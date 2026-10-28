import {
  Camera,
  CameraOff,
  Headphones,
  LoaderCircle,
  Mic,
  MicOff,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button.js';
import { CameraPreview } from '../components/lobby/CameraPreview.js';
import { DeviceSelect } from '../components/lobby/DeviceSelect.js';
import { PreflightChecklist } from '../components/lobby/PreflightChecklist.js';
import { useMediaDevices } from '../hooks/useMediaDevices.js';
import { useMicrophoneLevel } from '../hooks/useMicrophoneLevel.js';
import { usePreflightNetwork } from '../hooks/usePreflightNetwork.js';
import { loadJoinPreferences, saveJoinPreferences } from '../lib/storage.js';
import { detectCapabilities } from '../lib/webrtc/capabilities.js';
import { playSpeakerTest } from '../lib/webrtc/testSpeaker.js';

export interface JoinPreferences {
  name: string;
  cameraId: string;
  microphoneId: string;
  speakerId: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
}

interface LobbyPageProps {
  roomId: string;
  joining: boolean;
  approvalPending: boolean;
  joinError: string | undefined;
  onJoin(preferences: JoinPreferences): Promise<void>;
}

export function LobbyPage({ roomId, joining, approvalPending, joinError, onJoin }: LobbyPageProps) {
  const [savedPreferences] = useState(loadJoinPreferences);
  const [name, setName] = useState(savedPreferences.name);
  const [speakerOk, setSpeakerOk] = useState(false);
  const media = useMediaDevices();
  const startPreview = media.startPreview;
  const network = usePreflightNetwork();
  const [capabilities] = useState(() => detectCapabilities());
  const level = useMicrophoneLevel(media.stream);
  const ready =
    name.trim().length > 0 &&
    capabilities.browserSupported &&
    capabilities.secureContext &&
    network.backendReachable &&
    network.livekitConfigured;

  useEffect(() => {
    if (!savedPreferences.cameraEnabled && !savedPreferences.microphoneEnabled) return;
    void startPreview({
      cameraEnabled: savedPreferences.cameraEnabled,
      microphoneEnabled: savedPreferences.microphoneEnabled,
    });
  }, [savedPreferences, startPreview]);

  async function testSpeaker() {
    await playSpeakerTest(media.speakerId);
    setSpeakerOk(true);
  }

  async function join() {
    saveJoinPreferences({
      name: name.trim(),
      cameraEnabled: media.cameraEnabled,
      microphoneEnabled: media.microphoneEnabled,
    });
    await onJoin({
      name: name.trim(),
      cameraId: media.cameraId,
      microphoneId: media.microphoneId,
      speakerId: media.speakerId,
      cameraEnabled: media.cameraEnabled && media.cameras.length > 0,
      microphoneEnabled: media.microphoneEnabled && media.microphones.length > 0,
    });
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              <ShieldCheck size={15} /> UFMG Video Conference
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Prepare-se para a chamada</h1>
            <p className="mt-2 text-sm text-zinc-500">Sala {roomId}</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.8fr)]">
          <section className="space-y-5">
            <CameraPreview stream={media.stream} cameraEnabled={media.cameraEnabled} />
            {!media.permissionGranted ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-5 text-center">
                <h2 className="font-semibold">Permita câmera e microfone</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
                  O acesso é usado apenas para o preview e para a chamada. Você pode entrar com a
                  câmera desligada.
                </p>
                <Button
                  className="mt-4"
                  variant="primary"
                  onClick={() => void media.startPreview()}
                  disabled={media.loading}
                >
                  {media.loading ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <Camera size={18} />
                  )}
                  Configurar dispositivos
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 rounded-md border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-2">
                <DeviceSelect
                  label="Microfone"
                  kind="audioinput"
                  devices={media.microphones}
                  value={media.microphoneId}
                  onChange={(kind, id) => void media.selectDevice(kind, id)}
                />
                <DeviceSelect
                  label="Câmera"
                  kind="videoinput"
                  devices={media.cameras}
                  value={media.cameraId}
                  onChange={(kind, id) => void media.selectDevice(kind, id)}
                />
                <DeviceSelect
                  label="Alto-falante"
                  kind="audiooutput"
                  devices={media.speakers}
                  value={media.speakerId}
                  disabled={!capabilities.speakerSelection}
                  unsupportedMessage="Seleção não suportada neste navegador"
                  onChange={(kind, id) => void media.selectDevice(kind, id)}
                />
                <div className="grid content-end gap-2">
                  <span className="text-sm text-zinc-300">Nível do microfone</span>
                  <div
                    className="h-3 overflow-hidden rounded-md bg-zinc-800"
                    aria-label={`Nível do microfone ${Math.round(level * 100)}%`}
                  >
                    <div
                      className="h-full rounded-md bg-positive transition-[width] duration-100"
                      style={{ width: `${Math.max(2, level * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button onClick={() => media.setMicrophoneEnabled(!media.microphoneEnabled)}>
                    {media.microphoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}{' '}
                    {media.microphoneEnabled ? 'Microfone ligado' : 'Microfone desligado'}
                  </Button>
                  <Button onClick={() => media.setCameraEnabled(!media.cameraEnabled)}>
                    {media.cameraEnabled ? <Camera size={17} /> : <CameraOff size={17} />}{' '}
                    {media.cameraEnabled ? 'Câmera ligada' : 'Somente áudio'}
                  </Button>
                  <Button onClick={() => void testSpeaker()}>
                    <Headphones size={17} /> Testar som
                  </Button>
                </div>
              </div>
            )}
            {media.error && (
              <div
                role="alert"
                className="rounded-md border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200"
              >
                {media.error}{' '}
                <button className="ml-2 underline" onClick={() => void media.startPreview()}>
                  Tentar novamente
                </button>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <label className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-300">
              Seu nome
              <input
                autoComplete="name"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Como você deseja aparecer"
                className="min-h-12 rounded-md border border-zinc-700 bg-zinc-950 px-4 text-base text-white placeholder:text-zinc-600"
              />
            </label>
            <PreflightChecklist
              cameraOk={media.cameraEnabled && media.cameras.length > 0}
              microphoneOk={media.microphoneEnabled && media.microphones.length > 0}
              speakerOk={speakerOk}
              speakerSupported={capabilities.speakerSelection}
              browserOk={capabilities.browserSupported}
              secure={capabilities.secureContext}
              backendReachable={network.backendReachable}
              livekitConfigured={network.livekitConfigured}
              networkRunning={network.running}
              networkQuality={network.quality}
              httpRttMs={network.httpRttMs}
            />
            {network.backendReachable && network.quality === 'poor' && !network.running && (
              <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-4 text-sm leading-relaxed text-amber-100">
                <strong>Rede instável detectada.</strong>
                <br />
                Use Ethernet, desative VPN se possível e pause downloads antes de entrar.
              </div>
            )}
            {(joinError || network.error) && (
              <div
                role="alert"
                className="rounded-md border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200"
              >
                {joinError ?? network.error}
              </div>
            )}
            {approvalPending && (
              <div
                role="status"
                className="rounded-md border border-amber-800/50 bg-amber-950/25 p-4 text-sm text-amber-100"
              >
                <strong>Aguardando aprovação</strong>
                <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
                  Um administrador recebeu sua solicitação. Esta tela entrará na chamada
                  automaticamente quando ela for aceita.
                </p>
              </div>
            )}
            <Button
              variant="primary"
              className="w-full cursor-pointer"
              disabled={!ready || joining || approvalPending}
              onClick={() => void join()}
            >
              {joining ? <LoaderCircle className="animate-spin" size={18} /> : null}
              {joining
                ? 'Conectando…'
                : approvalPending
                  ? 'Aguardando administrador…'
                  : 'Entrar na chamada'}
            </Button>
            {!ready && (
              <p className="text-center text-xs text-zinc-500">
                Informe seu nome e conclua as verificações essenciais. Mesmo sem câmera ou
                microfone, é possível entrar para ouvir.
              </p>
            )}
            <button
              className="mx-auto flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
              onClick={network.rerun}
            >
              <RefreshCw size={13} /> Repetir teste de rede
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}
