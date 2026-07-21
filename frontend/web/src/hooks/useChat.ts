/**
 * 会话状态管理 hook — 企业级
 *
 * 能力：
 *  - 消息状态机（queued / in_flight / streaming / succeeded / failed / cancelled / expired / moderated）
 *  - 多会话管理（增/删/置顶/星标/分享/归档/TTL）
 *  - 输入 + 草稿 + 历史（↑↓）+ @ 提及
 *  - 流式响应（chunk 级增量、AbortController、可重试）
 *  - 错误分类（network / auth / timeout / rate_limit / content_filter / tool_denied / internal）
 *  - 用户反馈（like / dislike + 标签 + 备注 → RAG eval / 训练）
 *  - 双签审批（operator + auditor + 时间戳 + hash）
 *  - Reasoning / Tool / RAG / 安全字段
 *  - 调试：请求日志（requestId / correlationId / TTFT / tokens / status）
 *  - 持久化：localStorage（带版本 + 容量上限 + 字段裁剪）
 *
 * 兼容：
 *  - 旧 API（setDraft / newSession / delSession / switchSession / togglePin / toggleStar /
 *    send / stop / regenerate / delMessage / approveSign）保持签名与行为
 *  - 旧 state 字段（sessions / activeId / draftInput / typing / inputHistory / requests）保留
 *  - 旧 ChatMessageEx 字段保留（同时新增企业级字段）
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { getApiClient } from '@de/web-api';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type {
  ChatMessageEx,
  ChatSession,
  SendMessageInput,
  MessageStatus,
  ErrorCategory,
  FeedbackKind,
  FeedbackTag,
  Signer,
  MessageMetrics,
  Citation,
  ToolCall,
  ReasoningStep,
  SafetyInfo,
  ApprovalDecision,
} from './types';
export type { ChatMessageEx, ChatSession };

/* ============ 公共类型 ============ */

export interface RequestLog {
  id: string;
  /** 链路追踪 ID（与消息 correlationId 对齐） */
  correlationId: string;
  ts: number;
  op: 'send' | 'regenerate' | 'stop' | 'approve' | 'delete' | 'create' | 'archive' | 'share' | 'export' | 'feedback';
  mid?: string;
  sid?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  /** 首 token 时间 */
  ttftMs?: number;
  status: 'pending' | 'streaming' | 'success' | 'aborted' | 'error';
  errorCategory?: ErrorCategory;
  error?: string;
}

interface State {
  /* 兼容字段 */
  sessions: Record<string, ChatSession>;
  activeId: string;
  draftInput: string;
  inputHistory: string[];
  typing: boolean;
  abortRef: { current: AbortController | null };
  requests: RequestLog[];

  /* 新增 */
  /** 当前活跃请求 ID（用于 UI 关联） */
  activeCorrelationId: string | null;
  /** 调试面板开关 */
  debugOpen: boolean;
  /** 持久化 schema 版本 */
  schemaVersion: number;
}

type Action =
  /* 兼容 */
  | { type: 'set_draft'; value: string }
  | { type: 'push_history'; value: string }
  | { type: 'new_session'; session: ChatSession }
  | { type: 'del_session'; id: string }
  | { type: 'switch'; id: string }
  | { type: 'pin'; id: string; pinned: boolean }
  | { type: 'star'; id: string; starred: boolean }
  | { type: 'append_msg'; sid: string; msg: ChatMessageEx }
  | { type: 'replace_msg'; sid: string; mid: string; msg: ChatMessageEx }
  | { type: 'del_msg'; sid: string; mid: string }
  | { type: 'regenerate'; sid: string; mid: string; msg: ChatMessageEx }
  | { type: 'update_session'; sid: string; patch: Partial<ChatSession> }
  | { type: 'set_typing'; typing: boolean }
  | { type: 'stop_typing' }
  | { type: 'set_abort'; ctrl: AbortController | null }
  | { type: 'clear_unread'; id: string }
  | { type: 'log_request'; log: RequestLog }
  | { type: 'update_request'; id: string; patch: Partial<RequestLog> }
  | { type: 'clear_requests' }
  /* 新增 */
  | { type: 'set_msg_status'; sid: string; mid: string; status: MessageStatus; error?: ChatMessageEx['error'] }
  | { type: 'set_feedback'; sid: string; mid: string; feedback: ChatMessageEx['feedback'] }
  | { type: 'set_metrics'; sid: string; mid: string; metrics: Partial<MessageMetrics> }
  | { type: 'append_reasoning_step'; sid: string; mid: string; step: ReasoningStep }
  | { type: 'set_safety'; sid: string; mid: string; safety: SafetyInfo }
  | { type: 'approve'; sid: string; mid: string; signerIndex: number }
  | { type: 'reject'; sid: string; mid: string; signerIndex: number; reason?: string }
  | { type: 'archive_session'; id: string; archived: boolean }
  | { type: 'set_share_token'; id: string; token: string | null }
  | { type: 'set_active_correlation'; id: string | null }
  | { type: 'set_debug'; open: boolean }
  | { type: 'hydrate'; state: State };

/* ============ 常量 ============ */

const STORAGE_KEY = 'de-chat-state';
const STORAGE_VERSION = 2;
const MAX_SESSIONS = 200; // 总会话上限
const MAX_MESSAGES_PER_SESSION = 500; // 单会话消息上限
const MAX_REQUESTS = 200; // 请求日志上限
const MAX_INPUT_HISTORY = 20;
const MAX_CHARS_DEFAULT = 4000;
const STREAM_CHUNK_MS = 24;
const STREAM_TICK_MS = 120;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRY = 1;

/* ============ 工具函数 ============ */

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function previewOf(m: ChatMessageEx): string {
  const c = m.content ?? '';
  return c.length > 50 ? c.slice(0, 50) : c;
}

export function uid(prefix = ''): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

function correlationId(): string {
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function newSigner(name: string, role: Signer['role'] = 'approver'): Signer {
  return { name, role, signed: false };
}

/* ============ 初始 state ============ */

const initial: State = {
  sessions: {},
  activeId: '',
  draftInput: '',
  inputHistory: [],
  typing: false,
  abortRef: { current: null },
  requests: [],
  activeCorrelationId: null,
  debugOpen: false,
  schemaVersion: STORAGE_VERSION,
};

/* ============ Reducer ============ */

function reducer(s: State, a: Action): State {
  switch (a.type) {
    /* ---- 兼容 ---- */
    case 'set_draft':
      return { ...s, draftInput: a.value };
    case 'push_history': {
      const prev = s.inputHistory ?? [];
      return { ...s, inputHistory: [a.value, ...prev.filter((x) => x !== a.value)].slice(0, MAX_INPUT_HISTORY) };
    }
    case 'new_session': {
      const next = { ...s.sessions, [a.session.id]: a.session };
      // 总数上限保护
      const ids = Object.keys(next);
      let trimmed = next;
      if (ids.length > MAX_SESSIONS) {
        const overflow = ids.slice(0, ids.length - MAX_SESSIONS);
        trimmed = { ...next };
        overflow.forEach((k) => delete trimmed[k]);
      }
      return { ...s, sessions: trimmed, activeId: a.session.id };
    }
    case 'del_session': {
      const next = { ...s.sessions };
      delete next[a.id];
      const ids = Object.keys(next);
      const firstId = ids[0] ?? '';
      return { ...s, sessions: next, activeId: s.activeId === a.id ? firstId : s.activeId };
    }
    case 'switch':
      return { ...s, activeId: a.id };
    case 'pin':
      return { ...s, sessions: { ...s.sessions, [a.id]: { ...s.sessions[a.id], pinned: a.pinned } } };
    case 'star':
      return { ...s, sessions: { ...s.sessions, [a.id]: { ...s.sessions[a.id], starred: a.starred } } };
    case 'append_msg': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = capMessages([...sess.messages, a.msg]);
      const updated: ChatSession = {
        ...sess,
        messages,
        preview: previewOf(a.msg),
        status: 'active',
        time: nowHHMM(),
        lastActiveAt: Date.now(),
      };
      return { ...s, sessions: { ...s.sessions, [a.sid]: updated } };
    }
    case 'replace_msg': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) => (m.id === a.mid ? a.msg : m));
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages, lastActiveAt: Date.now() } } };
    }
    case 'del_msg': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages: sess.messages.filter((m) => m.id !== a.mid) } } };
    }
    case 'regenerate': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const idx = sess.messages.findIndex((m) => m.id === a.mid);
      if (idx < 0) return s;
      const messages = [...sess.messages.slice(0, idx), a.msg, ...sess.messages.slice(idx + 1)];
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages, lastActiveAt: Date.now() } } };
    }
    case 'update_session':
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...s.sessions[a.sid], ...a.patch } } };
    case 'set_typing':
      return { ...s, typing: a.typing };
    case 'stop_typing':
      if (s.abortRef.current) s.abortRef.current.abort();
      return { ...s, typing: false, abortRef: { current: null } };
    case 'set_abort':
      return { ...s, abortRef: { current: a.ctrl } };
    case 'clear_unread':
      return { ...s, sessions: { ...s.sessions, [a.id]: { ...s.sessions[a.id], unread: 0 } } };
    case 'log_request':
      return { ...s, requests: [a.log, ...s.requests].slice(0, MAX_REQUESTS) };
    case 'update_request': {
      const reqs = s.requests.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r));
      return { ...s, requests: reqs };
    }
    case 'clear_requests':
      return { ...s, requests: [] };

    /* ---- 新增 ---- */
    case 'set_msg_status': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) =>
        m.id === a.mid ? { ...m, status: a.status, error: a.error ?? m.error } : m,
      );
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages } } };
    }
    case 'set_feedback': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) =>
        m.id === a.mid ? { ...m, feedback: { ...(m.feedback ?? { kind: null }), ...(a.feedback ?? { kind: null }) } } : m,
      );
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages } } };
    }
    case 'set_metrics': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) =>
        m.id === a.mid ? { ...m, metrics: { ...(m.metrics ?? {}), ...a.metrics } } : m,
      );
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages } } };
    }
    case 'append_reasoning_step': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) =>
        m.id === a.mid
          ? { ...m, reasoningSteps: [...(m.reasoningSteps ?? []), a.step] }
          : m,
      );
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages } } };
    }
    case 'set_safety': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) => (m.id === a.mid ? { ...m, safety: a.safety } : m));
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages } } };
    }
    case 'approve': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) => {
        if (m.id !== a.mid || !m.approvalRequest) return m;
        const ar = m.approvalRequest;
        if (ar.signed >= ar.required) return m;
        const signers = ar.signers.map((sg, i) =>
          i === a.signerIndex && !sg.signed
            ? { ...sg, signed: true, signedAt: new Date().toISOString(), signatureHash: uid('sig_') }
            : sg,
        );
        const signed = signers.filter((sg) => sg.signed).length;
        const decision: ApprovalDecision = signed >= ar.required ? 'approved' : 'pending';
        const nextApproval = {
          ...ar,
          signers,
          signed,
          decision,
          decidedAt: signed >= ar.required ? new Date().toISOString() : ar.decidedAt,
        } as typeof m.approvalRequest;
        return { ...m, approvalRequest: nextApproval };
      });
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages } } };
    }
    case 'reject': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const messages = sess.messages.map((m) => {
        if (m.id !== a.mid || !m.approvalRequest) return m;
        const ar = m.approvalRequest;
        const signers = ar.signers.map((sg, i) =>
          i === a.signerIndex ? { ...sg, signed: true, signedAt: new Date().toISOString(), signatureHash: uid('sig_') } : sg,
        );
        return {
          ...m,
          approvalRequest: {
            ...ar,
            signers,
            signed: ar.signed + 1,
            decision: 'rejected' as const,
            decidedAt: new Date().toISOString(),
          } as typeof m.approvalRequest,
        };
      });
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages } } };
    }
    case 'archive_session': {
      const sess = s.sessions[a.id];
      if (!sess) return s;
      return {
        ...s,
        sessions: {
          ...s.sessions,
          [a.id]: {
            ...sess,
            lifecycle: a.archived ? 'archived' : 'active',
            archivedAt: a.archived ? Date.now() : undefined,
            group: a.archived ? 'archived' : sess.group,
          },
        },
      };
    }
    case 'set_share_token': {
      const sess = s.sessions[a.id];
      if (!sess) return s;
      return { ...s, sessions: { ...s.sessions, [a.id]: { ...sess, shareToken: a.token ?? undefined } } };
    }
    case 'set_active_correlation':
      return { ...s, activeCorrelationId: a.id };
    case 'set_debug':
      return { ...s, debugOpen: a.open };
    case 'hydrate':
      return a.state;
  }
}

/* 限制单会话消息数量（保留首条 + 尾部若干，加一条系统摘要占位） */
function capMessages(msgs: ChatMessageEx[]): ChatMessageEx[] {
  if (msgs.length <= MAX_MESSAGES_PER_SESSION) return msgs;
  const head = msgs[0];
  const tail = msgs.slice(-MAX_MESSAGES_PER_SESSION + 2);
  const notice: ChatMessageEx = {
    id: uid('m_'),
    role: 'system',
    content: `—— 此处省略 ${msgs.length - tail.length - 1} 条历史消息 ——`,
    createdAt: new Date().toISOString(),
  };
  return [head, notice, ...tail];
}

/* ============ mock agent 回复生成器（兼容旧版 + 扩展企业级字段） ============ */

interface ReplyMock {
  id?: string;
  role: 'assistant';
  agentName: string;
  content: string;
  thinkingSummary?: string;
  reasoningSteps?: ReasoningStep[];
  citations?: Citation[];
  toolCalls?: ToolCall[];
  approvalRequest?: ChatMessageEx['approvalRequest'];
  safety?: SafetyInfo;
  metrics?: MessageMetrics;
}

const REPLY_TEMPLATES: { match: RegExp; reply: (q: string) => ReplyMock }[] = [
  {
    match: /(redis|缓存|cache)/i,
    reply: (q) => ({
      role: 'assistant',
      agentName: '故障自愈',
      content: '已检测到 Redis 相关问题。正在按 Runbook §3.1 执行：\n1. 检查 maxmemory-policy（当前 noeviction）\n2. 临时扩容到 16GB（需双签）\n3. 切换 volatile-lru 策略\n4. 监控 OOM 频率',
      thinkingSummary: '用户提到 Redis，先查 maxmemory-policy + 最近写入速率。',
      reasoningSteps: [
        { id: uid('r_'), kind: 'plan', title: '识别问题域', detail: '关键词命中 Redis，定位缓存层', startedAt: now(), endedAt: now() },
        { id: uid('r_'), kind: 'search', title: '检索 Runbook', detail: '召回 2 篇：Redis OOM 处置 v3.2、CMDB 资产表' },
        { id: uid('r_'), kind: 'tool_call', title: '执行 redis-cli INFO memory', toolCallIds: ['t1'] },
        { id: uid('r_'), kind: 'tool_call', title: '执行 redis-cli CONFIG GET maxmemory*', toolCallIds: ['t2'] },
        { id: uid('r_'), kind: 'finalize', title: '生成修复方案' },
      ],
      citations: [
        { id: 'c1', docId: 'rb-redis-oom', chunkId: 'rb-12-3', source: 'Runbook', page: 12, score: 0.92, rerankScore: 0.94, evalLabel: 'useful', text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率...' },
        { id: 'c2', docId: 'cmdb-cache', chunkId: 'cmdb-prd-019', source: 'CMDB', page: null, score: 0.78, rerankScore: 0.81, evalLabel: 'useful', text: 'prod-redis-01 资产编号 PRD-CACHE-019...' },
      ],
      toolCalls: [
        { id: 't1', name: 'redis-cli INFO memory', args: { host: 'prod-redis-01' }, result: 'used_memory_human: 7.2G · maxmemory_human: 8G', status: 'success', durationMs: 120, permission: 'auto', sandboxId: 'sandbox-r-1024', traceId: 'tr-1' },
        { id: 't2', name: 'redis-cli CONFIG GET maxmemory*', args: {}, result: 'maxmemory 8589934592 · maxmemory-policy noeviction', status: 'success', durationMs: 80, permission: 'auto', sandboxId: 'sandbox-r-1024', traceId: 'tr-1' },
      ],
      approvalRequest: {
        action: 'CONFIG SET maxmemory 16GB + volatile-lru',
        resource: 'prod-redis-01',
        reason: '等保 3 · 高危配置变更',
        ticketId: 'CHG-2026-0156',
        required: 2,
        signed: 1,
        decision: 'pending',
        signers: [newSigner('王昊', 'operator'), newSigner('李婷', 'auditor')].map((sg, i) => i === 0 ? { ...sg, signed: true, signedAt: new Date().toISOString(), signatureHash: uid('sig_') } : sg),
      },
      metrics: { ttftMs: 320, durationMs: 1200, promptTokens: 480, completionTokens: 220, cacheHits: 2, model: 'Sonnet-4', provider: 'anthropic' },
    }),
  },
  {
    match: /(k8s|kubernetes|节点扩容)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '变更辅助',
      content: '已识别 K8s 节点扩容请求。分析：\n- 当前集群节点使用率 78%\n- 预计 5 个服务受影响（网关/订单/支付/认证/库存）\n- 建议维护窗口执行（建议 7/15 02:00-04:00）\n- 已生成变更单 #CHG-2026-0156',
      thinkingSummary: 'K8s 扩容需要评估影响范围 + 维护窗口。',
      reasoningSteps: [
        { id: uid('r_'), kind: 'plan', title: '解析诉求', detail: 'K8s 节点扩容' },
        { id: uid('r_'), kind: 'tool_call', title: 'kubectl get nodes', toolCallIds: ['t1'] },
        { id: uid('r_'), kind: 'finalize', title: '输出变更方案' },
      ],
      toolCalls: [
        { id: 't1', name: 'kubectl get nodes', args: { selector: 'role=worker' }, result: '5 nodes · 78% utilization', status: 'success', durationMs: 180, permission: 'auto', sandboxId: 'sandbox-k-2048', traceId: 'tr-2' },
      ],
      metrics: { ttftMs: 280, durationMs: 980, promptTokens: 320, completionTokens: 180, cacheHits: 1, model: 'Sonnet-4', provider: 'anthropic' },
    }),
  },
  {
    match: /(cve|漏洞|安全|漏洞修复)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '漏洞修复',
      content: 'CVE 周报已生成。本周发现 12 个新漏洞，其中 3 个高危：\n- CVE-2026-3321（CVSS 9.8）· Log4j 远程代码执行\n- CVE-2026-3318（CVSS 8.6）· Spring Framework 权限绕过\n- CVE-2026-3315（CVSS 7.5）· OpenSSL 拒绝服务\n\n影响资产：\n- 12 台 K8s 节点（cluster-prd-01）\n- 8 个 API 网关实例\n- 4 个 CMDB 资产',
      thinkingSummary: 'CVE 报告需要按 CVSS 排序 + 关联资产。',
      citations: [
        { id: 'c1', docId: 'nvd-cve-2026-3321', source: 'CVE', page: null, score: 0.95, rerankScore: 0.97, evalLabel: 'gold', text: 'CVE-2026-3321 影响 Log4j 2.x < 2.17.0...' },
      ],
      metrics: { ttftMs: 410, durationMs: 1320, promptTokens: 540, completionTokens: 260, cacheHits: 0, model: 'Sonnet-4', provider: 'anthropic' },
    }),
  },
  {
    match: /(合规|审计|iso|等保)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '合规审计',
      content: '本月合规自评报告已生成。94 项自评结果：\n- 通过 91 项（97%）\n- 需改善 3 项（导出审计日志/字段脱敏增强/灰度发布）\n- 等保 3 复测通过\n- ISO 27001 认证有效至 2027-03\n\n下次审计：2026-09-12',
      metrics: { ttftMs: 260, durationMs: 880, promptTokens: 280, completionTokens: 160, cacheHits: 1, model: 'Haiku-4.5', provider: 'anthropic' },
    }),
  },
  {
    match: /(alert|alertnoise|告警|降噪|siem|edr)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '告警降噪',
      content: '已分析过去 24h 告警数据：\n\n**告警去重**：1,247 → 89（合并 92.8% 重复）\n\n- **重复 SIEM 规则**：R-019 触发 478 次（同一 IP）\n- **升级风暴**：kubernetes_pod_restart 触发 312 次（同一 deployment）\n- **低危噪音**：disk_usage_warning 156 次（>80% 但 <90%）\n\n建议处理：\n1. 静默 R-019（该 IP 已确认）\n2. 合并 k8s deployment 重启告警（1 条聚合）\n3. 调高 disk_usage 阈值到 90%\n\n效果：预计每日告警量从 1,247 降至 ~150（-88%）',
      thinkingSummary: '告警降噪核心是模式识别 + 历史数据关联。',
      citations: [
        { id: 'c1', docId: 'siem-rule-r019', source: 'SIEM', page: 12, score: 0.94, rerankScore: 0.95, evalLabel: 'useful', text: '告警去重 R-019 历史触发 478 次...' },
        { id: 'c2', docId: 'cmdb-frontend', source: 'CMDB', page: null, score: 0.82, rerankScore: 0.85, evalLabel: 'useful', text: 'kubernetes deployment prod-frontend-7d8...' },
      ],
      toolCalls: [
        { id: 't1', name: 'siem query', args: { rule: 'R-019', range: '24h' }, result: '478 hits · 1 unique IP', status: 'success', durationMs: 240, permission: 'auto', sandboxId: 'sandbox-s-4096', traceId: 'tr-3' },
      ],
      metrics: { ttftMs: 360, durationMs: 1180, promptTokens: 420, completionTokens: 240, cacheHits: 1, model: 'Sonnet-4', provider: 'anthropic' },
    }),
  },
  {
    match: /(siem|调查|威胁|入侵|incident)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '威胁狩猎',
      content: '**SIEM 调查时间线**（基于 ATT&CK 框架）：\n\n1. **07:23** 初始入侵 — 钓鱼邮件 → 用户工作站执行恶意附件\n2. **07:45** 持久化 — 注册表 Run 键写入 svchost.exe\n3. **08:12** 凭证窃取 — Mimikatz 抓取 23 个凭据\n4. **08:30** 横向移动 — 扫描内网 SMB 共享\n5. **09:15** 数据外传 — DNS 隧道 1.2GB 至 C2 服务器\n\n**已自动隔离**：3 个工作站 + 2 个服务账号\n**建议**：立即重置 23 个泄露凭据 + 阻断 C2 域名',
      thinkingSummary: 'SIEM 调查需要按时间线 + ATT&CK 战术分类。',
      citations: [
        { id: 'c1', docId: 'mitre-t1003', source: 'SIEM', page: 5, score: 0.96, rerankScore: 0.98, evalLabel: 'gold', text: 'Mimikatz 凭证窃取 T1003...' },
        { id: 'c2', docId: 'cmdb-ws-042', source: 'CMDB', page: null, score: 0.88, rerankScore: 0.9, evalLabel: 'useful', text: 'workstation-042 · user-svc-018 ...' },
      ],
      toolCalls: [
        { id: 't1', name: 'siem timeline', args: { case: 'INC-2026-0723' }, result: '5 events · 23 creds · 1.2GB exfil', status: 'success', durationMs: 380, permission: 'auto', sandboxId: 'sandbox-s-4096', traceId: 'tr-4' },
      ],
      approvalRequest: {
        action: '重置 23 个泄露凭据 + 阻断 3 个 C2 域名',
        resource: 'workstation-042 / 23 凭据',
        reason: '等保 3 · 应急响应',
        ticketId: 'INC-2026-0723',
        required: 2,
        signed: 1,
        decision: 'pending',
        signers: [newSigner('王昊', 'operator'), newSigner('张睿', 'approver')].map((sg, i) => i === 0 ? { ...sg, signed: true, signedAt: new Date().toISOString(), signatureHash: uid('sig_') } : sg),
      },
      metrics: { ttftMs: 420, durationMs: 1480, promptTokens: 620, completionTokens: 320, cacheHits: 0, model: 'Sonnet-4', provider: 'anthropic' },
    }),
  },
  {
    match: /(灰度|发布|deploy|release|蓝绿)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '变更辅助',
      content: '**灰度发布方案**（蓝绿 → 5% → 25% → 100%）：\n\n**阶段 1**（5% · 30min）\n- 仅 cn-east-1 区域\n- 监控指标：5xx < 0.1% / P95 < 800ms\n- 自动回滚阈值：5xx > 0.5%\n\n**阶段 2**（25% · 1h）\n- cn-east-1 + cn-south-1\n- 监控指标：CPU < 70% / 内存 < 80%\n\n**阶段 3**（100% · 24h）\n- 全量 + 流量切换\n- 监控所有业务指标 + 用户反馈\n\n**预计风险**：\n- 影响服务：5 个（gateway / order / pay / auth / inventory）\n- 回滚时间：< 30s（自动）\n- 影响用户：渐进式',
      thinkingSummary: '蓝绿发布 3 阶段，每阶段 30min 观察 + 自动回滚。',
      citations: [
        { id: 'c1', docId: 'rb-blue-green', source: 'Runbook', page: 8, score: 0.91, rerankScore: 0.93, evalLabel: 'useful', text: '蓝绿发布 3 阶段流程...' },
      ],
      toolCalls: [
        { id: 't1', name: 'argocd rollout', args: { stage: '5%', region: 'cn-east-1' }, result: '5/100 pods updated · 0 errors', status: 'success', durationMs: 1200, permission: 'approval-required', sandboxId: 'sandbox-a-8192', traceId: 'tr-5' },
      ],
      approvalRequest: {
        action: 'argocd rollout (5% → 25% → 100%)',
        resource: 'gateway-prod / order-prod',
        reason: 'P1 灰度发布 · 影响 5 个核心服务',
        ticketId: 'REL-2026-0715',
        required: 2,
        signed: 0,
        decision: 'pending',
        signers: [newSigner('王昊', 'operator'), newSigner('孙博', 'approver')],
      },
      metrics: { ttftMs: 380, durationMs: 1620, promptTokens: 580, completionTokens: 300, cacheHits: 2, model: 'Sonnet-4', provider: 'anthropic' },
    }),
  },
  {
    match: /(知识|文档|wiki|怎么用|介绍|使用)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '知识答疑',
      content: '**数字员工平台使用指南**（v3.0）：\n\n**核心模块**：\n- **首页** — 业务总览（KPI / 健康度 / 告警）\n- **会话**（Copilot）— 与数字员工协同处理工作\n- **任务** — 任务管理与双签审批\n- **工作区** — 多租户隔离与成员协作\n- **智能体** — 智能体能力管理\n- **工作流** — DAG 可视化编排\n- **知识** — RAG 检索与知识资产管理\n- **技能** — Skill / MCP / Tool（gVisor 沙箱）\n- **模型** — 多 Provider 与分级路由\n- **渠道** — 飞书 / 企微 / 邮件 / Webhook\n- **设置** — 租户 / 成员 / 合规 / 计费\n\n**快速上手**：\n1. 按 `⌘K` 全局搜索\n2. 输入 `/` 唤起命令面板\n3. 输入 `@` 提及智能体、技能或文档\n4. 主题切换在顶栏右侧\n5. 在左侧栏进入所需模块',
      citations: [
        { id: 'c1', docId: 'rb-platform-v3', source: 'Runbook', page: 1, score: 0.95, rerankScore: 0.97, evalLabel: 'gold', text: '数字员工平台使用指南 v3.0 ...' },
      ],
      metrics: { ttftMs: 220, durationMs: 720, promptTokens: 240, completionTokens: 180, cacheHits: 3, model: 'Haiku-4.5', provider: 'anthropic' },
    }),
  },
  {
    match: /(工单|创建任务|建工单|ticket|incident)/i,
    reply: (q) => ({
      role: 'assistant',
      agentName: '故障自愈',
      content: '**工单已创建** — TSK-20260714-001\n\n**基本信息**：\n- **标题**：' + (q.replace(/^.*?(工单|创建|建|ticket|incident)/i, '') || '用户问题') + '\n- **优先级**：P1（基于关键词分析）\n- **状态**：待分配\n- **创建人**：王昊\n- **来源**：Copilot 对话\n\n**自动关联**：\n- CMDB 资产：prod-redis-01, k8s-prod-cluster\n- Runbook：cache-oom 处置 v3.2\n- 知识库引用：3 篇\n\n**SLA**：4 小时内响应 / 24 小时内解决\n**负责人**：待分配（建议分配给 王昊 或 李婷）\n\n是否要立即分配给某人？',
      thinkingSummary: '创建工单需要从用户消息提取关键信息 + 关联资产 + 设置 SLA。',
      toolCalls: [
        { id: 't1', name: 'jira create', args: { project: 'OPS', priority: 'P1' }, result: 'TSK-20260714-001 created', status: 'success', durationMs: 320, permission: 'auto', sandboxId: 'sandbox-j-512', traceId: 'tr-6' },
        { id: 't2', name: 'cmdb lookup', args: { query: 'cache' }, result: '3 assets matched', status: 'success', durationMs: 180, permission: 'auto', sandboxId: 'sandbox-c-256', traceId: 'tr-6' },
      ],
      metrics: { ttftMs: 340, durationMs: 1040, promptTokens: 360, completionTokens: 220, cacheHits: 0, model: 'Sonnet-4', provider: 'anthropic' },
    }),
  },
  {
    match: /^($|help|帮助|\?)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '故障自愈',
      content: '我是 **故障自愈** Agent v1.4.2。可以帮你：\n\n**我能处理**：\n- 🔴 Redis/K8s 等基础设施故障\n- 📊 容量预测与扩容建议\n- 🔍 CVE 漏洞扫描与修复\n- 🛡️ 合规审计报告\n- 📋 任务创建与追踪\n\n**试试问我**：\n- "prod-redis-01 OOM 了怎么办？"\n- "K8s 节点扩容建议"\n- "本周 CVE 周报"\n- "本月合规审计"\n\n**快捷键**：\n- `/` — 命令面板\n- `@` — 提及\n- `Enter` 发送 / `Shift+Enter` 换行\n- `Esc` 停止生成',
      metrics: { ttftMs: 120, durationMs: 280, promptTokens: 80, completionTokens: 120, cacheHits: 5, model: 'Haiku-4.5', provider: 'anthropic' },
    }),
  },
  {
    match: /^(hi|hello|你好|嗨)/i,
    reply: () => ({
      role: 'assistant',
      agentName: '故障自愈',
      content: '你好！我是故障自愈 Agent v1.4.2。可以帮你：\n- 处理 Redis/K8s 等基础设施故障\n- 执行 Runbook 自动化修复\n- 监控告警 + 智能诊断\n\n试试问我："Redis OOM 怎么解决" 或 "K8s 节点扩容建议"',
      metrics: { ttftMs: 80, durationMs: 220, promptTokens: 60, completionTokens: 100, cacheHits: 6, model: 'Haiku-4.5', provider: 'anthropic' },
    }),
  },
];

function generateMockReply(userMsg: string): ReplyMock {
  for (const t of REPLY_TEMPLATES) {
    if (t.match.test(userMsg)) return t.reply(userMsg);
  }
  return {
    role: 'assistant',
    agentName: '故障自愈',
    content: `已收到你的问题：「${userMsg}」\n\n正在分析中，可按 / 唤起命令面板切换 Agent 或使用 @ 提及特定资源。`,
    thinkingSummary: '通用回复：识别不到具体场景，给出引导。',
    metrics: { ttftMs: 180, durationMs: 420, promptTokens: 100, completionTokens: 80, cacheHits: 1, model: 'Haiku-4.5', provider: 'anthropic' },
  };
}

function now(): string {
  return new Date().toISOString();
}

/* ============ 持久化 ============ */

function loadState(): State | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed || !parsed.sessions) return null;
    // 版本兼容：旧版本仅作 hydrate，缺字段补默认值
    if ((parsed.schemaVersion ?? 1) < STORAGE_VERSION) {
      parsed.schemaVersion = STORAGE_VERSION;
    }
    return {
      ...parsed,
      inputHistory: parsed.inputHistory ?? [],
      requests: parsed.requests ?? [],
      debugOpen: parsed.debugOpen ?? false,
      activeCorrelationId: null,
      typing: false,
      abortRef: { current: null },
    } as State;
  } catch {
    return null;
  }
}

function saveState(s: State) {
  try {
    const { typing, abortRef, ...rest } = s;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {}
}

/* ============ 序列化（导出） ============ */

export function exportSession(session: ChatSession, opts: { includeCitations?: boolean; includeToolCalls?: boolean; includeReasoning?: boolean; includeAuditTrail?: boolean } = {}): string {
  const { includeCitations = true, includeToolCalls = true, includeReasoning = true, includeAuditTrail = false } = opts;
  if (!includeAuditTrail) {
    const out: string[] = [`# ${session.title}`, `> ${session.preview || '(空)'}`, '', `Agent: ${session.agent}`, `Created: ${new Date(session.createdAt).toISOString()}`, ''];
    for (const m of session.messages) {
      out.push(`## [${m.role}] ${m.agentName ?? m.role} — ${m.createdAt}`);
      if (m.content) out.push(m.content);
      if (includeReasoning && m.reasoningSteps?.length) {
        out.push('', '**Reasoning:**');
        for (const s of m.reasoningSteps) out.push(`- (${s.kind}) ${s.title}${s.detail ? ` — ${s.detail}` : ''}`);
      }
      if (includeToolCalls && m.toolCalls?.length) {
        out.push('', '**Tool calls:**');
        for (const t of m.toolCalls) out.push(`- \`${t.name}\` (${t.status}, ${t.durationMs ?? 0}ms) ${t.sandboxId ? `[sandbox:${t.sandboxId}]` : ''}`);
      }
      if (includeCitations && m.citations?.length) {
        out.push('', '**Citations:**');
        for (const c of m.citations) out.push(`- [${c.source}${c.page ? ` p.${c.page}` : ''}] (score=${c.score.toFixed(2)}) ${c.text}`);
      }
      out.push('');
    }
    return out.join('\n');
  }
  // 审计模式：JSON + 摘要哈希
  const auditPayload = {
    sessionId: session.id,
    title: session.title,
    owner: session.ownerName,
    workspaceId: session.workspaceId,
    createdAt: new Date(session.createdAt).toISOString(),
    messages: session.messages.map((m) => ({
      id: m.id,
      role: m.role,
      agent: m.agentName,
      content: m.content,
      status: m.status,
      correlationId: m.correlationId,
      feedback: m.feedback,
      safety: m.safety,
      metrics: m.metrics,
      approval: m.approvalRequest,
    })),
    hash: uid('audit_'),
  };
  return JSON.stringify(auditPayload, null, 2);
}

/* ============ hook ============ */

export function useChat(agentMeta?: { name: string }) {
  const [state, dispatch] = useReducer(reducer, initial, () => {
    const loaded = loadState();
    if (loaded) return loaded;

    // 默认会话（首启动）
    const id = uid('s_');
    const sid: ChatSession = {
      id,
      title: 'Redis OOM 处理',
      preview: '已扩容到 16GB + volatile-lru',
      agent: agentMeta?.name ?? '故障自愈',
      status: 'active',
      lifecycle: 'active',
      group: 'today',
      time: '14:32',
      pinned: true,
      ownerId: 'u1',
      ownerName: '王昊',
      workspaceId: useWorkspaceStore.getState().currentWorkspaceId ?? 'w1',
      encrypted: true,
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'prod-redis-01 OOM 了，怎么处理？',
          createdAt: new Date(Date.now() - 120_000).toISOString(),
          clientMsgId: uid('c_'),
          status: 'succeeded',
        },
      ],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    return {
      sessions: { [id]: sid },
      activeId: id,
      draftInput: '',
      inputHistory: [],
      typing: false,
      abortRef: { current: null },
      requests: [],
      activeCorrelationId: null,
      debugOpen: false,
      schemaVersion: STORAGE_VERSION,
    };
  });

  // 持久化
  useEffect(() => {
    saveState(state);
  }, [state]);

  // 切换会话时清未读
  useEffect(() => {
    if (state.activeId) dispatch({ type: 'clear_unread', id: state.activeId });
  }, [state.activeId]);

  // 超时监控：超时自动 abort + 写错误
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ==================== 内部：启动流式 ==================== */

  const startStream = useCallback(
    (
      sid: string,
      replyId: string,
      reply: ReplyMock,
      ctrl: AbortController,
      correlationIdStr: string,
    ) => {
      // 1) 占位
      const placeholder: ChatMessageEx = {
        id: replyId,
        role: 'assistant',
        agentName: reply.agentName,
        content: '',
        reasoningSteps: [],
        toolCalls: [],
        citations: [],
        clientMsgId: uid('c_'),
        correlationId: correlationIdStr,
        status: 'streaming',
        metrics: { model: reply.metrics?.model ?? 'Sonnet-4', provider: reply.metrics?.provider ?? 'anthropic' },
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'append_msg', sid, msg: placeholder });

      // 2) 写请求日志
      const reqId = uid('req_');
      const startedAt = Date.now();
      dispatch({
        type: 'log_request',
        log: {
          id: reqId,
          correlationId: correlationIdStr,
          ts: startedAt,
          op: 'send',
          mid: replyId,
          sid,
          model: reply.metrics?.model ?? 'Sonnet-4',
          promptTokens: 0,
          completionTokens: 0,
          durationMs: 0,
          ttftMs: 0,
          status: 'streaming',
        },
      });

      // 3) Reasoning steps 注入（先全部）
      const steps = reply.reasoningSteps ?? [];
      let stepIdx = 0;
      const injectStep = () => {
        if (stepIdx >= steps.length) {
          streamText();
          return;
        }
        const s = steps[stepIdx++];
        dispatch({ type: 'append_reasoning_step', sid, mid: replyId, step: s });
        setTimeout(injectStep, 60);
      };

      // 4) 流式文本
      const text = reply.content;
      let i = 0;
      let firstChunkAt = 0;
      const tick = () => {
        if (ctrl.signal.aborted) {
          dispatch({ type: 'update_request', id: reqId, patch: { status: 'aborted', durationMs: Date.now() - startedAt } });
          dispatch({ type: 'set_typing', typing: false });
          dispatch({ type: 'set_abort', ctrl: null });
          dispatch({ type: 'set_msg_status', sid, mid: replyId, status: 'cancelled' });
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          return;
        }
        if (i === 0) firstChunkAt = Date.now();
        i += 2;
        dispatch({
          type: 'replace_msg',
          sid,
          mid: replyId,
          msg: {
            ...placeholder,
            content: text.slice(0, i),
            status: 'streaming',
          },
        });
        if (i < text.length) {
          setTimeout(tick, STREAM_CHUNK_MS);
        } else {
          // 5) 完整消息：恢复 reasoning / tool / citations / approval / metrics
          const finalMsg: ChatMessageEx = {
            ...placeholder,
            content: text,
            reasoningSteps: steps,
            thinkingSummary: reply.thinkingSummary,
            citations: reply.citations,
            toolCalls: reply.toolCalls,
            approvalRequest: reply.approvalRequest,
            safety: reply.safety,
            metrics: {
              ...placeholder.metrics,
              ...(reply.metrics ?? {}),
              ttftMs: reply.metrics?.ttftMs ?? firstChunkAt - startedAt,
              durationMs: Date.now() - startedAt,
            },
            status: 'succeeded',
            serverMsgId: uid('srv_'),
          };
          dispatch({ type: 'replace_msg', sid, mid: replyId, msg: finalMsg });
          dispatch({ type: 'update_request', id: reqId, patch: { status: 'success', durationMs: Date.now() - startedAt, ttftMs: firstChunkAt - startedAt, completionTokens: reply.metrics?.completionTokens ?? Math.round(text.length * 0.4) } });
          dispatch({ type: 'set_typing', typing: false });
          dispatch({ type: 'set_abort', ctrl: null });
          dispatch({ type: 'set_active_correlation', id: null });
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
        }
      };

      const streamText = () => setTimeout(tick, STREAM_TICK_MS);

      // 启动
      setTimeout(injectStep, 80);
    },
    [],
  );

  /* ==================== 公共 API ==================== */

  const setDraft = useCallback((v: string) => dispatch({ type: 'set_draft', value: v }), []);

  const newSession = useCallback(() => {
    const id = uid('s_');
    const sess: ChatSession = {
      id,
      title: '新会话',
      preview: '',
      agent: agentMeta?.name ?? '故障自愈',
      status: 'active',
      lifecycle: 'active',
      group: 'today',
      time: nowHHMM(),
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      ownerId: 'u1',
      ownerName: '王昊',
      workspaceId: useWorkspaceStore.getState().currentWorkspaceId ?? 'w1',
      encrypted: true,
    };
    dispatch({ type: 'new_session', session: sess });
  }, [agentMeta?.name]);

  const delSession = useCallback((id: string) => dispatch({ type: 'del_session', id }), []);
  const switchSession = useCallback((id: string) => dispatch({ type: 'switch', id }), []);
  const togglePin = useCallback((id: string) => {
    const sess = state.sessions[id];
    if (sess) dispatch({ type: 'pin', id, pinned: !sess.pinned });
  }, [state.sessions]);
  const toggleStar = useCallback((id: string) => {
    const sess = state.sessions[id];
    if (sess) dispatch({ type: 'star', id, starred: !sess.starred });
  }, [state.sessions]);

  const stop = useCallback(() => {
    dispatch({ type: 'stop_typing' });
    const corr = state.activeCorrelationId;
    if (corr) {
      // 找到正在 streaming 的消息，标 cancelled
      const sid = state.activeId;
      const sess = state.sessions[sid];
      if (sess) {
        const m = sess.messages.find((x) => x.correlationId === corr);
        if (m) dispatch({ type: 'set_msg_status', sid, mid: m.id, status: 'cancelled' });
      }
      dispatch({ type: 'set_active_correlation', id: null });
    }
  }, [state.activeCorrelationId, state.activeId, state.sessions]);

  const send = useCallback((content: string, opts?: Partial<SendMessageInput>) => {
    const text = (opts?.text ?? content).trim();
    if (!text || !state.activeId || state.typing) return;

    dispatch({ type: 'push_history', value: text });

    const corr = correlationId();
    dispatch({ type: 'set_active_correlation', id: corr });

    const userMsg: ChatMessageEx = {
      id: uid('m_'),
      role: 'user',
      content: text,
      clientMsgId: uid('c_'),
      correlationId: corr,
      status: 'succeeded',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'append_msg', sid: state.activeId, msg: userMsg });
    dispatch({ type: 'set_draft', value: '' });

    // 流式
    const ctrl = new AbortController();
    dispatch({ type: 'set_abort', ctrl });
    dispatch({ type: 'set_typing', typing: true });

    // 超时
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      ctrl.abort();
    }, DEFAULT_TIMEOUT_MS);

    setTimeout(() => {
      const reply = generateMockReply(text);
      const replyId = uid('m_');
      const replyWithCorr: ReplyMock = { ...reply, id: replyId };
      startStream(state.activeId, replyId, replyWithCorr, ctrl, corr);
    }, 300);
  }, [state.activeId, state.typing, startStream]);

  const sendMessage = send; // 兼容别名

  const regenerate = useCallback((mid: string) => {
    const sess = state.sessions[state.activeId];
    if (!sess) return;
    const idx = sess.messages.findIndex((m) => m.id === mid);
    if (idx <= 0) return;
    const userMsg = sess.messages[idx - 1];
    if (userMsg.role !== 'user') return;

    const corr = correlationId();
    dispatch({ type: 'set_active_correlation', id: corr });

    const reply = generateMockReply(userMsg.content);
    const replyId = uid('m_');
    const placeholder: ChatMessageEx = {
      id: replyId,
      role: 'assistant',
      agentName: reply.agentName,
      content: '',
      reasoningSteps: [],
      toolCalls: [],
      citations: [],
      clientMsgId: uid('c_'),
      correlationId: corr,
      parentId: mid,
      branchIndex: (sess.messages.filter((m) => m.parentId === mid).length || 0) + 1,
      status: 'streaming',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'regenerate', sid: state.activeId, mid, msg: placeholder });

    const ctrl = new AbortController();
    dispatch({ type: 'set_abort', ctrl });
    dispatch({ type: 'set_typing', typing: true });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);

    setTimeout(() => {
      startStream(state.activeId, replyId, { ...reply, id: replyId }, ctrl, corr);
    }, 200);
  }, [state.activeId, state.sessions, startStream]);

  const delMessage = useCallback((mid: string) => {
    if (state.activeId) dispatch({ type: 'del_msg', sid: state.activeId, mid });
  }, [state.activeId]);

  /** 兼容旧 API：单签通过（默认签 0 号位） */
  const approveSign = useCallback((mid: string) => {
    if (!state.activeId) return;
    const sess = state.sessions[state.activeId];
    if (!sess) return;
    const m = sess.messages.find((x) => x.id === mid);
    if (!m?.approvalRequest) return;
    const ar = m.approvalRequest;
    if (ar.signed >= ar.required) return;
    // 找第一个未签的人
    const idx = ar.signers.findIndex((s) => !s.signed);
    if (idx < 0) return;
    dispatch({ type: 'approve', sid: state.activeId, mid, signerIndex: idx });
  }, [state.activeId, state.sessions]);

  /** 新 API：指定签名人 index 批准 */
  const approve = useCallback((mid: string, signerIndex: number) => {
    if (!state.activeId) return;
    const session = state.sessions[state.activeId];
    const message = session?.messages.find((item) => item.id === mid);
    if (!message?.approvalRequest) return;
    dispatch({ type: 'approve', sid: state.activeId, mid, signerIndex });
    void (async () => {
      const api = getApiClient();
      await api.post(`/api/actions/${mid}/approve`, { signerIndex, conversationId: state.activeId });
      if (message.approvalRequest!.signed + 1 >= message.approvalRequest!.required) {
        const task = await api.post<{ id: string; code: string }>(`/api/conversations/${state.activeId}/tasks`, {
          title: `${session?.title ?? '数字员工会话'} · 受控执行`, priority: 'P1', assignee: '王昊', correlationId: message.correlationId,
        });
        await api.post(`/api/actions/${mid}/execute`, { taskId: task.id });
      }
    })().catch(() => undefined);
  }, [state.activeId]);

  /** 拒绝 */
  const reject = useCallback((mid: string, signerIndex: number, reason?: string) => {
    if (state.activeId) dispatch({ type: 'reject', sid: state.activeId, mid, signerIndex, reason });
  }, [state.activeId]);

  /** 反馈（点赞 / 点踩 + 标签 + 备注） */
  const setFeedback = useCallback((mid: string, payload: { kind: FeedbackKind; tags?: FeedbackTag[]; comment?: string; ratedBy?: string }) => {
    if (!state.activeId) return;
    dispatch({
      type: 'set_feedback',
      sid: state.activeId,
      mid,
      feedback: {
        kind: payload.kind,
        tags: payload.tags,
        comment: payload.comment,
        ratedBy: payload.ratedBy ?? 'u1',
        ratedAt: new Date().toISOString(),
      },
    });
  }, [state.activeId]);

  /** 重试某条失败消息（消费相同 clientMsgId 幂等） */
  const retryMessage = useCallback((mid: string) => {
    const sess = state.sessions[state.activeId];
    if (!sess) return;
    const m = sess.messages.find((x) => x.id === mid);
    if (!m || m.role !== 'assistant' || m.status !== 'failed') return;
    // 找到对应的 user 消息
    const idx = sess.messages.findIndex((x) => x.id === mid);
    if (idx <= 0) return;
    const userMsg = sess.messages[idx - 1];
    if (userMsg.role !== 'user') return;
    regenerate(mid);
  }, [state.activeId, state.sessions, regenerate]);

  /** 归档 / 取消归档 */
  const archiveSession = useCallback((id: string, archived: boolean) => {
    dispatch({ type: 'archive_session', id, archived });
  }, []);

  /** 分享（生成只读 token） */
  const shareSession = useCallback((id: string): string | null => {
    const sess = state.sessions[id];
    if (!sess) return null;
    if (sess.shareToken) return sess.shareToken;
    const token = uid('sh_');
    dispatch({ type: 'set_share_token', id, token });
    return token;
  }, [state.sessions]);

  const revokeShare = useCallback((id: string) => {
    dispatch({ type: 'set_share_token', id, token: null });
  }, []);

  /** 导出 */
  const exportSessionAs = useCallback((id: string, format: 'markdown' | 'json' | 'audit', options?: { includeCitations?: boolean; includeToolCalls?: boolean; includeReasoning?: boolean; includeAuditTrail?: boolean }): string | null => {
    const sess = state.sessions[id];
    if (!sess) return null;
    const opts = { includeAuditTrail: format === 'audit', ...(options ?? {}) };
    if (format === 'json') {
      return JSON.stringify({ session: sess }, null, 2);
    }
    return exportSession(sess, opts);
  }, [state.sessions]);

  /** 会话指标汇总 */
  const getSessionMetrics = useCallback((id: string) => {
    const sess = state.sessions[id];
    if (!sess) return null;
    const msgs = sess.messages.filter((m) => m.role === 'assistant');
    const succeeded = msgs.filter((m) => m.status === 'succeeded').length;
    const cancelled = msgs.filter((m) => m.status === 'cancelled').length;
    const failed = msgs.filter((m) => m.status === 'failed').length;
    const total = msgs.length || 1;
    const ttfts = msgs.map((m) => m.metrics?.ttftMs ?? 0).filter((v) => v > 0);
    const tokens = msgs.reduce((acc, m) => acc + (m.metrics?.completionTokens ?? 0), 0);
    const likes = msgs.filter((m) => m.feedback?.kind === 'like').length;
    const dislikes = msgs.filter((m) => m.feedback?.kind === 'dislike').length;
    return {
      totalMessages: sess.messages.length,
      totalTokens: tokens,
      avgTtftMs: ttfts.length ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) : 0,
      successRate: succeeded / total,
      cancelledCount: cancelled,
      failedCount: failed,
      feedbackLike: likes,
      feedbackDislike: dislikes,
    };
  }, [state.sessions]);

  /** 调试面板 */
  const setDebugOpen = useCallback((open: boolean) => dispatch({ type: 'set_debug', open }), []);
  const clearRequests = useCallback(() => dispatch({ type: 'clear_requests' }), []);

  return {
    state,
    activeSession: state.sessions[state.activeId],

    /* 兼容 */
    setDraft,
    newSession,
    delSession,
    switchSession,
    togglePin,
    toggleStar,
    send,
    sendMessage,
    stop,
    regenerate,
    delMessage,
    approveSign,

    /* 企业级 */
    approve,
    reject,
    setFeedback,
    retryMessage,
    archiveSession,
    shareSession,
    revokeShare,
    exportSessionAs,
    getSessionMetrics,
    setDebugOpen,
    clearRequests,
  };
}
