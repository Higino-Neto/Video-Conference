import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeetingQuestion, QuestionQueueResponse } from '@ufmg/shared';
import type * as ApiClientModule from '../src/lib/api/client.js';
import { ActiveQuestion } from '../src/components/call/ActiveQuestion.js';
import { QuestionManagement } from '../src/components/call/QuestionManagement.js';
import {
  createQuestion,
  reorderQuestions,
  runQuestionAction,
  updateQuestion,
} from '../src/lib/api/client.js';

vi.mock('../src/lib/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    createQuestion: vi.fn(),
    reorderQuestions: vi.fn(),
    runQuestionAction: vi.fn(),
    updateQuestion: vi.fn(),
  };
});

const first = question('11111111-1111-4111-8111-111111111111', 'Ana', 'Primeira pergunta?', 0);
const second = question('22222222-2222-4222-8222-222222222222', 'Bruno', 'Segunda pergunta?', 1);
const queue: QuestionQueueResponse = {
  revision: 7,
  activeQuestion: null,
  queuedQuestions: [first, second],
  answeredQuestions: [],
  archivedQuestions: [],
};

describe('meeting questions experience', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the active question with the author identity', () => {
    render(<ActiveQuestion question={{ ...first, status: 'live', authorName: 'Ana Souza' }} />);
    expect(screen.getByRole('region', { name: 'Pergunta em destaque' })).toHaveTextContent('AS');
    expect(screen.getByText('Ana Souza')).toBeVisible();
    expect(screen.getByText('Primeira pergunta?')).toBeVisible();
  });

  it('adds a question quickly with the selected participant as author', async () => {
    vi.mocked(createQuestion).mockResolvedValue({
      ...queue,
      revision: 8,
      queuedQuestions: [
        ...queue.queuedQuestions,
        question('33333333-3333-4333-8333-333333333333', 'Carla', 'Nova pergunta', 2),
      ],
    });
    renderPanel({ ...queue, queuedQuestions: [] }, [{ identity: 'guest_carla123', name: 'Carla' }]);

    fireEvent.change(screen.getByLabelText('Nova pergunta'), {
      target: { value: '  Como foi o começo da sua carreira?  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(createQuestion).toHaveBeenCalledWith(
        'ROOM1234',
        {
          text: 'Como foi o começo da sua carreira?',
          authorName: 'Carla',
          authorIdentity: 'guest_carla123',
          expectedRevision: 7,
        },
        'resume-credential',
      ),
    );
  });

  it('publishes, reorders and edits without losing the current revision', async () => {
    vi.mocked(runQuestionAction).mockResolvedValue({ ...queue, revision: 8 });
    vi.mocked(reorderQuestions).mockResolvedValue({
      ...queue,
      revision: 8,
      queuedQuestions: [second, first],
    });
    vi.mocked(updateQuestion).mockResolvedValue({ ...queue, revision: 8 });
    renderPanel(queue, [{ identity: 'admin_12345678', name: 'Admin' }]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Exibir' })[0]!);
    await waitFor(() =>
      expect(runQuestionAction).toHaveBeenCalledWith(
        'ROOM1234',
        first.id,
        'show',
        7,
        'resume-credential',
      ),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Mover pergunta para cima' })[1]!);
    await waitFor(() =>
      expect(reorderQuestions).toHaveBeenCalledWith(
        'ROOM1234',
        [second.id, first.id],
        7,
        'resume-credential',
      ),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar pergunta' })[0]!);
    fireEvent.change(screen.getByLabelText('Pergunta', { selector: '#edit-question-text' }), {
      target: { value: 'Pergunta revisada?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(updateQuestion).toHaveBeenCalledWith(
        'ROOM1234',
        first.id,
        {
          text: 'Pergunta revisada?',
          authorName: 'Ana',
          authorIdentity: first.authorIdentity,
          expectedRevision: 7,
        },
        'resume-credential',
      ),
    );
  });
});

function renderPanel(state: QuestionQueueResponse, authors: { identity: string; name: string }[]) {
  return render(
    <QuestionManagement
      roomName="ROOM1234"
      resumeCredential="resume-credential"
      state={state}
      authors={authors}
      loading={false}
      onClose={vi.fn()}
      onChange={vi.fn()}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      notify={vi.fn()}
    />,
  );
}

function question(id: string, authorName: string, text: string, position: number): MeetingQuestion {
  return {
    id,
    authorName,
    authorIdentity: null,
    text,
    status: 'queued',
    position,
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
    answeredAt: null,
  };
}
