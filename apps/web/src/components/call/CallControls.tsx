import { useLocalParticipant } from '@livekit/components-react';
import {
  Camera,
  CameraOff,
  LoaderCircle,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  PhoneOff,
  ScreenShareOff,
  Settings,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { isScreenShareCancellation } from '../../lib/webrtc/callMedia.js';
import type { ToastTone } from './CallToast.js';

interface CallControlsProps {
  screenShareSupported: boolean;
  onSettings: () => void;
  onDiagnostics: () => void;
  onLeave: () => void;
  onError: (message: string, tone?: ToastTone, title?: string) => void;
}

export function CallControls({
  screenShareSupported,
  onSettings,
  onDiagnostics,
  onLeave,
  onError,
}: CallControlsProps) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const [pendingAction, setPendingAction] = useState<'camera' | 'microphone' | 'screen'>();
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);

    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  async function toggle(kind: 'camera' | 'microphone' | 'screen', action: () => Promise<unknown>) {
    if (pendingAction) return;
    setPendingAction(kind);

    try {
      await action();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível alterar a mídia.';

      if (kind === 'screen' && isScreenShareCancellation(error)) {
        onError(message || 'Permission denied by user', 'neutral', 'Compartilhamento cancelado');

      } else {
        onError(message, 'danger', 'Não foi possível alterar a mídia');
      }
    } finally {
      setPendingAction(undefined);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();

      else await document.documentElement.requestFullscreen();
    } catch {
      onError('Tela cheia não está disponível neste navegador.', 'neutral', 'Tela cheia');
    }
  }

  return (
    <div className="surface-enter glass safe-bottom absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 border-t border-white/5 px-3 pt-4 sm:gap-3">
      <ControlButton
        label={
          pendingAction === 'microphone'
            ? isMicrophoneEnabled
              ? 'Desligando microfone…'
              : 'Ligando microfone…'
            : isMicrophoneEnabled
              ? 'Silenciar'
              : 'Ligar microfone'
        }
        active={isMicrophoneEnabled}
        pending={pendingAction === 'microphone'}
        disabled={Boolean(pendingAction)}
        onClick={() =>
          void toggle('microphone', () =>
            localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
          )
        }
      >
        {pendingAction === 'microphone' ? (
          <LoaderCircle className="animate-spin" />
        ) : isMicrophoneEnabled ? (
          <Mic />
        ) : (
          <MicOff />
        )}
      </ControlButton>

      <ControlButton
        label={
          pendingAction === 'camera'
            ? isCameraEnabled
              ? 'Desligando câmera…'
              : 'Ligando câmera…'
            : isCameraEnabled
              ? 'Desligar câmera'
              : 'Ligar câmera'
        }
        active={isCameraEnabled}
        pending={pendingAction === 'camera'}
        disabled={Boolean(pendingAction)}
        onClick={() =>
          void toggle('camera', () => localParticipant.setCameraEnabled(!isCameraEnabled))
        }
      >
        {pendingAction === 'camera' ? (
          <LoaderCircle className="animate-spin" />
        ) : isCameraEnabled ? (
          <Camera />
        ) : (
          <CameraOff />
        )}
      </ControlButton>

      <ControlButton
        label={
          pendingAction === 'screen'
            ? isScreenShareEnabled
              ? 'Encerrando compartilhamento…'
              : 'Iniciando compartilhamento…'
            : isScreenShareEnabled
              ? 'Parar de compartilhar sua tela'
              : 'Compartilhar tela'
        }
        active={isScreenShareEnabled}
        attention={isScreenShareEnabled}
        pending={pendingAction === 'screen'}
        disabled={!screenShareSupported || Boolean(pendingAction)}
        onClick={() =>
          void toggle('screen', () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled))
        }
      >
        {pendingAction === 'screen' ? (
          <LoaderCircle className="animate-spin" />
        ) : isScreenShareEnabled ? (
          <ScreenShareOff />
        ) : (
          <MonitorUp />
        )}
      </ControlButton>

      <ControlButton label="Dispositivos" onClick={onSettings}>
        <Settings />
      </ControlButton>

      <ControlButton
        label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
        className="hidden sm:flex"
        disabled={!document.fullscreenEnabled}
        onClick={() => void toggleFullscreen()}
      >
        {isFullscreen ? <Minimize /> : <Maximize />}
      </ControlButton>
      
      <button
        aria-label="Sair da chamada"
        title="Sair da chamada"
        className="ui-motion ml-4 flex h-12 w-14 items-center justify-center rounded-md bg-[#B93842] text-white hover:bg-red-500"
        onClick={onLeave}
      >
        <PhoneOff size={21} />
      </button>
      <button
        className="ui-motion absolute right-3 top-1 m-3 mt-5 text-[10px] text-zinc-600 hover:text-zinc-300"
        onClick={onDiagnostics}
      >
        Diagnóstico
      </button>
    </div>
  );
}

function ControlButton({
  label,
  active,
  attention,
  pending,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  attention?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      className={`text-zinc-100 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 ui-motion flex h-12 w-12 items-center justify-center rounded-md border sm:w-14 ${attention ? ' text-zinc-100' : active === false ? ' text-zinc-100' : 'border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'} disabled:cursor-wait disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
