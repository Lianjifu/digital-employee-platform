import { describe, expect, it } from 'vitest';
import {
  createBoard,
  createComment,
  deleteBoard,
  deleteComment,
  editComment,
  getBoard,
  listBoards,
  openBoardStream,
  touchPresence,
} from './canvas-api';
import type { CanvasBoard, CanvasComment, CanvasPresence } from './canvas-types';

function makeFetch(handlers: Record<string, (body?: unknown) => unknown>) {
  return ((path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = handlers[key];
    if (!handler) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'not stubbed', key }), { status: 404 }),
      );
    }
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    return Promise.resolve(new Response(JSON.stringify({ ok: true, data: handler(body) }), { status: 200 }));
  }) as unknown as typeof fetch;
}

describe('canvas-api: listBoards / createBoard / getBoard / deleteBoard', () => {
  it('listBoards unwraps the { ok, data } envelope', async () => {
    const boards: CanvasBoard[] = [
      { id: 'b1', workspaceId: 'w1', title: 't1', owner: 'alice', createdAt: 'a', updatedAt: 'u' },
    ];
    const fetchImpl = makeFetch({
      'GET /api/canvas/boards': () => ({ boards }),
    });
    const r = await listBoards({ fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.boards).toEqual(boards);
  });

  it('createBoard sends a clamped title and unwraps', async () => {
    let received: unknown;
    const fetchImpl = makeFetch({
      'POST /api/canvas/boards': (body) => {
        received = body;
        return { id: 'new', workspaceId: 'w', title: 'p', owner: 'u', createdAt: '', updatedAt: '' };
      },
    });
    const r = await createBoard('   padded title   ', { fetchImpl });
    expect(r.ok).toBe(true);
    expect((received as { title: string }).title).toBe('padded title');
  });

  it('getBoard encodes the board id', async () => {
    let receivedPath = '';
    const fetchImpl = ((path: string, init?: RequestInit) => {
      receivedPath = `${init?.method ?? 'GET'} ${path}`;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              board: { id: 'a/b', workspaceId: 'w', title: 't', owner: 'u', createdAt: '', updatedAt: '' },
              comments: [],
              presence: [],
            },
          }),
          { status: 200 },
        ),
      );
    }) as unknown as typeof fetch;
    const r = await getBoard('a/b', { fetchImpl });
    expect(r.ok).toBe(true);
    expect(receivedPath).toBe('GET /api/canvas/boards/a%2Fb');
  });

  it('deleteBoard returns deleted:true on success', async () => {
    const fetchImpl = makeFetch({
      'DELETE /api/canvas/boards/b1': () => ({ deleted: true }),
    });
    const r = await deleteBoard('b1', { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.deleted).toBe(true);
  });
});

describe('canvas-api: comments', () => {
  it('createComment normalises coords and trims text', async () => {
    let received: unknown;
    const fetchImpl = makeFetch({
      'POST /api/canvas/boards/b1/comments': (body) => {
        received = body;
        return {
          id: 'c1',
          boardId: 'b1',
          workspaceId: 'w',
          x: 1,
          y: 1,
          text: '   hello   ',
          author: 'u',
          status: 'open',
          createdAt: '',
          updatedAt: '',
        };
      },
    });
    const r = await createComment('b1', '   hello   ', 2, -1, { fetchImpl });
    expect(r.ok).toBe(true);
    const body = received as { x: number; y: number; text: string };
    expect(body.x).toBe(1);
    expect(body.y).toBe(0);
    expect(body.text).toBe('hello');
  });

  it('editComment sends only provided fields', async () => {
    let received: unknown;
    const fetchImpl = makeFetch({
      'PATCH /api/canvas/comments/c1': (body) => {
        received = body;
        return {
          id: 'c1',
          boardId: 'b',
          workspaceId: 'w',
          x: 0,
          y: 0,
          text: 'updated',
          author: 'u',
          status: 'resolved',
          createdAt: '',
          updatedAt: '',
        };
      },
    });
    await editComment('c1', { status: 'resolved' }, { fetchImpl });
    expect(received).toEqual({ status: 'resolved' });
  });

  it('deleteComment returns deleted:true', async () => {
    const fetchImpl = makeFetch({
      'DELETE /api/canvas/comments/c1': () => ({ deleted: true }),
    });
    const r = await deleteComment('c1', { fetchImpl });
    expect(r.ok).toBe(true);
  });
});

describe('canvas-api: touchPresence', () => {
  it('POSTs presence with empty body', async () => {
    let received: unknown;
    const fetchImpl = makeFetch({
      'POST /api/canvas/boards/b1/presence': (body) => {
        received = body;
        return { present: [] };
      },
    });
    await touchPresence('b1', { fetchImpl });
    expect(received).toBeUndefined();
  });
});

describe('canvas-api: openBoardStream', () => {
  it('parses SSE blocks into events', async () => {
    const events: unknown[] = [];
    const sseBody =
      'event: snapshot\ndata: {"type":"snapshot","board":{"id":"b","workspaceId":"w","title":"t","owner":"u","createdAt":"","updatedAt":""},"comments":[],"presence":[]}\n\n' +
      'event: ping\ndata: {"type":"ping","now":"2026-09-08T00:00:00Z"}\n\n';
    const reader = {
      read: (async function* () {
        yield { value: new TextEncoder().encode(sseBody), done: false };
        yield { value: undefined, done: true };
      })(),
    };
    const fetchImpl = ((_path: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sseBody));
              controller.close();
            },
          }),
          { status: 200 },
        ),
      )) as unknown as typeof fetch;
    const stream = openBoardStream('b1', {
      onEvent: (ev) => events.push(ev),
    }, { fetchImpl });
    // Wait one tick for the parser loop to flush.
    await new Promise((r) => setTimeout(r, 30));
    stream.close();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ type: 'snapshot' });
  });
});

describe('canvas-api: error envelope', () => {
  it('returns ok:false when fetchImpl fails', async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response('boom', { status: 500 }))) as unknown as typeof fetch;
    const r = await listBoards({ fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('500');
  });
});

describe('canvas-api: presence typing', () => {
  it('presence payload has expected shape', () => {
    const p: CanvasPresence = { boardId: 'b', identity: 'alice', lastTouch: new Date().toISOString() };
    expect(p.boardId).toBe('b');
    expect(p.identity).toBe('alice');
  });
});