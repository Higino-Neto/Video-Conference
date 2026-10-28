import { X } from 'lucide-react';
import type { DiagnosticsSnapshot, MediaDiagnostics } from '../../types/diagnostics.js';

interface DiagnosticsPanelProps {
  snapshot: DiagnosticsSnapshot;
  onClose: () => void;
}

export function DiagnosticsPanel({ snapshot, onClose }: DiagnosticsPanelProps) {
  return (
    <aside className="fixed bg-zinc-800 inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-zinc-800 p-6">
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Real-time
          </p>
          <h2 className="mt-1 text-xl font-semibold">Diagnóstico da chamada</h2>
          <p className="mt-1 text-xs text-zinc-500">Atualização a cada 1,5 s · Ctrl + Shift + D</p>
        </div>
        <button
          aria-label="Fechar diagnóstico"
          className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <DiagnosticSection
        title="Connection"
        rows={[
          ['State', snapshot.connectionState],
          ['Quality', snapshot.quality],
          ['Transport', snapshot.transport],
          ['ICE', snapshot.iceState],
          ['RTT', format(snapshot.network.rttMs, 'ms')],
          ['Jitter', format(snapshot.network.jitterMs, 'ms')],
          ['Packet loss', format(snapshot.network.packetLossPercent, '%')],
          ['Available outgoing', format(snapshot.network.availableOutgoingBitrateKbps, 'kbps')],
        ]}
      />
      <MediaSection title="Video" media={snapshot.video} />
      <MediaSection title="Audio" media={snapshot.audio} />
      <p className="mt-6 text-xs leading-relaxed text-zinc-600">
        Valores ausentes não são estimados. Transporte é derivado do par ICE selecionado publicado
        pelo RTCStatsReport; em alguns navegadores ele pode ficar indisponível.
      </p>
    </aside>
  );
}

function MediaSection({ title, media }: { title: string; media: MediaDiagnostics }) {
  const resolution = media.width && media.height ? `${media.width} × ${media.height}` : undefined;
  return (
    <DiagnosticSection
      title={title}
      rows={[
        ['Codec', media.codec],
        ['Resolution', resolution],
        ['FPS', format(media.fps)],
        ['Bitrate', format(media.bitrateKbps, 'kbps')],
        ['Packet loss', format(media.packetLossPercent, '%')],
        ['Jitter', format(media.jitterMs, 'ms')],
      ]}
    />
  );
}

function DiagnosticSection({
  title,
  rows,
}: {
  title: string;
  rows: [string, string | undefined][];
}) {
  return (
    <section className="mb-7">
      <h3 className="mb-3 border-b border-zinc-800 pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-right font-mono text-zinc-200">{value ?? 'Unavailable'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function format(value: number | undefined, unit = '') {
  return value === undefined
    ? undefined
    : `${value.toFixed(value >= 100 ? 0 : 1)}${unit ? ` ${unit}` : ''}`;
}
