import { describe, expect, it } from 'vitest';

/**
 * 轻量复刻 reconcile / clear_active 语义，避免侧栏空列表时主区仍挂残留会话。
 * （reducer 未导出，此处锁定契约行为）
 */
function reconcileSessions(
  sessions: Record<string, { id: string; workspaceId?: string }>,
  activeId: string,
  workspaceId: string,
  serverIds: string[],
) {
  const server = new Set(serverIds);
  const next = { ...sessions };
  for (const id of Object.keys(next)) {
    const session = next[id];
    const ws = session.workspaceId ?? 'w1';
    if (ws !== workspaceId) continue;
    if (/^s_/.test(id)) continue;
    if (server.has(id)) continue;
    delete next[id];
  }
  const activeStill = Boolean(activeId && next[activeId]);
  return { sessions: next, activeId: activeStill ? activeId : '' };
}

describe('chat session reconcile', () => {
  it('drops server-deleted sessions and clears activeId', () => {
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
    expect(result.sessions.s1).toBeUndefined();
    expect(result.sessions.s_local).toBeDefined();
    expect(result.sessions.other).toBeDefined();
    expect(result.activeId).toBe('');
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
});
