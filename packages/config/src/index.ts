export const MEDIA_DEFAULTS = {
  camera: { width: 1280, height: 720, frameRate: 30 },
  screen: { frameRate: 15 },
  statsIntervalMs: 1_500,
  meetingMode: 'high-reliability',
} as const;

export const STORAGE_KEYS = {
  cameraId: 'ufmg.cameraId',
  microphoneId: 'ufmg.microphoneId',
  speakerId: 'ufmg.speakerId',
  preferredVideoQuality: 'ufmg.preferredVideoQuality',
  thumbnailPosition: 'ufmg.thumbnailPosition',
  thumbnailSize: 'ufmg.thumbnailSize',
  thumbnailOverlay: 'ufmg.thumbnailOverlay',
  audioEchoCancellation: 'ufmg.audioEchoCancellation',
  audioNoiseSuppression: 'ufmg.audioNoiseSuppression',
  audioAutoGainControl: 'ufmg.audioAutoGainControl',
  joinPreferences: 'ufmg.joinPreferences',
  lastCall: 'ufmg.lastCall',
} as const;
