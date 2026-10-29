import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveQuestionResponse, QuestionQueueResponse } from '@ufmg/shared';
import { RoomEvent, type Room, type RoomEventCallbacks } from 'livekit-client';
import { fetchActiveQuestion, fetchQuestionQueue } from '../lib/api/client.js';

const EMPTY_PUBLIC_STATE: ActiveQuestionResponse = { revision: 0, activeQuestion: null };
const EMPTY_ADMIN_STATE: QuestionQueueResponse = {
  ...EMPTY_PUBLIC_STATE,
  queuedQuestions: [],
  answeredQuestions: [],
  archivedQuestions: [],
};

export function useMeetingQuestions(
  room: Room,
  roomName: string,
  resumeCredential: string,
  isAdmin: boolean,
) {
  const [state, setState] = useState<ActiveQuestionResponse | QuestionQueueResponse>(() =>
    isAdmin ? EMPTY_ADMIN_STATE : EMPTY_PUBLIC_STATE,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const requestSequence = useRef(0);
  const acceptState = useCallback((next: ActiveQuestionResponse | QuestionQueueResponse) => {
    requestSequence.current += 1;
    setState(next);
    setError(undefined);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const response = isAdmin
        ? await fetchQuestionQueue(roomName, resumeCredential)
        : await fetchActiveQuestion(roomName, resumeCredential);
      if (sequence === requestSequence.current) {
        setState(response);
        setError(undefined);
      }
      return response;
    } catch (refreshError) {
      if (sequence === requestSequence.current) {
        setError(
          refreshError instanceof Error ? refreshError : new Error('Falha ao atualizar perguntas.'),
        );
      }
      throw refreshError;
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [isAdmin, resumeCredential, roomName]);

  useEffect(() => {
    let active = true;
    const safeRefresh = () => {
      if (active) void refresh().catch(() => undefined);
    };
    const onData: RoomEventCallbacks['dataReceived'] = (_payload, _participant, _kind, topic) => {
      if (topic === 'ufmg.questions') safeRefresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') safeRefresh();
    };

    safeRefresh();
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.Reconnected, safeRefresh);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(safeRefresh, isAdmin ? 8_000 : 12_000);
    return () => {
      active = false;
      requestSequence.current += 1;
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.Reconnected, safeRefresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [isAdmin, refresh, room]);

  return { state, setState: acceptState, loading, error, refresh };
}

export function isQuestionQueue(
  state: ActiveQuestionResponse | QuestionQueueResponse,
): state is QuestionQueueResponse {
  return 'queuedQuestions' in state;
}
