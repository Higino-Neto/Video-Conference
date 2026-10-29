import { AccessToken } from 'livekit-server-sdk';
import type { TokenResponse } from '@ufmg/shared';
import type { ServerConfig } from '../config.js';
import { AppError } from '../errors.js';
import type { ValidTokenRequest } from '../schemas.js';
import { LiveKitRoomService } from './roomManagement.js';
import { SessionCredentialService } from './sessionCredentials.js';

export interface TokenIssuer {
  issue(request: ValidTokenRequest): Promise<TokenResponse>;
}

interface RoomInspector {
  listParticipants(roomName: string): Promise<readonly { identity: string }[]>;
  resolveRole?(
    roomName: string,
    participantIdentity: string,
    ownerCredential?: string,
    participantName?: string,
  ): Promise<'admin' | 'participant'>;
}

export class LiveKitTokenIssuer implements TokenIssuer {
  private readonly roomInspector: RoomInspector | undefined;
  private readonly reservations = new Map<string, number>();

  constructor(
    private readonly config: ServerConfig,
    roomInspector?: RoomInspector,
    private readonly credentials = new SessionCredentialService(config.livekitApiSecret),
  ) {
    this.roomInspector =
      roomInspector ??
      (config.livekitConfigured ? new LiveKitRoomService(config, this.credentials) : undefined);
  }

  async issue(request: ValidTokenRequest): Promise<TokenResponse> {
    if (!this.config.livekitConfigured) {
      throw new AppError(
        'LiveKit não está configurado. Preencha LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET no arquivo .env.',
        503,
        'LIVEKIT_NOT_CONFIGURED',
      );
    }

    if (this.config.reservedRooms && !this.config.allowedRooms.has(request.roomName)) {
      throw new AppError('Esta sala não está disponível.', 403, 'ROOM_NOT_AUTHORIZED');
    }

    const resumeIsValid = Boolean(
      this.credentials.verifyResume(
        request.resumeCredential,
        request.roomName,
        request.participantIdentity,
      ),
    );
    const participants = await this.readParticipants(request.roomName);
    const duplicateIsActive = participants.some(
      (participant) => participant.identity === request.participantIdentity,
    );
    if (duplicateIsActive && !resumeIsValid) {
      throw new AppError('Esta identidade já está conectada à sala.', 409, 'DUPLICATE_IDENTITY');
    }

    const role = this.roomInspector?.resolveRole
      ? await this.roomInspector.resolveRole(
          request.roomName,
          request.participantIdentity,
          request.ownerCredential,
          request.participantName,
        )
      : 'participant';

    const now = Date.now();
    this.pruneReservations(now);
    for (const participant of participants) {
      this.reservations.delete(`${request.roomName}:${participant.identity}`);
    }

    // Room capacity limit removed - no longer enforced.

    const reservationKey = `${request.roomName}:${request.participantIdentity}`;
    if (this.reservations.has(reservationKey) && !resumeIsValid) {
      throw new AppError('Uma entrada já está sendo processada.', 409, 'TOKEN_RECENTLY_ISSUED');
    }
    this.reservations.set(reservationKey, now + 45_000);

    try {
      const accessToken = new AccessToken(this.config.livekitApiKey, this.config.livekitApiSecret, {
        identity: request.participantIdentity,
        name: request.participantName,
        metadata: JSON.stringify({ role }),
        attributes: { 'ufmg.role': role },
        ttl: this.config.tokenTtlSeconds,
      });
      accessToken.addGrant({
        roomJoin: true,
        room: request.roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: false,
        roomAdmin: false,
        roomCreate: false,
        roomList: false,
        roomRecord: false,
      });

      return {
        serverUrl: this.config.livekitUrl,
        participantToken: await accessToken.toJwt(),
        expiresIn: this.config.tokenTtlSeconds,
        resumeCredential: this.credentials.createResumeCredential(
          request.roomName,
          request.participantIdentity,
        ),
        role,
      };
    } catch (error) {
      this.reservations.delete(reservationKey);
      throw error;
    }
  }

  private async readParticipants(roomName: string) {
    try {
      if (!this.roomInspector) return [];
      return await this.roomInspector.listParticipants(roomName);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw new AppError(
        'Não foi possível verificar a disponibilidade da sala.',
        503,
        'LIVEKIT_UNAVAILABLE',
      );
    }
  }

  private pruneReservations(now: number) {
    for (const [key, expiresAt] of this.reservations) {
      if (expiresAt <= now) this.reservations.delete(key);
    }
  }
}

function isNotFoundError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: string | number };
  return (
    candidate.code === 5 || candidate.code === 'not_found' || /not found/i.test(candidate.message)
  );
}
