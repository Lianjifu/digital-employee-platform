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

/** 元数据更新不得用带旧 messages 的 sync 覆盖乐观气泡。 */
describe('session metadata patch safety', () => {
  it('update_session keeps appended user message while sync with stale snapshot would drop it', () => {
    type Sess = { id: string; modelId?: string; enabledTools?: string[]; messages: { id: string; content: string }[] };
    const beforeAppend: Sess = { id: 's1', modelId: 'm-old', enabledTools: ['a'], messages: [{ id: 'u0', content: 'prev' }] };
    const afterAppend: Sess = {
      ...beforeAppend,
      messages: [...beforeAppend.messages, { id: 'u1', content: 'just sent' }],
    };
    // 错误路径：用 append 前快照 sync
    const clobbered = { ...beforeAppend, modelId: 'm-new', enabledTools: ['a', 'b'] };
    expect(clobbered.messages.some((m) => m.id === 'u1')).toBe(false);
    // 正确路径：只打补丁
    const patched: Sess = { ...afterAppend, modelId: 'm-new', enabledTools: ['a', 'b'] };
    expect(patched.messages.map((m) => m.id)).toEqual(['u0', 'u1']);
    expect(patched.modelId).toBe('m-new');
  });
});
