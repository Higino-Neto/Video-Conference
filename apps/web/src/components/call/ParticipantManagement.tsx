import {
  CameraOff,
  Crown,
  LoaderCircle,
  MicOff,
  ShieldPlus,
  UserMinus,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { AdmissionDecision, ModerationAction, PendingAdmission } from '@ufmg/shared';

export interface ManagedParticipant {
  identity: string;
  name: string;
  isAdmin: boolean;
}

interface ParticipantManagementProps {
  participants: ManagedParticipant[];
  pendingAdmissions: PendingAdmission[];
  onClose(): void;
  onAction(participant: ManagedParticipant, action: ModerationAction): Promise<void>;
  onAdmission(admission: PendingAdmission, decision: AdmissionDecision): Promise<void>;
}

export function ParticipantManagement({
  participants,
  pendingAdmissions,
  onClose,
  onAction,
  onAdmission,
}: ParticipantManagementProps) {
  const [pending, setPending] = useState<string>();

  async function run(participant: ManagedParticipant, action: ModerationAction) {
    if (
      (action === 'ban' || action === 'remove') &&
      !window.confirm(
        action === 'ban'
          ? `Banir ${participant.name}? Essa pessoa não poderá retornar com esta identidade.`
          : `Remover ${participant.name} da chamada?`,
      )
    ) {
      return;
    }
    const key = `${participant.identity}:${action}`;
    setPending(key);
    try {
      await onAction(participant, action);
    } catch {
      // The parent reports API errors in a toast; keep the panel ready for retry.
    } finally {
      setPending(undefined);
    }
  }

  async function decide(admission: PendingAdmission, decision: AdmissionDecision) {
    const key = `${admission.participantIdentity}:${decision}`;
    setPending(key);
    try {
      await onAdmission(admission, decision);
    } catch {
      // The parent reports API errors in a toast; keep the request available.
    } finally {
      setPending(undefined);
    }
  }

  return (
    <aside
      aria-label="Gerenciar participantes"
      className="surface-enter bg-zinc-800 absolute bottom-24 right-4 top-20 z-40 flex w-[min(26rem,calc(100%-2rem))] flex-col overflow-hidden rounded-md border border-white/10 shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Gerenciar participantes</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {participants.length} {participants.length === 1 ? 'pessoa' : 'pessoas'} ·{' '}
            {pendingAdmissions.length} aguardando
          </p>
        </div>
        <button
          type="button"
          className="ui-motion rounded-md p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
          aria-label="Fechar gerenciamento"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {pendingAdmissions.length > 0 && (
          <section className="rounded-md border border-amber-700/40 bg-amber-950/20 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-200">
              Pedidos de entrada
            </h3>
            <div className="mt-2 space-y-2">
              {pendingAdmissions.map((admission) => (
                <div
                  key={admission.participantIdentity}
                  className="flex items-center gap-2 rounded-md bg-black/25 p-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {admission.participantName}
                  </span>
                  <button
                    type="button"
                    className="ui-motion rounded-md bg-green-300 p-2 text-green-100 hover:bg-green-400 disabled:opacity-50"
                    aria-label={`Aceitar ${admission.participantName}`}
                    disabled={Boolean(pending)}
                    onClick={() => void decide(admission, 'approve')}
                  >
                    {pending === `${admission.participantIdentity}:approve` ? (
                      <LoaderCircle className="animate-spin" size={15} />
                    ) : (
                      <UserCheck size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="ui-motion rounded-md bg-red-900/35 p-2 text-red-200 hover:bg-red-900/55 disabled:opacity-50"
                    aria-label={`Recusar ${admission.participantName}`}
                    disabled={Boolean(pending)}
                    onClick={() => void decide(admission, 'deny')}
                  >
                    {pending === `${admission.participantIdentity}:deny` ? (
                      <LoaderCircle className="animate-spin" size={15} />
                    ) : (
                      <X size={15} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        {participants.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-black/20 p-4 text-center text-sm text-zinc-400">
            Nenhum outro participante na sala.
          </p>
        ) : (
          participants.map((participant) => (
            <section
              key={participant.identity}
              className="rounded-md border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-700 text-xs font-semibold">
                  {participant.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {participant.name}
                </span>
                {participant.isAdmin && (
                  <span className="flex items-center gap-1 rounded-md bg-amber-400/15 px-2 py-1 text-[11px] text-amber-200">
                    <Crown size={12} /> Admin
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton
                  label="Silenciar"
                  icon={<MicOff size={14} />}
                  busy={pending === `${participant.identity}:mute_microphone`}
                  disabled={Boolean(pending)}
                  onClick={() => void run(participant, 'mute_microphone')}
                />
                <ActionButton
                  label="Desligar câmera"
                  icon={<CameraOff size={14} />}
                  busy={pending === `${participant.identity}:disable_camera`}
                  disabled={Boolean(pending)}
                  onClick={() => void run(participant, 'disable_camera')}
                />
                {!participant.isAdmin && (
                  <ActionButton
                    label="Tornar admin"
                    icon={<ShieldPlus size={14} />}
                    busy={pending === `${participant.identity}:promote`}
                    disabled={Boolean(pending)}
                    onClick={() => void run(participant, 'promote')}
                  />
                )}
                <ActionButton
                  label="Remover"
                  icon={<UserMinus size={14} />}
                  busy={pending === `${participant.identity}:remove`}
                  disabled={Boolean(pending)}
                  onClick={() => void run(participant, 'remove')}
                />
                <ActionButton
                  label="Banir"
                  icon={<UserX size={14} />}
                  busy={pending === `${participant.identity}:ban`}
                  disabled={Boolean(pending)}
                  danger
                  onClick={() => void run(participant, 'ban')}
                />
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function ActionButton({
  label,
  icon,
  busy,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  danger?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={`ui-motion flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-xs disabled:cursor-wait disabled:opacity-50 ${
        danger
          ? 'border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40'
          : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? <LoaderCircle className="animate-spin" size={14} /> : icon}
      {label}
    </button>
  );
}
