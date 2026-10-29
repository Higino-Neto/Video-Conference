import {
  TrackSource,
  type ParticipantInfo,
  type Room,
  type RoomServiceClient,
} from 'livekit-server-sdk';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { LiveKitRoomService } from '../src/services/roomManagement.js';
import { SessionCredentialService } from '../src/services/sessionCredentials.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret-value-at-least-32-bytes',
  WEB_ORIGIN: 'http://localhost:5173',
});

describe('LiveKitRoomService', () => {
  it('enforces admission approval, an empty-room timeout and authenticated moderation', async () => {
    const credentials = new SessionCredentialService(config.livekitApiSecret);
    const created = credentials.createRoom(true);
    let room: Room | undefined;
    // const participants: ParticipantInfo[] = [
    //   {
    //     identity: 'guest_owner123',
    //     tracks: [],
    //   } as ParticipantInfo,
    // ];

    const participants: unknown[] = [
      {
        identity: 'guest_owner123',
        tracks: [],
      },
    ];
    const target = {
      identity: 'guest_target12',
      tracks: [
        { sid: 'TR_MIC', source: TrackSource.MICROPHONE, muted: false },
        { sid: 'TR_CAM', source: TrackSource.CAMERA, muted: false },
      ],
    } as ParticipantInfo;
    const createRoom = vi.fn((options: { name: string; metadata?: string }) => {
      room = { name: options.name, metadata: options.metadata ?? '' } as Room;
      return Promise.resolve(room);
    });
    const updateRoomMetadata = vi.fn((_roomName: string, metadata: string) => {
      room = { ...room, metadata } as Room;
      return Promise.resolve(room);
    });
    const updateParticipant = vi.fn().mockResolvedValue(target);
    const mutePublishedTrack = vi.fn().mockResolvedValue(target.tracks[0]);
    const removeParticipant = vi.fn().mockResolvedValue(undefined);
    const client = {
      listRooms: vi.fn(() => Promise.resolve(room ? [room] : [])),
      createRoom,
      updateRoomMetadata,
      listParticipants: vi.fn(() => Promise.resolve(participants)),
      updateParticipant,
      mutePublishedTrack,
      removeParticipant,
    } as unknown as RoomServiceClient;
    const service = new LiveKitRoomService(config, credentials, client);

    await service.initializeRoom(created.roomName, true);
    await expect(
      service.resolveRole(created.roomName, 'guest_early123', undefined, 'Visitante antecipado'),
    ).rejects.toMatchObject({ code: 'ADMISSION_PENDING' });
    await expect(
      service.resolveRole(created.roomName, 'guest_owner123', created.ownerCredential),
    ).resolves.toBe('admin');
    expect(createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ departureTimeout: 60, maxParticipants: 100 }),
    );

    const resumeCredential = credentials.createResumeCredential(created.roomName, 'guest_owner123');
    await service.decideAdmission(created.roomName, 'guest_early123', 'deny', resumeCredential);
    await expect(
      service.resolveRole(created.roomName, 'guest_target12', undefined, 'Bruno'),
    ).rejects.toMatchObject({ code: 'ADMISSION_PENDING' });
    await expect(service.getAdmissions(created.roomName, resumeCredential)).resolves.toEqual({
      pending: [
        expect.objectContaining({
          participantIdentity: 'guest_target12',
          participantName: 'Bruno',
        }),
      ],
    });
    await service.decideAdmission(created.roomName, 'guest_target12', 'approve', resumeCredential);
    await expect(
      service.resolveRole(created.roomName, 'guest_target12', undefined, 'Bruno'),
    ).resolves.toBe('participant');
    await expect(
      service.resolveRole(created.roomName, 'guest_denied12', undefined, 'Carla'),
    ).rejects.toMatchObject({ code: 'ADMISSION_PENDING' });
    await service.decideAdmission(created.roomName, 'guest_denied12', 'deny', resumeCredential);
    await expect(
      service.resolveRole(created.roomName, 'guest_denied12', undefined, 'Carla'),
    ).rejects.toMatchObject({ code: 'ADMISSION_DENIED' });
    participants.push(target);

    await expect(
      service.moderate(created.roomName, 'guest_target12', 'mute_microphone', resumeCredential),
    ).resolves.toMatchObject({ affectedTracks: 1 });
    expect(mutePublishedTrack).toHaveBeenCalledWith(
      created.roomName,
      'guest_target12',
      'TR_MIC',
      true,
    );

    await service.moderate(created.roomName, 'guest_target12', 'promote', resumeCredential);
    expect(updateParticipant).toHaveBeenCalledWith(created.roomName, 'guest_target12', {
      attributes: { 'ufmg.role': 'admin' },
    });
    await service.moderate(created.roomName, 'guest_target12', 'ban', resumeCredential);
    expect(removeParticipant).toHaveBeenCalledWith(created.roomName, 'guest_target12');
    await expect(service.resolveRole(created.roomName, 'guest_target12')).rejects.toMatchObject({
      code: 'PARTICIPANT_BANNED',
    });

    await expect(
      service.moderate(created.roomName, 'guest_target12', 'remove', 'invalid'),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION' });
  });
});
