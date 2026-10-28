import type { MeetingQuestion } from '@ufmg/shared';

export function ActiveQuestion({ question }: { question: MeetingQuestion | null }) {
  if (!question) return null;

  return (
    <section
      aria-label="Pergunta em destaque"
      aria-live="polite"
      className="question-enter absolute left-1/2 top-20 z-20 flex max-h-[30dvh] w-[min(46rem,calc(100%-2rem))] -translate-x-1/2 items-start gap-3 overflow-y-auto rounded-md border border-white/15 px-4 py-3 shadow-2xl sm:top-24"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-300 text-sm font-bold text-green-950"
      >
        {initials(question.authorName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-green-300">
          {question.authorName}
        </span>
        <span className="mt-0.5 block whitespace-pre-wrap break-words text-pretty text-sm font-medium leading-5 text-white sm:text-base sm:leading-6">
          {question.text}
        </span>
      </span>
    </section>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}
