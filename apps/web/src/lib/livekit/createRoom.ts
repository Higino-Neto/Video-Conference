import {
  AudioPresets,
  Room,
  ScreenSharePresets,
  VideoPresets,
  supportsAdaptiveStream,
  supportsDynacast,
} from 'livekit-client';
import type { JoinPreferences } from '../../pages/LobbyPage.js';
import {
  loadAudioProcessingPreferences,
  toAudioCaptureOptions,
  type AudioProcessingPreferences,
} from '../webrtc/audioProcessing.js';

export function createCallRoom(
  preferences: JoinPreferences,
  audioProcessing: AudioProcessingPreferences = loadAudioProcessingPreferences(),
) {
  return new Room({
    adaptiveStream: supportsAdaptiveStream(),
    dynacast: supportsDynacast(),
    disconnectOnPageLeave: true,
    stopLocalTrackOnUnpublish: true,
    singlePeerConnection: true,
    audioCaptureDefaults: {
      ...(preferences.microphoneId ? { deviceId: preferences.microphoneId } : {}),
      ...toAudioCaptureOptions(audioProcessing),
      channelCount: 1,
    },
    audioOutput: preferences.speakerId ? { deviceId: preferences.speakerId } : {},
    videoCaptureDefaults: {
      ...(preferences.cameraId ? { deviceId: preferences.cameraId } : {}),
      resolution: VideoPresets.h720.resolution,
      frameRate: 30,
    },
    publishDefaults: {
      // Speech uses a moderate Opus bitrate. Mono RED adds recoverable redundant
      // packets and DTX saves bandwidth during silence without competing with voice.
      audioPreset: AudioPresets.speech,
      red: true,
      dtx: true,
      forceStereo: false,
      simulcast: true,
      videoCodec: 'vp8',
      videoEncoding: VideoPresets.h720.encoding,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      degradationPreference: 'maintain-framerate',
      screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
      screenShareSimulcastLayers: [ScreenSharePresets.h360fps3, ScreenSharePresets.h720fps5],
    },
  });
}
