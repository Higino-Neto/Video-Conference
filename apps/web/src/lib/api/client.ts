import type {
  ActiveQuestionResponse,
  CreateRoomResponse,
  CreateQuestionRequest,
  AdmissionDecision,
  AdmissionQueueResponse,
  ModerationAction,
  ModerationResponse,
  PublicConfig,
  QuestionAction,
  QuestionQueueResponse,
  RoomStatusResponse,
  TokenRequest,
  TokenResponse,
  UpdateQuestionRequest,
} from '@ufmg/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

interface ApiErrorPayload {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchPublicConfig(signal?: AbortSignal): Promise<PublicConfig> {
  return request<PublicConfig>('/api/config', signal ? { signal } : {});
}

export async function fetchHealth(signal?: AbortSignal) {
  return request<{ status: string; timestamp: string }>('/api/health', signal ? { signal } : {});
}

export async function requestJoinToken(payload: TokenRequest, signal?: AbortSignal) {
  return request<TokenResponse>('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });
}

export function createMeetingRoom(approvalRequired: boolean) {
  return request<CreateRoomResponse>('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalRequired }),
  });
}

export function fetchRoomStatus(roomName: string, signal?: AbortSignal) {
  return request<RoomStatusResponse>(`/api/rooms/${encodeURIComponent(roomName)}/status`, {
    ...(signal ? { signal } : {}),
  });
}

export function moderateParticipant(
  roomName: string,
  targetIdentity: string,
  action: ModerationAction,
  resumeCredential: string,
) {
  return request<ModerationResponse>(
    `/api/rooms/${encodeURIComponent(roomName)}/participants/${encodeURIComponent(targetIdentity)}/actions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resumeCredential}`,
      },
      body: JSON.stringify({ action }),
    },
  );
}

export function fetchAdmissionQueue(roomName: string, resumeCredential: string) {
  return request<AdmissionQueueResponse>(`/api/rooms/${encodeURIComponent(roomName)}/admissions`, {
    headers: { Authorization: `Bearer ${resumeCredential}` },
  });
}

export function decideAdmission(
  roomName: string,
  participantIdentity: string,
  decision: AdmissionDecision,
  resumeCredential: string,
) {
  return request<{ decision: AdmissionDecision; participantIdentity: string }>(
    `/api/rooms/${encodeURIComponent(roomName)}/admissions/${encodeURIComponent(participantIdentity)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resumeCredential}`,
      },
      body: JSON.stringify({ decision }),
    },
  );
}

export function fetchActiveQuestion(
  roomName: string,
  resumeCredential: string,
  signal?: AbortSignal,
) {
  return request<ActiveQuestionResponse>(
    `/api/rooms/${encodeURIComponent(roomName)}/questions/active`,
    {
      headers: { Authorization: `Bearer ${resumeCredential}` },
      ...(signal ? { signal } : {}),
    },
  );
}

export function fetchQuestionQueue(
  roomName: string,
  resumeCredential: string,
  signal?: AbortSignal,
) {
  return request<QuestionQueueResponse>(`/api/rooms/${encodeURIComponent(roomName)}/questions`, {
    headers: { Authorization: `Bearer ${resumeCredential}` },
    ...(signal ? { signal } : {}),
  });
}

export function createQuestion(
  roomName: string,
  payload: CreateQuestionRequest,
  resumeCredential: string,
) {
  return request<QuestionQueueResponse>(`/api/rooms/${encodeURIComponent(roomName)}/questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resumeCredential}`,
    },
    body: JSON.stringify(payload),
  });
}

export function updateQuestion(
  roomName: string,
  questionId: string,
  payload: UpdateQuestionRequest,
  resumeCredential: string,
) {
  return request<QuestionQueueResponse>(
    `/api/rooms/${encodeURIComponent(roomName)}/questions/${encodeURIComponent(questionId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resumeCredential}`,
      },
      body: JSON.stringify(payload),
    },
  );
}

export function runQuestionAction(
  roomName: string,
  questionId: string,
  action: QuestionAction,
  expectedRevision: number,
  resumeCredential: string,
) {
  return request<QuestionQueueResponse>(
    `/api/rooms/${encodeURIComponent(roomName)}/questions/${encodeURIComponent(questionId)}/actions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resumeCredential}`,
      },
      body: JSON.stringify({ action, expectedRevision }),
    },
  );
}

export function reorderQuestions(
  roomName: string,
  questionIds: string[],
  expectedRevision: number,
  resumeCredential: string,
) {
  return request<QuestionQueueResponse>(
    `/api/rooms/${encodeURIComponent(roomName)}/questions/order`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resumeCredential}`,
      },
      body: JSON.stringify({ questionIds, expectedRevision }),
    },
  );
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, cache: 'no-store' });
  } catch {
    throw new ApiError('Não foi possível acessar o servidor da reunião.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as unknown;
    const payload = isApiErrorPayload(body) ? body : {};
    throw new ApiError(
      payload.error?.message ?? 'Não foi possível concluir a solicitação.',
      response.status,
      payload.error?.code ?? 'API_ERROR',
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(
      'A API respondeu em um formato inesperado. Verifique se o servidor backend está rodando e se VITE_API_URL aponta para ele.',
      response.status,
      'NON_JSON_RESPONSE',
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('A API retornou JSON inválido.', response.status, 'INVALID_JSON');
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return error === undefined || (typeof error === 'object' && error !== null);
}
