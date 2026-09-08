import type {
  CanvasBoard,
  CanvasComment,
  CanvasPresence,
  CanvasStreamEvent,
} from './canvas-types';
import { clampBoardTitle, clampCommentText, normaliseCoordinate } from './canvas-types';

export type CanvasFetchOptions = {
  workspaceId?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export type CanvasEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function unwrap<T>(raw: unknown): CanvasEnvelope<T> {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return { ok: true, data: (raw as { data: T }).data };
  }
  return { ok: true, data: raw as T };
}

async function send<T>(
  path: string,
  init: RequestInit,
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<T>> {
  const fetchImpl = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : (() => undefined) as unknown as typeof fetch);
  const base = opts.baseUrl ?? '';
  const res = await fetchImpl(base + path, {
    credentials: 'same-origin',
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      error: text
        ? `${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`
        : `${init.method ?? 'GET'} ${path} -> ${res.status}`,
    };
  }
  const json = await res.json().catch(() => ({}));
  return unwrap<T>(json);
}

export async function listBoards(
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<{ boards: CanvasBoard[] }>> {
  return send('/api/canvas/boards', { method: 'GET' }, opts);
}

export async function createBoard(
  title: string,
  opts: CanvasFetchOptions & { kind?: 'comments' | 'workflow' } = {},
): Promise<CanvasEnvelope<CanvasBoard>> {
  const body: Record<string, unknown> = { title: clampBoardTitle(title) };
  if (opts.kind) body.kind = opts.kind;
  return send(
    '/api/canvas/boards',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    opts,
  );
}

export async function deleteBoard(
  boardId: string,
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<{ deleted: true }>> {
  return send(
    `/api/canvas/boards/${encodeURIComponent(boardId)}`,
    { method: 'DELETE' },
    opts,
  );
}

export type BoardDetail = {
  board: CanvasBoard;
  comments: CanvasComment[];
  presence: CanvasPresence[];
};

export async function getBoard(
  boardId: string,
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<BoardDetail>> {
  return send(
    `/api/canvas/boards/${encodeURIComponent(boardId)}`,
    { method: 'GET' },
    opts,
  );
}

export async function createComment(
  boardId: string,
  text: string,
  x: number,
  y: number,
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<CanvasComment>> {
  return send(
    `/api/canvas/boards/${encodeURIComponent(boardId)}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clampCommentText(text),
        x: normaliseCoordinate(x),
        y: normaliseCoordinate(y),
      }),
    },
    opts,
  );
}

export async function editComment(
  commentId: string,
  fields: { text?: string; status?: 'open' | 'resolved' },
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<CanvasComment>> {
  const body: Record<string, unknown> = {};
  if (fields.text !== undefined) body.text = clampCommentText(fields.text);
  if (fields.status !== undefined) body.status = fields.status;
  return send(
    `/api/canvas/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    opts,
  );
}

export async function deleteComment(
  commentId: string,
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<{ deleted: true }>> {
  return send(
    `/api/canvas/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
    opts,
  );
}

export async function touchPresence(
  boardId: string,
  opts: CanvasFetchOptions = {},
): Promise<CanvasEnvelope<{ present: CanvasPresence[] }>> {
  return send(
    `/api/canvas/boards/${encodeURIComponent(boardId)}/presence`,
    { method: 'POST', body: '' },
    opts,
  );
}

export type CanvasStream = {
  close(): void;
};

export type CanvasStreamHandlers = {
  onEvent?: (event: CanvasStreamEvent) => void;
  onError?: (err: Error) => void;
};

export function openBoardStream(
  boardId: string,
  handlers: CanvasStreamHandlers = {},
  opts: CanvasFetchOptions = {},
): CanvasStream {
  const base = opts.baseUrl ?? '';
  const url = base + `/api/canvas/boards/${encodeURIComponent(boardId)}/stream`;
  const fetchImpl =
    opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : (() => undefined) as unknown as typeof fetch);
  const controller = new AbortController();
  fetchImpl(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`stream responded ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = parseSSEBlock(block);
          if (ev) handlers.onEvent?.(ev);
        }
      }
    })
    .catch((err) => {
      if (controller.signal.aborted) return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    });
  return {
    close: () => controller.abort(),
  };
}

function parseSSEBlock(block: string): CanvasStreamEvent | null {
  let type: string | null = null;
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      type = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }
  if (!type || !data) return null;
  try {
    const parsed = JSON.parse(data);
    return { ...(parsed as object), type } as CanvasStreamEvent;
  } catch {
    return null;
  }
}