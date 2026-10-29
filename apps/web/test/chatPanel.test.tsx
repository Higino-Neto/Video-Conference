import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReceivedChatMessage } from '@livekit/components-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../src/components/call/ChatPanel.js';

afterEach(cleanup);

const message = {
  id: 'message-1',
  timestamp: Date.UTC(2026, 9, 29, 12, 30),
  message: 'Olá, turma!',
  from: { identity: 'student', name: 'Ana' },
} as unknown as ReceivedChatMessage;

function renderPanel(overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  return render(
    <ChatPanel
      messages={[]}
      send={vi.fn().mockResolvedValue(undefined)}
      isSending={false}
      onClose={vi.fn()}
      onError={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ChatPanel', () => {
  it('shows the message author and keeps the draft until sending succeeds', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    renderPanel({ messages: [message], send });

    expect(screen.getByText('Ana')).toBeVisible();
    expect(screen.getByText('Olá, turma!')).toBeVisible();

    const input = screen.getByPlaceholderText('Escreva uma mensagem…');
    fireEvent.change(input, { target: { value: '  Nova mensagem  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() => expect(send).toHaveBeenCalledWith('Nova mensagem'));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('keeps the draft and reports a friendly error when sending fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('not connected to room'));
    const onError = vi.fn();
    renderPanel({ send, onError });

    const input = screen.getByPlaceholderText('Escreva uma mensagem…');
    fireEvent.change(input, { target: { value: 'Mensagem importante' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'Você não está conectado à chamada. Verifique sua conexão e tente novamente.',
        'danger',
        'Mensagem não enviada',
      ),
    );
    expect(input).toHaveValue('Mensagem importante');
  });

  it('does not submit empty or whitespace-only messages', () => {
    const send = vi.fn();
    renderPanel({ send });

    const input = screen.getByPlaceholderText('Escreva uma mensagem…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    expect(send).not.toHaveBeenCalled();
  });
});
