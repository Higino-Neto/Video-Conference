
import {
  isTrackReference,
  useIsSpeaking,
  useTrackVolume,
  VideoTrack,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { CameraOff, MicOff, MonitorUp } from 'lucide-react';
import { Track, type Participant } from 'livekit-client';

interface ParticipantVideoProps {
  trackRef: TrackReferenceOrPlaceholder;
  mirror?: boolean;
  contain?: boolean;
  compact?: boolean;
  screenShare?: boolean;
}

export function ParticipantVideo({
  trackRef,
  mirror = false,
  contain = false,
  compact = false,
  screenShare = false,
}: ParticipantVideoProps) {
  const participant = trackRef.participant;
  const microphone = participant.getTrackPublication(Track.Source.Microphone);

  const hasPlayableVideo =
    isTrackReference(trackRef) &&
    Boolean(trackRef.publication.track) &&
    !trackRef.publication.isMuted;

  const displayName =
    participant.name || (participant.isLocal ? 'Você' : 'Convidado');

  return (
    <div
      data-participant-id={participant.identity}
      className="relative h-full w-full overflow-hidden bg-[#111214]"
    >
      {/* Espaçamento externo real entre o vídeo e as bordas da área disponível. */}
      <div
        className={`relative mx-auto h-full w-[calc(100%-48px)] overflow-hidden bg-zinc-700 ${
          compact ? 'rounded-md' : 'rounded-md'
        }`}
      >
        {hasPlayableVideo ? (
          <VideoTrack
            trackRef={trackRef}
            className={`h-full w-full ${
              contain ? 'object-contain' : 'object-cover'
            } ${mirror ? 'scale-x-[-1]' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-700">
            <div
              className={`flex items-center justify-center rounded-md bg-[#282A2F] font-medium tracking-wide text-zinc-100 ${
                compact ? 'h-14 w-14 text-lg' : 'h-24 w-24 text-3xl'
              }`}
              aria-label={`Iniciais de ${displayName}`}
            >
              {initials(displayName)}
            </div>
          </div>
        )}

        {/* Borda sutil quando o participante está falando. */}
        {/* {!screenShare && <SpeakingFrame participant={participant} />} */}

        {/* Identificação do participante. */}
        <div
          className={`absolute bottom-3 left-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md border border-white/[0.08] bg-[#111214]/80 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-md ${
            compact ? 'bottom-2 left-2 px-2 py-1' : ''
          }`}
        >
          {!hasPlayableVideo && (
            <CameraOff
              size={13}
              aria-label="Câmera desligada"
              className="shrink-0 text-zinc-300"
            />
          )}

          {(!microphone || microphone.isMuted) && (
            <MicOff
              size={13}
              aria-label="Microfone desligado"
              className="shrink-0 text-red-300"
            />
          )}

          {screenShare && (
            <MonitorUp
              size={13}
              aria-label="Compartilhando tela"
              className="shrink-0 text-blue-300"
            />
          )}

          <span className="truncate">{displayName}</span>

          {participant.isLocal && !compact && (
            <span className="shrink-0 text-zinc-400">(você)</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeakingFrame({ participant }: { participant: Participant }) {
  const nativeSpeaking = useIsSpeaking(participant);
  const microphone = participant.getTrackPublication(Track.Source.Microphone);

  if (participant.isLocal) {
    return (
      <LocalSpeakingFrame
        participant={participant}
        nativeSpeaking={nativeSpeaking}
        microphoneMuted={!microphone || microphone.isMuted}
      />
    );
  }

  return (
    <SpeakingBorder
      isSpeaking={Boolean(
        microphone && !microphone.isMuted && nativeSpeaking,
      )}
    />
  );
}

function LocalSpeakingFrame({
  participant,
  nativeSpeaking,
  microphoneMuted,
}: {
  participant: Participant;
  nativeSpeaking: boolean;
  microphoneMuted: boolean;
}) {
  const microphone = participant.getTrackPublication(Track.Source.Microphone);

  const microphoneRef: TrackReference | undefined = microphone
    ? {
        participant,
        publication: microphone,
        source: Track.Source.Microphone,
      }
    : undefined;

  const localVolume = useTrackVolume(microphoneRef);

  return (
    <SpeakingBorder
      isSpeaking={
        !microphoneMuted && (nativeSpeaking || localVolume >= 0.035)
      }
    />
  );
}

function SpeakingBorder({ isSpeaking }: { isSpeaking: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-speaking={isSpeaking || undefined}
      className={`pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 transition-[border-color,box-shadow] duration-200 ${
        isSpeaking
          ? 'border-emerald-400/90 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.15)]'
          : 'border-transparent'
      }`}
    />
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}
