import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createComment,
  deleteComment,
  editComment,
  openBoardStream,
  touchPresence,
  type CanvasStream,
} from './canvas-api';
import type { CanvasBoard, CanvasComment, CanvasPresence } from './canvas-types';
import { isCanvasStreamEvent } from './canvas-types';

export type CanvasBoardState = {
  board: CanvasBoard | null;
  comments: CanvasComment[];
  presence: CanvasPresence[];
  loading: boolean;
  error: string | null;
  lastEventAt: number | null;
};

export type UseCanvasBoardOptions = {
  /** Touch presence on every interval (ms). Default 30s. */
  presenceIntervalMs?: number;
  /** Auto-reconnect on stream error after this delay (ms). Default 5s. */
  reconnectDelayMs?: number;
};

export type CanvasBoardHandle = {
  state: CanvasBoardState;
  refresh: () => Promise<void>;
  postComment: (text: string, x: number, y: number) => Promise<boolean>;
  resolveComment: (commentId: string, resolved: boolean) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
};

const PRESENCE_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 5_000;

export function useCanvasBoard(
  boardId: string | null,
  options: UseCanvasBoardOptions = {},
): CanvasBoardHandle {
  const [state, setState] = useState<CanvasBoardState>({
    board: null,
    comments: [],
    presence: [],
    loading: Boolean(boardId),
    error: null,
    lastEventAt: null,
  });
  const streamRef = useRef<CanvasStream | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const presenceInterval = options.presenceIntervalMs ?? PRESENCE_INTERVAL_MS;
  const reconnectDelay = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;

  const handleEvent = useCallback((event: unknown) => {
    if (!isCanvasStreamEvent(event)) {
      return;
    }
    setState((prev) => ({ ...prev, lastEventAt: Date.now() }));
    if (event.type === 'snapshot') {
      setState((prev) => ({
        ...prev,
        board: event.board,
        comments: event.comments,
        presence: event.presence,
        loading: false,
        error: null,
      }));
    } else if (event.type === 'presence' || event.type === 'tick') {
      setState((prev) => ({ ...prev, presence: event.presence }));
    } else if (event.type === 'comment') {
      setState((prev) => {
        const next = prev.comments.filter((c) => c.id !== event.comment.id);
        if (!event.deleted) next.push(event.comment);
        return { ...prev, comments: next.sort(byCreated) };
      });
    }
  }, []);

  const openStream = useCallback(() => {
    if (!boardId) return;
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    streamRef.current = openBoardStream(boardId, {
      onEvent: handleEvent,
      onError: () => {
        if (!mountedRef.current || !boardId) return;
        if (reconnectTimerRef.current) return;
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          openStream();
        }, reconnectDelay);
      },
    });
  }, [boardId, handleEvent, reconnectDelay]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!boardId) {
      setState({
        board: null,
        comments: [],
        presence: [],
        loading: false,
        error: null,
        lastEventAt: null,
      });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    openStream();
    const tick = () => {
      touchPresence(boardId).catch(() => undefined);
    };
    tick();
    presenceTimerRef.current = setInterval(tick, presenceInterval);
    return () => {
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
    };
  }, [boardId, presenceInterval, openStream]);

  const postComment = useCallback(
    async (text: string, x: number, y: number) => {
      if (!boardId) return false;
      const res = await createComment(boardId, text, x, y);
      if (!res.ok) {
        setState((prev) => ({ ...prev, error: res.error }));
        return false;
      }
      // Optimistic insert — the SSE 'comment' event will replace this.
      setState((prev) => ({
        ...prev,
        comments: [...prev.comments, res.data].sort(byCreated),
      }));
      return true;
    },
    [boardId],
  );

  const resolveComment = useCallback(
    async (commentId: string, resolved: boolean) => {
      if (!boardId) return;
      const res = await editComment(commentId, { status: resolved ? 'resolved' : 'open' });
      if (!res.ok) {
        setState((prev) => ({ ...prev, error: res.error }));
      }
    },
    [boardId],
  );

  const removeComment = useCallback(
    async (commentId: string) => {
      const res = await deleteComment(commentId);
      if (!res.ok) {
        setState((prev) => ({ ...prev, error: res.error }));
        return;
      }
      setState((prev) => ({ ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }));
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!boardId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    openStream();
  }, [boardId, openStream]);

  return {
    state,
    refresh,
    postComment,
    resolveComment,
    removeComment,
  };
}

function byCreated(a: CanvasComment, b: CanvasComment): number {
  return a.createdAt.localeCompare(b.createdAt);
}