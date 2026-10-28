import { LayoutGrid, LoaderCircle, X } from 'lucide-react';
import { RoomEvent, Track, VideoPresets, supportsAudioOutputSelection } from 'livekit-client';
import { useCallback, useEffect, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import {
  loadDevicePreferences,
  saveDevicePreference,
  type ThumbnailLayoutPreferences,
  type ThumbnailPosition,
  type ThumbnailSize,
} from '../../lib/storage.js';
import { restorePreviousDevice } from '../../lib/webrtc/callMedia.js';
import { DeviceSelect } from '../lobby/DeviceSelect.js';
import type { ToastTone } from './CallToast.js';

interface DeviceSettingsProps {
  onClose: () => void;
  onError: (message: string, tone?: ToastTone, title?: string) => void;
  layout: ThumbnailLayoutPreferences;
  onLayoutChange(layout: ThumbnailLayoutPreferences): void;
}

type SelectedDevices = Partial<Record<MediaDeviceKind, string>>;

export function DeviceSettings({ onClose, onError, layout, onLayoutChange }: DeviceSettingsProps) {
  const room = useRoomContext();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [quality, setQuality] = useState<'720p' | '1080p'>(
    () => loadDevicePreferences().preferredVideoQuality,
  );
  const [switching, setSwitching] = useState<MediaDeviceKind>();
  const [selected, setSelected] = useState<SelectedDevices>(() => ({
    audioinput: room.getActiveDevice('audioinput') ?? '',
    videoinput: room.getActiveDevice('videoinput') ?? '',
    audiooutput: room.getActiveDevice('audiooutput') ?? '',
  }));

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error('MediaDevices não está disponível.');
    }
    setDevices(await navigator.mediaDevices.enumerateDevices());
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('MediaDevices não está disponível.');
      }

      const all = await navigator.mediaDevices.enumerateDevices();
      if (active) setDevices(all);

    };
    void load().catch(() =>
      onError(
        'Não foi possível listar os dispositivos conectados.',
        'danger',
        'Dispositivos indisponíveis',
      ),
    );
    const handleDeviceChange = () =>
      void load().catch(() =>
        onError(
          'A lista de dispositivos não pôde ser atualizada após uma mudança no hardware.',
          'neutral',
          'Dispositivos alterados',
        ),
      );

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    const handleActiveDevice = (kind: MediaDeviceKind, deviceId: string) =>
      setSelected((current) => ({ ...current, [kind]: deviceId }));

    room.on(RoomEvent.ActiveDeviceChanged, handleActiveDevice);

    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      room.off(RoomEvent.ActiveDeviceChanged, handleActiveDevice);
    };
  }, [onError, room]);

  async function select(kind: MediaDeviceKind, deviceId: string) {
    if (switching || !deviceId) return;
    const previousDeviceId = room.getActiveDevice(kind);
    const cameraWasEnabled = room.localParticipant.isCameraEnabled;
    const microphoneWasEnabled = room.localParticipant.isMicrophoneEnabled;
    setSwitching(kind);
    setSelected((current) => ({ ...current, [kind]: deviceId }));

    try {
      const switched = await room.switchActiveDevice(kind, deviceId, true);

      if (!switched) throw new Error('O navegador recusou o dispositivo selecionado.');

      saveDevicePreference(
        kind === 'videoinput' ? 'cameraId' : kind === 'audioinput' ? 'microphoneId' : 'speakerId',
        deviceId,
      );
      await loadDevices().catch(() => undefined);
    } catch {
      const restored = await restorePreviousDevice(
        room,
        kind,
        previousDeviceId,
        cameraWasEnabled,
        microphoneWasEnabled,
      );

      setSelected((current) => ({ ...current, [kind]: previousDeviceId ?? '' }));
      onError(
        restored
          ? 'O novo dispositivo não respondeu. O dispositivo anterior foi restaurado e a chamada continua ativa.'
          : 'O novo dispositivo não respondeu e não foi possível restaurar o anterior. Reconecte o dispositivo ou escolha outro.',
        'danger',
        restored ? 'Troca de dispositivo desfeita' : 'Dispositivo indisponível',
      );

    } finally {
      setSwitching(undefined);
    }
  }

  async function changeQuality(value: '720p' | '1080p') {
    const previousQuality = quality;
    setQuality(value);
    saveDevicePreference('preferredVideoQuality', value);
    const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);

    try {
      const track = publication?.videoTrack;
      if (track && typeof track.restartTrack === 'function') {
        await track.restartTrack({
          resolution:
            value === '1080p' ? VideoPresets.h1080.resolution : VideoPresets.h720.resolution,
          frameRate: 30,
        });
        return;
      }
      // Fallback: if restart not possible, try to re-publish with new constraints
      const wasEnabled = room.localParticipant.isCameraEnabled;
      if (wasEnabled) {
        await room.localParticipant.setCameraEnabled(false);
      }
      await room.localParticipant.setCameraEnabled(true, {
        resolution:
          value === '1080p' ? VideoPresets.h1080.resolution : VideoPresets.h720.resolution,
        frameRate: 30,
      });
    } catch {
      onError(
        'O hardware ou navegador não aceitou essa resolução. A qualidade anterior foi mantida.',
        'danger',
        'Qualidade não suportada',
      );
      setQuality(previousQuality);
      try {
        const publication2 = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (!publication2 && room.localParticipant.isCameraEnabled) {
          await room.localParticipant.setCameraEnabled(false);
        }
        if (room.localParticipant.isCameraEnabled === false) {
          await room.localParticipant.setCameraEnabled(true);
        }
      } catch {
        // ignore recovery errors
      }
    }
  }

  function updateLayout(patch: Partial<ThumbnailLayoutPreferences>) {
    onLayoutChange({ ...layout, ...patch });
  }

  return (
    <aside className="surface-enter bg-zinc-900 absolute right-4 top-16 z-40 max-h-[calc(100dvh-8rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-md border border-zinc-700 p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">Dispositivos</h2>
        <button aria-label="Fechar configurações" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <div className="relative grid gap-4" aria-busy={Boolean(switching)}>
        {switching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-zinc-950/70 text-sm text-zinc-300 backdrop-blur-sm">
            <LoaderCircle className="mr-2 animate-spin" size={17} /> Testando dispositivo…
          </div>
        )}

        <DeviceSelect
          label="Microfone"
          kind="audioinput"
          devices={devices.filter((d) => d.kind === 'audioinput')}
          value={selected.audioinput ?? ''}
          disabled={Boolean(switching)}
          onChange={(kind, id) => void select(kind, id)}
        />

        <DeviceSelect
          label="Câmera"
          kind="videoinput"
          devices={devices.filter((d) => d.kind === 'videoinput')}
          value={selected.videoinput ?? ''}
          disabled={Boolean(switching)}
          onChange={(kind, id) => void select(kind, id)}
        />

        <DeviceSelect
          label="Alto-falante"
          kind="audiooutput"
          devices={devices.filter((d) => d.kind === 'audiooutput')}
          value={selected.audiooutput ?? ''}
          disabled={!supportsAudioOutputSelection() || Boolean(switching)}
          unsupportedMessage="Seleção não suportada neste navegador"
          onChange={(kind, id) => void select(kind, id)}
        />

        <label className="grid gap-2 text-sm text-zinc-300">
          Qualidade da câmera
          <select
            className="min-h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3"
            value={quality}
            onChange={(event) => void changeQuality(event.target.value as '720p' | '1080p')}
          >
            <option value="720p">720p / 30 fps — confiável</option>
            <option value="1080p">1080p / 30 fps — rede rápida</option>
          </select>
        </label>

      </div>
      <section className="mt-6 border-t border-zinc-700/70 pt-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <LayoutGrid size={16} /> Layout das miniaturas
        </h3>
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-zinc-300">
            Posição
            <select
              className="min-h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3"
              value={layout.position}
              onChange={(event) =>
                updateLayout({ position: event.target.value as ThumbnailPosition })
              }
            >
              <option value="bottom">Embaixo</option>
              <option value="top">No topo</option>
              <option value="left">À esquerda</option>
              <option value="right">À direita</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Tamanho
            <select
              className="min-h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3"
              value={layout.size}
              onChange={(event) => updateLayout({ size: event.target.value as ThumbnailSize })}
            >
              <option value="small">Pequeno — até 20 por página</option>
              <option value="medium">Médio — até 12 por página</option>
              <option value="large">Grande — até 8 por página</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-blue-500"
              checked={layout.overlay}
              onChange={(event) => updateLayout({ overlay: event.target.checked })}
            />
            <span>
              <strong className="block text-zinc-100">Sobrepor ao vídeo principal</strong>
              <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                Desative para reservar espaço e nunca cobrir a pessoa ou apresentação em foco.
              </span>
            </span>
          </label>
          
        </div>
      </section>
    </aside>
  );
}
