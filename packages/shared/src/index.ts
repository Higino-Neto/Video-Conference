export type MeetingMode = 'standard' | 'high-reliability';
export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export interface NetworkMetrics {
  rttMs?: number;
  jitterMs?: number;
  packetLossPercent?: number;
  availableOutgoingBitrateKbps?: number;
  liveKitQuality?: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
}

export interface TokenRequest {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  ownerCredential?: string;
  resumeCredential?: string;
}

export interface TokenResponse {
  serverUrl: string;
  participantToken: string;
  expiresIn: number;
  resumeCredential: string;
  role: 'admin' | 'participant';
}

export interface CreateRoomResponse {
  roomName: string;
  ownerCredential: string;
  approvalRequired: boolean;
}

export interface CreateRoomRequest {
  approvalRequired: boolean;
}

export interface RoomStatusResponse {
  roomName: string;
  exists: boolean;
  active: boolean;
  participantCount: number;
}

export type ModerationAction = 'mute_microphone' | 'disable_camera' | 'remove' | 'ban' | 'promote';

export interface ModerationResponse {
  action: ModerationAction;
  targetIdentity: string;
  affectedTracks: number;
}

export interface PendingAdmission {
  participantIdentity: string;
  participantName: string;
  requestedAt: number;
}

export interface AdmissionQueueResponse {
  pending: PendingAdmission[];
}

export type AdmissionDecision = 'approve' | 'deny';

export type QuestionStatus = 'queued' | 'live' | 'answered' | 'archived';

export interface MeetingQuestion {
  id: string;
  authorName: string;
  authorIdentity: string | null;
  text: string;
  status: QuestionStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
}

export interface ActiveQuestionResponse {
  revision: number;
  activeQuestion: MeetingQuestion | null;
}

export interface QuestionQueueResponse extends ActiveQuestionResponse {
  queuedQuestions: MeetingQuestion[];
  answeredQuestions: MeetingQuestion[];
  archivedQuestions: MeetingQuestion[];
}

export interface CreateQuestionRequest {
  authorName: string;
  authorIdentity?: string | undefined;
  text: string;
  expectedRevision: number;
}

export interface UpdateQuestionRequest {
  authorName: string;
  authorIdentity?: string | null | undefined;
  text: string;
  expectedRevision: number;
}

export type QuestionAction = 'show' | 'answer' | 'requeue' | 'archive';

export interface QuestionActionRequest {
  action: QuestionAction;
  expectedRevision: number;
}

export interface ReorderQuestionsRequest {
  questionIds: string[];
  expectedRevision: number;
}

export interface PublicConfig {
  livekitUrl: string;
  livekitConfigured: boolean;
  meetingMode: MeetingMode;
  maxParticipants: number;
  advancedNoiseFilterEnabled: boolean;
}

export function classifyNetworkQuality(metrics: NetworkMetrics): NetworkQuality {
  const values = [
    scoreLowerIsBetter(metrics.packetLossPercent, [1, 3, 7]),
    scoreLowerIsBetter(metrics.rttMs, [150, 300, 600]),
    scoreLowerIsBetter(metrics.jitterMs, [20, 40, 80]),
    scoreHigherIsBetter(metrics.availableOutgoingBitrateKbps, [2_000, 900, 350]),
    scoreLiveKit(metrics.liveKitQuality),
  ].filter((score): score is number => score !== undefined);

  if (values.length === 0) return 'unknown';

  // Apenas calcular a média é uma métrica ruim de qualidade de transmissão.
  // Eu não quero que uma métrica ruim seja ofuscada por 4 boas, então defini que a média dos
  // valores não pode ser muito maior do que a pior métrica.
  // O valor 0.75 é arbitrário/experimental.
  const average = values.reduce((sum, score) => sum + score, 0) / values.length;
  const worst = Math.min(...values);
  const score = Math.min(average, worst + 0.75);

  if (score >= 3.25) return 'excellent';
  if (score >= 2.4) return 'good';
  if (score >= 1.4) return 'fair';
  return 'poor';
}

function scoreLowerIsBetter(value: number | undefined, limits: [number, number, number]) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  if (value <= limits[0]) return 4;
  if (value <= limits[1]) return 3;
  if (value <= limits[2]) return 2;
  return 1;
}

function scoreHigherIsBetter(value: number | undefined, limits: [number, number, number]) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  if (value >= limits[0]) return 4;
  if (value >= limits[1]) return 3;
  if (value >= limits[2]) return 2;
  return 1;
}

function scoreLiveKit(value: NetworkMetrics['liveKitQuality']) {
  if (!value || value === 'unknown') return undefined;
  return { excellent: 4, good: 3, poor: 1, lost: 1 }[value];
}
