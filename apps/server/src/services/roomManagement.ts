import {
  DataPacket_Kind,
  RoomServiceClient,
  TrackSource,
  type ParticipantInfo,
  type Room,
} from 'livekit-server-sdk';
import type {
  AdmissionDecision,
  AdmissionQueueResponse,
  ModerationAction,
  ModerationResponse,
  PendingAdmission,
  RoomStatusResponse,
} from '@ufmg/shared';
import type { ServerConfig } from '../config.js';
import { AppError } from '../errors.js';
import type { SessionCredentialService } from './sessionCredentials.js';

interface RoomPolicy {
  version: 1;
  owners: string[];
  admins: string[];
  banned: string[];
  approvalRequired: boolean;
  approved: string[];
  denied: string[];
  pending: PendingAdmission[];
}

export interface RoomService {
  ensureRoom(roomName: string): Promise<Room>;
  initializeRoom(roomName: string, approvalRequired: boolean): Promise<void>;
  listParticipants(roomName: string): Promise<ParticipantInfo[]>;
  resolveRole(
    roomName: string,
    participantIdentity: string,
    ownerCredential?: string,
    participantName?: string,
  ): Promise<'admin' | 'participant'>;
  getStatus(roomName: string): Promise<RoomStatusResponse>;
  getAdmissions(
    roomName: string,
    resumeCredential: string | undefined,
  ): Promise<AdmissionQueueResponse>;
  decideAdmission(
    roomName: string,
    targetIdentity: string,
    decision: AdmissionDecision,
    resumeCredential: string | undefined,
  ): Promise<void>;
  moderate(
    roomName: string,
    targetIdentity: string,
    action: ModerationAction,
    resumeCredential: string | undefined,
  ): Promise<ModerationResponse>;
  assertAdmin(roomName: string, resumeCredential: string | undefined): Promise<string>;
  notifyQuestionsChanged(roomName: string, revision: number): Promise<void>;
}

export class LiveKitRoomService implements RoomService {
  private readonly client: RoomServiceClient;

  constructor(
    private readonly config: ServerConfig,
    private readonly credentials: SessionCredentialService,
    client?: RoomServiceClient,
  ) {
    this.client =
      client ??
      new RoomServiceClient(
        config.livekitUrl.replace(/^ws/, 'http'),
        config.livekitApiKey,
        config.livekitApiSecret,
      );
  }

  async ensureRoom(roomName: string) {
    this.assertConfigured();
    try {
      const existing = await this.client.listRooms([roomName]);
      if (existing[0]) return existing[0];
      return await this.client.createRoom({
        name: roomName,
        emptyTimeout: 10 * 60,
        departureTimeout: 60,
        maxParticipants: this.config.maxParticipants,
        metadata: JSON.stringify(DEFAULT_POLICY),
      });
    } catch (error) {
      throw liveKitUnavailable(error);
    }
  }

  async listParticipants(roomName: string) {
    try {
      return await this.client.listParticipants(roomName);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw liveKitUnavailable(error);
    }
  }

  async initializeRoom(roomName: string, approvalRequired: boolean) {
    const room = await this.ensureRoom(roomName);
    const policy = parsePolicy(room.metadata);
    if (policy.approvalRequired === approvalRequired) return;
    policy.approvalRequired = approvalRequired;
    try {
      await this.client.updateRoomMetadata(roomName, JSON.stringify(policy));
    } catch (error) {
      throw liveKitUnavailable(error);
    }
  }

  async resolveRole(
    roomName: string,
    participantIdentity: string,
    ownerCredential?: string,
    participantName?: string,
  ) {
    const room = await this.ensureRoom(roomName);
    const policy = parsePolicy(room.metadata);
    if (policy.banned.includes(participantIdentity)) {
      throw new AppError(
        'Você foi removido desta sala pelo administrador.',
        403,
        'PARTICIPANT_BANNED',
      );
    }
    const ownerOptions = this.credentials.readOwnerOptions(ownerCredential, roomName);
    if (ownerOptions) {
      let changed = false;
      if (policy.approvalRequired !== ownerOptions.approvalRequired) {
        policy.approvalRequired = ownerOptions.approvalRequired;
        changed = true;
      }
      if (!policy.owners.includes(participantIdentity)) {
        policy.owners.push(participantIdentity);
        changed = true;
      }
      if (!policy.admins.includes(participantIdentity)) {
        policy.admins.push(participantIdentity);
        changed = true;
      }
      if (changed) await this.client.updateRoomMetadata(roomName, JSON.stringify(policy));
    }
    if (
      !policy.admins.includes(participantIdentity) &&
      policy.denied.includes(participantIdentity)
    ) {
      throw new AppError('O administrador não autorizou sua entrada.', 403, 'ADMISSION_DENIED');
    }
    if (
      policy.approvalRequired &&
      !policy.admins.includes(participantIdentity) &&
      !policy.approved.includes(participantIdentity)
    ) {
      const now = Date.now();
      const activeRequests = policy.pending.filter(
        (request) => now - request.requestedAt < 30 * 60_000,
      );

      let changed = activeRequests.length !== policy.pending.length;
      policy.pending = activeRequests;
      const existing = policy.pending.find(
        (request) => request.participantIdentity === participantIdentity,
      );

      if (existing) {
        const currentName = participantName || 'Convidado';
        if (existing.participantName !== currentName) {
          existing.participantName = currentName;
          changed = true;
        }
      } else {
        policy.pending.push({
          participantIdentity,
          participantName: participantName || 'Convidado',
          requestedAt: now,
        });
        policy.pending = policy.pending.slice(-100);
        changed = true;
      }
      if (changed) await this.client.updateRoomMetadata(roomName, JSON.stringify(policy));
      throw new AppError(
        'Sua entrada está aguardando aprovação de um administrador.',
        403,
        'ADMISSION_PENDING',
      );
    }
    return policy.admins.includes(participantIdentity) ? 'admin' : 'participant';
  }

  async getAdmissions(roomName: string, resumeCredential: string | undefined) {
    const { policy } = await this.authorizeAdmin(roomName, resumeCredential);
    return { pending: policy.pending };
  }

  async decideAdmission(
    roomName: string,
    targetIdentity: string,
    decision: AdmissionDecision,
    resumeCredential: string | undefined,
  ) {
    const { policy } = await this.authorizeAdmin(roomName, resumeCredential);
    if (!policy.pending.some((request) => request.participantIdentity === targetIdentity)) {
      throw new AppError('Esta solicitação não está mais pendente.', 404, 'ADMISSION_NOT_FOUND');
    }

    policy.pending = policy.pending.filter(
      (request) => request.participantIdentity !== targetIdentity,
    );
    policy.approved = policy.approved.filter((identity) => identity !== targetIdentity);
    policy.denied = policy.denied.filter((identity) => identity !== targetIdentity);
    (decision === 'approve' ? policy.approved : policy.denied).push(targetIdentity);

    await this.client.updateRoomMetadata(roomName, JSON.stringify(policy));
  }

  async getStatus(roomName: string) {
    this.assertConfigured();
    try {
      const rooms = await this.client.listRooms([roomName]);
      if (!rooms[0]) return { roomName, exists: false, active: false, participantCount: 0 };
      const participants = await this.client.listParticipants(roomName);

      return {
        roomName,
        exists: true,
        active: participants.length > 0,
        participantCount: participants.length,
      };
    } catch (error) {
      if (isNotFoundError(error))
        return { roomName, exists: false, active: false, participantCount: 0 };
      throw liveKitUnavailable(error);
    }
  }

  async moderate(
    roomName: string,
    targetIdentity: string,
    action: ModerationAction,
    resumeCredential: string | undefined,
  ) {
    const requesterIdentity = this.credentials.verifyResume(resumeCredential, roomName);
    if (!requesterIdentity) {
      throw new AppError('A sessão administrativa expirou.', 401, 'INVALID_SESSION');
    }
    if (requesterIdentity === targetIdentity) {
      throw new AppError(
        'Use os controles da chamada para alterar seus próprios dispositivos.',
        400,
        'SELF_MODERATION',
      );
    }

    try {
      const rooms = await this.client.listRooms([roomName]);
      const room = rooms[0];
      if (!room) throw new AppError('A sala não está mais ativa.', 404, 'ROOM_NOT_FOUND');
      const policy = parsePolicy(room.metadata);
      const participants = await this.client.listParticipants(roomName);

      if (!participants.some((participant) => participant.identity === requesterIdentity)) {
        throw new AppError(
          'Você não está conectado a esta sala.',
          401,
          'PARTICIPANT_NOT_CONNECTED',
        );
      }
      if (!policy.admins.includes(requesterIdentity)) {
        throw new AppError(
          'Apenas administradores podem realizar esta ação.',
          403,
          'ADMIN_REQUIRED',
        );
      }

      const target = participants.find((participant) => participant.identity === targetIdentity);
      if (!target)
        throw new AppError('O participante já saiu da sala.', 404, 'PARTICIPANT_NOT_FOUND');
      if (policy.owners.includes(targetIdentity) && !policy.owners.includes(requesterIdentity)) {
        throw new AppError(
          'Um administrador delegado não pode moderar o criador.',
          403,
          'OWNER_PROTECTED',
        );
      }

      let affectedTracks = 0;
      if (action === 'promote') {
        if (!policy.admins.includes(targetIdentity)) policy.admins.push(targetIdentity);
        await this.client.updateRoomMetadata(roomName, JSON.stringify(policy));
        await this.client.updateParticipant(roomName, targetIdentity, {
          attributes: { 'ufmg.role': 'admin' },
        });
      } else if (action === 'mute_microphone' || action === 'disable_camera') {
        const source = action === 'mute_microphone' ? TrackSource.MICROPHONE : TrackSource.CAMERA;
        const tracks = target.tracks.filter((track) => track.source === source && !track.muted);
        await Promise.all(
          tracks.map((track) =>
            this.client.mutePublishedTrack(roomName, targetIdentity, track.sid, true),
          ),
        );
        affectedTracks = tracks.length;
      } else {
        if (action === 'ban') {
          if (!policy.banned.includes(targetIdentity)) policy.banned.push(targetIdentity);
          policy.admins = policy.admins.filter((identity) => identity !== targetIdentity);
          await this.client.updateRoomMetadata(roomName, JSON.stringify(policy));
        }
        await this.client.removeParticipant(roomName, targetIdentity);
      }

      return { action, targetIdentity, affectedTracks };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw liveKitUnavailable(error);
    }
  }

  async assertAdmin(roomName: string, resumeCredential: string | undefined) {
    const { requesterIdentity } = await this.authorizeAdmin(roomName, resumeCredential);
    return requesterIdentity;
  }

  async notifyQuestionsChanged(roomName: string, revision: number) {
    try {
      await this.client.sendData(
        roomName,
        new TextEncoder().encode(JSON.stringify({ type: 'questions.updated', revision })),
        DataPacket_Kind.RELIABLE,
        { topic: 'ufmg.questions' },
      );
    } catch {
      // Polling is the fallback when the room is closing or LiveKit is temporarily unavailable.
    }
  }

  private assertConfigured() {
    if (!this.config.livekitConfigured) {
      throw new AppError('LiveKit não está configurado.', 503, 'LIVEKIT_NOT_CONFIGURED');
    }
  }

  private async authorizeAdmin(roomName: string, resumeCredential: string | undefined) {
    const requesterIdentity = this.credentials.verifyResume(resumeCredential, roomName);
    if (!requesterIdentity) {
      throw new AppError('A sessão administrativa expirou.', 401, 'INVALID_SESSION');
    }
    try {
      const rooms = await this.client.listRooms([roomName]);
      const room = rooms[0];
      if (!room) throw new AppError('A sala não está mais ativa.', 404, 'ROOM_NOT_FOUND');
      const policy = parsePolicy(room.metadata);
      const participants = await this.client.listParticipants(roomName);
      if (!participants.some((participant) => participant.identity === requesterIdentity)) {
        throw new AppError(
          'Você não está conectado a esta sala.',
          401,
          'PARTICIPANT_NOT_CONNECTED',
        );
      }
      if (!policy.admins.includes(requesterIdentity)) {
        throw new AppError(
          'Apenas administradores podem realizar esta ação.',
          403,
          'ADMIN_REQUIRED',
        );
      }
      return { policy, requesterIdentity };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw liveKitUnavailable(error);
    }
  }
}

const DEFAULT_POLICY: RoomPolicy = {
  version: 1,
  owners: [],
  admins: [],
  banned: [],
  approvalRequired: false,
  approved: [],
  denied: [],
  pending: [],
};

function parsePolicy(metadata: string): RoomPolicy {
  try {
    const value = JSON.parse(metadata) as Partial<RoomPolicy>;
    if (
      value.version === 1 &&
      Array.isArray(value.owners) &&
      Array.isArray(value.admins) &&
      Array.isArray(value.banned)
    ) {
      return {
        version: 1,
        owners: value.owners.filter((item): item is string => typeof item === 'string'),
        admins: value.admins.filter((item): item is string => typeof item === 'string'),
        banned: value.banned.filter((item): item is string => typeof item === 'string'),
        approvalRequired: value.approvalRequired === true,
        approved: Array.isArray(value.approved)
          ? value.approved.filter((item): item is string => typeof item === 'string')
          : [],
        denied: Array.isArray(value.denied)
          ? value.denied.filter((item): item is string => typeof item === 'string')
          : [],
        pending: Array.isArray(value.pending)
          ? value.pending.filter(isPendingAdmission).slice(0, 100)
          : [],
      };
    }
  } catch {
    // Invalid metadata falls back to a clean policy below.
  }
  return {
    ...DEFAULT_POLICY,
    owners: [],
    admins: [],
    banned: [],
    approved: [],
    denied: [],
    pending: [],
  };
}

function isPendingAdmission(value: unknown): value is PendingAdmission {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PendingAdmission>;
  return (
    typeof candidate.participantIdentity === 'string' &&
    typeof candidate.participantName === 'string' &&
    typeof candidate.requestedAt === 'number'
  );
}

function liveKitUnavailable(error: unknown) {
  if (isNotFoundError(error)) {
    return new AppError('A sala não está mais ativa.', 404, 'ROOM_NOT_FOUND');
  }
  return new AppError(
    'Não foi possível administrar a sala no LiveKit.',
    503,
    'LIVEKIT_UNAVAILABLE',
  );
}

function isNotFoundError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: string | number };
  return (
    candidate.code === 5 || candidate.code === 'not_found' || /not found/i.test(candidate.message)
  );
}
