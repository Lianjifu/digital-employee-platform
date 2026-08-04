/**
 * 专家上下文概览：仅从本会话/本消息真实数据派生，禁止演示硬编码。
 */
import type { ChatMessageEx, Citation, ToolCall } from '@/hooks/types';

export type ExpertContextRag = {
  attempted: boolean;
  backend?: string;
  hitCount: number;
  topK: number | null;
  label: string;
};

export type ExpertContextTools = {
  total: number;
  success: number;
  failed: number;
  avgMs: number | null;
};

export type ExpertContextTimelineItem = {
  tone: 'success' | 'info' | 'warn' | 'error';
  text: string;
  time: string;
};

export type ExpertContextOverview = {
  citations: Citation[];
  tools: ExpertContextTools;
  rag: ExpertContextRag;
  tokenUsed: number | null;
  modelLabel: string | null;
  providerLabel: string | null;
  timeline: ExpertContextTimelineItem[];
};

function isKnowledgeTool(name: string): boolean {
  return /knowledge|rag|retrieve|检索/i.test(name);
}

function formatClock(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

/** 从会话消息汇总专家上下文（优先当前选中消息集合）。 */
export function deriveExpertContextOverview(messages: ChatMessageEx[]): ExpertContextOverview {
  const citations: Citation[] = [];
  const toolCalls: ToolCall[] = [];
  let tokenUsed = 0;
  let hasToken = false;
  let modelLabel: string | null = null;
  let providerLabel: string | null = null;
  let ragBackend: string | undefined;
  let ragAttempted = false;

  for (const message of messages) {
    for (const c of message.citations ?? []) citations.push(c);
    for (const t of message.toolCalls ?? []) {
      toolCalls.push(t);
      if (isKnowledgeTool(t.name)) {
        ragAttempted = true;
        const backend = t.args?.backend;
        if (typeof backend === 'string' && backend) ragBackend = backend;
      }
    }
    const m = message.metrics;
    if (m) {
      const tok = (m.promptTokens ?? 0) + (m.completionTokens ?? 0);
      if (tok > 0) {
        tokenUsed += tok;
        hasToken = true;
      }
      if (m.model) modelLabel = String(m.model);
      if (m.provider) providerLabel = String(m.provider);
    }
  }

  // 去重引用（同 docId+source+text）
  const seenCite = new Set<string>();
  const uniqueCitations = citations.filter((c) => {
    const key = `${c.docId}|${c.source}|${c.text}`;
    if (seenCite.has(key)) return false;
    seenCite.add(key);
    return true;
  });

  const success = toolCalls.filter((t) => t.status === 'success').length;
  const failed = toolCalls.filter((t) => t.status === 'failed' || t.status === 'denied').length;
  const timed = toolCalls.filter((t) => typeof t.durationMs === 'number' && (t.durationMs ?? 0) > 0);
  const avgMs = timed.length
    ? Math.round(timed.reduce((s, t) => s + (t.durationMs ?? 0), 0) / timed.length)
    : null;

  if (uniqueCitations.length > 0) ragAttempted = true;

  const rag: ExpertContextRag = {
    attempted: ragAttempted,
    backend: ragBackend,
    hitCount: uniqueCitations.length,
    topK: uniqueCitations.length > 0 ? uniqueCitations.length : null,
    label: !ragAttempted
      ? '本回合未触发检索'
      : uniqueCitations.length > 0
        ? `命中 ${uniqueCitations.length} 条`
        : '已检索 · 无命中',
  };

  const timeline: ExpertContextTimelineItem[] = [];
  const recent = [...messages].reverse().slice(0, 8);
  for (const message of recent) {
    const time = formatClock(message.createdAt);
    if (message.role === 'assistant' && message.status === 'succeeded') {
      const model = message.metrics?.model || message.metrics?.provider;
      timeline.push({
        tone: 'success',
        text: model ? `助手回复完成 · ${model}` : '助手回复完成',
        time,
      });
    }
    if (message.status === 'failed') {
      timeline.push({ tone: 'error', text: '回合失败', time });
    }
    for (const t of message.toolCalls ?? []) {
      timeline.push({
        tone: t.status === 'failed' || t.status === 'denied' ? 'error' : 'info',
        text: `${t.name} · ${t.status === 'success' ? '成功' : t.status}`,
        time,
      });
    }
    if (message.approvalRequest?.decision === 'pending') {
      timeline.push({ tone: 'warn', text: '写操作待审批', time });
    } else if (message.approvalRequest?.decision === 'approved') {
      timeline.push({ tone: 'success', text: '审批已通过', time });
    }
  }

  return {
    citations: uniqueCitations.slice(0, 8),
    tools: {
      total: toolCalls.length,
      success,
      failed,
      avgMs,
    },
    rag,
    tokenUsed: hasToken ? tokenUsed : null,
    modelLabel,
    providerLabel,
    timeline: timeline.slice(0, 6),
  };
}
