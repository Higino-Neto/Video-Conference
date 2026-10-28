import { AlertTriangle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

export type ToastTone = 'danger' | 'neutral';

export interface CallToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  title?: string;
}

interface CallToastProps {
  toast: CallToastMessage;
  onClose(): void;
  belowQuestion?: boolean;
}

export function CallToast({ toast, onClose, belowQuestion = false }: CallToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, toast.tone === 'danger' ? 8_000 : 5_000);
    return () => window.clearTimeout(timeout);
  }, [onClose, toast.id, toast.tone]);

  const danger = toast.tone === 'danger';
  return (
    <div
      role={danger ? 'alert' : 'status'}
      aria-live={danger ? 'assertive' : 'polite'}
      className={`fade-enter absolute left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-start gap-3 rounded-md border p-4 text-sm shadow-2xl ${belowQuestion ? 'top-48' : 'top-24'} ${
        danger
          ? 'border-red-900 bg-red-950/95 text-red-100'
          : 'border-zinc-700 bg-zinc-900 text-zinc-200'
      }`}
    >
      {danger ? (
        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      ) : (
        <Info className="mt-0.5 shrink-0 text-zinc-400" size={18} />
      )}
      <span className="min-w-0 flex-1">
        {toast.title && <strong className="mb-0.5 block">{toast.title}</strong>}
        <span className={danger ? 'text-red-100' : 'text-zinc-400'}>{toast.message}</span>
      </span>
      <button
        type="button"
        aria-label="Fechar notificação"
        className="shrink-0 rounded-md p-1 text-current opacity-70 hover:opacity-100"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}
