import { Check, LoaderCircle, Unplug } from 'lucide-react';
import type { CallConnectionStatus } from '../../hooks/useCallConnection.js';

export function ConnectionNotice({ status }: { status: CallConnectionStatus }) {
  if (status === 'connected') return null;

  const content = {
    connecting: [
      <LoaderCircle key="i" className="animate-spin" size={17} />,
      'Conectando…',
      'Estabelecendo mídia segura.',
    ],
    reconnecting: [
      <LoaderCircle key="i" className="animate-spin" size={17} />,
      'Reconectando…',
      'Tentando restaurar a chamada.',
    ],
    reconnected: [
      <Check key="i" size={17} className="text-positive" />,
      'Conexão restaurada',
      'A chamada voltou ao normal.',
    ],
    disconnected: [<Unplug key="i" size={17} />, 'Desconectado', 'A conexão com a sala terminou.'],
    failed: [
      <Unplug key="i" size={17} />,
      'Falha na conexão',
      'Não foi possível iniciar a chamada.',
    ],
  }[status];
  
  return (
    <div
      role="status"
      className="glass absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-zinc-700 px-4 py-3 shadow-xl"
    >
      <span>{content[0]}</span>
      <span>
        <strong className="block text-sm">{content[1]}</strong>
        <small className="text-zinc-400">{content[2]}</small>
      </span>
    </div>
  );
}
