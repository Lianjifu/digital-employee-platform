import { describe, expect, it } from 'vitest';
import {
  mergeConversationMessages,
  resolveHydratedMessages,
  shouldSkipConversationHydrate,
} from './conversation-merge';
import type { ChatMessageEx } from '@/hooks/types';

function msg(partial: Partial<ChatMessageEx> & Pick<ChatMessageEx, 'id' | 'role' | 'content'>): ChatMessageEx {
  return {
    createdAt: new Date().toISOString(),
    status: 'succeeded',
    ...partial,
  };
}

describe('conversation-merge', () => {
  it('skips hydrate while typing or streaming', () => {
    const local = [msg({ id: 'u1', role: 'user', content: 'hi' }), msg({ id: 'a1', role: 'assistant', content: '…', status: 'streaming' })];
    const server = [msg({ id: 'u1', role: 'user', content: 'hi' })];
    expect(shouldSkipConversationHydrate({ typing: true, localMessages: local, serverMessages: server })).toBe('skip_typing');
    expect(shouldSkipConversationHydrate({ localMessages: local, serverMessages: server })).toBe('skip_streaming');
  });

  it('skips when local is ahead of stale server snapshot', () => {
    const local = [
      msg({ id: 'u1', role: 'user', content: 'a' }),
      msg({ id: 'a1', role: 'assistant', content: 'b' }),
      msg({ id: 'u2', role: 'user', content: 'c' }),
    ];
    const server = [
      msg({ id: 'u1', role: 'user', content: 'a' }),
      msg({ id: 'a1', role: 'assistant', content: 'b' }),
    ];
    expect(shouldSkipConversationHydrate({ localMessages: local, serverMessages: server })).toBe('skip_local_ahead');
    const resolved = resolveHydratedMessages({ localMessages: local, serverMessages: server });
    expect(resolved.applied).toBe(false);
    expect(resolved.messages).toHaveLength(3);
  });

  it('merges server terminal state onto matching local messages', () => {
    const local = [
      msg({ id: 'u1', clientMsgId: 'c1', role: 'user', content: '直接生成' }),
      msg({ id: 'a-local', clientMsgId: 'c2', role: 'assistant', content: '部分', status: 'succeeded' }),
    ];
    const server = [
      msg({ id: 'srv-u', clientMsgId: 'c1', role: 'user', content: '直接生成' }),
      msg({
        id: 'srv-a',
        clientMsgId: 'c2',
        role: 'assistant',
        content: '完整回复',
        status: 'succeeded',
        toolCalls: [{ id: 't1', name: 'skill:pptx', args: {}, status: 'success' }],
      }),
    ];
    const merged = mergeConversationMessages(local, server);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.content).toBe('完整回复');
    expect(merged[1]?.toolCalls?.[0]?.name).toBe('skill:pptx');
    expect(merged[1]?.id).toBe('a-local');
  });

  it('keeps optimistic local-only user messages', () => {
    const local = [
      msg({ id: 'u1', role: 'user', content: 'old' }),
      msg({ id: 'u2', clientMsgId: 'new', role: 'user', content: 'new' }),
    ];
    const server = [msg({ id: 'u1', role: 'user', content: 'old' })];
    // local ahead → resolve skips; merge itself still preserves
    const merged = mergeConversationMessages(local, server);
    expect(merged.map((m) => m.content)).toEqual(['old', 'new']);
  });
});
