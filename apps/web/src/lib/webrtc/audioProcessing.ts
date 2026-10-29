import { STORAGE_KEYS } from '@ufmg/config';
import { Track, type AudioCaptureOptions, type Room } from 'livekit-client';

export interface AudioProcessingPreferences {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/**
 * Defaults applied natively to microphone capture.
 *
 * They are intentionally all `true` for testing. To ship any of them disabled by
 * default, just flip the value here: stored user preferences still take priority.
 */
export const DEFAULT_AUDIO_PROCESSING: AudioProcessingPreferences = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

type AudioProcessingKey = keyof AudioProcessingPreferences;

const STORAGE_KEY: Record<AudioProcessingKey, string> = {
  echoCancellation: STORAGE_KEYS.audioEchoCancellation,
  noiseSuppression: STORAGE_KEYS.audioNoiseSuppression,
  autoGainControl: STORAGE_KEYS.audioAutoGainControl,
};

export function loadAudioProcessingPreferences(): AudioProcessingPreferences {
  return {
    echoCancellation: readBoolean(
      STORAGE_KEYS.audioEchoCancellation,
      DEFAULT_AUDIO_PROCESSING.echoCancellation,
    ),
    noiseSuppression: readBoolean(
      STORAGE_KEYS.audioNoiseSuppression,
      DEFAULT_AUDIO_PROCESSING.noiseSuppression,
    ),
    autoGainControl: readBoolean(
      STORAGE_KEYS.audioAutoGainControl,
      DEFAULT_AUDIO_PROCESSING.autoGainControl,
    ),
  };
}

export function saveAudioProcessingPreferences(preferences: AudioProcessingPreferences) {
  for (const key of Object.keys(STORAGE_KEY) as AudioProcessingKey[]) {
    try {
      localStorage.setItem(STORAGE_KEY[key], String(preferences[key]));
    } catch {
      // Audio preferences are non-critical; private browsing can reject localStorage.
    }
  }
}

export function toAudioCaptureOptions(
  preferences: AudioProcessingPreferences,
): Pick<AudioCaptureOptions, AudioProcessingKey> {
  return {
    echoCancellation: preferences.echoCancellation,
    noiseSuppression: preferences.noiseSuppression,
    autoGainControl: preferences.autoGainControl,
  };
}

/**
 * Applies the preferences to the microphone capture defaults and to the live
 * microphone track, without dropping the call or reacquiring the device.
 */
export async function applyAudioProcessing(
  room: Room,
  preferences: AudioProcessingPreferences,
): Promise<void> {
  const options = toAudioCaptureOptions(preferences);

  room.options.audioCaptureDefaults = {
    ...room.options.audioCaptureDefaults,
    ...options,
  };

  const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
  if (track && 'applyConstraints' in track) {
    await track.applyConstraints(options);
  }
}

function readBoolean(key: string, fallback: boolean) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}
