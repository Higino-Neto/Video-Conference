import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { TokenIssuer } from '../src/services/tokenService.js';
import type { RoomService } from '../src/services/roomManagement.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret-value',
  WEB_ORIGIN: 'https://classroom.example',
  PORT: '3001',
  LOG_LEVEL: 'silent',
});

describe('API', () => {
  const issue = vi.fn<TokenIssuer['issue']>();

  beforeEach(() => issue.mockReset());

  it('returns health without exposing credentials', async () => {
    const app = await buildApp({ config, tokenIssuer: { issue }, logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
    expect(response.body).not.toContain('test-secret-value');
    await app.close();
  });

  it('starts in development without LiveKit credentials and reports the missing setup', async () => {
    const devConfig = loadConfig({
      NODE_ENV: 'development',
      LOG_LEVEL: 'silent',
    });
    const app = await buildApp({ config: devConfig, logger: false });

    const configResponse = await app.inject({ method: 'GET', url: '/api/config' });
    expect(configResponse.statusCode).toBe(200);
    expect(configResponse.json()).toMatchObject({ livekitConfigured: false });

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/api/token',
      payload: {
        roomName: 'ABCD1234',
        participantName: 'Remote Guest',
        participantIdentity: 'guest_12345678',
      },
    });
    expect(tokenResponse.statusCode).toBe(503);
    expect(tokenResponse.json()).toMatchObject({ error: { code: 'LIVEKIT_NOT_CONFIGURED' } });
    await app.close();
  });

  it('requires LiveKit credentials in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
      }),
    ).toThrow(/LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET/);
  });

  it('requires durable question storage in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        LIVEKIT_URL: 'wss://test.livekit.cloud',
        LIVEKIT_API_KEY: 'test-key',
        LIVEKIT_API_SECRET: 'test-secret-value',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('supports rooms with up to one hundred participants by default', () => {
    expect(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }).maxParticipants).toBe(100);
    expect(() =>
      loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', MAX_PARTICIPANTS: '101' }),
    ).toThrow(/MAX_PARTICIPANTS/);
  });

  it('allows same-project Vercel deployment origins', async () => {
    issue.mockResolvedValue({
      serverUrl: 'wss://test.livekit.cloud',
      participantToken: 'signed-token',
      expiresIn: 600,
      resumeCredential: 'resume-credential',
      role: 'participant',
    });
    const vercelConfig = loadConfig({
      NODE_ENV: 'test',
      LIVEKIT_URL: 'wss://test.livekit.cloud',
      LIVEKIT_API_KEY: 'test-key',
      LIVEKIT_API_SECRET: 'test-secret-value',
      WEB_ORIGIN: 'http://localhost:5173',
      VERCEL_URL: 'video-conference-server-six.vercel.app',
      LOG_LEVEL: 'silent',
    });
    const app = await buildApp({ config: vercelConfig, tokenIssuer: { issue }, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/token',
      headers: { origin: 'https://video-conference-server-six.vercel.app' },
      payload: {
        roomName: 'ABCD1234',
        participantName: 'Remote Guest',
        participantIdentity: 'guest_12345678',
      },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('validates the token request', async () => {
    const app = await buildApp({ config, tokenIssuer: { issue }, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/token',
      payload: { roomName: '../bad' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(issue).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns a short-lived token and disables caching', async () => {
    issue.mockResolvedValue({
      serverUrl: 'wss://test.livekit.cloud',
      participantToken: 'signed-token',
      expiresIn: 600,
      resumeCredential: 'resume-credential',
      role: 'participant',
    });
    const app = await buildApp({ config, tokenIssuer: { issue }, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/token',
      payload: {
        roomName: 'ABCD1234',
        participantName: 'Remote Guest',
        participantIdentity: 'guest_12345678',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({ participantToken: 'signed-token', expiresIn: 600 });
    await app.close();
  });

  it('enforces route rate limiting', async () => {
    issue.mockResolvedValue({
      serverUrl: 'wss://test.livekit.cloud',
      participantToken: 'signed-token',
      expiresIn: 600,
      resumeCredential: 'resume-credential',
      role: 'participant',
    });
    const app = await buildApp({ config, tokenIssuer: { issue }, logger: false });
    let status = 0;
    for (let index = 0; index < 11; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/token',
        remoteAddress: '203.0.113.8',
        payload: {
          roomName: 'ABCD1234',
          participantName: 'Remote Guest',
          participantIdentity: `guest_${String(index).padStart(8, '0')}`,
        },
      });
      status = response.statusCode;
    }
    expect(status).toBe(429);
    await app.close();
  });

  it('creates owner credentials and protects room moderation behind a session bearer', async () => {
    const moderate = vi.fn<RoomService['moderate']>().mockResolvedValue({
      action: 'mute_microphone',
      targetIdentity: 'guest_target12',
      affectedTracks: 1,
    });
    const getAdmissions = vi.fn<RoomService['getAdmissions']>().mockResolvedValue({
      pending: [
        {
          participantIdentity: 'guest_waiting12',
          participantName: 'Waiting Guest',
          requestedAt: 1_700_000_000_000,
        },
      ],
    });
    const decideAdmission = vi.fn<RoomService['decideAdmission']>().mockResolvedValue(undefined);
    const initializeRoom = vi.fn<RoomService['initializeRoom']>().mockResolvedValue(undefined);
    const roomService = {
      initializeRoom,
      getStatus: vi.fn().mockResolvedValue({
        roomName: 'ROOM1234',
        exists: true,
        active: true,
        participantCount: 2,
      }),
      getAdmissions,
      decideAdmission,
      moderate,
    } as unknown as RoomService;
    const app = await buildApp({
      config,
      tokenIssuer: { issue },
      roomService,
      logger: false,
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { approvalRequired: true },
    });
    expect(created.statusCode).toBe(200);
    expect(created.body).toMatch(/"roomName":"[A-F0-9]{8}"/);
    expect(created.body).toContain('"ownerCredential":"');
    expect(created.json()).toMatchObject({ approvalRequired: true });
    expect(initializeRoom).toHaveBeenCalledWith(expect.stringMatching(/^[A-F0-9]{8}$/), true);

    const status = await app.inject({ method: 'GET', url: '/api/rooms/ROOM1234/status' });
    expect(status.json()).toMatchObject({ active: true, participantCount: 2 });

    const action = await app.inject({
      method: 'POST',
      url: '/api/rooms/ROOM1234/participants/guest_target12/actions',
      headers: { authorization: 'Bearer signed-resume' },
      payload: { action: 'mute_microphone' },
    });
    expect(action.statusCode).toBe(200);
    expect(moderate).toHaveBeenCalledWith(
      'ROOM1234',
      'guest_target12',
      'mute_microphone',
      'signed-resume',
    );

    const queue = await app.inject({
      method: 'GET',
      url: '/api/rooms/ROOM1234/admissions',
      headers: { authorization: 'Bearer signed-resume' },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      pending: [{ participantIdentity: 'guest_waiting12' }],
    });
    expect(getAdmissions).toHaveBeenCalledWith('ROOM1234', 'signed-resume');

    const admission = await app.inject({
      method: 'POST',
      url: '/api/rooms/ROOM1234/admissions/guest_waiting12',
      headers: { authorization: 'Bearer signed-resume' },
      payload: { decision: 'approve' },
    });
    expect(admission.statusCode).toBe(200);
    expect(decideAdmission).toHaveBeenCalledWith(
      'ROOM1234',
      'guest_waiting12',
      'approve',
      'signed-resume',
    );
    await app.close();
  });
});
