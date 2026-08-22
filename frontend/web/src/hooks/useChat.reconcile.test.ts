import { describe, expect, it } from 'vitest';

/**
 * 轻量复刻 reconcile / merge / sync 语义，避免刷新后侧栏会话记录被误清空。
 * （reducer 未导出，此处锁定契约行为）
 */
function reconcileSessions(
  sessions: Record<string, {
    id: string;
    workspaceId?: string;
    pendingServerSync?: boolean;
    messages?: { id: string }[];
    createdAt?: number;
  }>,
  activeId: string,
  workspaceId: string,
  serverIds: string[],
) {
  // 空权威清单不得整表清空（权限过滤 / 瞬态空响应）
  if (serverIds.length === 0) {
    return { sessions, activeId };
  }
  const server = new Set(serverIds);
  const now = Date.now();
  const next = { ...sessions };
  for (const id of Object.keys(next)) {
    const session = next[id];
    const ws = session.workspaceId ?? 'w1';
    if (ws !== workspaceId) continue;
    if (/^s_/.test(id)) continue;
    if (server.has(id)) continue;
    if (activeId === id) continue;
    if (session.pendingServerSync) continue;
    if ((session.messages?.length ?? 0) > 0) continue;
    if (typeof session.createdAt === 'number' && now - session.createdAt < 5 * 60_000) continue;
    delete next[id];
  }
  const activeStill = Boolean(activeId && next[activeId]);
  return { sessions: next, activeId: activeStill ? activeId : '' };
}

function mergeSessions(
  sessions: Record<string, { id: string; title: string; preview: string; messages: { id: string }[] }>,
  incoming: Array<{ id: string; title: string; preview: string; messages: { id: string }[] }>,
) {
  const merged = { ...sessions };
  for (const session of incoming) {
    const existing = merged[session.id];
    if (!existing) {
      merged[session.id] = session;
      continue;
    }
    merged[session.id] = {
      ...existing,
      ...session,
      messages: existing.messages.length > 0 ? existing.messages : session.messages,
    };
  }
  return merged;
}

function syncSessionMessages(
  existing: { id: string; messages: { id: string }[] } | undefined,
  incoming: { id: string; messages: { id: string }[] },
) {
  if (!existing) return incoming;
  if (existing.messages.length > 0 && incoming.messages.length === 0) {
    return { ...existing, ...incoming, messages: existing.messages };
  }
  return { ...existing, ...incoming };
}

describe('chat session reconcile', () => {
  it('does not wipe local sessions when server list is empty', () => {
    const result = reconcileSessions(
      {
        s1: { id: 's1', workspaceId: 'w1' },
        s_local: { id: 's_local', workspaceId: 'w1' },
        other: { id: 'other', workspaceId: 'w2' },
      },
      's1',
      'w1',
      [],
    );
    expect(result.sessions.s1).toBeDefined();
    expect(result.sessions.s_local).toBeDefined();
    expect(result.sessions.other).toBeDefined();
    expect(result.activeId).toBe('s1');
  });

  it('drops server-deleted sessions when authoritative non-empty list arrives', () => {
    const result = reconcileSessions(
      {
        s1: { id: 's1', workspaceId: 'w1' },
        gone: { id: 'gone', workspaceId: 'w1' },
        s_local: { id: 's_local', workspaceId: 'w1' },
      },
      's1',
      'w1',
      ['s1'],
    );
    expect(result.sessions.s1).toBeDefined();
    expect(result.sessions.gone).toBeUndefined();
    expect(result.sessions.s_local).toBeDefined();
    expect(result.activeId).toBe('s1');
  });

  it('keeps activeId when session still on server', () => {
    const result = reconcileSessions(
      { s1: { id: 's1', workspaceId: 'w1' } },
      's1',
      'w1',
      ['s1'],
    );
    expect(result.sessions.s1).toBeDefined();
    expect(result.activeId).toBe('s1');
  });

  it('keeps pending server sync session even when missing from server list', () => {
    const result = reconcileSessions(
      {
        s1: { id: 's1', workspaceId: 'w1' },
        fresh: { id: 'fresh', workspaceId: 'w1', pendingServerSync: true },
      },
      'fresh',
      'w1',
      ['s1'],
    );
    expect(result.sessions.fresh).toBeDefined();
    expect(result.activeId).toBe('fresh');
  });

  it('keeps session with local messages when missing from server list', () => {
    const result = reconcileSessions(
      {
        s1: { id: 's1', workspaceId: 'w1' },
        chatting: { id: 'chatting', workspaceId: 'w1', messages: [{ id: 'm1' }] },
      },
      'chatting',
      'w1',
      ['s1'],
    );
    expect(result.sessions.chatting).toBeDefined();
    expect(result.activeId).toBe('chatting');
  });
});

describe('chat session merge/sync', () => {
  it('updates metadata but keeps local messages during merge', () => {
    const merged = mergeSessions(
      {
        s1: { id: 's1', title: '旧标题', preview: '旧', messages: [{ id: 'm1' }] },
      },
      [{ id: 's1', title: '新标题', preview: '新预览', messages: [] }],
    );
    expect(merged.s1.title).toBe('新标题');
    expect(merged.s1.preview).toBe('新预览');
    expect(merged.s1.messages).toEqual([{ id: 'm1' }]);
  });

  it('does not let empty server messages wipe local sync', () => {
    const next = syncSessionMessages(
      { id: 's1', messages: [{ id: 'm1' }, { id: 'm2' }] },
      { id: 's1', messages: [] },
    );
    expect(next.messages).toHaveLength(2);
  });

  it('accepts non-empty server messages on sync', () => {
    const next = syncSessionMessages(
      { id: 's1', messages: [{ id: 'local' }] },
      { id: 's1', messages: [{ id: 'srv1' }, { id: 'srv2' }] },
    );
    expect(next.messages).toEqual([{ id: 'srv1' }, { id: 'srv2' }]);
  });
});
