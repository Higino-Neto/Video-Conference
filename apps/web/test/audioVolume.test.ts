import { Track, type Room } from 'livekit-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMicrophoneGain,
  applyRemoteParticipantVolumes,
  clampVolume,
  DEFAULT_VOLUME,
  loadMicrophoneGain,
  MAX_VOLUME,
  MicrophoneGainProcessor,
  saveMicrophoneGain,
} from '../src/lib/webrtc/audioVolume.js';

describe('volume preferences', () => {
  beforeEach(() => localStorage.clear());

  it('clamps values to the supported range and recovers from invalid numbers', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(3)).toBe(MAX_VOLUME);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
  });

  it('persists the microphone gain', () => {
    saveMicrophoneGain(1.4);
    expect(loadMicrophoneGain()).toBe(1.4);
  });

  it('falls back to 100% when nothing valid is stored', () => {
    expect(loadMicrophoneGain()).toBe(DEFAULT_VOLUME);
    localStorage.setItem('ufmg.microphoneGain', 'not-a-number');
    expect(loadMicrophoneGain()).toBe(DEFAULT_VOLUME);
  });
});

describe('applyRemoteParticipantVolumes', () => {
  it('applies the volume to microphone and screen share audio', () => {
    const participant = { identity: 'alice', setVolume: vi.fn() };
    const room = {
      remoteParticipants: new Map([['alice', participant]]),
    } as unknown as Room;

    applyRemoteParticipantVolumes(room, { alice: 1.6 });

    expect(participant.setVolume).toHaveBeenNthCalledWith(1, 1.6, Track.Source.Microphone);
    expect(participant.setVolume).toHaveBeenNthCalledWith(2, 1.6, Track.Source.ScreenShareAudio);
  });

  it('uses 100% for participants without a custom value and clamps the rest', () => {
    const bob = { identity: 'bob', setVolume: vi.fn() };
    const carol = { identity: 'carol', setVolume: vi.fn() };
    const room = {
      remoteParticipants: new Map([
        ['bob', bob],
        ['carol', carol],
      ]),
    } as unknown as Room;

    applyRemoteParticipantVolumes(room, { carol: 5 });

    expect(bob.setVolume).toHaveBeenCalledWith(DEFAULT_VOLUME, Track.Source.Microphone);
    expect(carol.setVolume).toHaveBeenCalledWith(MAX_VOLUME, Track.Source.Microphone);
    expect(carol.setVolume).toHaveBeenCalledWith(MAX_VOLUME, Track.Source.ScreenShareAudio);
  });
});

describe('applyMicrophoneGain', () => {
  it('installs a gain processor only when the microphone is boosted', async () => {
    const setProcessor = vi.fn().mockResolvedValue(undefined);
    const track = { getProcessor: () => undefined, setProcessor };
    const room = createRoomWithTrack(track);

    await applyMicrophoneGain(room, 1.5);

    expect(setProcessor).toHaveBeenCalledTimes(1);
    expect(setProcessor.mock.calls[0]?.[0]).toBeInstanceOf(MicrophoneGainProcessor);
  });

  it('does not add a processor for the neutral 100% setting', async () => {
    const setProcessor = vi.fn();
    const room = createRoomWithTrack({ getProcessor: () => undefined, setProcessor });

    await applyMicrophoneGain(room, DEFAULT_VOLUME);

    expect(setProcessor).not.toHaveBeenCalled();
  });

  it('updates the existing processor without replacing it', async () => {
    const processor = new MicrophoneGainProcessor(1.5);
    const setGain = vi.spyOn(processor, 'setGain');
    const setProcessor = vi.fn();
    const room = createRoomWithTrack({ getProcessor: () => processor, setProcessor });

    await applyMicrophoneGain(room, 0.7);

    expect(setGain).toHaveBeenCalledWith(0.7);
    expect(setProcessor).not.toHaveBeenCalled();
  });

  it('does nothing when no microphone track is published', async () => {
    const room = {
      localParticipant: { getTrackPublication: () => undefined },
    } as unknown as Room;

    await expect(applyMicrophoneGain(room, 1.5)).resolves.toBeUndefined();
  });
});

function createRoomWithTrack(track: {
  getProcessor(): unknown;
  setProcessor: ReturnType<typeof vi.fn>;
}) {
  return {
    localParticipant: {
      getTrackPublication: () => ({ audioTrack: track }),
    },
  } as unknown as Room;
}
