import { describe, expect, it } from 'vitest';

/** 锁定 sync_session preserveGovernance 契约（reducer 未导出）。 */
function syncSession(
  existing: {
    id: string;
    sessionMode?: 'investigate' | 'execute';
    riskLevel?: string;
    messages: { id: string }[];
    title: string;
  } | undefined,
  incoming: {
    id: string;
    sessionMode?: 'investigate' | 'execute';
    riskLevel?: string;
    messages: { id: string }[];
    title: string;
  },
  preserveGovernance?: boolean,
) {
  if (!incoming.id) return existing;
  const incomingMessages = incoming.messages ?? [];
  const keepLocalMessages = Boolean(existing && existing.messages.length > 0 && incomingMessages.length === 0);
  const merged = existing
    ? { ...existing, ...incoming, messages: keepLocalMessages ? existing.messages : incomingMessages }
    : incoming;
  if (existing && preserveGovernance) {
    return {
      ...merged,
      sessionMode: existing.sessionMode,
      riskLevel: existing.riskLevel,
    };
  }
  return merged;
}

describe('sync_session preserveGovernance', () => {
  it('keeps local sessionMode when hydrating messages', () => {
    const next = syncSession(
      {
        id: 's1',
        sessionMode: 'execute',
        riskLevel: 'high',
        title: '旧',
        messages: [{ id: 'm1' }],
      },
      {
        id: 's1',
        sessionMode: 'investigate',
        riskLevel: 'medium',
        title: '新',
        messages: [{ id: 'm1' }, { id: 'm2' }],
      },
      true,
    );
    expect(next?.sessionMode).toBe('execute');
    expect(next?.riskLevel).toBe('high');
    expect(next?.title).toBe('新');
    expect(next?.messages).toHaveLength(2);
  });
});
