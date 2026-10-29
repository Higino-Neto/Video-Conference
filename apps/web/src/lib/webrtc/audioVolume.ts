import { STORAGE_KEYS } from '@ufmg/config';
import { Track, type AudioProcessorOptions, type Room, type TrackProcessor } from 'livekit-client';

export const MIN_VOLUME = 0;
export const MAX_VOLUME = 2;
export const DEFAULT_VOLUME = 1;

export function clampVolume(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, value));
}

export function loadMicrophoneGain() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.microphoneGain);
    if (!stored) return DEFAULT_VOLUME;
    return clampVolume(Number(stored));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveMicrophoneGain(value: number) {
  try {
    localStorage.setItem(STORAGE_KEYS.microphoneGain, String(clampVolume(value)));
  } catch {
    // Audio preferences are non-critical; private browsing can reject localStorage.
  }
}

/**
 * Applies gain to the published microphone track using Web Audio. The browser
 * still applies the capture constraints (noise suppression, echo cancellation)
 * before the signal reaches this processor.
 */
export async function applyMicrophoneGain(room: Room, value: number) {
  const gain = clampVolume(value);
  const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
  if (!track || !('setProcessor' in track)) return;

  const existing = track.getProcessor();
  if (existing instanceof MicrophoneGainProcessor) {
    existing.setGain(gain);
    return;
  }

  if (gain === DEFAULT_VOLUME) return;
  await track.setProcessor(new MicrophoneGainProcessor(gain));
}

/**
 * Applies the per-participant playback volume to every remote audio source.
 * Requires `webAudioMix` in the room options so values above 100% are not
 * clamped by HTMLMediaElement.volume.
 */
export function applyRemoteParticipantVolumes(room: Room, volumes: Record<string, number>) {
  for (const participant of room.remoteParticipants.values()) {
    const volume = clampVolume(volumes[participant.identity] ?? DEFAULT_VOLUME);
    participant.setVolume(volume, Track.Source.Microphone);
    participant.setVolume(volume, Track.Source.ScreenShareAudio);
  }
}

export class MicrophoneGainProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  readonly name = 'ufmg-microphone-gain';
  processedTrack?: MediaStreamTrack;

  private context: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private gainNode: GainNode | undefined;
  private destination: MediaStreamAudioDestinationNode | undefined;

  constructor(private gain = DEFAULT_VOLUME) {}

  async init(options: AudioProcessorOptions) {
    this.context = options.audioContext;
    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => undefined);
    }
    this.connect(options.track);
  }

  async restart(options: AudioProcessorOptions) {
    // The SDK does not provide a new audio context on restarts (for example,
    // after switching microphones), so keep using the one created on init.
    const context = this.context ?? options.audioContext;
    if (!context) {
      await this.init(options);
      return;
    }
    this.context = context;
    this.disconnect();
    this.connect(options.track);
  }

  destroy(): Promise<void> {
    this.disconnect();
    return Promise.resolve();
  }

  setGain(value: number) {
    this.gain = clampVolume(value);
    if (this.gainNode && this.context) {
      this.gainNode.gain.setTargetAtTime(this.gain, this.context.currentTime, 0.02);
    }
  }

  private connect(track: MediaStreamTrack) {
    const context = this.context;
    if (!context) return;

    this.source = context.createMediaStreamSource(new MediaStream([track]));
    this.gainNode = context.createGain();
    this.gainNode.gain.value = this.gain;
    this.destination = context.createMediaStreamDestination();
    this.source.connect(this.gainNode).connect(this.destination);
    const [processedTrack] = this.destination.stream.getAudioTracks();
    if (processedTrack) this.processedTrack = processedTrack;
  }

  private disconnect() {
    this.processedTrack?.stop();
    this.source?.disconnect();
    this.gainNode?.disconnect();
    this.destination?.disconnect();
    delete this.processedTrack;
    this.source = undefined;
    this.gainNode = undefined;
    this.destination = undefined;
  }
}
