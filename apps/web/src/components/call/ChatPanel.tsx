import type { ReceivedChatMessage } from '@livekit/components-react';
import { Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ChatPanelProps {
  messages: ReceivedChatMessage[];
  send: (message: string) => Promise<unknown>;
  isSending: boolean;
  onClose: () => void;
}

export function ChatPanel({ messages, send, isSending, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft('');
    await send(text);
  }

  return (
    <aside className="glass fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-zinc-800 shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Chamada
          </p>
          <h2 className="mt-1 text-lg font-semibold">Chat</h2>
        </div>
        <button
          aria-label="Fechar chat"
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-600">
            Nenhuma mensagem ainda. Diga olá!
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => (
              <li key={`${message.from?.identity}-${message.timestamp}`} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-zinc-200">
                    {message.from?.name || message.from?.identity || 'Anônimo'}
                  </span>
                  <span className="text-[11px] text-zinc-600">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                <p className="mt-0.5 break-words text-zinc-300">{message.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="border-t border-zinc-800 p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva uma mensagem…"
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Enviar mensagem"
            disabled={!draft.trim() || isSending}
            className="ui-motion flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
