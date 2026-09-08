import { ArrowRight, LoaderCircle, PhoneCall, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button.js';
import { createMeetingRoom, fetchRoomStatus } from '../lib/api/client.js';
import { loadLastCall, saveRoomOwnerCredential } from '../lib/storage.js';

export function HomePage() {
  const [room, setRoom] = useState('');
  const [creating, setCreating] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [recentRoom, setRecentRoom] = useState<string>();
  const valid = /^[A-Za-z0-9_-]{4,64}$/.test(room);
  const navigate = (id: string) => {
    window.location.href = `/join/${encodeURIComponent(id)}`;
  };
  const create = async () => {
    setCreating(true);
    setCreateError(undefined);
    try {
      const created = await createMeetingRoom(approvalRequired);
      saveRoomOwnerCredential(created.roomName, created.ownerCredential);
      navigate(created.roomName);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não foi possível criar a sala.');
      setCreating(false);
    }
  };

  useEffect(() => {
    const previous = loadLastCall();
    if (!previous?.active) return;
    const controller = new AbortController();
    void fetchRoomStatus(previous.roomId, controller.signal)
      .then((status) => {
        if (status.participantCount > 0) setRecentRoom(previous.roomId);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-zinc-100">
      <section className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-900/60 p-7 shadow-2xl sm:p-10">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-950">
          <ShieldCheck />
        </div>
        {/* <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          UFMG Video Conference
        </p> */}
        <p className="mt-3 leading-relaxed text-zinc-400">
          Crie uma sala e compartilhe o link.
        </p>
        {recentRoom && (
          <div className="mt-6 rounded-2xl border border-emerald-800/60 bg-emerald-950/25 p-4">
            <div className="flex items-start gap-3">
              <PhoneCall className="mt-0.5 shrink-0 text-emerald-400" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-100">
                  Sua última chamada continua ativa
                </p>
                <p className="mt-1 text-xs text-emerald-200/70">Sala {recentRoom}</p>
                <Button className="mt-3" onClick={() => navigate(recentRoom)}>
                  Voltar para a chamada <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        )}
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-black/20 p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-zinc-100"
            checked={approvalRequired}
            onChange={(event) => setApprovalRequired(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-200">
              Entrada somente com aprovação
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
              Um administrador deverá aceitar cada novo participante antes da entrada.
            </span>
          </span>
        </label>
        <Button
          variant="primary"
          className="mt-7 w-full"
          onClick={() => void create()}
          disabled={creating}
        >
          {creating ? <LoaderCircle className="animate-spin" size={17} /> : null}
          {creating ? 'Criando sala…' : 'Criar Nova Sala'}
          {!creating ? <ArrowRight size={17} /> : null}
        </Button>
        {createError && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {createError}
          </p>
        )}
        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-zinc-600">
          <span className="h-px flex-1 bg-zinc-800" />
          ou entrar em uma sala
          <span className="h-px flex-1 bg-zinc-800" />
        </div>
        <div className="flex gap-2">
          <input
            aria-label="Código da sala"
            value={room}
            onChange={(event) => setRoom(event.target.value.trim())}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && valid) navigate(room);
            }}
            placeholder="Código da sala"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4"
          />
          <Button disabled={!valid} onClick={() => navigate(room)}>
            <ArrowRight size={18} />
          </Button>
        </div>
      </section>
    </main>
  );
}
