import { RoomAudioRenderer, RoomContext, useChat } from '@livekit/components-react';
import { Headphones, MessageSquare, Share2, ShieldCheck, UsersRound } from 'lucide-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdmissionDecision,
  ModerationAction,
  PendingAdmission,
  TokenResponse,
} from '@ufmg/shared';
import { CallControls } from '../components/call/CallControls.js';
import { CallToast, type CallToastMessage, type ToastTone } from '../components/call/CallToast.js';
import { ChatPanel } from '../components/call/ChatPanel.js';
import { ConnectionNotice } from '../components/call/ConnectionNotice.js';
import { DeviceSettings } from '../components/call/DeviceSettings.js';
import {
  ParticipantManagement,
  type ManagedParticipant,
} from '../components/call/ParticipantManagement.js';
import { VideoStage } from '../components/call/VideoStage.js';
import { DiagnosticsPanel } from '../components/diagnostics/DiagnosticsPanel.js';
import { useCallConnection } from '../hooks/useCallConnection.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useNetworkStats } from '../hooks/useNetworkStats.js';
import { createCallRoom } from '../lib/livekit/createRoom.js';
import { decideAdmission, fetchAdmissionQueue, moderateParticipant } from '../lib/api/client.js';
import { logger } from '../lib/logger.js';
import {
  loadThumbnailLayoutPreferences,
  saveThumbnailLayoutPreferences,
  type ThumbnailLayoutPreferences,
} from '../lib/storage.js';
import { detectCapabilities } from '../lib/webrtc/capabilities.js';
import type { JoinPreferences } from './LobbyPage.js';

interface CallPageProps {
  session: TokenResponse;
  roomId: string;
  preferences: JoinPreferences;
  onLeave(): void;
}

export function CallPage({ session, roomId, preferences, onLeave }: CallPageProps) {
  const [room] = useState(() => createCallRoom(preferences));
  const lifecycle = useRef<Promise<void>>(Promise.resolve());
  const nextToastId = useRef(0);
  const [toast, setToast] = useState<CallToastMessage>();
  const [connectionFailed, setConnectionFailed] = useState(false);

  const notify = useCallback((message: string, tone: ToastTone = 'danger', title?: string) => {
    nextToastId.current += 1;
    setToast({ id: nextToastId.current, message, tone, ...(title ? { title } : {}) });
  }, []);

  useEffect(() => {
    let active = true;
    lifecycle.current = lifecycle.current.then(async () => {
      if (!active) return;
      try {
        setConnectionFailed(false);
        await room.prepareConnection(session.serverUrl, session.participantToken);
        await room.connect(session.serverUrl, session.participantToken, {
          autoSubscribe: true,
          maxRetries: 3,
          websocketTimeout: 15_000,
          peerConnectionTimeout: 15_000,
        });
        if (!active) return;

        await room.startAudio().catch(() => undefined);
        if (preferences.microphoneEnabled) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
          } catch (mediaError) {
            logger.warn('Microphone publication failed', {
              message: mediaError instanceof Error ? mediaError.message : 'unknown',
            });
            notify(
              'A chamada está conectada, mas o microfone não pôde ser iniciado. Verifique a permissão ou selecione outro dispositivo.',
              'danger',
              'Microfone indisponível',
            );
          }
        }
        if (preferences.cameraEnabled) {
          try {
            await room.localParticipant.setCameraEnabled(true);
          } catch (mediaError) {
            logger.warn('Camera publication failed', {
              message: mediaError instanceof Error ? mediaError.message : 'unknown',
            });
            notify(
              'A chamada está conectada em áudio, mas a câmera não pôde ser iniciada. Você pode selecionar outro dispositivo.',
              'danger',
              'Câmera indisponível',
            );
          }
        }
        logger.info('Connected to LiveKit room', { roomId });
      } catch (connectionError) {
        if (!active) return;
        logger.error('LiveKit connection failed', connectionError, { roomId });
        setConnectionFailed(true);
        notify(friendlyConnectionError(connectionError), 'danger', 'Falha na conexão');
      }
    });

    return () => {
      active = false;
      lifecycle.current = lifecycle.current.then(() => room.disconnect(true));
    };
  }, [
    preferences.cameraEnabled,
    preferences.microphoneEnabled,
    notify,
    room,
    roomId,
    session.participantToken,
    session.serverUrl,
  ]);

  return (
    <RoomContext.Provider value={room}>
      <CallExperience
        roomId={roomId}
        room={room}
        session={session}
        toast={toast}
        dismissToast={() => setToast(undefined)}
        notify={notify}
        connectionFailed={connectionFailed}
        onLeave={onLeave}
      />
    </RoomContext.Provider>
  );
}

interface CallExperienceProps {
  roomId: string;
  room: ReturnType<typeof createCallRoom>;
  session: TokenResponse;
  toast: CallToastMessage | undefined;
  dismissToast(): void;
  notify(message: string, tone?: ToastTone, title?: string): void;
  connectionFailed: boolean;
  onLeave(): void;
}

function CallExperience({
  roomId,
  room,
  session,
  toast,
  dismissToast,
  notify,
  connectionFailed,
  onLeave,
}: CallExperienceProps) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const { chatMessages, send: sendChatMessage, isSending: isSendingChatMessage } = useChat();
  const [participantRevision, setParticipantRevision] = useState(0);
  const [pendingAdmissions, setPendingAdmissions] = useState<PendingAdmission[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [thumbnailLayout, setThumbnailLayout] = useState(loadThumbnailLayoutPreferences);
  const { status } = useCallConnection(room);
  const snapshot = useNetworkStats(room);
  const [capabilities] = useState(detectCapabilities);
  const toggleDiagnostics = useCallback(() => setDiagnosticsOpen((open) => !open), []);
  const updateThumbnailLayout = useCallback((layout: ThumbnailLayoutPreferences) => {
    setThumbnailLayout(layout);
    saveThumbnailLayoutPreferences(layout);
  }, []);
  useKeyboardShortcuts(toggleDiagnostics);

  // Tracks how many chat messages we'd already accounted for last time the effect below got called so we can tell how many are new
  const previousChatMessageCount = useRef(0);
  // Tracks the last number sent to setUnreadChatCount
  const lastUnreadCountSent = useRef(0);

  useEffect(() => {
    const newMessageCount = chatMessages.length - previousChatMessageCount.current;
    previousChatMessageCount.current = chatMessages.length;

    if (newMessageCount > 0 && !chatOpen) {
      const nextUnreadCount = lastUnreadCountSent.current + newMessageCount;
      lastUnreadCountSent.current = nextUnreadCount;
      setUnreadChatCount(nextUnreadCount);
    }
  }, [chatMessages.length, chatOpen]);

  const toggleChat = useCallback(() => {
    setChatOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        lastUnreadCountSent.current = 0;
        setUnreadChatCount(0);
      }
      return nextOpen;
    });
  }, []);


  useEffect(() => {
    const update = () => setAudioBlocked(!room.canPlaybackAudio);
    room.on(RoomEvent.AudioPlaybackStatusChanged, update);
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, update);
    };
  }, [room]);

  useEffect(() => {
    const refresh = () => setParticipantRevision((revision) => revision + 1);
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.ParticipantAttributesChanged, refresh);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
      room.off(RoomEvent.ParticipantAttributesChanged, refresh);
    };
  }, [room]);

  const isAdmin =
    session.role === 'admin' || room.localParticipant.attributes['ufmg.role'] === 'admin';
  const managedParticipants = useMemo<ManagedParticipant[]>(
    () =>
      [...room.remoteParticipants.values()].map((participant) => ({
        identity: participant.identity,
        name: participant.name || 'Convidado',
        isAdmin: participant.attributes['ufmg.role'] === 'admin',
      })),
    [participantRevision, room],
  );

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const refresh = () => {
      void fetchAdmissionQueue(roomId, session.resumeCredential)
        .then((response) => {
          if (active) setPendingAdmissions(response.pending);
        })
        .catch((error: unknown) => {
          if (active && managementOpen)
            notify(
              error instanceof Error ? error.message : 'Não foi possível atualizar os pedidos.',
              'danger',
              'Pedidos indisponíveis',
            );
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAdmin, managementOpen, notify, roomId, session.resumeCredential]);

  async function moderate(target: ManagedParticipant, action: ModerationAction) {
    try {
      const result = await moderateParticipant(
        roomId,
        target.identity,
        action,
        session.resumeCredential,
      );
      const messages: Record<ModerationAction, [string, string]> = {
        mute_microphone: [
          result.affectedTracks > 0
            ? `O microfone de ${target.name} foi silenciado.`
            : `${target.name} já estava com o microfone desligado.`,
          'Microfone atualizado',
        ],

        disable_camera: [
          result.affectedTracks > 0
            ? `A câmera de ${target.name} foi desligada.`
            : `${target.name} já estava com a câmera desligada.`,
          'Câmera atualizada',
        ],

        remove: [`${target.name} foi removido da chamada.`, 'Participante removido'],
        ban: [`${target.name} foi banido desta sala.`, 'Participante banido'],
        promote: [`${target.name} agora também pode administrar a sala.`, 'Admin concedido'],
      };

      notify(messages[action][0], 'neutral', messages[action][1]);
      setParticipantRevision((revision) => revision + 1);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível concluir a moderação.',
        'danger',
        'Ação não concluída',
      );
      throw error;
    }
  }

  async function handleAdmission(admission: PendingAdmission, decision: AdmissionDecision) {
    try {
      await decideAdmission(
        roomId,
        admission.participantIdentity,
        decision,
        session.resumeCredential,
      );
      setPendingAdmissions((current) =>
        current.filter((request) => request.participantIdentity !== admission.participantIdentity),
      );
      notify(
        decision === 'approve'
          ? `${admission.participantName} poderá entrar na chamada.`
          : `A entrada de ${admission.participantName} foi recusada.`,
        'neutral',
        decision === 'approve' ? 'Entrada autorizada' : 'Entrada recusada',
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível responder ao pedido.',
        'danger',
        'Decisão não enviada',
      );
      throw error;
    }
  }

  async function leave() {
    await room.disconnect(true);
    onLeave();
  }

  async function shareCall() {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        notify(
          'O link da chamada foi copiado para a área de transferência.',
          'neutral',
          'Link copiado',
        );
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: `Sala ${roomId}`,
          text: 'Entre na minha chamada de vídeo.',
          url,
        });
        notify('O convite da chamada foi compartilhado.', 'neutral', 'Convite enviado');
        return;
      }
      throw new Error('Compartilhamento indisponível');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') {
        notify('O compartilhamento do convite foi cancelado.', 'neutral', 'Convite não enviado');
      } else {
        notify(`Copie e envie este endereço: ${url}`, 'neutral', 'Link da chamada');
      }
    }
  }

  const showStage = room.state !== ConnectionState.Disconnected || status === 'connecting';
  return (
    <main className="relative h-[100dvh] min-h-[520px] overflow-hidden bg-black text-zinc-100">
      <header className="glass absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-white/5 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              type="button"
              className="ui-motion flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-zinc-700/40"
              aria-label="Gerenciar participantes"
              title="Gerenciar participantes"
              onClick={() => setManagementOpen((open) => !open)}
            >
              <UsersRound size={15} />
              {/* <span className="hidden md:inline">Gerenciar</span> */}
              {pendingAdmissions.length > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-black"
                  aria-label={`${pendingAdmissions.length} aguardando aprovação`}
                >
                  {pendingAdmissions.length > 99 ? '99+' : pendingAdmissions.length}
                </span>
              )}
            </button>
          )}
          <ShieldCheck size={18} />
          <span className="text-sm font-semibold">Sala {roomId}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="ui-motion relative flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            aria-label="Chat"
            title="Chat"
            onClick={toggleChat}
          >
            <MessageSquare size={15} />
            {unreadChatCount > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-black"
                aria-label={`${unreadChatCount} novas mensagens`}
              >
                {unreadChatCount > 99 ? '+99' : unreadChatCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ui-motion flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            onClick={() => void shareCall()}
          >
            <Share2 size={15} />
            {/* <span className="hidden sm:inline">Compartilhar chamada</span> */}
          </button>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${qualityColor(snapshot.quality)}`} />
            <span className="hidden sm:inline">
              {snapshot.quality === 'unknown' ? 'Medindo rede' : snapshot.quality}
            </span>
          </div>
        </div>
      </header>
      
      <div className="absolute inset-x-0 bottom-0 top-16">
        {showStage ? (
          <VideoStage layout={thumbnailLayout} />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            A chamada foi encerrada.
          </div>
        )}
      </div>
      <RoomAudioRenderer room={room} />
      <ConnectionNotice status={connectionFailed ? 'failed' : status} />
      {audioBlocked && (
        <button
          className="absolute left-1/2 top-24 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black"
          onClick={() =>
            void room
              .startAudio()
              .then(() => setAudioBlocked(false))
              .catch(() =>
                notify(
                  'O navegador ainda bloqueou a reprodução. Verifique a permissão de áudio do site.',
                  'neutral',
                  'Áudio bloqueado',
                ),
              )
          }
        >
          <Headphones size={17} /> Ativar áudio da chamada
        </button>
      )}
      {toast && <CallToast toast={toast} onClose={dismissToast} />}
      <CallControls
        screenShareSupported={capabilities.screenShare}
        onSettings={() => setSettingsOpen((open) => !open)}
        onDiagnostics={toggleDiagnostics}
        onLeave={() => void leave()}
        onError={notify}
      />
      {settingsOpen && (
        <DeviceSettings
          layout={thumbnailLayout}
          onLayoutChange={updateThumbnailLayout}
          onClose={() => setSettingsOpen(false)}
          onError={notify}
        />
      )}
      {diagnosticsOpen && (
        <DiagnosticsPanel snapshot={snapshot} onClose={() => setDiagnosticsOpen(false)} />
      )}
      {chatOpen && (
        <ChatPanel
          messages={chatMessages}
          send={sendChatMessage}
          isSending={isSendingChatMessage}
          onClose={() => setChatOpen(false)}
        />
      )}
      {isAdmin && managementOpen && (
        <ParticipantManagement
          participants={managedParticipants}
          pendingAdmissions={pendingAdmissions}
          onClose={() => setManagementOpen(false)}
          onAction={moderate}
          onAdmission={handleAdmission}
        />
      )}
    </main>
  );
}

function qualityColor(quality: string) {
  return quality === 'excellent'
    ? 'bg-emerald-400'
    : quality === 'good'
      ? 'bg-lime-400'
      : quality === 'fair'
        ? 'bg-amber-400'
        : quality === 'poor'
          ? 'bg-red-500'
          : 'bg-zinc-600';
}

function friendlyConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/token|jwt|expired/i.test(message))
    return 'O acesso à sala expirou ou é inválido. Volte ao lobby e tente novamente.';
  if (/room.*closed|not found/i.test(message)) return 'A sala não está disponível no momento.';
  if (/permission|notallowed/i.test(message))
    return 'O navegador bloqueou o acesso à câmera ou ao microfone.';
  return 'Não foi possível estabelecer a chamada WebRTC. Verifique sua rede, firewall ou VPN e tente novamente.';
}
