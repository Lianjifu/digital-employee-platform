/**
 * 会话消息合并：在线回合本地权威，空闲时按 id/clientMsgId upsert 服务端终态。
 */
import type { ChatMessageEx } from '@/hooks/types';

export type ConversationMergeReason =
  | 'apply'
  | 'skip_typing'
  | 'skip_streaming'
  | 'skip_local_ahead'
  | 'skip_empty_server';

export type ConversationMergeResult = {
  messages: ChatMessageEx[];
  reason: ConversationMergeReason;
  applied: boolean;
};

function messageKey(message: ChatMessageEx): string {
  return message.clientMsgId || message.serverMsgId || message.id;
}

function isStreaming(message: ChatMessageEx): boolean {
  return message.status === 'streaming' || message.status === 'in_flight' || message.status === 'queued';
}

function stamp(message: ChatMessageEx): number {
  const raw = message.editedAt || message.createdAt;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** 是否应跳过用服务端快照整表覆盖本地（在线回合保护）。 */
export function shouldSkipConversationHydrate(opts: {
  typing?: boolean;
  localMessages: ChatMessageEx[];
  serverMessages: ChatMessageEx[];
}): ConversationMergeReason | null {
  if (opts.typing) return 'skip_typing';
  if (opts.localMessages.some(isStreaming)) return 'skip_streaming';
  if (opts.serverMessages.length === 0 && opts.localMessages.length > 0) return 'skip_empty_server';
  if (opts.localMessages.length > opts.serverMessages.length) return 'skip_local_ahead';
  return null;
}

/**
 * 按 id / clientMsgId upsert。
 * - 本地 streaming / in_flight 优先保留
 * - 其余以服务端正文与终态字段为准（工具调用、审批、metrics）
 */
export function mergeConversationMessages(
  local: ChatMessageEx[],
  server: ChatMessageEx[],
): ChatMessageEx[] {
  if (!server.length) return local;
  if (!local.length) return server;

  const byKey = new Map<string, ChatMessageEx>();
  const order: string[] = [];

  const put = (message: ChatMessageEx, preferIncoming: boolean) => {
    const key = messageKey(message);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, message);
      order.push(key);
      return;
    }
    if (isStreaming(existing) && !isStreaming(message)) {
      // 本地仍在流：保留本地，除非调用方明确用终态（由 preferIncoming + 非 streaming server）
      if (!preferIncoming) return;
    }
    if (isStreaming(message) && !isStreaming(existing)) {
      byKey.set(key, message);
      return;
    }
    // 较新时间戳或 preferIncoming（服务端灌入）胜出
    if (preferIncoming || stamp(message) >= stamp(existing)) {
      byKey.set(key, {
        ...existing,
        ...message,
        // 保留本地 clientMsgId，便于后续对齐
        clientMsgId: existing.clientMsgId || message.clientMsgId,
        id: existing.id || message.id,
      });
    }
  };

  for (const message of local) put(message, false);
  for (const message of server) put(message, true);

  // 服务端没有、仅本地存在的消息（乐观用户气泡）保留在原相对位置之后
  return order.map((key) => byKey.get(key)!).filter(Boolean);
}

export function resolveHydratedMessages(opts: {
  typing?: boolean;
  localMessages: ChatMessageEx[];
  serverMessages: ChatMessageEx[];
}): ConversationMergeResult {
  const skip = shouldSkipConversationHydrate(opts);
  if (skip) {
    return { messages: opts.localMessages, reason: skip, applied: false };
  }
  return {
    messages: mergeConversationMessages(opts.localMessages, opts.serverMessages),
    reason: 'apply',
    applied: true,
  };
}
