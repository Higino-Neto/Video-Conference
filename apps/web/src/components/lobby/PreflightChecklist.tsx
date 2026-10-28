import { AlertTriangle, Check, Clock3, X } from 'lucide-react';
import type { NetworkQuality } from '@ufmg/shared';

interface CheckItemProps {
  label: string;
  status: 'ok' | 'warning' | 'error' | 'pending';
  detail?: string;
}

function CheckItem({ label, status, detail }: CheckItemProps) {
  const icon = {
    ok: <Check size={16} className="text-positive" />,
    warning: <AlertTriangle size={16} className="text-amber-400" />,
    error: <X size={16} className="text-red-400" />,
    pending: <Clock3 size={16} className="text-zinc-500" />,
  }[status];
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="flex items-center gap-2 text-zinc-200">
        {icon}
        {label}
      </span>
      {detail && <span className="text-right text-xs text-zinc-500">{detail}</span>}
    </div>
  );
}

interface PreflightChecklistProps {
  cameraOk: boolean;
  microphoneOk: boolean;
  speakerOk: boolean;
  speakerSupported: boolean;
  browserOk: boolean;
  secure: boolean;
  backendReachable: boolean;
  livekitConfigured: boolean;
  networkRunning: boolean;
  networkQuality: NetworkQuality;
  httpRttMs: number | undefined;
}

export function PreflightChecklist(props: PreflightChecklistProps) {
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">
        System check
      </h2>
      <div className="divide-y divide-zinc-800">
        <CheckItem
          label="Câmera"
          status={props.cameraOk ? 'ok' : 'warning'}
          detail={props.cameraOk ? 'Pronta' : 'Opcional'}
        />
        <CheckItem
          label="Microfone"
          status={props.microphoneOk ? 'ok' : 'error'}
          detail={props.microphoneOk ? 'Pronto' : 'Necessário para conversar'}
        />
        <CheckItem
          label="Alto-falante"
          status={props.speakerOk ? 'ok' : 'pending'}
          detail={props.speakerSupported ? 'Faça o teste' : 'Seleção não suportada'}
        />
        <CheckItem label="Navegador" status={props.browserOk ? 'ok' : 'error'} />
        <CheckItem
          label="Conexão segura"
          status={props.secure ? 'ok' : 'error'}
          detail={props.secure ? 'HTTPS/contexto local' : 'HTTPS obrigatório'}
        />
        <CheckItem
          label="Servidor"
          status={props.networkRunning ? 'pending' : props.backendReachable ? 'ok' : 'error'}
        />
        <CheckItem
          label="LiveKit"
          status={
            props.networkRunning
              ? 'pending'
              : !props.backendReachable
                ? 'pending'
                : props.livekitConfigured
                  ? 'ok'
                  : 'error'
          }
          detail={props.backendReachable ? 'WebRTC validado ao entrar' : 'Aguardando servidor'}
        />
        <CheckItem
          label="Rede"
          status={
            props.networkRunning
              ? 'pending'
              : !props.backendReachable
                ? 'pending'
                : props.networkQuality === 'poor'
                  ? 'warning'
                  : 'ok'
          }
          detail={
            !props.backendReachable && !props.networkRunning
              ? 'Teste indisponível'
              : props.httpRttMs === undefined
                ? 'Medição indisponível'
                : `RTT HTTP ~${props.httpRttMs} ms`
          }
        />
      </div>
      {/* <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Jitter, perda de pacotes, upload e transporte ICE só ficam tecnicamente disponíveis após a
        conexão WebRTC. O painel de diagnóstico mostrará esses dados sem estimativas inventadas.
      </p> */}
    </section>
  );
}
