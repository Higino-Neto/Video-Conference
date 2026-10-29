import type { Room } from 'livekit-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAudioProcessing,
  DEFAULT_AUDIO_PROCESSING,
  loadAudioProcessingPreferences,
  saveAudioProcessingPreferences,
  toAudioCaptureOptions,
} from '../src/lib/webrtc/audioProcessing.js';

describe('audio processing preferences', () => {
  beforeEach(() => localStorage.clear());

  it('enables noise suppression, gain control and echo cancellation by default', () => {
    expect(DEFAULT_AUDIO_PROCESSING).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(loadAudioProcessingPreferences()).toEqual(DEFAULT_AUDIO_PROCESSING);
  });

  it('persists and restores user overrides', () => {
    saveAudioProcessingPreferences({
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false,
    });

    expect(loadAudioProcessingPreferences()).toEqual({
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false,
    });
  });

  it('falls back to the code defaults when stored values are invalid', () => {
    localStorage.setItem('ufmg.audioEchoCancellation', 'yes');
    localStorage.setItem('ufmg.audioNoiseSuppression', '');
    localStorage.setItem('ufmg.audioAutoGainControl', '0');

    expect(loadAudioProcessingPreferences()).toEqual(DEFAULT_AUDIO_PROCESSING);
  });
});

describe('applyAudioProcessing', () => {
  beforeEach(() => localStorage.clear());

  it('updates the capture defaults and the live microphone constraints', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const room = createFakeRoom({ applyConstraints });
    const preferences = {
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false,
    };

    await applyAudioProcessing(room, preferences);

    expect(room.options.audioCaptureDefaults).toMatchObject({
      deviceId: 'microphone-1',
      channelCount: 1,
      ...toAudioCaptureOptions(preferences),
    });
    expect(applyConstraints).toHaveBeenCalledWith(toAudioCaptureOptions(preferences));
  });

  it('still updates the defaults when no microphone track is published', async () => {
    const room = createFakeRoom({ track: undefined });

    await applyAudioProcessing(room, {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
    });

    expect(room.options.audioCaptureDefaults).toMatchObject({
      deviceId: 'microphone-1',
      noiseSuppression: false,
    });
  });
});

function createFakeRoom({
  track = { applyConstraints: vi.fn() },
  applyConstraints,
}: {
  track?: { applyConstraints: ReturnType<typeof vi.fn> } | undefined;
  applyConstraints?: ReturnType<typeof vi.fn>;
} = {}) {
  if (applyConstraints && track) track.applyConstraints = applyConstraints;

  return {
    options: {
      audioCaptureDefaults: { deviceId: 'microphone-1', channelCount: 1 },
    },
    localParticipant: {
      getTrackPublication: () => (track ? { audioTrack: track } : undefined),
    },
  } as unknown as Room;
}
