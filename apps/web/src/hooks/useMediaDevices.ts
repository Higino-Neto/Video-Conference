import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadDevicePreferences,
  loadJoinPreferences,
  saveDevicePreference,
} from '../lib/storage.js';
import { friendlyMediaError } from '../lib/webrtc/mediaErrors.js';

export interface DeviceState {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  cameraId: string;
  microphoneId: string;
  speakerId: string;
  stream: MediaStream | null;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  permissionGranted: boolean;
  loading: boolean;
  error: string | null;
}

interface PreviewOptions {
  cameraEnabled?: boolean;
  microphoneEnabled?: boolean;
}

export function useMediaDevices() {
  const preferences = useRef(loadDevicePreferences());
  const joinPreferences = useRef(loadJoinPreferences());
  const enabledRef = useRef({
    camera: joinPreferences.current.cameraEnabled,
    microphone: joinPreferences.current.microphoneEnabled,
  });
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<DeviceState>({
    cameras: [],
    microphones: [],
    speakers: [],
    cameraId: preferences.current.cameraId,
    microphoneId: preferences.current.microphoneId,
    speakerId: preferences.current.speakerId,
    stream: null,
    cameraEnabled: joinPreferences.current.cameraEnabled,
    microphoneEnabled: joinPreferences.current.microphoneEnabled,
    permissionGranted: false,
    loading: false,
    error: null,
  });

  const enumerate = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setState((current) => ({
      ...current,
      cameras: devices.filter((device) => device.kind === 'videoinput'),
      microphones: devices.filter((device) => device.kind === 'audioinput'),
      speakers: devices.filter((device) => device.kind === 'audiooutput'),
    }));
  }, []);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState((current) => ({ ...current, stream: null }));
  }, []);

  const startPreview = useCallback(
    async (options: PreviewOptions = {}) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState((current) => ({
          ...current,
          error: 'Este navegador não oferece acesso WebRTC à mídia.',
        }));
        return;
      }

      const shouldUseCamera = options.cameraEnabled ?? enabledRef.current.camera;
      const shouldUseMicrophone = options.microphoneEnabled ?? enabledRef.current.microphone;

      setState((current) => ({ ...current, loading: true, stream: null, error: null }));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      try {
        const audioConstraints = (): MediaTrackConstraints => ({
          ...(preferences.current.microphoneId
            ? { deviceId: { exact: preferences.current.microphoneId } }
            : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        });
        const videoConstraints = (): MediaTrackConstraints => ({
          ...(preferences.current.cameraId
            ? { deviceId: { exact: preferences.current.cameraId } }
            : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        });

        let stream: MediaStream;
        let warning: string | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: shouldUseMicrophone ? audioConstraints() : false,
            video: shouldUseCamera ? videoConstraints() : false,
          });
        } catch (combinedError) {
          if (!isRecoverablePartialFailure(combinedError)) throw combinedError;
          if (
            combinedError instanceof DOMException &&
            combinedError.name === 'OverconstrainedError'
          ) {
            preferences.current.cameraId = '';
            preferences.current.microphoneId = '';
          }

          const recoveredTracks: MediaStreamTrack[] = [];
          let audioError: unknown;
          let videoError: unknown;
          if (shouldUseMicrophone) {
            try {
              const audioOnly = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints(),
                video: false,
              });
              recoveredTracks.push(...audioOnly.getAudioTracks());
            } catch (error) {
              audioError = error;
            }
          }
          if (shouldUseCamera) {
            try {
              const videoOnly = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: videoConstraints(),
              });
              recoveredTracks.push(...videoOnly.getVideoTracks());
            } catch (error) {
              videoError = error;
            }
          }
          if (recoveredTracks.length === 0) throw combinedError;
          stream = new MediaStream(recoveredTracks);
          warning = audioError
            ? friendlyMediaError(audioError, 'microphone')
            : videoError
              ? friendlyMediaError(videoError, 'camera')
              : null;
        }
        streamRef.current = stream;
        enabledRef.current = {
          camera: shouldUseCamera && stream.getVideoTracks().length > 0,
          microphone: shouldUseMicrophone && stream.getAudioTracks().length > 0,
        };
        setState((currentState) => ({
          ...currentState,
          stream,
          permissionGranted: true,
          microphoneEnabled: shouldUseMicrophone && stream.getAudioTracks().length > 0,
          cameraEnabled: shouldUseCamera && stream.getVideoTracks().length > 0,
          loading: false,
          error: warning,
        }));
        await enumerate();
      } catch (error) {
        // If a selected device disappeared, retrying with the OS defaults is useful
        // and avoids trapping the user behind a stale localStorage preference.
        if (error instanceof DOMException && error.name === 'OverconstrainedError') {
          preferences.current.cameraId = '';
          preferences.current.microphoneId = '';
        }
        setState((current) => ({
          ...current,
          loading: false,
          permissionGranted: false,
          error: friendlyMediaError(error, 'devices'),
        }));
      }
    },
    [enumerate],
  );

  const selectDevice = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      const key =
        kind === 'videoinput' ? 'cameraId' : kind === 'audioinput' ? 'microphoneId' : 'speakerId';
      preferences.current[key] = deviceId;
      if (kind === 'videoinput') enabledRef.current.camera = true;
      if (kind === 'audioinput') enabledRef.current.microphone = true;
      saveDevicePreference(key, deviceId);
      setState((current) => ({
        ...current,
        [key]: deviceId,
        ...(kind === 'videoinput' ? { cameraEnabled: true } : {}),
        ...(kind === 'audioinput' ? { microphoneEnabled: true } : {}),
      }));
      if (kind === 'videoinput') await startPreview({ cameraEnabled: true });
      if (kind === 'audioinput') await startPreview({ microphoneEnabled: true });
    },
    [startPreview],
  );

  const setCameraEnabled = useCallback(
    (enabled: boolean) => {
      enabledRef.current.camera = enabled;
      setState((current) => ({ ...current, cameraEnabled: enabled }));
      const track = streamRef.current?.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        track.enabled = enabled;
        return;
      }
      if (enabled) {
        void startPreview({ cameraEnabled: true });
        return;
      }
      if (track) {
        track.enabled = false;
      }
    },
    [startPreview],
  );

  const setMicrophoneEnabled = useCallback(
    (enabled: boolean) => {
      enabledRef.current.microphone = enabled;
      setState((current) => ({ ...current, microphoneEnabled: enabled }));
      const track = streamRef.current?.getAudioTracks()[0];
      if (track && track.readyState === 'live') {
        track.enabled = enabled;
        return;
      }
      if (enabled) {
        void startPreview({ microphoneEnabled: true });
        return;
      }
      if (track) {
        track.enabled = false;
      }
    },
    [startPreview],
  );

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    void enumerate().catch(() => undefined);
    const onDeviceChange = () => void enumerate().catch(() => undefined);
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [enumerate]);

  return {
    ...state,
    startPreview,
    stopPreview,
    selectDevice,
    setCameraEnabled,
    setMicrophoneEnabled,
  };
}

function isRecoverablePartialFailure(error: unknown) {
  if (!(error instanceof DOMException)) return false;
  return [
    'NotFoundError',
    'DevicesNotFoundError',
    'NotReadableError',
    'TrackStartError',
    'OverconstrainedError',
  ].includes(error.name);
}
