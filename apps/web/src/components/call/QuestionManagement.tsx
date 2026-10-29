import {
  Archive,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CircleCheck,
  Edit3,
  Eye,
  LoaderCircle,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import type { MeetingQuestion, QuestionAction, QuestionQueueResponse } from '@ufmg/shared';
import {
  ApiError,
  createQuestion,
  reorderQuestions,
  runQuestionAction,
  updateQuestion,
} from '../../lib/api/client.js';
import type { ToastTone } from './CallToast.js';

export interface QuestionAuthor {
  identity: string;
  name: string;
}

interface QuestionManagementProps {
  roomName: string;
  resumeCredential: string;
  state: QuestionQueueResponse;
  authors: QuestionAuthor[];
  loading: boolean;
  error?: string;
  onClose(): void;
  onChange(state: QuestionQueueResponse): void;
  onRefresh(): Promise<unknown>;
  notify(message: string, tone?: ToastTone, title?: string): void;
}

export function QuestionManagement({
  roomName,
  resumeCredential,
  state,
  authors,
  loading,
  error,
  onClose,
  onChange,
  onRefresh,
  notify,
}: QuestionManagementProps) {
  const [text, setText] = useState('');
  const [authorChoice, setAuthorChoice] = useState(authors[0]?.identity ?? 'custom');
  const [customAuthor, setCustomAuthor] = useState('');
  const [pending, setPending] = useState<string>();
  const [editing, setEditing] = useState<MeetingQuestion>();
  const [editText, setEditText] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [showAnswered, setShowAnswered] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const selectedAuthor = authors.find((author) => author.identity === authorChoice);
  const authorName = selectedAuthor?.name ?? customAuthor.trim();
  const canCreate = text.trim().length > 0 && authorName.length > 0 && !pending && !loading;

  async function addQuestion() {
    if (!canCreate) return;
    await execute(
      'create',
      () =>
        createQuestion(
          roomName,
          {
            text: text.trim(),
            authorName,
            ...(selectedAuthor ? { authorIdentity: selectedAuthor.identity } : {}),
            expectedRevision: state.revision,
          },
          resumeCredential,
        ),
      'Pergunta adicionada à fila.',
    );
    setText('');
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void addQuestion();
    }
  }

  function startEditing(question: MeetingQuestion) {
    setEditing(question);
    setEditText(question.text);
    setEditAuthor(question.authorName);
  }

  async function saveEdit() {
    if (!editing || !editText.trim() || !editAuthor.trim()) return;
    const authorChanged = editAuthor.trim() !== editing.authorName;
    await execute(
      `edit:${editing.id}`,
      () =>
        updateQuestion(
          roomName,
          editing.id,
          {
            text: editText.trim(),
            authorName: editAuthor.trim(),
            authorIdentity: authorChanged ? null : editing.authorIdentity,
            expectedRevision: state.revision,
          },
          resumeCredential,
        ),
      'Pergunta atualizada.',
    );
    setEditing(undefined);
  }

  async function action(question: MeetingQuestion, value: QuestionAction) {
    const messages: Record<QuestionAction, string> = {
      show: 'Pergunta exibida para todos.',
      answer: 'Pergunta marcada como respondida.',
      requeue: 'Pergunta devolvida ao fim da fila.',
      archive: 'Pergunta arquivada.',
    };
    await execute(
      `${value}:${question.id}`,
      () => runQuestionAction(roomName, question.id, value, state.revision, resumeCredential),
      messages[value],
    );
  }

  async function move(question: MeetingQuestion, offset: -1 | 1) {
    const ids = state.queuedQuestions.map((item) => item.id);
    const index = ids.indexOf(question.id);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination]!, ids[index]!];
    await execute(
      `move:${question.id}`,
      () => reorderQuestions(roomName, ids, state.revision, resumeCredential),
      'Ordem da fila atualizada.',
      false,
    );
  }

  async function execute(
    key: string,
    operation: () => Promise<QuestionQueueResponse>,
    successMessage: string,
    announce = true,
  ) {
    setPending(key);
    try {
      const result = await operation();
      onChange(result);
      if (announce) notify(successMessage, 'neutral', 'Perguntas');
    } catch (error) {
      const conflict =
        error instanceof ApiError &&
        (error.code === 'QUESTION_REVISION_CONFLICT' || error.code === 'QUESTION_ORDER_MISMATCH');
      if (conflict) await onRefresh().catch(() => undefined);
      notify(
        error instanceof Error ? error.message : 'Não foi possível alterar a pergunta.',
        conflict ? 'neutral' : 'danger',
        conflict ? 'Fila atualizada' : 'Alteração não concluída',
      );
      throw error;
    } finally {
      setPending(undefined);
    }
  }

  return (
    <aside
      aria-label="Gerenciar perguntas"
      className="surface-enter absolute bottom-24 right-2 top-18 z-40 flex w-[min(30rem,calc(100%-1rem))] flex-col overflow-hidden rounded-md border border-white/10 shadow-2xl sm:right-4 sm:top-20 sm:w-[min(30rem,calc(100%-2rem))]"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MessageCircleQuestion size={17} className="text-green-300" /> Perguntas
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {state.queuedQuestions.length} na fila · {state.answeredQuestions.length} respondidas
          </p>
        </div>
        <button
          type="button"
          className="ui-motion rounded-md p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
          aria-label="Fechar perguntas"
          title="Fechar"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      {error && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-700/35 bg-amber-950/25 px-4 py-3 text-xs text-amber-100"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={15} />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            className="shrink-0 font-semibold text-amber-200 hover:text-white"
            onClick={() => void onRefresh().catch(() => undefined)}
          >
            Tentar novamente
          </button>
        </div>
      )}

      <form
        className="border-b border-white/10 bg-black/20 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void addQuestion().catch(() => undefined);
        }}
      >
        <label className="mb-1.5 block text-xs font-medium text-zinc-300" htmlFor="question-author">
          Pergunta feita por
        </label>
        <select
          id="question-author"
          className="h-10 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-white"
          value={authorChoice}
          onChange={(event) => setAuthorChoice(event.target.value)}
        >
          {authors.map((author) => (
            <option key={author.identity} value={author.identity}>
              {author.name}
            </option>
          ))}
          <option value="custom">Outra pessoa…</option>
        </select>
        {authorChoice === 'custom' && (
          <input
            className="mt-2 h-10 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-500"
            aria-label="Nome de quem fez a pergunta"
            maxLength={60}
            placeholder="Nome da pessoa"
            value={customAuthor}
            onChange={(event) => setCustomAuthor(event.target.value)}
          />
        )}
        <label className="sr-only" htmlFor="new-question">
          Nova pergunta
        </label>
        <textarea
          id="new-question"
          className="mt-2 min-h-20 w-full resize-none rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm leading-5 text-white placeholder:text-zinc-500"
          maxLength={500}
          placeholder="Digite a pergunta…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-zinc-500">{text.length}/500</span>
          <button
            type="submit"
            className="ui-motion flex h-9 items-center gap-2 rounded-md bg-green-300 px-3 text-xs font-semibold text-green-950 hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canCreate}
          >
            {pending === 'create' ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <Plus size={15} />
            )}
            Adicionar
          </button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && state.revision === 0 ? (
          <div className="flex h-28 items-center justify-center gap-2 text-sm text-zinc-400">
            <LoaderCircle className="animate-spin" size={17} /> Atualizando perguntas…
          </div>
        ) : (
          <div className="space-y-5">
            <QuestionSection title="No ar" count={state.activeQuestion ? 1 : 0}>
              {state.activeQuestion ? (
                <QuestionItem
                  question={state.activeQuestion}
                  pending={pending}
                  active
                  onEdit={startEditing}
                  onAction={action}
                />
              ) : (
                <EmptyState text="Nenhuma pergunta está visível para os participantes." />
              )}
            </QuestionSection>

            <QuestionSection title="Próximas" count={state.queuedQuestions.length}>
              {state.queuedQuestions.length === 0 ? (
                <EmptyState text="A fila está vazia. Adicione uma pergunta acima." />
              ) : (
                <div className="space-y-2">
                  {state.queuedQuestions.map((question, index) => (
                    <QuestionItem
                      key={question.id}
                      question={question}
                      pending={pending}
                      position={index + 1}
                      canMoveUp={index > 0}
                      canMoveDown={index < state.queuedQuestions.length - 1}
                      onMove={move}
                      onEdit={startEditing}
                      onAction={action}
                    />
                  ))}
                </div>
              )}
            </QuestionSection>

            <HistorySection
              title="Respondidas"
              open={showAnswered}
              questions={state.answeredQuestions}
              pending={pending}
              onToggle={() => setShowAnswered((open) => !open)}
              onEdit={startEditing}
              onAction={action}
            />
            <HistorySection
              title="Arquivadas"
              open={showArchived}
              questions={state.archivedQuestions}
              pending={pending}
              onToggle={() => setShowArchived((open) => !open)}
              onEdit={startEditing}
              onAction={action}
            />
          </div>
        )}
      </div>

      {editing && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/70 p-3 sm:items-center">
          <form
            aria-label="Editar pergunta"
            className="w-full rounded-md border border-white/15 bg-zinc-900 p-4 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEdit().catch(() => undefined);
            }}
          >
            <h3 className="text-sm font-semibold text-white">Editar pergunta</h3>
            <label className="mt-3 block text-xs text-zinc-400" htmlFor="edit-question-author">
              Nome
            </label>
            <input
              id="edit-question-author"
              className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm"
              maxLength={60}
              value={editAuthor}
              onChange={(event) => setEditAuthor(event.target.value)}
            />
            <label className="mt-3 block text-xs text-zinc-400" htmlFor="edit-question-text">
              Pergunta
            </label>
            <textarea
              id="edit-question-text"
              className="mt-1 min-h-28 w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5"
              maxLength={500}
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="ui-motion h-9 rounded-md px-3 text-xs text-zinc-300 hover:bg-white/10"
                onClick={() => setEditing(undefined)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="ui-motion flex h-9 items-center gap-2 rounded-md bg-green-300 px-3 text-xs font-semibold text-green-950 disabled:opacity-45"
                disabled={!editText.trim() || !editAuthor.trim() || Boolean(pending)}
              >
                {pending === `edit:${editing.id}` ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}

function QuestionSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase text-zinc-400">
        {title} <span className="font-normal text-zinc-600">{count}</span>
      </h3>
      {children}
    </section>
  );
}

function QuestionItem({
  question,
  pending,
  active,
  position,
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onAction,
}: {
  question: MeetingQuestion;
  pending: string | undefined;
  active?: boolean;
  position?: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?(question: MeetingQuestion, offset: -1 | 1): Promise<void>;
  onEdit(question: MeetingQuestion): void;
  onAction(question: MeetingQuestion, action: QuestionAction): Promise<void>;
}) {
  const busy = Boolean(pending);
  return (
    <article
      className={`rounded-md border p-3 ${active ? 'border-green-300' : 'border-white/10 bg-black/25'}`}
    >
      <div className="flex items-start gap-2">
        {position !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-[11px] font-semibold text-zinc-300">
            {position}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-300">{question.authorName}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-white">
            {question.text}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
        {onMove && (
          <>
            <IconButton
              label="Mover pergunta para cima"
              disabled={busy || !canMoveUp}
              onClick={() => void onMove(question, -1).catch(() => undefined)}
            >
              <ArrowUp size={15} />
            </IconButton>
            <IconButton
              label="Mover pergunta para baixo"
              disabled={busy || !canMoveDown}
              onClick={() => void onMove(question, 1).catch(() => undefined)}
            >
              <ArrowDown size={15} />
            </IconButton>
          </>
        )}
        <IconButton label="Editar pergunta" disabled={busy} onClick={() => onEdit(question)}>
          <Edit3 size={15} />
        </IconButton>
        {!active && question.status === 'queued' && (
          <button
            type="button"
            className="ui-motion flex h-8 items-center gap-1.5 rounded-md bg-green-300 px-2.5 text-xs font-semibold text-green-950 hover:bg-green-400 disabled:opacity-45"
            disabled={busy}
            onClick={() => void onAction(question, 'show').catch(() => undefined)}
          >
            {pending === `show:${question.id}` ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <Eye size={14} />
            )}
            Exibir
          </button>
        )}
        {(active || question.status === 'queued') && (
          <IconButton
            label="Marcar como respondida"
            disabled={busy}
            onClick={() => void onAction(question, 'answer').catch(() => undefined)}
          >
            {pending === `answer:${question.id}` ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <CircleCheck size={15} />
            )}
          </IconButton>
        )}
        {(question.status === 'answered' || question.status === 'archived') && (
          <IconButton
            label="Devolver pergunta à fila"
            disabled={busy}
            onClick={() => void onAction(question, 'requeue').catch(() => undefined)}
          >
            {pending === `requeue:${question.id}` ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <RotateCcw size={15} />
            )}
          </IconButton>
        )}
        {question.status !== 'archived' && (
          <IconButton
            label="Arquivar pergunta"
            disabled={busy}
            onClick={() => void onAction(question, 'archive').catch(() => undefined)}
          >
            {pending === `archive:${question.id}` ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <Archive size={15} />
            )}
          </IconButton>
        )}
      </div>
    </article>
  );
}

function HistorySection({
  title,
  questions,
  open,
  pending,
  onToggle,
  onEdit,
  onAction,
}: {
  title: string;
  questions: MeetingQuestion[];
  open: boolean;
  pending: string | undefined;
  onToggle(): void;
  onEdit(question: MeetingQuestion): void;
  onAction(question: MeetingQuestion, action: QuestionAction): Promise<void>;
}) {
  return (
    <section>
      <button
        type="button"
        className="ui-motion flex w-full items-center justify-between rounded-md py-2 text-xs font-semibold uppercase text-zinc-400 hover:text-white"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="flex items-center gap-2 font-normal text-zinc-500">
          {questions.length} <span aria-hidden>{open ? '−' : '+'}</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-2">
          {questions.length === 0 ? (
            <EmptyState
              text={
                title === 'Respondidas'
                  ? 'Nenhuma pergunta respondida.'
                  : 'Nenhuma pergunta arquivada.'
              }
            />
          ) : (
            questions.map((question) => (
              <QuestionItem
                key={question.id}
                question={question}
                pending={pending}
                onEdit={onEdit}
                onAction={onAction}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-white/10 px-3 py-4 text-center text-xs text-zinc-500">
      {text}
    </p>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="ui-motion flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
