import { randomUUID } from 'node:crypto';
import type {
  ActiveQuestionResponse,
  CreateQuestionRequest,
  MeetingQuestion,
  QuestionActionRequest,
  QuestionQueueResponse,
  ReorderQuestionsRequest,
  UpdateQuestionRequest,
} from '@ufmg/shared';
import { AppError } from '../errors.js';
import type { RoomService } from './roomManagement.js';
import type { SessionCredentialService } from './sessionCredentials.js';
import {
  QuestionRevisionConflict,
  type QuestionStore,
  type StoredQuestionState,
} from './questionStore.js';

const MAX_OPEN_QUESTIONS = 200;
const MAX_TOTAL_QUESTIONS = 1_000;

export class QuestionService {
  constructor(
    private readonly store: QuestionStore,
    private readonly roomService: RoomService,
    private readonly credentials: SessionCredentialService,
  ) {}

  async getActive(
    roomName: string,
    resumeCredential: string | undefined,
  ): Promise<ActiveQuestionResponse> {
    this.assertSession(roomName, resumeCredential);
    return publicSnapshot(await this.store.read(roomName));
  }

  async list(
    roomName: string,
    resumeCredential: string | undefined,
  ): Promise<QuestionQueueResponse> {
    await this.roomService.assertAdmin(roomName, resumeCredential);
    return adminSnapshot(await this.store.read(roomName));
  }

  async create(
    roomName: string,
    input: CreateQuestionRequest,
    resumeCredential: string | undefined,
  ) {
    await this.roomService.assertAdmin(roomName, resumeCredential);
    const state = await this.store.read(roomName);
    this.assertExpectedRevision(state, input.expectedRevision);
    if (state.questions.length >= MAX_TOTAL_QUESTIONS) {
      throw new AppError(
        'O histórico desta sala atingiu o limite. Arquive a reunião antes de adicionar mais perguntas.',
        409,
        'QUESTION_HISTORY_LIMIT',
      );
    }
    if (
      state.questions.filter((question) => question.status !== 'archived').length >=
      MAX_OPEN_QUESTIONS
    ) {
      throw new AppError(
        'Há perguntas demais nesta reunião. Arquive algumas antes de continuar.',
        409,
        'QUESTION_QUEUE_LIMIT',
      );
    }
    const now = new Date().toISOString();
    const question: MeetingQuestion = {
      id: randomUUID(),
      authorName: input.authorName,
      authorIdentity: input.authorIdentity ?? null,
      text: input.text,
      status: 'queued',
      position: nextPosition(state.questions),
      createdAt: now,
      updatedAt: now,
      answeredAt: null,
    };
    return this.save(roomName, state.revision, [...state.questions, question]);
  }

  async update(
    roomName: string,
    questionId: string,
    input: UpdateQuestionRequest,
    resumeCredential: string | undefined,
  ) {
    await this.roomService.assertAdmin(roomName, resumeCredential);
    const state = await this.store.read(roomName);
    this.assertExpectedRevision(state, input.expectedRevision);
    const question = findQuestion(state, questionId);
    question.authorName = input.authorName;
    question.authorIdentity = input.authorIdentity ?? null;
    question.text = input.text;
    question.updatedAt = new Date().toISOString();
    return this.save(roomName, state.revision, state.questions);
  }

  async action(
    roomName: string,
    questionId: string,
    input: QuestionActionRequest,
    resumeCredential: string | undefined,
  ) {
    await this.roomService.assertAdmin(roomName, resumeCredential);
    const state = await this.store.read(roomName);
    this.assertExpectedRevision(state, input.expectedRevision);
    const question = findQuestion(state, questionId);
    const now = new Date().toISOString();

    if (input.action === 'show') {
      if (question.status !== 'queued' && question.status !== 'live') {
        throw new AppError(
          'Coloque a pergunta de volta na fila antes de exibi-la.',
          409,
          'QUESTION_NOT_QUEUED',
        );
      }
      for (const item of state.questions) {
        if (item.status === 'live' && item.id !== question.id) {
          item.status = 'queued';
          item.updatedAt = now;
        }
      }
      question.status = 'live';
      question.updatedAt = now;
    } else if (input.action === 'answer') {
      if (question.status === 'archived') {
        throw new AppError('Esta pergunta está arquivada.', 409, 'QUESTION_ARCHIVED');
      }
      question.status = 'answered';
      question.answeredAt = now;
      question.updatedAt = now;
    } else if (input.action === 'requeue') {
      question.status = 'queued';
      question.position = nextPosition(state.questions);
      question.answeredAt = null;
      question.updatedAt = now;
    } else {
      question.status = 'archived';
      question.updatedAt = now;
    }

    return this.save(roomName, state.revision, state.questions);
  }

  async reorder(
    roomName: string,
    input: ReorderQuestionsRequest,
    resumeCredential: string | undefined,
  ) {
    await this.roomService.assertAdmin(roomName, resumeCredential);
    const state = await this.store.read(roomName);
    this.assertExpectedRevision(state, input.expectedRevision);
    const queued = state.questions.filter((question) => question.status === 'queued');
    if (
      queued.length !== input.questionIds.length ||
      queued.some((question) => !input.questionIds.includes(question.id))
    ) {
      throw new AppError(
        'A fila mudou enquanto você ordenava. Ela foi atualizada para a versão mais recente.',
        409,
        'QUESTION_ORDER_MISMATCH',
      );
    }
    const positions = new Map(input.questionIds.map((id, index) => [id, index]));
    for (const question of queued)
      question.position = positions.get(question.id) ?? question.position;
    return this.save(roomName, state.revision, state.questions);
  }

  private assertSession(roomName: string, resumeCredential: string | undefined) {
    if (!this.credentials.verifyResume(resumeCredential, roomName)) {
      throw new AppError('A sessão da reunião expirou.', 401, 'INVALID_SESSION');
    }
  }

  private assertExpectedRevision(state: StoredQuestionState, expectedRevision: number) {
    if (state.revision !== expectedRevision) {
      throw new AppError(
        'Outro administrador alterou as perguntas. A lista foi atualizada.',
        409,
        'QUESTION_REVISION_CONFLICT',
      );
    }
  }

  private async save(roomName: string, revision: number, questions: MeetingQuestion[]) {
    try {
      const saved = await this.store.write(roomName, revision, questions);
      await this.roomService.notifyQuestionsChanged(roomName, saved.revision);
      return adminSnapshot(saved);
    } catch (error) {
      if (error instanceof QuestionRevisionConflict) {
        throw new AppError(
          'Outro administrador alterou as perguntas. A lista foi atualizada.',
          409,
          'QUESTION_REVISION_CONFLICT',
        );
      }
      throw error;
    }
  }
}

function findQuestion(state: StoredQuestionState, questionId: string) {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) throw new AppError('A pergunta não existe mais.', 404, 'QUESTION_NOT_FOUND');
  return question;
}

function nextPosition(questions: MeetingQuestion[]) {
  return (
    questions.reduce(
      (maximum, question) =>
        question.status === 'queued' ? Math.max(maximum, question.position) : maximum,
      -1,
    ) + 1
  );
}

function publicSnapshot(state: StoredQuestionState): ActiveQuestionResponse {
  return {
    revision: state.revision,
    activeQuestion: state.questions.find((question) => question.status === 'live') ?? null,
  };
}

function adminSnapshot(state: StoredQuestionState): QuestionQueueResponse {
  const active = publicSnapshot(state);
  return {
    ...active,
    queuedQuestions: state.questions
      .filter((question) => question.status === 'queued')
      .sort((left, right) => left.position - right.position),
    answeredQuestions: state.questions
      .filter((question) => question.status === 'answered')
      .sort((left, right) => (right.answeredAt ?? '').localeCompare(left.answeredAt ?? '')),
    archivedQuestions: state.questions
      .filter((question) => question.status === 'archived')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}
