/**
 * 会话模块共享类型 — 企业级数字员工会话规范
 *
 * 在原有 ChatMessageEx / ChatSession 基础上扩展：
 *  - 消息生命周期状态机
 *  - Reasoning / Tool / RAG 完整审计字段
 *  - 双签审批（policy + 角色 + 时间戳）
 *  - Feedback 写回（RAG eval / 训练）
 *  - 安全与合规（moderation / 安全标签）
 *  - 可观测性（correlationId / requestId / metrics）
 *
 * 旧字段全部保留以兼容既有 UI（Copilot.tsx / DebugPanel.tsx）。
 */

/* ---------- 枚举 ---------- */

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';
export type MessageStatus =
  | 'queued'
  | 'in_flight'
  | 'streaming'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'moderated';

export type FeedbackKind = 'like' | 'dislike' | null;
export type FeedbackTag = 'factuality' | 'helpfulness' | 'harmful' | 'style' | 'outdated' | 'other';

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired';
export type SignerRole = 'operator' | 'auditor' | 'approver';

export type SessionStatus = 'active' | 'idle' | 'archived' | 'deleted';
export type SessionGroup = 'today' | 'yesterday' | 'week' | 'earlier' | 'archived';

export type ErrorCategory =
  | 'network'
  | 'auth'
  | 'timeout'
  | 'rate_limit'
  | 'content_filter'
  | 'tool_denied'
  | 'internal'
  | 'unknown';

/* ---------- 公共结构 ---------- */

export interface Citation {
  id: string;
  docId: string;
  chunkId?: string;
  source: string;
  page?: number | null;
  score: number;
  rerankScore?: number;
  span?: { start: number; end: number };
  text: string;
  evalLabel?: 'gold' | 'useful' | 'noisy' | 'harmful';
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'denied';
  durationMs?: number;
  retryCount?: number;
  /** 权限策略：auto / approval-required / denied */
  permission?: 'auto' | 'approval-required' | 'denied';
  /** gVisor 沙箱执行 ID，可审计 */
  sandboxId?: string;
  /** 调用 traceId，与审计事件关联 */
  traceId?: string;
  error?: string;
}

export interface ReasoningStep {
  id: string;
  kind: 'plan' | 'search' | 'analyze' | 'tool_call' | 'reflect' | 'finalize';
  title: string;
  detail?: string;
  /** 该步骤产生的引用 ID（RAG） */
  citationIds?: string[];
  /** 该步骤触发的工具调用 ID */
  toolCallIds?: string[];
  /** 该步骤开始/结束时间（ISO） */
  startedAt?: string;
  endedAt?: string;
}

export interface Signer {
  name: string;
  role: SignerRole;
  signed: boolean;
  signedAt?: string;
  /** 签名 hash（合规审计链） */
  signatureHash?: string;
}

export interface ApprovalRequest {
  action: string;
  /** 写操作对应的命令/资源标识 */
  resource?: string;
  /** 至少需要的签名人数 */
  required: number;
  /** 已完成签名人数（兼容旧字段名） */
  signed: number;
  signers: Signer[];
  decision: ApprovalDecision;
  /** 关联工单 / 变更单 */
  ticketId?: string;
  /** 触发原因（如等保 3 / 高危命令） */
  reason?: string;
  /** 该审批在审计日志中的 hash */
  policyHash?: string;
  decidedAt?: string;
}

export interface MessageFeedback {
  kind: FeedbackKind;
  tags?: FeedbackTag[];
  comment?: string;
  ratedBy?: string;
  ratedAt?: string;
}

export interface SafetyInfo {
  /** 内容过滤命中分类 */
  flaggedCategory?: 'pii' | 'secrets' | 'harmful' | 'compliance';
  /** 命中后采取的处理：redact / block / warn */
  action?: 'redact' | 'block' | 'warn' | 'allow';
  /** 脱敏后的原文（若有） */
  redactedText?: string;
}

/* ---------- 指标 ---------- */

export interface MessageMetrics {
  /** 首 token 时间（ms） */
  ttftMs?: number;
  /** 总耗时 */
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** 上下文缓存命中数 */
  cacheHits?: number;
  /** 模型 / 提供商 */
  model?: string;
  provider?: string;
}

/* ---------- 消息 ---------- */

export interface ChatMessageEx {
  /* 兼容字段 */
  id: string;
  role: MessageRole;
  content: string;
  agentId?: string;
  agentName?: string;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  codeBlock?: { lang: string; code: string };
  attachment?: { name: string; size: string; type: 'file' | 'image' };
  thinking?: string;
  approvalRequest?: ApprovalRequest;
  createdAt: string;

  /* 新增字段（企业级） */
  /** 客户端幂等 ID，用于重试去重 */
  clientMsgId?: string;
  /** 服务端消息 ID（流式完成后填回） */
  serverMsgId?: string;
  status?: MessageStatus;
  /** 失败原因 */
  error?: { category: ErrorCategory; message: string; retryable?: boolean };
  /** 链路追踪 ID */
  correlationId?: string;
  /** 父消息 ID（分支 / 重新生成） */
  parentId?: string;
  /** 分支序号（同一 parent 的多次重新生成） */
  branchIndex?: number;
  /** Reasoning 步骤 */
  reasoningSteps?: ReasoningStep[];
  /** Reasoning 折叠摘要（一段式兼容字段） */
  thinkingSummary?: string;
  /** 用户反馈 */
  feedback?: MessageFeedback;
  /** 内容安全 */
  safety?: SafetyInfo;
  /** 指标 */
  metrics?: MessageMetrics;
  /** 升级到人工 */
  escalatedTo?: { userId: string; userName: string; at: string };
  /** 关联任务 / 工单 */
  linkedTaskId?: string;
  /** 最近一次编辑时间 */
  editedAt?: string;
}

/* ---------- 会话 ---------- */

export interface ChatSessionMetrics {
  totalMessages: number;
  totalTokens: number;
  avgTtftMs: number;
  successRate: number;
  cancelledCount: number;
  feedbackLike: number;
  feedbackDislike: number;
}

export interface ChatSession {
  /* 兼容字段 */
  id: string;
  title: string;
  preview: string;
  agent: string;
  agentKey?: string;
  status: 'active' | 'done';
  group: SessionGroup;
  time: string;
  pinned?: boolean;
  starred?: boolean;
  unread?: number;
  messages: ChatMessageEx[];
  createdAt: number;

  /* 新增字段 */
  /** 企业级会话状态 */
  lifecycle?: SessionStatus;
  /** 工作区 ID（RBAC） */
  workspaceId?: string;
  /** 会话所有者 */
  ownerId?: string;
  ownerName?: string;
  /** 协作者列表 */
  collaborators?: { userId: string; userName: string; role: 'viewer' | 'editor' }[];
  /** 会话标签 */
  tags?: string[];
  /** 是否加密（端到端 / 仅存储加密） */
  encrypted?: boolean;
  /** 自动摘要（归档 / 长会话） */
  summary?: string;
  /** 归档时间 */
  archivedAt?: number;
  /** 过期时间（TTL） */
  expiresAt?: number;
  /** 整体指标 */
  metrics?: ChatSessionMetrics;
  /** 最近一次活跃（用于侧栏排序） */
  lastActiveAt?: number;
  /** 分享 token（仅查看） */
  shareToken?: string;
}

/* ---------- 输入 ---------- */

export interface SendMessageInput {
  text: string;
  /** 携带附件（图片 / 文件） */
  attachments?: { name: string; size: string; type: 'file' | 'image'; url?: string }[];
  /** 显式指定 Agent（默认沿用会话 agent） */
  agentId?: string;
  /** 显式指定模型 */
  model?: string;
  /** 携带的 @ 提及 */
  mentions?: { kind: 'agent' | 'skill' | 'doc' | 'member'; key: string }[];
}

/* ---------- 导出 ---------- */

export interface SessionExportPayload {
  format: 'markdown' | 'json' | 'audit';
  sessionId: string;
  includeCitations?: boolean;
  includeToolCalls?: boolean;
  includeReasoning?: boolean;
  includeAuditTrail?: boolean;
}