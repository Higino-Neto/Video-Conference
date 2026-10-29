import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { MeetingQuestion } from '@ufmg/shared';
import type { ServerConfig } from '../config.js';

export interface StoredQuestionState {
  revision: number;
  questions: MeetingQuestion[];
}

export interface QuestionStore {
  read(roomName: string): Promise<StoredQuestionState>;
  write(
    roomName: string,
    expectedRevision: number,
    questions: MeetingQuestion[],
  ): Promise<StoredQuestionState>;
  close(): Promise<void>;
}

export class QuestionRevisionConflict extends Error {
  constructor(readonly currentRevision: number) {
    super('Question state changed before this update was saved.');
    this.name = 'QuestionRevisionConflict';
  }
}

export function createQuestionStore(config: ServerConfig): QuestionStore {
  if (config.nodeEnv === 'test') return new MemoryQuestionStore();
  if (config.databaseUrl) return new PostgresQuestionStore(config.databaseUrl);
  return new JsonQuestionStore(config.questionStorePath);
}

export class MemoryQuestionStore implements QuestionStore {
  private readonly rooms = new Map<string, StoredQuestionState>();

  read(roomName: string) {
    return Promise.resolve(cloneState(this.rooms.get(roomName) ?? emptyState()));
  }

  write(roomName: string, expectedRevision: number, questions: MeetingQuestion[]) {
    const current = this.rooms.get(roomName) ?? emptyState();
    try {
      assertRevision(current.revision, expectedRevision);
      const next = { revision: current.revision + 1, questions: structuredClone(questions) };
      this.rooms.set(roomName, next);
      return Promise.resolve(cloneState(next));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Não foi possível salvar as perguntas.'),
      );
    }
  }

  async close() {}
}

interface JsonStoreFile {
  version: 1;
  rooms: Record<string, StoredQuestionState>;
}

export class JsonQuestionStore implements QuestionStore {
  private readonly filePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  read(roomName: string) {
    return this.exclusive(async () => {
      const file = await this.load();
      return cloneState(file.rooms[roomName] ?? emptyState());
    });
  }

  write(roomName: string, expectedRevision: number, questions: MeetingQuestion[]) {
    return this.exclusive(async () => {
      const file = await this.load();
      const current = file.rooms[roomName] ?? emptyState();
      assertRevision(current.revision, expectedRevision);
      const next = { revision: current.revision + 1, questions: structuredClone(questions) };
      file.rooms[roomName] = next;
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(file), 'utf8');
      await rename(temporaryPath, this.filePath);
      return cloneState(next);
    });
  }

  async close() {
    await this.queue;
  }

  private exclusive<T>(operation: () => Promise<T>) {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async load(): Promise<JsonStoreFile> {
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      if (isJsonStoreFile(value)) return value;
      throw new Error('O arquivo local de perguntas está corrompido.');
    } catch (error) {
      if (isMissingFile(error)) return { version: 1, rooms: {} };
      throw error;
    }
  }
}

export class PostgresQuestionStore implements QuestionStore {
  private readonly pool: pg.Pool;
  private ready: Promise<void> | undefined;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  async read(roomName: string) {
    await this.ensureReady();
    const result = await this.pool.query<{
      revision: string;
      state: { questions?: MeetingQuestion[] };
    }>('SELECT revision, state FROM meeting_question_states WHERE room_name = $1', [roomName]);
    const row = result.rows[0];
    if (!row) return emptyState();
    return {
      revision: Number(row.revision),
      questions: Array.isArray(row.state.questions) ? structuredClone(row.state.questions) : [],
    };
  }

  async write(roomName: string, expectedRevision: number, questions: MeetingQuestion[]) {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [roomName]);
      const currentResult = await client.query<{ revision: string }>(
        'SELECT revision FROM meeting_question_states WHERE room_name = $1 FOR UPDATE',
        [roomName],
      );
      const currentRevision = Number(currentResult.rows[0]?.revision ?? 0);
      assertRevision(currentRevision, expectedRevision);
      const revision = currentRevision + 1;
      await client.query(
        `INSERT INTO meeting_question_states (room_name, revision, state, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (room_name) DO UPDATE
         SET revision = EXCLUDED.revision, state = EXCLUDED.state, updated_at = NOW()`,
        [roomName, revision, JSON.stringify({ questions })],
      );
      await client.query('COMMIT');
      return { revision, questions: structuredClone(questions) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  private async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_question_states (
        room_name VARCHAR(64) PRIMARY KEY,
        revision BIGINT NOT NULL,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private ensureReady() {
    this.ready ??= this.initialize();
    return this.ready;
  }
}

function emptyState(): StoredQuestionState {
  return { revision: 0, questions: [] };
}

function cloneState(state: StoredQuestionState): StoredQuestionState {
  return structuredClone(state);
}

function assertRevision(current: number, expected: number) {
  if (current !== expected) throw new QuestionRevisionConflict(current);
}

function isMissingFile(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isJsonStoreFile(value: unknown): value is JsonStoreFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<JsonStoreFile>).version === 1 &&
    typeof (value as Partial<JsonStoreFile>).rooms === 'object' &&
    (value as Partial<JsonStoreFile>).rooms !== null
  );
}
