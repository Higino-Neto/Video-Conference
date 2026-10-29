import { describe, expect, it, vi } from 'vitest';
import type { ActiveQuestionResponse, QuestionQueueResponse } from '@ufmg/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AppError } from '../src/errors.js';
import { MemoryQuestionStore, QuestionRevisionConflict } from '../src/services/questionStore.js';
import type { RoomService } from '../src/services/roomManagement.js';
import { SessionCredentialService } from '../src/services/sessionCredentials.js';
import type { TokenIssuer } from '../src/services/tokenService.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret-value',
  WEB_ORIGIN: 'https://classroom.example',
  LOG_LEVEL: 'silent',
});

describe('meeting questions API', () => {
  it('covers creation, ordering, live display, concurrency conflicts and history', async () => {
    const credentials = new SessionCredentialService(config.livekitApiSecret);
    const adminCredential = credentials.createResumeCredential('ROOM1234', 'admin_12345678');
    const participantCredential = credentials.createResumeCredential('ROOM1234', 'guest_12345678');
    const notifyQuestionsChanged = vi.fn().mockResolvedValue(undefined);
    const assertAdmin = vi.fn((roomName: string, credential: string | undefined) => {
      if (roomName !== 'ROOM1234' || credential !== adminCredential) {
        return Promise.reject(
          new AppError('Apenas administradores podem realizar esta ação.', 403, 'ADMIN_REQUIRED'),
        );
      }
      return Promise.resolve('admin_12345678');
    });
    const roomService = {
      assertAdmin,
      notifyQuestionsChanged,
    } as unknown as RoomService;
    const store = new MemoryQuestionStore();
    const tokenIssuer = { issue: vi.fn() } as unknown as TokenIssuer;
    const app = await buildApp({
      config,
      credentialService: credentials,
      roomService,
      questionStore: store,
      tokenIssuer,
      logger: false,
    });

    const unauthorized = await app.inject({
      method: 'POST',
      url: '/api/rooms/ROOM1234/questions',
      payload: {
        authorName: 'Ana',
        text: 'Pergunta sem autorização?',
        expectedRevision: 0,
      },
    });
    expect(unauthorized.statusCode).toBe(403);

    const first = await app.inject({
      method: 'POST',
      url: '/api/rooms/ROOM1234/questions',
      headers: { authorization: `Bearer ${adminCredential}` },
      payload: {
        authorName: 'Ana',
        authorIdentity: 'guest_ana12345',
        text: 'Qual foi o maior desafio?',
        expectedRevision: 0,
      },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json<QuestionQueueResponse>();
    expect(firstBody).toMatchObject({ revision: 1, queuedQuestions: [{ authorName: 'Ana' }] });
    const firstId = firstBody.queuedQuestions[0]!.id;

    const second = await app.inject({
      method: 'POST',
      url: '/api/rooms/ROOM1234/questions',
      headers: { authorization: `Bearer ${adminCredential}` },
      payload: {
        authorName: 'Bruno',
        text: 'O que você faria diferente?',
        expectedRevision: 1,
      },
    });
    const secondId = second.json<QuestionQueueResponse>().queuedQuestions[1]!.id;

    const reordered = await app.inject({
      method: 'PUT',
      url: '/api/rooms/ROOM1234/questions/order',
      headers: { authorization: `Bearer ${adminCredential}` },
      payload: { questionIds: [secondId, firstId], expectedRevision: 2 },
    });
    expect(
      reordered.json<QuestionQueueResponse>().queuedQuestions.map((question) => question.id),
    ).toEqual([secondId, firstId]);

    const shown = await app.inject({
      method: 'POST',
      url: `/api/rooms/ROOM1234/questions/${secondId}/actions`,
      headers: { authorization: `Bearer ${adminCredential}` },
      payload: { action: 'show', expectedRevision: 3 },
    });
    expect(shown.json()).toMatchObject({
      revision: 4,
      activeQuestion: { id: secondId, status: 'live' },
    });

    const participantView = await app.inject({
      method: 'GET',
      url: '/api/rooms/ROOM1234/questions/active',
      headers: { authorization: `Bearer ${participantCredential}` },
    });
    expect(participantView.statusCode).toBe(200);
    const participantBody = participantView.json<ActiveQuestionResponse>();
    expect(participantBody.revision).toBe(4);
    expect(participantBody.activeQuestion).toMatchObject({ id: secondId, authorName: 'Bruno' });
    expect(participantView.body).not.toContain('Qual foi o maior desafio?');

    const staleEdit = await app.inject({
      method: 'PATCH',
      url: `/api/rooms/ROOM1234/questions/${firstId}`,
      headers: { authorization: `Bearer ${adminCredential}` },
      payload: {
        authorName: 'Ana',
        text: 'Edição baseada em uma fila antiga',
        expectedRevision: 2,
      },
    });
    expect(staleEdit.statusCode).toBe(409);
    expect(staleEdit.json()).toMatchObject({
      error: { code: 'QUESTION_REVISION_CONFLICT' },
    });

    const answered = await app.inject({
      method: 'POST',
      url: `/api/rooms/ROOM1234/questions/${secondId}/actions`,
      headers: { authorization: `Bearer ${adminCredential}` },
      payload: { action: 'answer', expectedRevision: 4 },
    });
    expect(answered.json()).toMatchObject({
      revision: 5,
      activeQuestion: null,
      answeredQuestions: [{ id: secondId, status: 'answered' }],
    });
    expect(notifyQuestionsChanged).toHaveBeenLastCalledWith('ROOM1234', 5);
    await app.close();
  });

  it('rejects invalid participant sessions and conflicting writes', async () => {
    const credentials = new SessionCredentialService(config.livekitApiSecret);
    const roomService = {
      assertAdmin: vi.fn(),
      notifyQuestionsChanged: vi.fn(),
    } as unknown as RoomService;
    const app = await buildApp({
      config,
      credentialService: credentials,
      roomService,
      questionStore: new MemoryQuestionStore(),
      tokenIssuer: { issue: vi.fn() },
      logger: false,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/rooms/ROOM1234/questions/active',
      headers: { authorization: 'Bearer invalid-credential' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_SESSION' } });
    await app.close();

    const store = new MemoryQuestionStore();
    await store.write('ROOM1234', 0, []);
    await expect(store.write('ROOM1234', 0, [])).rejects.toBeInstanceOf(QuestionRevisionConflict);
  });
});
