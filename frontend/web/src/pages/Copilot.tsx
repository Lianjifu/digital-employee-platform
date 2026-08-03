/**
 * P2 会话 · Copilot（企业级数字员工会话）
 * 核心能力:
 *  1. 消息状态机（queued / streaming / succeeded / failed / cancelled / expired / moderated）
 *  2. 多会话管理（增/删/置顶/星标/归档/分享/TTL）
 *  3. 流式响应（chunk 级 + AbortController + 超时）
 *  4. 双重审批（operator + auditor 角色 + 时间戳 + hash）
 *  5. Reasoning steps 折叠（plan / search / analyze / tool_call / reflect / finalize）
 *  6. RAG 引用（chunkId / rerankScore / evalLabel + Drawer）
 *  7. Tool call（permission / sandboxId / traceId + 失败重试）
 *  8. 反馈写回（like / dislike + 标签 + 备注 → RAG eval）
 *  9. 错误处理（分类 / inline 重试 / 超时）
 * 10. 导出（Markdown / JSON / 可打印审计记录）
 * 11. 分享（只读 token + RBAC 边界）
 * 12. 本地持久化（IndexedDB / localStorage，容量上限 + 字段裁剪）
 * 13. 可观测性（correlationId / TTFT / tokens / cache 命中）
 * 14. 侧栏会话搜索 / 分组 / 置顶 / 标签
 * 15. 输入草稿 / 历史（↑↓）+ 字符 / Token 用量
 * 16. 内容安全（脱敏 / 拦截 / 警告）
 * 17. 键盘可达 + aria-live 多档
 * 18. i18n（中英双语）
 * 19. 调试面板（Request / Response / Agent / Tools / RAG / Reasoning / Policy / Approval / Timeline / Audit）
 * 20. 升级人工（escalate to human）
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApiQuery } from '@/services/query';
import { Avatar, Badge, Button, Input, Row, CollapsedPanelHandle } from '@de/web-ui';
import {
  Bot, Search, ListChecks as ListChecksIcon, Wrench, Workflow as WorkflowIcon, FileText, ShieldCheck,
  AlertTriangle, Upload, MoreHorizontal, Download,
  Link2, CheckCircle2, BarChart3, Volume2, Zap, Clock, Server, BellOff,
  Star, Share2, Settings, X, Pin, ChevronDown, ChevronLeft,
  Sparkles, Database, Code, Cpu, Users, Loader2, AlertCircle, AtSign,
  Hash, Activity, Languages, BookOpenCheck, Brain, RotateCcw,
  Paperclip, Send, ChevronRight, ThumbsUp, ThumbsDown,
  Copy, Trash2, Square, Plus, Archive, ArchiveRestore, FileDown, Lock, Eye, EyeOff, ArrowUp,
  Archive as ArchiveIcon, MessageSquareWarning, ShieldAlert, Check, Hourglass, Plug, PlugZap, Pencil,
  BriefcaseBusiness,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import { DualSignModal } from '@/components/DualSignModal';
import { DigitalEmployeeAvatar } from '@/components/DigitalEmployeeAvatar';
import { compareDigitalEmployees, employeePrimaryLabel, employeeSecondaryLabel, isDepartmentHead } from '@/lib/digital-employees';
import { Modal } from '@/components/shared';
import type { DigitalEmployee } from '@de/web-types';
import { DebugPanel } from '@/components/DebugPanel';
import { useChat } from '@/hooks/useChat';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n';
import { Markdown } from '@/components/Markdown';
import { deriveWorkbenchSummary, type WorkbenchContextTab } from '@/features/copilot/workbench';
import { sessionHistoryPresentation } from '@/features/copilot/layout';
import { RoleReadonlyBanner } from '@/components/shared';
import { roleCanMutate, rolePageCopy } from '@/features/role-nav/role-nav';
import type {
  ChatMessageEx,
  ChatSession,
  FeedbackKind,
  FeedbackTag,
  Signer,
  MessageStatus,
  ErrorCategory,
} from '@/hooks/types';

interface SessionItem {
  id: string;
  workspaceId?: string;
  ownerId?: string;
  correlationId?: string;
  conversationId?: string;
  title?: string;
  preview?: string;
  agent?: string;
  digitalEmployeeId?: string;
  digitalEmployeeName?: string;
  status?: 'active' | 'done' | string;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string;
  pinned?: boolean;
  unread?: number;
}

function sessionGroup(lastMessageAt: string | undefined | null): ChatSession['group'] {
  const day = parseDate(lastMessageAt);
  if (!day) return 'earlier';
  const today = new Date();
  const delta = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()) / 86_400_000);
  return delta <= 0 ? 'today' : delta === 1 ? 'yesterday' : delta < 7 ? 'week' : 'earlier';
}

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShanghaiTime(value: string | number | Date) {
  const date = parseDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: SHANGHAI_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function formatShanghaiDate(value: string | number | Date) {
  const date = parseDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: SHANGHAI_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
}

function sessionTime(lastMessageAt: string | undefined | null) {
  const date = parseDate(lastMessageAt);
  if (!date) return '—';
  const today = new Date();
  const sameDay = formatShanghaiDate(date) === formatShanghaiDate(today);
  return sameDay ? formatShanghaiTime(date) : new Intl.DateTimeFormat('zh-CN', { timeZone: SHANGHAI_TIME_ZONE, month: 'numeric', day: 'numeric' }).format(date);
}

function toChatSession(session: SessionItem): ChatSession {
  const stamp = session.lastMessageAt || session.updatedAt || session.createdAt;
  const created = parseDate(session.createdAt)?.getTime() ?? parseDate(stamp)?.getTime() ?? Date.now();
  const updated = parseDate(session.updatedAt)?.getTime() ?? parseDate(stamp)?.getTime() ?? created;
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    ownerId: session.ownerId,
    conversationId: session.conversationId ?? session.id,
    title: session.title || '未命名会话',
    preview: session.preview || '暂无消息',
    agent: session.digitalEmployeeName ?? session.agent ?? '岗位专家',
    digitalEmployeeId: session.digitalEmployeeId,
    digitalEmployeeName: session.digitalEmployeeName ?? session.agent,
    status: session.status === 'done' ? 'done' : 'active',
    lifecycle: session.status === 'done' ? 'idle' : 'active',
    group: sessionGroup(stamp),
    time: sessionTime(stamp),
    pinned: session.pinned,
    messages: [],
    createdAt: created,
    lastActiveAt: updated,
    encrypted: true,
  };
}

function sessionInWorkspace(session: Pick<ChatSession, 'id' | 'workspaceId'> | SessionItem | undefined, workspaceId: string) {
  if (!session?.id) return false;
  return (session.workspaceId ?? 'w1') === workspaceId;
}

type ContextSelection = {
  open: boolean;
  scope: 'message' | 'session';
  tab: WorkbenchContextTab;
  messageId?: string;
  pinned: boolean;
};

interface AgentMeta {
  id: string; name: string; version: string; category: string;
  rating: number; ratingCount: number; lastActive: string;
  installCount: number; responseP95: number; totalTokens: number;
  sla: number; errorRate: number; knowledgeBases: number; tools: number; languages: string[];
  description?: string;
}

const SLASH_ICON: Record<string, any> = {
  Bot, Search, ListChecksIcon, Wrench, WorkflowIcon, FileText, Sparkles,
  Users, X, Download,
};

const SOURCE_COLOR: Record<string, string> = {
  Runbook: 'text-slate-700 bg-slate-100',
  CMDB: 'text-[var(--info)] bg-[var(--info-bg)]',
  CVE: 'text-[var(--danger)] bg-[var(--danger-bg)]',
  SIEM: 'text-[var(--warning)] bg-[var(--warning-bg)]',
};

const MENTIONS = [
  { key: '@expert', label: '专家', icon: BriefcaseBusiness, desc: '在岗数字员工 ...' },
  { key: '@skill', label: '技能', icon: Wrench, desc: 'redis-cli / 流程技能 ...' },
  { key: '@doc', label: '文档', icon: FileText, desc: 'Runbook / CMDB ...' },
  { key: '@member', label: '成员', icon: Users, desc: '王昊 / 李婷 ...' },
];

interface ComposerAttachment {
  name: string;
  size: string;
  type: 'file' | 'image';
}

const MODELS: { key: string; label: string; tier: string; tone: 'success' | 'brand' | 'warn' | 'neutral'; desc: string }[] = [
  { key: 'sonnet-4', label: 'Sonnet-4', tier: 'P0', tone: 'success', desc: '复杂推理 · 长上下文 · 默认' },
  { key: 'haiku-4.5', label: 'Haiku-4.5', tier: 'P2', tone: 'brand', desc: '低成本 · 高吞吐 · FAQ 场景' },
  { key: 'opus-4.8', label: 'Opus-4.8', tier: 'P0+', tone: 'success', desc: '深度分析 · 合规审计' },
  { key: 'gpt-5', label: 'GPT-5', tier: 'P1', tone: 'brand', desc: '通用 · 多模态' },
  { key: 'deepseek-r2', label: 'DeepSeek-R2', tier: 'P1', tone: 'brand', desc: '代码生成 · 技术问答' },
];

const availableTools: { key: string; name: string; desc: string; requiresApproval?: boolean }[] = [
  { key: 'redis-cli', name: 'redis-cli', desc: '查询 / 设置 Redis 配置' },
  { key: 'kubectl', name: 'kubectl', desc: 'K8s 资源管理（需双重审批）', requiresApproval: true },
  { key: 'prometheus', name: 'prometheus', desc: '指标查询 · PromQL' },
  { key: 'loki-query', name: 'loki-query', desc: '日志检索' },
  { key: 'siem', name: 'siem', desc: '威胁狩猎 · ATT&CK 时间线' },
  { key: 'jira', name: 'jira', desc: '工单 / 任务创建' },
  { key: 'cmdb', name: 'cmdb', desc: '资产查询' },
];

const FEEDBACK_TAGS: { key: FeedbackTag; label: string }[] = [
  { key: 'factuality', label: '事实性' },
  { key: 'helpfulness', label: '有用' },
  { key: 'style', label: '风格' },
  { key: 'outdated', label: '信息陈旧' },
  { key: 'harmful', label: '有害' },
  { key: 'other', label: '其他' },
];

const escapeHtml = (value: string) => value.replace(/[&<>'\"]/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
}[char] ?? char));

const STATUS_LABEL: Record<MessageStatus, string> = {
  queued: '排队中',
  in_flight: '请求中',
  streaming: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已停止',
  expired: '已过期',
  moderated: '已拦截',
};

const STATUS_TONE: Record<MessageStatus, string> = {
  queued: 'neutral',
  in_flight: 'info',
  streaming: 'info',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'neutral',
  expired: 'warn',
  moderated: 'error',
};

const ERROR_HINT: Record<ErrorCategory, string> = {
  network: '网络异常，请检查连通性',
  auth: '鉴权失败，请重新登录',
  timeout: '请求超时，可重试',
  rate_limit: '触发限流，请稍候重试',
  content_filter: '内容被安全策略拦截',
  tool_denied: '工具调用被权限策略拒绝',
  internal: '服务内部错误',
  unknown: '未知错误',
};

export default function Copilot() {
  const navigate = useNavigate();
  const { id: routeSessionId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const employeeIdFromQuery = searchParams.get('employeeId');
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'admin';
  const canMutate = roleCanMutate(currentUser?.role);
  const pageCopy = rolePageCopy('copilot', currentUser?.role);
  const { t } = useT();
  const [searchQ, setSearchQ] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [showSlash, setShowSlash] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [showApproval, setShowApproval] = useState<{ messageId: string; signerIndex: number } | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedArgs, setExpandedArgs] = useState<Record<string, boolean>>({});
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [expandedApproval, setExpandedApproval] = useState<Record<string, boolean>>({});
  const [focusedCitation, setFocusedCitation] = useState<any | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(() => typeof window !== 'undefined' && sessionHistoryPresentation(window.innerWidth) === 'pinned');
  // 右栏由消息上下文驱动：没有可追溯信息时保持隐藏，避免空面板占用工作区。
  const [contextSelection, setContextSelection] = useState<ContextSelection>({ open: false, scope: 'session', tab: 'overview', pinned: false });
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<'investigate' | 'execute'>('investigate');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffOwner, setHandoffOwner] = useState('李婷 · 值班负责人');
  const [handoffActive, setHandoffActive] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [hoverMsgId, setHoverMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [shareDialog, setShareDialog] = useState<{ open: boolean; token?: string }>({ open: false });
  const [rejectionReason, setRejectionReason] = useState<{ mid: string; idx: number; open: boolean }>({ mid: '', idx: -1, open: false });
  const [expertPickerOpen, setExpertPickerOpen] = useState(false);
  const [expertPickerMode, setExpertPickerMode] = useState<'new' | 'rebind'>('new');
  const [expertPickerQuery, setExpertPickerQuery] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [exportSubOpen, setExportSubOpen] = useState(false);
  const [rebindBlockedReason, setRebindBlockedReason] = useState<string | null>(null);
  const deepLinkHandled = useRef<string | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // Composer 增强状态
  const [modelOpen, setModelOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [currentModelKey, setCurrentModelKey] = useState('sonnet-4');
  const [enabledTools, setEnabledTools] = useState<string[]>(availableTools.map((t) => t.key));
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [sessionsPaneW, setSessionsPaneW] = useState(() => {
    if (typeof window === 'undefined') return 280;
    const saved = Number(window.localStorage.getItem('copilot-sessions-w'));
    return Number.isFinite(saved) && saved >= 200 && saved <= 420 ? saved : 280;
  });
  const [detailsPaneW, setDetailsPaneW] = useState(() => {
    if (typeof window === 'undefined') return 360;
    const saved = Number(window.localStorage.getItem('copilot-details-w'));
    return Number.isFinite(saved) && saved >= 280 && saved <= 520 ? saved : 360;
  });
  const [draggingSplit, setDraggingSplit] = useState<'sessions' | 'details' | null>(null);

  const persistSessionsW = useCallback((next: number) => {
    const clamped = Math.min(420, Math.max(200, Math.round(next)));
    setSessionsPaneW(clamped);
    window.localStorage.setItem('copilot-sessions-w', String(clamped));
    return clamped;
  }, []);

  const persistDetailsW = useCallback((next: number) => {
    const clamped = Math.min(520, Math.max(280, Math.round(next)));
    setDetailsPaneW(clamped);
    window.localStorage.setItem('copilot-details-w', String(clamped));
    return clamped;
  }, []);

  const onSessionsSplitPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const styles = getComputedStyle(shell);
    const pad = parseFloat(styles.paddingLeft) || 0;
    setDraggingSplit('sessions');
    event.currentTarget.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      persistSessionsW(moveEvent.clientX - rect.left - pad);
    };
    const onUp = (upEvent: PointerEvent) => {
      setDraggingSplit(null);
      try { event.currentTarget.releasePointerCapture(upEvent.pointerId); } catch { /* ignore */ }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [persistSessionsW]);

  const onDetailsSplitPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const styles = getComputedStyle(shell);
    const pad = parseFloat(styles.paddingRight) || 0;
    setDraggingSplit('details');
    event.currentTarget.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      persistDetailsW(rect.right - pad - moveEvent.clientX);
    };
    const onUp = (upEvent: PointerEvent) => {
      setDraggingSplit(null);
      try { event.currentTarget.releasePointerCapture(upEvent.pointerId); } catch { /* ignore */ }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [persistDetailsW]);

  const currentModel = MODELS.find((m) => m.key === currentModelKey) ?? MODELS[0];
  const enabledToolCount = enabledTools.length;

  const { data: employeesData } = useApiQuery<DigitalEmployee[]>(['digital-employees'], '/api/digital-employees');
  const employees = useMemo(() => employeesData ?? [], [employeesData]);
  const onDutyEmployees = useMemo(
    () => employees.filter((item) => item.lifecycle === 'active').sort(compareDigitalEmployees),
    [employees],
  );
  const { data: slashCmdsData } = useApiQuery<{ cmd: string; desc: string; icon: string; category: string }[]>(
    ['slash-cmds'], '/api/slash-commands'
  );
  const slashCmds = useMemo(() => slashCmdsData ?? [], [slashCmdsData]);
  const { data: sessionHistoryData, isLoading: sessionsLoading } = useApiQuery<SessionItem[]>(['sessions'], '/api/sessions');
  const sessionHistory = useMemo(() => sessionHistoryData ?? [], [sessionHistoryData]);
  const chat = useChat({ name: '岗位专家' });
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId ?? 'w1');
  const activeSession = chat.activeSession;
  const serverSession = useMemo(
    () => sessionHistory.find((item) => item.id === chat.state.activeId),
    [sessionHistory, chat.state.activeId],
  );
  // 仅拉取服务端已知会话；本地新建 s_* 不请求，避免 404 刷屏
  const conversationFetchId = serverSession
    ? (serverSession.conversationId || serverSession.id)
    : undefined;
  const { data: activeConversation, isError: conversationMissing } = useApiQuery<any>(
    ['conversation', conversationFetchId],
    `/api/conversations/${conversationFetchId ?? '__none__'}`,
    undefined,
    { enabled: Boolean(conversationFetchId), retry: false, staleTime: 30_000 },
  );

  const activeEmployeeId = activeSession?.digitalEmployeeId ?? employeeIdFromQuery ?? undefined;
  const activeEmployee = employees.find((item) => item.id === activeEmployeeId) ?? null;
  const expertName = activeEmployee ? employeePrimaryLabel(activeEmployee) : (activeSession?.digitalEmployeeName ?? activeSession?.agent ?? '岗位专家');
  const expertMeta = activeEmployee ? employeeSecondaryLabel(activeEmployee) : null;
  const expertDescription = activeEmployee?.description ?? '选择在岗数字员工后开始专家协作。';
  const agentMeta = {
    id: activeEmployee?.capabilities.agentId ?? 'runtime',
    name: expertName,
    category: activeEmployee?.department ?? '专家团队',
    version: activeEmployee?.version ?? '—',
    rating: 0,
    ratingCount: 0,
    lastActive: '—',
    installCount: 0,
    responseP95: activeEmployee?.runtime.p95Ms ?? 0,
    totalTokens: 0,
    sla: activeEmployee ? Number((activeEmployee.runtime.successRate * 100).toFixed(1)) : 0,
    errorRate: activeEmployee ? Math.max(0, 1 - activeEmployee.runtime.successRate) : 0,
    knowledgeBases: activeEmployee?.capabilities.knowledge.length ?? 0,
    tools: (activeEmployee?.capabilities.tools.length ?? 0) + (activeEmployee?.capabilities.skills.length ?? 0),
    languages: ['zh-CN'],
    description: expertDescription,
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionToggleRef = useRef<HTMLButtonElement>(null);
  const detailsToggleRef = useRef<HTMLButtonElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const historyIdx = useRef(0);

  // 服务器历史是当前工作区的权威列表；仅合并缺失项，避免覆盖本地正在编辑或刚创建的会话。
  useEffect(() => {
    chat.importSessions(sessionHistory.map(toChatSession));
    if (!sessionsLoading) setHistoryReady(true);
  }, [chat.importSessions, sessionHistory, sessionsLoading]);

  useEffect(() => {
    if (conversationMissing || !activeConversation || !chat.state.activeId || !conversationFetchId) return;
    if (activeConversation.id !== conversationFetchId && activeConversation.id !== chat.state.activeId) return;
    const summary = sessionHistory.find((item) => item.id === chat.state.activeId)
      ?? sessionHistory.find((item) => item.conversationId === activeConversation.id);
    if (!summary) return;
    chat.syncSession({ ...toChatSession(summary), messages: (activeConversation.messages ?? []) as ChatMessageEx[] });
  }, [activeConversation, conversationMissing, chat.state.activeId, chat.syncSession, conversationFetchId, sessionHistory]);

  // 深链：URL → state（仅当路由会话在当前工作区有效时）
  useEffect(() => {
    if (!historyReady || !routeSessionId) return;
    if (routeSessionId === chat.state.activeId) return;
    const local = chat.state.sessions[routeSessionId];
    const fromServer = sessionHistory.find((item) => item.id === routeSessionId);
    if (!local && !fromServer) return;
    if (!sessionInWorkspace(local ?? fromServer, currentWorkspaceId)) return;
    chat.switchSession(routeSessionId);
  }, [historyReady, routeSessionId, chat.state.activeId, chat.switchSession, sessionHistory, currentWorkspaceId, chat.state.sessions]);

  // URL 同步：state → URL。若路由已指向另一有效会话，交给深链 effect，禁止互相抢写。
  useEffect(() => {
    if (!historyReady || !chat.state.activeId) return;
    if (routeSessionId === chat.state.activeId) return;
    if (routeSessionId) {
      const routeLocal = chat.state.sessions[routeSessionId];
      const routeServer = sessionHistory.find((item) => item.id === routeSessionId);
      if ((routeLocal || routeServer) && sessionInWorkspace(routeLocal ?? routeServer, currentWorkspaceId)) {
        return;
      }
    }
    navigate(`/copilot/${chat.state.activeId}`, { replace: true });
  }, [historyReady, chat.state.activeId, routeSessionId, navigate, chat.state.sessions, sessionHistory, currentWorkspaceId]);

  // 深链：?employeeId= 选中在岗专家并发起/绑定会话
  useEffect(() => {
    if (!historyReady || !employeeIdFromQuery) return;
    if (deepLinkHandled.current === employeeIdFromQuery) return;
    const employee = employees.find((item) => item.id === employeeIdFromQuery);
    if (!employee) return;
    deepLinkHandled.current = employeeIdFromQuery;
    if (employee.lifecycle !== 'active') {
      setExpertPickerOpen(true);
      return;
    }
    const existing = Object.values(chat.state.sessions).find((session) => session.digitalEmployeeId === employee.id && session.status === 'active' && sessionInWorkspace(session, currentWorkspaceId));
    if (existing) {
      chat.switchSession(existing.id);
    } else if (canMutate) {
      const id = chat.newSession({
        digitalEmployeeId: employee.id,
        digitalEmployeeName: employeePrimaryLabel(employee),
        agentKey: employee.capabilities.agentId,
      });
      if (id) navigate(`/copilot/${id}`, { replace: true });
    }
    setSearchParams({}, { replace: true });
  }, [historyReady, employeeIdFromQuery, employees, chat.state.sessions, chat.switchSession, chat.newSession, navigate, setSearchParams, canMutate, currentWorkspaceId]);

  const startSessionWithExpert = (employee: DigitalEmployee) => {
    if (!canMutate) return;
    if (employee.lifecycle !== 'active') return;
    const active = chat.activeSession;
    if (expertPickerMode === 'rebind' && active) {
      const pending = (active.messages ?? []).filter((message) => message.approvalRequest?.decision === 'pending').length;
      if (pending > 0) {
        setRebindBlockedReason(`当前会话有 ${pending} 项待审批，请先完成或拒绝后再改绑专家。`);
        return;
      }
      if (isClosed || handoffActive) {
        setRebindBlockedReason(isClosed ? '会话已结案，无法改绑专家。' : '人工交接中，无法改绑专家。');
        return;
      }
      chat.syncSession({
        ...active,
        digitalEmployeeId: employee.id,
        digitalEmployeeName: employeePrimaryLabel(employee),
        agent: employeePrimaryLabel(employee),
        agentKey: employee.capabilities.agentId,
      });
      setExpertPickerOpen(false);
      setExpertPickerQuery('');
      setRebindBlockedReason(null);
      return;
    }
    const id = chat.newSession({
      digitalEmployeeId: employee.id,
      digitalEmployeeName: employeePrimaryLabel(employee),
      agentKey: employee.capabilities.agentId,
    });
    setExpertPickerOpen(false);
    setExpertPickerQuery('');
    setRebindBlockedReason(null);
    if (id) navigate(`/copilot/${id}`);
  };

  const openNewSessionPicker = () => {
    if (!canMutate) return;
    setExpertPickerMode('new');
    setExpertPickerOpen(true);
    setExpertPickerQuery('');
    setRebindBlockedReason(null);
  };

  const openRebindExpertPicker = () => {
    if (!canMutate) return;
    setExpertPickerMode('rebind');
    setExpertPickerOpen(true);
    setExpertPickerQuery('');
    setRebindBlockedReason(null);
  };

  const filteredExperts = useMemo(() => {
    const q = expertPickerQuery.trim().toLowerCase();
    return onDutyEmployees.filter((item) => !q || [item.name, item.role, item.department].join(' ').toLowerCase().includes(q));
  }, [onDutyEmployees, expertPickerQuery]);

  // todo 8: 上下方向键切换输入历史
  const onTextareaKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      historyIdx.current = 0;
      return;
    }
    if (e.key === 'Escape' && chat.state.typing) {
      chat.stop();
      return;
    }
    const ta = e.currentTarget;
    if (e.key === 'ArrowUp' && ta.selectionStart === 0 && ta.value !== '' && chat.state.inputHistory.length > 0) {
      e.preventDefault();
      const hist = chat.state.inputHistory;
      const next = Math.min(hist.length, historyIdx.current + 1);
      if (next > 0 && next <= hist.length) {
        historyIdx.current = next;
        chat.setDraft(hist[next - 1]);
      }
    } else if (e.key === 'ArrowDown' && ta.selectionEnd === ta.value.length && historyIdx.current > 0) {
      e.preventDefault();
      const hist = chat.state.inputHistory;
      historyIdx.current -= 1;
      chat.setDraft(historyIdx.current === 0 ? '' : hist[historyIdx.current - 1]);
    }
  };

  // todo 10: 分享会话
  const shareSession = () => {
    if (!currentSession) return;
    if (currentSession.shareToken) {
      setShareDialog({ open: true, token: currentSession.shareToken });
      return;
    }
    const token = chat.shareSession(currentSession.id);
    setShareDialog({ open: true, token: token ?? undefined });
  };

  // 复制分享链接
  const copyShareUrl = async () => {
    if (!shareDialog.token) return;
    const url = `${window.location.origin}/copilot/share/${shareDialog.token}`;
    try { await navigator.clipboard.writeText(url); } catch {}
  };

  // 导出菜单
  const handleExport = (format: 'markdown' | 'json') => {
    if (!currentSession) return;
    const data = chat.exportSessionAs(currentSession.id, format);
    if (!data) return;
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSession.title || 'session'}-${currentSession.id}.${format === 'json' ? 'json' : 'md'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printAuditRecord = () => {
    if (!currentSession) return;
    const auditData = chat.exportSessionAs(currentSession.id, 'audit');
    if (!auditData) return;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;

    const title = escapeHtml(currentSession.title || '数字员工会话审计记录');
    const exportedAt = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date());
    printWindow.document.write(`<!doctype html>
      <html lang="zh-CN"><head><meta charset="utf-8" /><title>${title} · 审计记录</title>
      <style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body { color: #0f172a; font: 12px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
        h1 { margin: 0; font-size: 20px; } h2 { margin: 24px 0 8px; font-size: 14px; }
        .meta { margin-top: 8px; color: #64748b; } .rule { height: 3px; margin: 16px 0; background: #4f46e5; }
        pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; color: #334155; font: 10px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
        .footer { margin-top: 16px; color: #64748b; font-size: 10px; }
      </style></head><body>
        <h1>${title}</h1><div class="meta">会话 ID：${escapeHtml(currentSession.id)} · 导出时间：${exportedAt}</div>
        <div class="rule"></div><h2>审计明细</h2><pre>${escapeHtml(auditData)}</pre>
        <div class="footer">由数字员工平台生成。请在系统打印对话框中选择“另存为 PDF”。</div>
      </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // 归档 / 取消归档
  const toggleArchive = () => {
    if (!currentSession) return;
    const archived = currentSession.lifecycle === 'archived';
    chat.archiveSession(currentSession.id, !archived);
  };

  // 分组的 slash 命令
  const slashGrouped = useMemo(() => {
    const g: Record<string, any[]> = { agent: [], kb: [], task: [], tool: [], collab: [] };
    slashCmds.forEach((c) => { g[c.category]?.push(c); });
    return g;
  }, [slashCmds]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  }, [chat.activeSession?.messages.length, chat.state.typing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showSlash || showMention) {
        setShowSlash(false);
        setShowMention(false);
        return;
      }
      if (sessionsOpen) {
        setSessionsOpen(false);
        sessionToggleRef.current?.focus();
      } else if (contextSelection.open) {
        setContextSelection((selection) => ({ ...selection, open: false }));
        detailsToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextSelection.open, sessionsOpen, showMention, showSlash]);

  // 平板与桌面固定保留会话历史；只有窄屏允许收起为抽屉，避免主内容被遮挡。
  useEffect(() => {
    const keepHistoryPinned = () => {
      if (sessionHistoryPresentation(window.innerWidth) === 'pinned') setSessionsOpen(true);
    };
    keepHistoryPinned();
    window.addEventListener('resize', keepHistoryPinned);
    return () => window.removeEventListener('resize', keepHistoryPinned);
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [chat.state.activeId]);

  // 过滤会话
  const filteredSessions = useMemo(() => {
    const list = Object.values(chat.state.sessions).filter((session) => sessionInWorkspace(session, currentWorkspaceId));
    const q = searchQ.trim().toLowerCase();
    return list.filter((s) => !q || s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q));
  }, [chat.state.sessions, currentWorkspaceId, searchQ]);

  const grouped = useMemo(() => ({
    pinned: filteredSessions.filter((s) => s.pinned),
    today: filteredSessions.filter((s) => !s.pinned && s.group === 'today'),
    yesterday: filteredSessions.filter((s) => !s.pinned && s.group === 'yesterday'),
    week: filteredSessions.filter((s) => !s.pinned && s.group === 'week'),
    earlier: filteredSessions.filter((s) => !s.pinned && s.group === 'earlier'),
  }), [filteredSessions]);

  const charCount = chat.state.draftInput.length;
  const MAX_CHARS = 4000;
  const tokenEstimate = Math.round(charCount * 0.6);
  const tokenPercent = (tokenEstimate / (MAX_CHARS * 0.6)) * 100;

  const onInputChange = (v: string) => {
    chat.setDraft(v);
    if (v === '/') { setShowSlash(true); setShowMention(false); return; }
    if (v.endsWith('@') || / @\w*$/.test(v)) { setShowMention(true); setShowSlash(false); return; }
    setShowSlash(v.startsWith('/') && v.length > 1 && !v.includes(' '));
    setShowMention(v.endsWith('@') || / @\w*$/.test(v));
  };

  const handleSend = () => {
    if (!canMutate) return;
    if (!chat.state.draftInput.trim() || chat.state.typing || isClosed || handoffActive) return;
    if (!activeSession?.digitalEmployeeId && !activeEmployee) {
      openNewSessionPicker();
      return;
    }
    // 研判模式：仅允许检索与分析指令；写操作类 slash 需先切到受控执行
    if (sessionMode === 'investigate') {
      const draft = chat.state.draftInput.trim();
      const writeHint = /\/(exec|kubectl|write|apply|config)|CONFIG SET|kubectl\s+(apply|delete|exec)/i.test(draft);
      if (writeHint) {
        setSessionMode('execute');
      }
    }
    if (editingMessageId) { chat.replaceAndSend(editingMessageId, chat.state.draftInput); setEditingMessageId(null); } else chat.send(chat.state.draftInput);
    setShowSlash(false);
    setShowMention(false);
  };

  const insertSlash = (c: string) => {
    chat.setDraft(c + ' ');
    setShowSlash(false);
    inputRef.current?.focus();
  };

  const insertMention = (m: typeof MENTIONS[number]) => {
    const cur = chat.state.draftInput;
    chat.setDraft(cur.replace(/ @?\w*$/, ` ${m.key} `));
    setShowMention(false);
    inputRef.current?.focus();
  };

  // 附件：拖拽 / 文件选择 / 粘贴
  const formatBytes = (b: number): string => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };
  const addAttachments = (files: File[]) => {
    if (!files.length) {
      fileInputRef.current?.click();
      return;
    }
    const next: ComposerAttachment[] = files.map((f) => ({
      name: f.name,
      size: formatBytes(f.size),
      type: f.type.startsWith('image/') ? 'image' : 'file',
    }));
    setAttachments((prev) => [...prev, ...next]);
  };
  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  const onPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      addAttachments(files);
    }
  };

  const copyMessage = async (m: ChatMessageEx) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const switchSession = (id: string) => {
    chat.switchSession(id);
    navigate(`/copilot/${id}`, { replace: true });
    setSessionsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openCitation = (citation: any, messageId?: string) => {
    openContext('evidence', messageId);
    setFocusedCitation(citation);
  };

  const currentSession = chat.activeSession;
  const sessionUsage = useMemo(() => {
    const messages = currentSession?.messages ?? [];
    const tokens = messages.reduce((sum, message) => sum + (message.metrics?.promptTokens ?? 0) + (message.metrics?.completionTokens ?? 0), 0);
    const priced = tokens > 0 ? Number(((tokens / 1000) * (riskLevel === 'high' ? 0.08 : 0.045)).toFixed(2)) : null;
    return { tokens, priced };
  }, [currentSession, riskLevel]);
  useEffect(() => {
    const visible = Object.values(chat.state.sessions).filter((session) => sessionInWorkspace(session, currentWorkspaceId));
    if (!historyReady || sessionsLoading) return;
    if (chat.state.activeId && visible.some((session) => session.id === chat.state.activeId)) return;
    // 优先采纳当前路由中的有效会话，避免与深链互相覆盖
    if (routeSessionId && visible.some((session) => session.id === routeSessionId)) {
      chat.switchSession(routeSessionId);
      return;
    }
    if (visible[0]?.id) {
      chat.switchSession(visible[0].id);
      if (routeSessionId !== visible[0].id) navigate(`/copilot/${visible[0].id}`, { replace: true });
      return;
    }
    if (canMutate && onDutyEmployees[0]) {
      const id = chat.newSession({
        digitalEmployeeId: onDutyEmployees[0].id,
        digitalEmployeeName: employeePrimaryLabel(onDutyEmployees[0]),
        agentKey: onDutyEmployees[0].capabilities.agentId,
      });
      if (id) navigate(`/copilot/${id}`, { replace: true });
    }
  }, [chat.state.activeId, chat.state.sessions, currentWorkspaceId, historyReady, sessionsLoading, onDutyEmployees, chat.switchSession, chat.newSession, canMutate, navigate, routeSessionId]);
  const sessionSignals = useMemo(() => {
    const messages = currentSession?.messages ?? [];
    const executions = messages.reduce((total, message) => total + (message.toolCalls?.length ?? 0), 0);
    const pendingApprovals = messages.filter((message) => message.approvalRequest?.decision === 'pending').length;
    const evidence = messages.reduce((total, message) => total + (message.citations?.length ?? 0), 0);
    return { executions, pendingApprovals, evidence };
  }, [currentSession]);
  const workbench = useMemo(() => deriveWorkbenchSummary(currentSession), [currentSession]);
  const detailsOpen = contextSelection.open;
  const contextTab = contextSelection.tab;
  const selectedContextMessage = useMemo(
    () => contextSelection.scope === 'message' && contextSelection.messageId
      ? currentSession?.messages.find((message) => message.id === contextSelection.messageId)
      : undefined,
    [contextSelection.messageId, contextSelection.scope, currentSession],
  );
  const contextMessages = useMemo(
    () => selectedContextMessage ? [selectedContextMessage] : currentSession?.messages ?? [],
    [currentSession, selectedContextMessage],
  );
  const contextSummary = useMemo(
    () => currentSession
      ? deriveWorkbenchSummary({ title: currentSession.title, messages: contextMessages })
      : workbench,
    [contextMessages, currentSession, workbench],
  );
  const hasSessionContext = workbench.evidence + workbench.linkedTasks + workbench.pendingApprovals + workbench.executions > 0;
  const canOpenExpertContext = Boolean(currentSession && (activeEmployee || currentSession.digitalEmployeeId || hasSessionContext));
  const hasSelectedContext = !!selectedContextMessage && (
    (selectedContextMessage.citations?.length ?? 0) > 0
    || (selectedContextMessage.toolCalls?.length ?? 0) > 0
    || !!selectedContextMessage.approvalRequest
    || !!selectedContextMessage.linkedTaskId
  );
  const openContext = (tab: WorkbenchContextTab, messageId?: string) => {
    const target = messageId ? currentSession?.messages.find((message) => message.id === messageId) : undefined;
    if (messageId && !target) return;
    if (messageId && !(
      (target?.citations?.length ?? 0) > 0
      || (target?.toolCalls?.length ?? 0) > 0
      || !!target?.approvalRequest
      || !!target?.linkedTaskId
    )) return;
    if (tab !== 'evidence' || messageId !== contextSelection.messageId) setFocusedCitation(null);
    setContextSelection((selection) => ({
      open: true,
      scope: messageId ? 'message' : 'session',
      tab,
      messageId,
      pinned: selection.pinned,
    }));
    setSessionsOpen(false);
  };
  const closeContext = () => {
    setFocusedCitation(null);
    setContextSelection((selection) => ({ ...selection, open: false }));
  };
  const setContextTab = (tab: WorkbenchContextTab) => {
    if (tab !== 'evidence') setFocusedCitation(null);
    setContextSelection((selection) => ({ ...selection, open: true, tab }));
  };
  const jumpToMessage = (messageId?: string) => {
    if (!messageId) return;
    messageRefs.current[messageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHoverMsgId(messageId);
    window.setTimeout(() => setHoverMsgId((current) => current === messageId ? null : current), 1200);
  };
  const visibleContextTabs: { tab: WorkbenchContextTab; label: string; count?: number }[] = [
    { tab: 'overview', label: '概览' },
    ...(contextSummary.evidence > 0 ? [{ tab: 'evidence' as const, label: '证据', count: contextSummary.evidence }] : []),
    ...(contextSummary.linkedTasks > 0 ? [{ tab: 'tasks' as const, label: '任务', count: contextSummary.linkedTasks }] : []),
    ...(contextSummary.pendingApprovals > 0 ? [{ tab: 'approvals' as const, label: '审批', count: contextSummary.pendingApprovals }] : []),
    ...(contextSummary.executions > 0 ? [{ tab: 'audit' as const, label: '审计', count: contextSummary.executions }] : []),
    ...(contextTab === 'admin' ? [{ tab: 'admin' as const, label: '运行控制' }] : []),
  ];

  // P2：按会话恢复最近一次上下文，仍以当前会话实际存在的关联信息为准。
  useEffect(() => {
    if (!currentSession?.id || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(`copilot-context:${currentSession.id}`);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<ContextSelection>;
      if (!saved.open || (saved.scope !== 'message' && saved.scope !== 'session')) return;
      const savedMessage = saved.messageId ? currentSession.messages.find((message) => message.id === saved.messageId) : undefined;
      const hasSavedContext = saved.scope === 'session'
        ? hasSessionContext
        : !!savedMessage && ((savedMessage.citations?.length ?? 0) > 0 || (savedMessage.toolCalls?.length ?? 0) > 0 || !!savedMessage.approvalRequest || !!savedMessage.linkedTaskId);
      if (!hasSavedContext) return;
      const validTabs: WorkbenchContextTab[] = ['overview', 'evidence', 'tasks', 'approvals', 'audit', 'admin'];
      setContextSelection({
        open: true,
        scope: saved.scope,
        messageId: savedMessage?.id,
        tab: validTabs.includes(saved.tab as WorkbenchContextTab) ? saved.tab as WorkbenchContextTab : 'overview',
        pinned: !!saved.pinned,
      });
    } catch {
      window.localStorage.removeItem(`copilot-context:${currentSession.id}`);
    }
  }, [currentSession?.id]);

  useEffect(() => {
    if (!currentSession?.id || typeof window === 'undefined') return;
    if (!contextSelection.open) {
      window.localStorage.removeItem(`copilot-context:${currentSession.id}`);
      return;
    }
    window.localStorage.setItem(`copilot-context:${currentSession.id}`, JSON.stringify(contextSelection));
  }, [contextSelection, currentSession?.id]);

  useEffect(() => {
    if (!contextSelection.open) return;
    if (contextSelection.scope === 'session' && canOpenExpertContext) return;
    if (contextSelection.scope === 'message' && hasSelectedContext) return;
    setContextSelection((selection) => (
      selection.open ? { ...selection, open: false, messageId: undefined } : selection
    ));
  }, [contextSelection.open, contextSelection.scope, hasSelectedContext, canOpenExpertContext]);

  // P2：Cmd/Ctrl + Shift + E 快速打开或关闭当前会话上下文。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'e' || !canOpenExpertContext) return;
      event.preventDefault();
      if (contextSelection.open) {
        closeContext();
      } else {
        openContext('overview');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextSelection.open, canOpenExpertContext]);

  // 切回研判时卸下需审批的写工具，避免「模式显示研判、工具仍可写」
  useEffect(() => {
    if (sessionMode !== 'investigate') return;
    setEnabledTools((prev) => prev.filter((key) => !availableTools.find((tool) => tool.key === key)?.requiresApproval));
  }, [sessionMode]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
        setExportSubOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, [moreMenuOpen]);

  return (
    <div
      ref={shellRef}
      className={cn('copilot-shell relative h-full min-h-0 min-w-0 bg-[var(--bg-elevated)]', draggingSplit && 'is-resizing')}
      data-sessions-open={sessionsOpen ? 'true' : 'false'}
      data-details-open={detailsOpen ? 'true' : 'false'}
      style={{
        ['--copilot-sessions-w' as string]: `${sessionsPaneW}px`,
        ['--copilot-details-w' as string]: `${detailsPaneW}px`,
      }}
    >
      {(sessionsOpen || detailsOpen) && (
        <button
          type="button"
          className="copilot-scrim"
          aria-label="关闭会话抽屉"
          onClick={() => { setSessionsOpen(false); closeContext(); }}
        />
      )}
      {/* ============ 左侧 session-list ============ */}
      <aside
        id="copilot-sessions"
        className="copilot-sessions"
        aria-label="会话列表"
        data-open={sessionsOpen ? 'true' : 'false'}
      >
        <div className="copilot-sessions__head">
          <div className="copilot-sessions__title-row">
            <h2>{pageCopy.title}</h2>
            <span className="copilot-sessions__count" title="当前工作区可见会话数">{filteredSessions.length}</span>
          </div>
          {canMutate ? (
            <Button size="sm" className="copilot-sessions__new" onClick={openNewSessionPicker}>
              <Plus className="h-3.5 w-3.5" />新会话
            </Button>
          ) : (
            <p className="px-1 text-[10px] leading-4 text-[var(--text-muted)]">{pageCopy.subtitle}</p>
          )}
          <div className="copilot-sessions__search">
            <Search className="h-3.5 w-3.5" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="搜索会话..."
              aria-label="搜索会话"
            />
          </div>
        </div>

        <div className="copilot-sessions__body">
          {(['pinned', 'today', 'yesterday', 'week', 'earlier'] as const).map((g) =>
            grouped[g].length === 0 ? null : (
              <section key={g} className="copilot-sessions__group">
                <div className="copilot-sessions__group-head">
                  {g === 'pinned' && <Pin className="h-3 w-3" />}
                  <span>{g === 'today' ? '今天' : g === 'yesterday' ? '昨天' : g === 'week' ? '本周' : g === 'earlier' ? '更早' : '置顶'}</span>
                  <span className="copilot-sessions__group-count">{grouped[g].length}</span>
                </div>
                <div className="copilot-sessions__list">
                  {grouped[g].map((s) => {
                    const active = s.id === chat.state.activeId;
                    return (
                      <div key={s.id} className="copilot-session-item__wrap group">
                        <button
                          type="button"
                          onClick={() => switchSession(s.id)}
                          onDoubleClick={() => chat.togglePin(s.id)}
                          className={cn('session-item copilot-session-item', active && 'session-item--active')}
                          aria-current={active ? 'page' : undefined}
                          aria-label={`${s.title}，${s.status === 'active' ? '进行中' : '已完成'}${s.unread ? `，${s.unread} 条未读` : ''}`}
                        >
                          <div className="session-item__top">
                            <div className="session-item__title">
                              {s.pinned && <Pin className="h-3 w-3 shrink-0 text-[var(--brand)]" />}
                              <span className="truncate">{s.title}</span>
                            </div>
                            {s.unread ? (
                              <span className="session-item__unread">{s.unread}</span>
                            ) : (
                              <time className="session-item__time">{s.time}</time>
                            )}
                          </div>
                          <div className="session-item__preview">{s.preview || '暂无消息'}</div>
                          <div className="session-item__meta">
                            <span className="session-item__agent">{s.agent}</span>
                            <Badge tone={s.status === 'active' ? 'brand' : 'success'} className="text-[10px]">
                              {s.status === 'active' ? '进行中' : '已完成'}
                            </Badge>
                          </div>
                        </button>
                        {canMutate && (
                          <button
                            type="button"
                            onClick={() => chat.delSession(s.id)}
                            className="copilot-session-item__delete"
                            aria-label={`删除会话：${s.title}`}
                            title="删除"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )
          )}
          {filteredSessions.length === 0 && (
            <div className="copilot-sessions__empty">
              <Bot className="h-8 w-8" />
              <strong>{canMutate ? '还没有会话' : '暂无协作记录'}</strong>
              <span>{canMutate ? '点击「新会话」选择在岗专家开始协作' : '工作区会话证据将在此只读展示'}</span>
            </div>
          )}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整会话列表宽度"
        aria-valuemin={200}
        aria-valuemax={420}
        aria-valuenow={sessionsPaneW}
        tabIndex={0}
        className={cn('copilot-split copilot-split--sessions', draggingSplit === 'sessions' && 'is-dragging')}
        onPointerDown={onSessionsSplitPointerDown}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            persistSessionsW(sessionsPaneW - 12);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            persistSessionsW(sessionsPaneW + 12);
          }
        }}
      >
        <span className="copilot-split__grip" aria-hidden="true" />
      </div>

      {/* ============ 中间对话 ============ */}
      <section className="copilot-conversation flex min-w-0 min-h-0 flex-1 flex-col bg-[var(--bg)] overflow-hidden">
        <div className="px-4 pt-2 sm:px-5"><RoleReadonlyBanner className="mb-1 flex items-start gap-2 rounded-lg bg-[var(--info-bg)] px-3 py-2 text-[11px] leading-5 text-[var(--info)]" /></div>
        {/* 当前事件工作头：对话页首先呈现处置对象和下一待办。 */}
        <header className="app-glass copilot-header px-4 py-3 sm:px-5">
          {(() => {
            const decision = handoffActive
              ? { label: '人工交接', tone: 'warn' as const, text: `写操作已暂停，由 ${handoffOwner} 继续处置。` }
              : workbench.pendingApprovals
                ? { label: '需审批', tone: 'warn' as const, text: `${workbench.pendingApprovals} 项写操作待双重审批 · 打开消息中的审批卡签署` }
                : sessionMode === 'execute' && riskLevel === 'high'
                  ? { label: '需审批', tone: 'warn' as const, text: '高风险受控执行 · 写操作需双重审批与回滚点' }
                  : sessionMode === 'execute'
                    ? { label: '脱敏放行', tone: 'info' as const, text: '受控执行中 · 写操作进入审批与审计' }
                    : { label: '允许研判', tone: 'success' as const, text: '可检索分析 · 变更请切换受控执行' };
            const showCost = sessionUsage.tokens > 0;
            return (
              <>
          <div className="copilot-work-header">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', workbench.tone === 'warning' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : 'bg-[var(--brand-light)] text-[var(--brand)]')}>
                {workbench.tone === 'warning' ? <AlertTriangle className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="copilot-work-title truncate font-semibold">{workbench.title}</span>
                  <Badge tone={workbench.tone === 'warning' ? 'warn' : 'brand'} className="shrink-0 text-[10px]">{workbench.pendingApprovals ? '待处置' : sessionMode === 'execute' ? '受控执行' : '研判中'}</Badge>
                  {riskLevel !== 'low' && <Badge tone={riskLevel === 'high' ? 'error' : 'warn'} className="shrink-0 text-[10px]">{riskLevel === 'high' ? '高风险' : '中风险'}</Badge>}
                </div>
                {(workbench.nextAction || handoffActive) && (
                  <div className="copilot-header__meta copilot-work-next mt-0.5 flex items-center gap-1.5 text-[var(--text-muted)]">
                    {workbench.nextAction && <span className="truncate">下一步：{workbench.nextAction}</span>}
                    {handoffActive && <span className="hidden sm:inline">{workbench.nextAction ? '· ' : ''}已由 {handoffOwner} 接管</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="copilot-header__actions shrink-0">
              <div className="copilot-mode-toggle hidden sm:inline-flex" role="group" aria-label="协作模式">
                <button type="button" disabled={isClosed || handoffActive} onClick={() => setSessionMode('investigate')} className={cn('copilot-mode-toggle__btn', sessionMode === 'investigate' && 'is-active')}>研判</button>
                <button type="button" disabled={isClosed || handoffActive} onClick={() => setSessionMode('execute')} className={cn('copilot-mode-toggle__btn', sessionMode === 'execute' && 'is-active is-execute')}>受控执行</button>
              </div>
              <button type="button" onClick={openRebindExpertPicker} className="copilot-toolbar-btn copilot-toolbar-btn--expert hidden sm:inline-flex" title="查看或改绑数字员工">
                <span className="copilot-toolbar-btn__icon relative !bg-transparent !p-0" style={{ boxShadow: 'none' }}>
                  <DigitalEmployeeAvatar
                    employee={activeEmployee ?? { id: activeEmployeeId ?? 'expert', name: expertName }}
                    size={22}
                  />
                  {activeEmployee?.lifecycle === 'active' && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--success)] ring-1 ring-white" />}
                </span>
                <span className="copilot-toolbar-btn__label">
                  <span className="copilot-toolbar-btn__name">{expertName}</span>
                  {expertMeta && <span className="copilot-toolbar-btn__role">{expertMeta}</span>}
                </span>
              </button>
              <button ref={sessionToggleRef} type="button" onClick={() => { setSessionsOpen((open) => !open); closeContext(); }} className="copilot-mobile-toggle copilot-toolbar-btn !px-0 !w-8 justify-center" aria-label="打开会话列表" aria-expanded={sessionsOpen} aria-controls="copilot-sessions"><ListChecksIcon className="h-4 w-4" /></button>
              {canOpenExpertContext && (
                <Button ref={detailsToggleRef} variant="secondary" size="sm" className="copilot-header-action" onClick={() => openContext('overview')}>
                  <FileText className="h-3.5 w-3.5" />专家上下文
                </Button>
              )}
              <div className="relative" ref={moreMenuRef}>
                <Button
                  variant="secondary"
                  size="sm"
                  className="copilot-header-action"
                  aria-haspopup="menu"
                  aria-expanded={moreMenuOpen}
                  onClick={() => { setMoreMenuOpen((open) => !open); setExportSubOpen(false); }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />更多
                </Button>
                {moreMenuOpen && (
                  <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] py-1 shadow-lg">
                    <button type="button" role="menuitem" disabled={isClosed} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] disabled:opacity-40" onClick={() => { setMoreMenuOpen(false); setCloseoutOpen(true); }}>
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />结束会话
                    </button>
                    <button type="button" role="menuitem" disabled={isClosed || handoffActive} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] disabled:opacity-40" onClick={() => { setMoreMenuOpen(false); setHandoffOpen(true); }}>
                      <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />人工交接
                    </button>
                    <div className="my-1 border-t border-[var(--border)]" />
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)]" onClick={() => setExportSubOpen((open) => !open)}>
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--text-muted)]" />导出证据
                      <ChevronRight className="ml-auto h-3 w-3 text-[var(--text-muted)]" />
                    </button>
                    {exportSubOpen && (
                      <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)] py-1">
                        <button type="button" role="menuitem" className="flex w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]" onClick={() => { setMoreMenuOpen(false); printAuditRecord(); }}>证据包 · 打印 / PDF</button>
                        <button type="button" role="menuitem" className="flex w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]" onClick={() => { setMoreMenuOpen(false); handleExport('markdown'); }}>Markdown</button>
                        <button type="button" role="menuitem" className="flex w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]" onClick={() => { setMoreMenuOpen(false); handleExport('json'); }}>JSON</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

            <div className="copilot-header__decision" role="status" aria-label="策略裁决">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Badge tone={decision.tone} className="shrink-0">{decision.label}</Badge>
                <span className="copilot-header__decision-text">{decision.text}</span>
              </div>
              {showCost ? (
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]" title={`计入 ${expertName}`}>
                  {sessionUsage.priced != null ? `¥${sessionUsage.priced}` : '计量中'} · {sessionUsage.tokens} tok · {expertName}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">与 {expertName} 协作</span>
              )}
            </div>
              </>
            );
          })()}
        </header>

        {/* 消息流 */}
        <div ref={scrollRef} className="copilot-message-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden" aria-label="消息列表">
          <div className="copilot-message-stream">
            {currentSession && currentSession.messages.length > 0 ? (
              <>
                <div className="copilot-conversation-intro flex flex-col items-center gap-2 pt-6 pb-2" aria-label="会话安全与审计状态">
                  <div className="flex w-full items-center gap-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[var(--border)]" />
                    <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums">{formatShanghaiDate(currentSession.createdAt)}</span>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[var(--border)]" />
                  </div>
                  <div className="copilot-conversation-intro__security inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                    <ShieldCheck className="h-3 w-3 text-[var(--success)]" />
                    会话受保护 · 审计已启用
                  </div>
                </div>

                <div className="copilot-message-list px-4 sm:px-8 md:px-12 py-4">
                  {currentSession.messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      m={m}
                      expandedThinking={expandedThinking}
                      setExpandedThinking={setExpandedThinking}
                      expandedArgs={expandedArgs}
                      setExpandedArgs={setExpandedArgs}
                      expandedReasoning={expandedReasoning}
                      setExpandedReasoning={setExpandedReasoning}
                      expandedApproval={expandedApproval}
                      setExpandedApproval={setExpandedApproval}
                      onApprove={(mid) => setShowApproval({ messageId: mid, signerIndex: 0 })}
                      onCitation={(citation) => openCitation(citation, m.id)}
                      onRetry={(name) => chat.regenerate(m.id)}
                      onCopy={copyMessage}
                      onEdit={(message) => { setEditingMessageId(message.id); chat.setDraft(message.content); inputRef.current?.focus(); }}
                      onRegenerate={(mid) => chat.regenerate(mid)}
                      onDelete={(mid) => chat.delMessage(mid)}
                      onRetryMessage={(mid) => chat.retryMessage(mid)}
                      onFeedback={(mid, kind) => {
                        if (kind === null) {
                          chat.setFeedback(mid, { kind: null });
                        } else {
                          setFeedbackOpen(mid);
                        }
                      }}
                      onApproveSigner={(mid, signerIndex) => setShowApproval({ messageId: mid, signerIndex })}
                      onRequestReject={(mid, idx) => setRejectionReason({ mid, idx, open: true })}
                      currentUser={currentUser}
                      hoverMsgId={hoverMsgId}
                      setHoverMsgId={setHoverMsgId}
                      copiedId={copiedId}
                      agentName={expertName}
                      expertRole={expertMeta ?? undefined}
                      expert={activeEmployee ?? (activeEmployeeId ? { id: activeEmployeeId, name: expertName } : { id: 'expert', name: expertName })}
                      onOpenContext={openContext}
                      selectedContextMessageId={contextSelection.scope === 'message' ? contextSelection.messageId : undefined}
                      messageRef={(element) => { messageRefs.current[m.id] = element; }}
                    />
                  ))}
                </div>

                {chat.state.typing && (
                  <div className="copilot-streaming-status flex gap-3 px-4 sm:px-8 md:px-12 pb-4" aria-live="polite" aria-label="数字员工正在思考">
                    <DigitalEmployeeAvatar
                      employee={activeEmployee ?? { id: activeEmployeeId ?? 'expert', name: expertName }}
                      size={32}
                    />
                    <div className="inline-flex items-center gap-1.5 pt-2 text-[12px] text-[var(--text-muted)]">
                      {[0, 1, 2].map((i) => (
                        <span key={i} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                      <span className="ml-1.5">{expertName} 正在思考</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="copilot-empty-state h-full grid place-items-center px-6">
                <div className="w-full max-w-2xl">
                  <div className="text-center mb-8">
                    {activeEmployee ? (
                      <div className="mx-auto mb-4 inline-flex"><DigitalEmployeeAvatar employee={activeEmployee} size={56} rounded="lg" /></div>
                    ) : (
                      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bg-elevated)] text-[var(--text-secondary)]" style={{ boxShadow: 'var(--saas-ring), var(--saas-elev-2)' }}>
                        <BriefcaseBusiness className="h-7 w-7" />
                      </div>
                    )}
                    {activeEmployee ? (
                      <>
                        <h2 className="text-xl font-semibold text-[var(--text)]">{expertName}</h2>
                        {expertMeta && <p className="mt-1 text-xs text-[var(--text-secondary)]">{expertMeta}</p>}
                        <p className="text-sm text-[var(--text-muted)] mt-1">{expertDescription}</p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-xl font-semibold text-[var(--text)]">{canMutate ? '选择在岗专家' : '协作记录核查'}</h2>
                        <p className="text-sm text-[var(--text-muted)] mt-1">{canMutate ? '专家协作面向已上岗的数字员工；请先选择协作对象再开始会话。' : '请从左侧选择已有会话核查证据与审批轨迹。'}</p>
                        {canMutate && (
                          <Button size="sm" className="mt-4" onClick={openNewSessionPicker}>
                            <BriefcaseBusiness className="h-3.5 w-3.5" />选择在岗专家
                          </Button>
                        )}
                        {canMutate && onDutyEmployees.length === 0 && (
                          <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                            当前工作区暂无在岗员工，请先到 <Link to="/agents" className="text-[var(--brand)]">数字员工</Link> 完成上岗。
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {canMutate && activeEmployee && (
                    <>
                      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        <Sparkles className="h-3 w-3" />建议试试
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { Icon: Zap, title: 'Redis 集群 OOM', desc: 'prod-redis-01 触发 maxmemory 限制' },
                          { Icon: Server, title: 'K8s 节点扩容', desc: '为 cn-east-1 增加 2 个 worker' },
                          { Icon: ShieldCheck, title: 'CVE 周报', desc: '本周漏洞与影响资产' },
                          { Icon: BellOff, title: '告警降噪', desc: '合并重复告警规则' },
                        ].map((p) => (
                          <button
                            key={p.title}
                            onClick={() => { chat.setDraft(`${p.title} - ${p.desc}`); inputRef.current?.focus(); }}
                            className="copilot-suggestion-card group flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-left transition-colors hover:border-[var(--brand)] hover:bg-[var(--bg-elevated)]"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)] group-hover:bg-[var(--brand)] group-hover:text-white transition-colors">
                              <p.Icon className="h-4.5 w-4.5" />
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[var(--text)]">{p.title}</div>
                              <div className="text-[11px] text-[var(--text-muted)] truncate">{p.desc}</div>
                            </div>
                            <ArrowUp className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 ml-auto self-center" />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============ 输入区（企业级 Composer） ============ */}
        {canMutate ? (
        <div
          className="copilot-composer relative border-t border-[var(--border)] px-3 pb-3 pt-2.5 bg-gradient-to-b from-[var(--bg)] to-[var(--bg-elevated)]/40"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files ?? []);
            if (files.length) addAttachments(files);
          }}
        >
          {/* 拖拽高亮 */}
          {isDragging && (
            <div className="absolute inset-2 z-20 rounded-xl border-2 border-dashed border-[var(--brand)] bg-[var(--brand-light)]/40 backdrop-blur-sm grid place-items-center pointer-events-none">
              <div className="text-xs text-[var(--brand)] font-semibold flex items-center gap-1.5">
                <Upload className="h-4 w-4" />松手以上传到当前会话
              </div>
            </div>
          )}

          {showSlash && (
            <div className="copilot-popover copilot-popover--slash absolute bottom-full left-3 right-3 mb-2 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl p-2 z-10">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />Slash 命令
                <span className="text-[10px] font-mono normal-case text-[var(--text-muted)] ml-auto">{slashCmds.length} 个</span>
              </div>
              {Object.entries(slashGrouped).map(([cat, cmds]) =>
                cmds.length > 0 ? (
                  <div key={cat} className="mb-1.5">
                    <div className="px-3 py-1 text-[9px] font-semibold uppercase text-[var(--text-muted)]">{labelOfCat(cat)}</div>
                    {cmds.map((c) => {
                      const Icon = SLASH_ICON[c.icon] ?? Sparkles;
                      return (
                        <button
                          key={c.cmd}
                          onClick={() => insertSlash(c.cmd)}
                          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
                        >
                          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)]">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex-1">
                            <div className="text-xs font-mono font-semibold">{c.cmd}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{c.desc}</div>
                          </div>
                          <Badge tone="neutral" className="text-[9px]">{c.category}</Badge>
                        </button>
                      );
                    })}
                  </div>
                ) : null,
              )}
            </div>
          )}

          {showMention && (
            <div className="copilot-popover copilot-popover--mention absolute bottom-full left-3 mb-2 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl p-1 z-10">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <AtSign className="h-3 w-3" />@ 提及对象
              </div>
              {MENTIONS.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    onClick={() => insertMention(m)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--info-bg)] text-[var(--info)]">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex-1">
                      <div className="text-xs font-mono font-semibold">{m.key}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{m.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 运行配置：不再重复挂专家条，专家身份已在工作头芯片 */}
          <div className="mb-1.5 flex items-center justify-end gap-1.5" aria-label="会话运行配置">
              <button
                type="button"
                onClick={() => { if (isAdmin) { setToolsOpen(false); setModelOpen((v) => !v); } }}
                aria-haspopup={isAdmin ? 'menu' : undefined}
                aria-expanded={isAdmin ? modelOpen : undefined}
                className="copilot-composer__model-pill flex items-center gap-1.5 rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors"
                title={isAdmin ? '调整本次会话的模型与工具链' : '由工作区策略分配的受控运行路由'}
              >
                <Settings className="h-3 w-3 text-[var(--text-muted)]" />
                <span className="font-medium">{isAdmin ? '运行配置' : '受控运行路由'}</span>
                <span className="font-mono text-[var(--text-muted)]">{isAdmin ? `${currentModel.label} · ${enabledToolCount} 工具` : '由工作区策略分配'}</span>
                {isAdmin && <ChevronDown className="h-3 w-3 opacity-60" />}
              </button>
          </div>

          {/* 运行配置 popover */}
          {isAdmin && modelOpen && (
            <div role="menu" className="absolute right-3 bottom-full mb-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl p-1 z-30">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">运行配置 · 模型</div>
              {MODELS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => { setCurrentModelKey(m.key); setModelOpen(false); }}
                  role="menuitemradio"
                  aria-checked={currentModelKey === m.key}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left hover:bg-[var(--bg-hover)]',
                    currentModelKey === m.key && 'bg-[var(--bg-hover)]',
                  )}
                >
                  <Cpu className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {m.label}
                      <Badge tone={m.tone} className="text-[9px]">{m.tier}</Badge>
                      {currentModelKey === m.key && <Check className="h-3 w-3 text-[var(--text)] ml-auto" />}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">{m.desc}</div>
                  </div>
                </button>
              ))}
              <div className="mt-1 border-t border-[var(--border)] p-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => {
                    setModelOpen(false);
                    setToolsOpen(true);
                  }}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  管理工具链（{enabledToolCount}/{availableTools.length}）
                </Button>
              </div>
            </div>
          )}

          {/* 工具链 popover */}
          {toolsOpen && (
            <div role="menu" className="absolute right-3 bottom-full mb-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl p-1 z-30">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Wrench className="h-3 w-3" />本会话工具链
                <button className="ml-auto text-[10px] text-[var(--text-secondary)] hover:underline" onClick={() => setEnabledTools(availableTools.map((t) => t.key))}>全选</button>
              </div>
              {availableTools.map((t) => {
                const on = enabledTools.includes(t.key);
                const writeLocked = Boolean(t.requiresApproval && sessionMode === 'investigate');
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      if (writeLocked) {
                        setSessionMode('execute');
                        setToolsOpen(false);
                        return;
                      }
                      setEnabledTools((prev) => on ? prev.filter((k) => k !== t.key) : [...prev, t.key]);
                    }}
                    role="menuitemcheckbox"
                    aria-checked={on && !writeLocked}
                    className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-[var(--bg-hover)]', on && !writeLocked && 'bg-[var(--bg-hover)]', writeLocked && 'opacity-60')}
                  >
                    <span className={cn('grid h-5 w-5 place-items-center rounded border text-[10px]', on && !writeLocked ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'border-[var(--border)] text-[var(--text-muted)]')}>
                      {on && !writeLocked && <Check className="h-3 w-3" />}
                    </span>
                    <Plug className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-semibold">{t.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{writeLocked ? '研判模式不可用 · 点击切换到受控执行' : t.desc}</div>
                    </div>
                    {t.requiresApproval && <Badge tone="warn" className="text-[9px]">需双重审批</Badge>}
                  </button>
                );
              })}
            </div>
          )}

          {/* 附件 chip 区 */}
          {attachments.length > 0 && (
            <div className="copilot-composer__attachments flex flex-wrap gap-1.5 mb-2">
              {attachments.map((a, i) => (
                <div key={i} className="copilot-composer__attach-chip flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] pl-1.5 pr-1 py-1 text-[11px]">
                  {a.type === 'image' ? <FileText className="h-3.5 w-3.5 text-[var(--info)]" /> : <Paperclip className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                  <span className="font-mono text-[var(--text)] max-w-[160px] truncate">{a.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{a.size}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="grid h-4 w-4 place-items-center rounded text-[var(--text-muted)] hover:text-[var(--danger)]"
                    aria-label={`移除附件 ${a.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addAttachments([])}
                className="copilot-composer__attach-chip flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                <Plus className="h-3 w-3" />添加
              </button>
            </div>
          )}

          {/* 编辑器卡片 */}
          <div className={cn(
            'copilot-composer__editor group relative rounded-xl bg-[var(--surface-1)] transition-all',
            isDragging && 'is-dragging',
          )}>
            {/* 自动 @ token 渲染预览（输入含 @ 时显示） */}
            {/[@#]\w+/.test(chat.state.draftInput) && (
              <div className="copilot-composer__chips flex flex-wrap items-center gap-1 px-3 pt-2 text-[10px]">
                {Array.from(new Set(chat.state.draftInput.match(/[@#]\w+/g) ?? [])).map((tok, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-elevated)] text-[var(--text-secondary)] px-1.5 py-0.5 font-mono">
                    <AtSign className="h-2.5 w-2.5" />{tok}
                  </span>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={chat.state.draftInput}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onTextareaKey}
              onPaste={onPaste}
              aria-label="输入会话消息"
              placeholder={sessionMode === 'execute'
                ? `向 ${expertName} 下达受控执行指令 · / 命令 · @ 资源`
                : `向 ${expertName} 发起研判 · / 命令 · @ 资源`}
              maxLength={MAX_CHARS}
              rows={2}
              className="copilot-composer__textarea block w-full resize-none bg-transparent px-3.5 py-2.5 text-sm leading-relaxed outline-none placeholder:text-[var(--text-muted)]/80"
            />

            {/* 操作栏：左工具 / 右字数+发送 */}
            <div className="copilot-composer__footer flex items-center justify-between">
              <div className="copilot-composer__tools flex items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addAttachments(Array.from(e.target.files ?? []))}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="copilot-composer__tool grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  title="附件（支持拖拽 / 粘贴）"
                  aria-label="添加附件"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => chat.setDraft(chat.state.draftInput + ' @')}
                  className="copilot-composer__tool grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  title="@ 提及"
                  aria-label="@ 提及"
                >
                  <AtSign className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => chat.setDraft(chat.state.draftInput + ' /')}
                  className="copilot-composer__tool grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  title="/ 命令"
                  aria-label="slash 命令"
                >
                  <Hash className="h-3.5 w-3.5" />
                </button>
                {chat.state.typing ? (
                  <button
                    type="button"
                    onClick={chat.stop}
                    className="copilot-composer__stop ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-[10px]"
                    title="停止生成（Esc）"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" />停止
                  </button>
                ) : (
                  <span className="copilot-composer__status" title="等待输入">
                    <Hourglass className="h-2.5 w-2.5" />就绪
                  </span>
                )}
              </div>

              <div className="copilot-composer__send flex items-center">
                <span className={cn('copilot-composer__usage hidden sm:flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]', tokenPercent > 90 && 'copilot-composer__usage--danger', tokenPercent > 60 && tokenPercent <= 90 && 'copilot-composer__usage--warning')}>
                  <span className="font-mono tabular-nums">{charCount}/{MAX_CHARS}</span>
                  <div className="copilot-composer__usage-bar" aria-hidden="true"><div style={{ width: `${Math.min(100, tokenPercent)}%` }} /></div>
                </span>
                <Button
                  onClick={handleSend}
                  disabled={!chat.state.draftInput.trim() || chat.state.typing || isClosed || handoffActive}
                  size="sm"
                  className="copilot-composer__send-btn"
                  aria-label={isClosed ? '会话已结案，发送已禁用' : handoffActive ? '人工交接中，发送已禁用' : chat.state.typing ? '生成中，发送已禁用' : '发送消息（Enter）'}
                >
                  <Send className="h-3.5 w-3.5" />发送
                </Button>
              </div>
            </div>
          </div>

          {/* 提示条：协作状态 + 快捷键 + 草稿用量 */}
          <div className="mt-1.5 px-1 flex items-center justify-between gap-3 text-[10px] text-[var(--text-muted)]">
            <span className="truncate min-w-0">
              {isClosed ? '会话已结案 · 仅可查看和导出' : handoffActive ? `交接中 · ${handoffOwner}` : `与 ${expertName} 协作中`}
            </span>
            <span className="hidden sm:inline-flex items-center gap-2 shrink-0 font-mono">
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-1)] text-[9px] font-sans">Enter</kbd>
                <span>发送</span>
              </span>
              <span className="text-[var(--border-strong)]">·</span>
              <span>{attachments.length} 附件</span>
              <span className="text-[var(--border-strong)]">·</span>
              <span>草稿约 {tokenEstimate} tok</span>
            </span>
          </div>
        </div>
        ) : (
          <div className="border-t border-[var(--border)] px-4 py-3 text-[11px] leading-5 text-[var(--text-muted)] bg-[var(--bg-elevated)]/40">
            审计只读 · 可核查会话证据；若审批策略要求审计签署位，仍可在消息审批卡中完成签署。
          </div>
        )}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整专家上下文宽度"
        aria-valuemin={280}
        aria-valuemax={520}
        aria-valuenow={detailsPaneW}
        tabIndex={detailsOpen ? 0 : -1}
        className={cn('copilot-split copilot-split--details', draggingSplit === 'details' && 'is-dragging')}
        onPointerDown={detailsOpen ? onDetailsSplitPointerDown : undefined}
        onKeyDown={(event) => {
          if (!detailsOpen) return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            persistDetailsW(detailsPaneW + 12);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            persistDetailsW(detailsPaneW - 12);
          }
        }}
      >
        <span className="copilot-split__grip" aria-hidden="true" />
      </div>

      {/* ============ 右侧详情 ============ */}
      <aside
        id="copilot-agent-details"
        className="copilot-agent-details"
        aria-label="会话上下文"
        data-open={detailsOpen ? 'true' : 'false'}
        aria-expanded={detailsOpen}
      >
        {detailsOpen ? (
        <div className="copilot-agent-details__inner flex min-h-0 flex-1 flex-col">
          <header className="copilot-agent-details__header shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="copilot-agent-details__avatar shrink-0">
                  <DigitalEmployeeAvatar
                    employee={activeEmployee ?? { id: activeEmployeeId ?? 'expert', name: expertName }}
                    size={32}
                    rounded="lg"
                  />
                </span>
                <div className="min-w-0">
                  <div className="copilot-agent-details__eyebrow">{contextSelection.scope === 'message' ? '消息上下文' : '专家上下文'}</div>
                  <div className="copilot-agent-details__title truncate">{expertName}</div>
                  {expertMeta && <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{expertMeta}</div>}
                  <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                    {contextSelection.scope === 'message' && selectedContextMessage
                      ? `来源消息 · ${formatShanghaiTime(selectedContextMessage.createdAt)}`
                      : `会话 · ${workbench.title}`}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {contextSelection.scope === 'message' && <button type="button" onClick={() => jumpToMessage(contextSelection.messageId)} title="回到来源消息" aria-label="回到来源消息" className="copilot-details-header-action grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-1)] text-[var(--text-muted)]"><ArrowUp className="h-4 w-4" /></button>}
                <button type="button" onClick={() => setContextSelection((selection) => ({ ...selection, pinned: !selection.pinned }))} title={contextSelection.pinned ? '取消固定上下文' : '固定当前上下文'} aria-label={contextSelection.pinned ? '取消固定上下文' : '固定当前上下文'} aria-pressed={contextSelection.pinned} className={cn('copilot-details-header-action grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-1)] text-[var(--text-muted)]', contextSelection.pinned && 'is-pinned')}><Pin className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={closeContext} title="关闭会话上下文" aria-label="关闭会话上下文" className="copilot-details-header-action grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-1)] text-[var(--text-muted)] hover:!bg-[var(--danger-bg)] hover:!text-[var(--danger)]"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="copilot-agent-details__status-row">
              <span className={cn('copilot-agent-details__status-dot', handoffActive || sessionMode === 'execute' ? 'copilot-agent-details__status-dot--warning' : 'copilot-agent-details__status-dot--active')} aria-hidden="true" />
              <Badge tone={handoffActive || sessionMode === 'execute' ? 'warn' : 'brand'} className="text-[10px]">{handoffActive ? '人工接管中' : sessionMode === 'execute' ? '受控执行中' : '研判进行中'}</Badge>
              <span className={cn('copilot-agent-details__risk', riskLevel === 'high' ? 'copilot-agent-details__risk--high' : riskLevel === 'medium' ? 'copilot-agent-details__risk--medium' : 'copilot-agent-details__risk--low')}>
                风险 {riskLevel === 'high' ? '高' : riskLevel === 'medium' ? '中' : '低'}
              </span>
              {handoffActive && <span className="copilot-agent-details__handoff">由 {handoffOwner} 处理后续变更</span>}
            </div>
            <p className="mt-2 px-1 text-[10px] leading-4 text-[var(--text-muted)]">
              会话上下文即运行记忆入口；管理员可在「记忆中心」做策略治理，审计员可核查记忆策略。
            </p>
          </header>

          <nav className="copilot-agent-details__tabs shrink-0" aria-label="会话上下文分区">
            {visibleContextTabs.map(({ tab, label, count }) => (
              <button key={tab} type="button" onClick={() => setContextTab(tab)} aria-current={contextTab === tab ? 'page' : undefined} className={cn('copilot-agent-details__tab', contextTab === tab && 'is-active')}>
                <span>{label}</span>
                {count !== undefined && <span className="copilot-agent-details__tab-count">{count}</span>}
              </button>
            ))}
          </nav>

          <div className="copilot-agent-details__body min-h-0 flex-1">
            {contextTab === 'admin' && (
              <section className="copilot-agent-details__section copilot-agent-details__section--admin space-y-3">
                <div className="copilot-agent-details__section-heading flex items-center gap-1.5"><Settings className="h-3.5 w-3.5 text-[var(--brand)]" />运行控制 <Badge tone="brand" className="ml-auto text-[9px]">管理员</Badge></div>
                <Row label="当前模型" value={<span className="font-mono text-[11px]">{currentModel.label} · {currentModel.tier}</span>} />
                <Row label="启用工具" value={<span className="font-mono text-[11px]">{enabledToolCount}/{availableTools.length}</span>} />
                <label className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-muted)]">执行风险</span><select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as 'low' | 'medium' | 'high')} className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px]"><option value="low">低 · 仅可逆操作</option><option value="medium">中 · 需审批</option><option value="high">高 · 双重审批与回滚</option></select></label>
                <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => setDebugOpen(true)}><Activity className="h-3.5 w-3.5" />查看调试与链路指标</Button>
              </section>
            )}
            {contextTab !== 'overview' && contextTab !== 'admin' && (
              <ContextDrawerPanel tab={contextTab} messages={contextMessages} onCitation={openCitation} focusedCitation={focusedCitation} />
            )}
            {contextTab === 'overview' && (
              <div className="copilot-context-stack">
                <ContextOverview summary={contextSummary} sessionMode={sessionMode} riskLevel={riskLevel} handoffActive={handoffActive} onOpenTab={setContextTab} />

                <section className="copilot-agent-details__section">
                  <div className="copilot-details-card">
                    <div className="copilot-details-card__heading">
                      <BriefcaseBusiness className="h-3.5 w-3.5 text-[var(--brand)]" />
                      岗位专家
                    </div>
                    {activeEmployee ? (
                      <div className="copilot-expert-facts">
                        <div><span>岗位</span><strong className="truncate">{employeePrimaryLabel(activeEmployee)}</strong></div>
                        <div><span>花名</span><strong className="truncate">{activeEmployee.name}</strong></div>
                        <div><span>部门</span><Badge tone="info">{activeEmployee.department}</Badge></div>
                        <div><span>版本</span><strong className="font-mono">v{activeEmployee.version}</strong></div>
                        <div className="copilot-expert-facts__wide">
                          <span>已装配能力</span>
                          <div className="copilot-expert-caps">
                            {[...activeEmployee.capabilities.skills, ...activeEmployee.capabilities.workflows, ...activeEmployee.capabilities.tools].slice(0, 6).map((item) => (
                              <span key={item}>{item}</span>
                            ))}
                            {![...activeEmployee.capabilities.skills, ...activeEmployee.capabilities.workflows, ...activeEmployee.capabilities.tools].length && (
                              <em>尚未装配</em>
                            )}
                          </div>
                        </div>
                        <Link to="/agents" className="copilot-text-link">查看岗位配置</Link>
                      </div>
                    ) : (
                      <div className="copilot-expert-empty">
                        <p>当前会话尚未绑定在岗数字员工。</p>
                        <Button size="sm" onClick={openNewSessionPicker}>选择专家</Button>
                      </div>
                    )}
                  </div>
                </section>

                <section className="copilot-agent-details__section">
                  <div className="copilot-details-card">
                    <div className="copilot-details-card__heading">
                      <Database className="h-3.5 w-3.5 text-[var(--brand)]" />
                      RAG 检索
                      <Badge tone="success" className="ml-auto text-[10px]">实时</Badge>
                    </div>
                    <div className="copilot-rag-grid">
                      <div><span>召回耗时</span><strong className="font-mono">320ms</strong></div>
                      <div><span>Top-K</span><strong className="font-mono">8</strong></div>
                      <div><span>命中率</span><strong className="text-[var(--success)]">92%</strong></div>
                      <div><span>重排</span><strong className="truncate font-mono text-[11px]">bge-reranker</strong></div>
                    </div>
                    <div className="copilot-token-meter">
                      <div className="copilot-token-meter__label">
                        <span>上下文 Token</span>
                        <strong className="font-mono">1.2k / 200k</strong>
                      </div>
                      <div className="copilot-token-meter__track"><span style={{ width: '0.6%' }} /></div>
                    </div>
                  </div>
                </section>

                <section className="copilot-agent-details__section">
                  <div className="copilot-details-card__heading mb-2.5">
                    <Link2 className="h-3.5 w-3.5 text-[var(--brand)]" />
                    最近引用
                  </div>
                  <div className="copilot-details-list">
                    {[
                      { src: 'Redis Runbook v3.2', source: 'Runbook', page: 12, score: 0.92 },
                      { src: 'CMDB PRD-CACHE-019', source: 'CMDB', page: null, score: 0.78 },
                      { src: 'INC-019 处理记录', source: 'Runbook', page: 5, score: 0.71 },
                    ].map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => openCitation(c)}
                        className="copilot-evidence-item block w-full text-left p-2.5"
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className={cn('nav-pill text-[9px]', SOURCE_COLOR[c.source])}>{c.source}</span>
                          <span className="flex-1 truncate text-[11px] font-semibold">{c.src}</span>
                          {c.page && <span className="text-[10px] text-[var(--text-muted)]">p.{c.page}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="shrink-0 text-[var(--text-muted)]">置信度</span>
                          <div className={cn('copilot-confidence-bar', c.score >= 0.85 ? 'is-high' : c.score >= 0.7 ? 'is-mid' : 'is-low')}>
                            <span style={{ width: `${c.score * 100}%` }} />
                          </div>
                          <span className={cn('font-mono', c.score >= 0.85 ? 'text-[var(--success)]' : c.score >= 0.7 ? 'text-[var(--text-secondary)]' : 'text-[var(--warning)]')}>
                            {(c.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="copilot-agent-details__section">
                  <div className="copilot-details-card__heading mb-2.5">
                    <Wrench className="h-3.5 w-3.5 text-[var(--brand)]" />
                    工具调用
                    <Badge tone="brand" className="ml-auto text-[10px]">3</Badge>
                  </div>
                  <div className="copilot-mini-grid">
                    <Mini label="成功" value="3" tone="success" />
                    <Mini label="失败" value="0" tone="success" />
                    <Mini label="平均" value="42ms" />
                    <Mini label="缓存" value="32%" tone="success" />
                  </div>
                </section>

                <section className="copilot-agent-details__section copilot-agent-details__section--last">
                  <div className="copilot-details-card__heading mb-2.5">
                    <Clock className="h-3.5 w-3.5 text-[var(--brand)]" />
                    活动时间线
                  </div>
                  <div className="activity-timeline">
                    {[
                      { tone: 'success' as const, icon: CheckCircle2, text: `${expertName} 完成处置`, time: '14:32' },
                      { tone: 'success' as const, icon: ShieldCheck, text: '双重审批通过（王昊 + 李婷）', time: '14:28' },
                      { tone: 'info' as const, icon: Search, text: '检索 2 个 Runbook 文档', time: '14:25' },
                    ].map((a, i) => (
                      <div key={i} className="activity-timeline__item">
                        <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.tone}`)}>
                          <a.icon className="h-3 w-3" />
                        </div>
                        <div className="activity-timeline__content">
                          <div className="activity-timeline__text">{a.text}</div>
                          <div className="activity-timeline__time">{a.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
        ) : null}
      </aside>

      <Modal
        open={expertPickerOpen}
        onClose={() => { setExpertPickerOpen(false); setExpertPickerQuery(''); setRebindBlockedReason(null); }}
        title={expertPickerMode === 'rebind' ? '改绑岗位专家' : '选择在岗专家'}
        description={expertPickerMode === 'rebind'
          ? '将当前会话改绑到另一位在岗数字员工。存在待审批写操作时不可改绑。'
          : '仅展示已上岗数字员工。确认后将创建新会话并绑定所选岗位专家。'}
        size="lg"
      >
        <div className="space-y-3">
          {rebindBlockedReason && (
            <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-[var(--warning)]" />{rebindBlockedReason}
            </div>
          )}
          <div className="copilot-search-field">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <input
              value={expertPickerQuery}
              onChange={(event) => setExpertPickerQuery(event.target.value)}
              placeholder="搜索姓名、岗位或部门"
              className="copilot-search-field__input"
              autoFocus
            />
          </div>
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {filteredExperts.map((employee) => {
              const isCurrent = expertPickerMode === 'rebind' && employee.id === activeEmployeeId;
              return (
              <button
                key={employee.id}
                type="button"
                disabled={isCurrent}
                onClick={() => startSessionWithExpert(employee)}
                className="copilot-expert-option"
              >
                <span className="copilot-expert-option__avatar">
                  <DigitalEmployeeAvatar employee={employee} size={36} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text)]">{employeePrimaryLabel(employee)}</span>
                    {isDepartmentHead(employee) && <Badge tone="info">部门负责人</Badge>}
                    <Badge tone="success">在岗</Badge>
                    {isCurrent && <Badge tone="neutral">当前</Badge>}
                    <Badge tone={employee.risk === 'high' ? 'error' : employee.risk === 'medium' ? 'warn' : 'neutral'}>{employee.risk === 'high' ? '高风险' : employee.risk === 'medium' ? '中风险' : '低风险'}</Badge>
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-secondary)]">{employeeSecondaryLabel(employee)}</span>
                  <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">{employee.description}</span>
                </span>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </button>
              );
            })}
            {!filteredExperts.length && (
              <div className="copilot-expert-empty rounded-xl bg-[var(--bg-elevated)] px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                {onDutyEmployees.length === 0
                  ? <>当前工作区暂无在岗员工。请先到 <Link to="/agents" className="font-medium text-[var(--text)] underline-offset-2 hover:underline" onClick={() => setExpertPickerOpen(false)}>数字员工</Link> 完成上岗发布。</>
                  : '未找到匹配的在岗专家，请调整搜索词。'}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={closeoutOpen && !!currentSession}
        onClose={() => setCloseoutOpen(false)}
        title="会话结案摘要"
        description="将当前研判、证据和待办固化为可追溯记录。结案后会话只读。"
        size="md"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setCloseoutOpen(false)}>返回会话</Button>
            <Button
              size="sm"
              disabled={sessionSignals.pendingApprovals > 0}
              onClick={() => {
                if (!currentSession || sessionSignals.pendingApprovals > 0) return;
                setIsClosed(true);
                chat.syncSession({ ...currentSession, status: 'done', lifecycle: 'idle' });
                setCloseoutOpen(false);
              }}
            >
              确认结案
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          {sessionSignals.pendingApprovals > 0 && (
            <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-[var(--text-secondary)]">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-[var(--warning)]" />仍有 {sessionSignals.pendingApprovals} 项待审批，请处理后再结案。
            </div>
          )}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="font-semibold">结论</div>
            <p className="mt-1 leading-relaxed text-[var(--text-secondary)]">
              已完成 {sessionSignals.executions} 项行动研判，关联 {sessionSignals.evidence} 条证据；
              {sessionSignals.pendingApprovals ? `仍有 ${sessionSignals.pendingApprovals} 项审批待处理。` : '当前无待审批变更。'}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="行动" value={sessionSignals.executions} />
            <Mini label="证据" value={sessionSignals.evidence} tone="success" />
            <Mini label="待办" value={sessionSignals.pendingApprovals} />
          </div>
          <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="mb-1 font-semibold">任务回链</div>
            <p className="text-[var(--text-muted)]">受控执行完成后会生成并回链任务；审批中的变更将保留在当前会话直到责任人处理。</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        title="人工交接"
        description="接管后，自动写操作保持暂停，已生成的证据与审批记录不变。"
        size="sm"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setHandoffOpen(false)}>取消</Button>
            <Button
              size="sm"
              disabled={!handoffOwner.trim()}
              onClick={() => {
                setHandoffOpen(false);
                setHandoffActive(true);
                setSessionMode('investigate');
              }}
            >
              确认交接
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium">
            接管人
            <Input value={handoffOwner} onChange={(event) => setHandoffOwner(event.target.value)} className="mt-1.5" placeholder="例如：李婷 · 值班负责人" />
          </label>
          <div className="rounded-md bg-[var(--warning-bg)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-[var(--warning)]" />
            交接包含当前结论、{sessionSignals.evidence} 条证据与 {sessionSignals.pendingApprovals} 项待审批。确认后将切回研判模式并暂停自动写操作。
          </div>
        </div>
      </Modal>

      <DualSignModal
        open={!!showApproval}
        title={showApproval && currentSession ? (() => {
          const request = currentSession.messages.find((message) => message.id === showApproval.messageId)?.approvalRequest;
          const signer = request?.signers[showApproval.signerIndex];
          return `${signer?.name ?? '待签人'} · ${request?.action ?? '受控写操作'}`;
        })() : '写操作 · 双重审批'}
        description={showApproval && currentSession
          ? (() => {
            const request = currentSession.messages.find((message) => message.id === showApproval.messageId)?.approvalRequest;
            if (!request) return '请确认写操作范围与回滚预案后再签发。';
            return [
              request.resource ? `资源：${request.resource}` : null,
              request.reason ? `原因：${request.reason}` : null,
              '签发身份由当前登录会话校验，不接受手工填写姓名。',
            ].filter(Boolean).join(' · ');
          })()
          : undefined}
        currentIdentity={currentUser ? { id: currentUser.id, name: currentUser.name, role: currentUser.role } : null}
        targetSigner={showApproval && currentSession ? currentSession.messages.find((message) => message.id === showApproval.messageId)?.approvalRequest?.signers[showApproval.signerIndex] : undefined}
        canApprove={!!(showApproval && currentUser && currentSession && (() => {
          const signer = currentSession.messages.find((message) => message.id === showApproval.messageId)?.approvalRequest?.signers[showApproval.signerIndex];
          const expectedRoles: Record<Signer['role'], string> = { operator: 'user', auditor: 'auditor', approver: 'admin' };
          return signer && !signer.signed && signer.userId === currentUser.id && expectedRoles[signer.role] === currentUser.role;
        })())}
        eligibilityMessage={showApproval && currentSession ? (() => {
          const signer = currentSession.messages.find((message) => message.id === showApproval.messageId)?.approvalRequest?.signers[showApproval.signerIndex];
          return signer ? `仅待签人 ${signer.name}（${signer.role === 'auditor' ? '审计复核' : signer.role === 'operator' ? '执行复核' : '变更审批'}）可签发。` : '当前审批席位不可用，请刷新后重试。';
        })() : '当前审批席位不可用，请刷新后重试。'}
        onClose={() => setShowApproval(null)}
        onApprove={async () => {
          if (!showApproval) throw new Error('当前审批席位不可用，请刷新后重试。');
          await chat.approve(showApproval.messageId, showApproval.signerIndex);
        }}
      />
      <DebugPanel
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        session={currentSession}
        agentMeta={agentMeta}
      />

      {/* ============ 分享会话 ============ */}
      {shareDialog.open && (
        <div className="copilot-citation-layer fixed inset-0 z-40" onClick={() => setShareDialog({ open: false })}>
          <div className="copilot-scrim" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div id="share-dialog-title" className="text-sm font-semibold flex items-center gap-2">
                <Share2 className="h-4 w-4 text-[var(--brand)]" />分享会话
              </div>
              <button onClick={() => setShareDialog({ open: false })} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]" aria-label="关闭分享">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2 text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />仅查看 · 脱敏 token / 内部 IP · 审计 SignedLog
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)] mb-1">分享链接（只读）</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-[11px] break-all rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
                    {window.location.origin}/copilot/share/{shareDialog.token}
                  </code>
                  <Button size="sm" variant="secondary" onClick={copyShareUrl}>
                    <Copy className="h-3 w-3" />复制
                  </Button>
                </div>
              </div>
              {currentSession && (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                  <Lock className="h-3 w-3" />RBAC：仅工作区 {currentSession.workspaceId ?? 'w1'} 协作者可访问
                </div>
              )}
              <div className="flex gap-1.5 pt-2 border-t border-[var(--border)]">
                {currentSession?.shareToken && (
                  <Button size="sm" variant="secondary" onClick={() => { chat.revokeShare(currentSession.id); setShareDialog({ open: false }); }}>
                    <X className="h-3 w-3" />撤销分享
                  </Button>
                )}
                <div className="flex-1" />
                <Button size="sm" onClick={() => setShareDialog({ open: false })}>完成</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ 反馈 Drawer ============ */}
      {feedbackOpen && currentSession && (() => {
        const target = currentSession.messages.find((x) => x.id === feedbackOpen);
        if (!target) return null;
        return (
          <div className="copilot-citation-layer fixed inset-0 z-40" onClick={() => setFeedbackOpen(null)}>
            <div className="copilot-scrim" />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-drawer-title"
              className="absolute right-0 top-0 h-full w-[400px] max-w-[90vw] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-5 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div id="feedback-drawer-title" className="text-sm font-semibold flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-[var(--danger)]" />反馈 · 写回 RAG eval
                </div>
                <button onClick={() => setFeedbackOpen(null)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]" aria-label="关闭反馈">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <FeedbackForm
                target={target}
                onSubmit={(payload) => { chat.setFeedback(target.id, { kind: 'dislike', ...payload }); setFeedbackOpen(null); }}
              />
            </div>
          </div>
        );
      })()}

      {/* ============ 拒绝审批 ============ */}
      {rejectionReason.open && currentSession && (
        <div className="copilot-citation-layer fixed inset-0 z-40" onClick={() => setRejectionReason({ mid: '', idx: -1, open: false })}>
          <div className="copilot-scrim" />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <X className="h-4 w-4 text-[var(--danger)]" />拒绝审批
            </div>
            <div className="space-y-2 text-xs">
              <label className="block text-[10px] text-[var(--text-muted)]">拒绝原因（必填，写入审计）</label>
              <textarea
                id="rejection-reason"
                className="w-full h-24 rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
                placeholder="例如：维护窗口未到 / 影响范围过大 / 配置错误..."
              />
              <div className="flex gap-1.5 pt-2">
                <div className="flex-1" />
                <Button size="sm" variant="secondary" onClick={() => setRejectionReason({ mid: '', idx: -1, open: false })}>取消</Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    const reason = (document.getElementById('rejection-reason') as HTMLTextAreaElement | null)?.value ?? '';
                    chat.reject(rejectionReason.mid, rejectionReason.idx, reason);
                    setRejectionReason({ mid: '', idx: -1, open: false });
                  }}
                >
                  确认拒绝
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function labelOfCat(c: string) {
  return { agent: '专家', kb: '知识', task: '任务', tool: '工具', collab: '协作' }[c] ?? c;
}

/** 能力调用 / 依据摘要：默认一行，点开进专家上下文；明细可按需展开 */
function MessageCapabilityTrace({
  message,
  onOpenContext,
  expanded,
  onToggle,
}: {
  message: ChatMessageEx;
  onOpenContext: (tab: WorkbenchContextTab, messageId?: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const toolCount = message.toolCalls?.length ?? 0;
  const citeCount = message.citations?.length ?? 0;
  const taskRef = message.linkedTaskId ?? message.approvalRequest?.ticketId;
  const hasApproval = Boolean(message.approvalRequest);
  if (!toolCount && !citeCount && !hasApproval && !taskRef) return null;
  const okTools = message.toolCalls?.filter((item) => item.status === 'success').length ?? 0;

  return (
    <div className="copilot-message-workcards flex max-w-[920px] flex-wrap items-center gap-1.5" aria-label="岗位能力调用与依据">
      {toolCount > 0 && (
        <button type="button" onClick={() => onOpenContext('audit', message.id)} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
          <Wrench className="h-3 w-3 text-[var(--brand)]" />能力调用 {toolCount} · {okTools} 成功
        </button>
      )}
      {citeCount > 0 && (
        <button type="button" onClick={() => onOpenContext('evidence', message.id)} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
          <Link2 className="h-3 w-3 text-[var(--brand)]" />依据 {citeCount}
        </button>
      )}
      {hasApproval && (
        <button type="button" onClick={() => onOpenContext('approvals', message.id)} className="inline-flex items-center gap-1 rounded-md border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-[var(--warning)]">
          <ShieldCheck className="h-3 w-3 text-[var(--warning)]" />受控审批 {message.approvalRequest!.signed}/{message.approvalRequest!.required}
        </button>
      )}
      {taskRef && (
        <button type="button" onClick={() => onOpenContext('tasks', message.id)} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-[var(--brand)]">
          <ListChecksIcon className="h-3 w-3 text-[var(--brand)]" />任务 {taskRef}
        </button>
      )}
      {(toolCount > 0 || citeCount > 0) && (
        <button type="button" onClick={onToggle} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--brand)]">
          {expanded ? '收起明细' : '展开明细'}
        </button>
      )}
    </div>
  );
}

function RiskDecisionCard({ onOpenContext, messageId }: { onOpenContext: (tab: WorkbenchContextTab, messageId?: string) => void; messageId: string }) {
  return <section className="max-w-[760px] rounded-lg border border-[var(--warning)]/35 bg-[var(--warning-bg)]/25 p-3" aria-label="风险处置建议"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-xs font-semibold"><AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />风险处置建议</div><p className="mt-1 text-[11px] text-[var(--text-secondary)]">已识别高风险项。建议先核验受影响资产，再生成受控修复任务并发起人工复核。</p></div><Badge tone="warn" className="shrink-0 text-[10px]">需复核</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => onOpenContext('evidence', messageId)}>查看受影响资产</Button><Button size="sm" onClick={() => onOpenContext('tasks', messageId)}>生成修复任务</Button><Button size="sm" variant="secondary" onClick={() => onOpenContext('approvals', messageId)}>发起人工复核</Button></div></section>;
}

// ============ 消息气泡 ============
function MessageBubble({
  m, expandedThinking, setExpandedThinking, expandedArgs, setExpandedArgs,
  expandedReasoning, setExpandedReasoning, expandedApproval, setExpandedApproval,
  onApprove, onCitation, onRetry, onCopy, onRegenerate, onDelete, onRetryMessage, onFeedback,
  onApproveSigner, onRequestReject, onEdit,
  hoverMsgId, setHoverMsgId, copiedId, agentName, expertRole, expert, onOpenContext, selectedContextMessageId, messageRef, currentUser,
}: {
  m: ChatMessageEx;
  expandedThinking: Record<string, boolean>;
  setExpandedThinking: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedArgs: Record<string, boolean>;
  setExpandedArgs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedReasoning: Record<string, boolean>;
  setExpandedReasoning: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedApproval: Record<string, boolean>;
  setExpandedApproval: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onApprove: (msgId: string) => void;
  onCitation: (c: any, messageId?: string) => void;
  onRetry: (name: string) => void;
  onCopy: (m: ChatMessageEx) => void;
  onEdit: (m: ChatMessageEx) => void;
  onRegenerate: (mid: string) => void;
  onDelete: (mid: string) => void;
  onRetryMessage: (mid: string) => void;
  onFeedback: (mid: string, kind: FeedbackKind) => void;
  onApproveSigner: (mid: string, signerIndex: number) => void;
  onRequestReject: (mid: string, idx: number) => void;
  hoverMsgId: string | null;
  setHoverMsgId: (v: string | null) => void;
  copiedId: string | null;
  agentName?: string;
  expertRole?: string;
  expert?: Pick<DigitalEmployee, 'id' | 'name' | 'department' | 'avatarUrl'> | { id: string; name: string; department?: string; avatarUrl?: string };
  onOpenContext: (tab: WorkbenchContextTab, messageId?: string) => void;
  selectedContextMessageId?: string;
  messageRef?: (element: HTMLDivElement | null) => void;
  currentUser: { id: string; name: string; role: 'user' | 'admin' | 'auditor' } | null;
}) {
  const isUser = m.role === 'user';
  const isTool = m.role === 'tool';
  const isEmpty = !m.content;
  const isStreaming = m.status === 'streaming';
  const agentDisplayName = agentName || m.agentName || (isUser ? '王昊' : isTool ? '能力调用' : '数字员工');
  const [traceOpen, setTraceOpen] = useState(false);
  const needsDecision = !isUser && /CVE|高危|高风险|影响资产/.test(m.content ?? '');
  const expectedPlatformRole: Record<Signer['role'], 'user' | 'admin' | 'auditor'> = { operator: 'user', approver: 'admin', auditor: 'auditor' };
  const canSign = (signer: Signer) => !!currentUser && signer.userId === currentUser.id && expectedPlatformRole[signer.role] === currentUser.role;

  return (
    <div
      ref={messageRef}
      className={cn('copilot-message group relative', isUser ? 'copilot-message--user flex justify-end' : isTool ? 'copilot-message--tool flex gap-3' : 'copilot-message--assistant flex gap-3', selectedContextMessageId === m.id && 'is-context-selected')}
      data-message-status={m.status}
      onMouseEnter={() => setHoverMsgId(m.id)}
      onMouseLeave={() => setHoverMsgId(null)}
    >
      {!isUser && (
        <div className="shrink-0 pt-0.5">
          {isTool ? (
            <div className="copilot-message__avatar copilot-message__avatar--tool grid h-7 w-7 place-items-center rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">
              <Wrench className="h-3.5 w-3.5" />
            </div>
          ) : (
            <DigitalEmployeeAvatar
              employee={expert ?? { id: 'expert', name: agentDisplayName }}
              size={28}
              className="copilot-message__avatar copilot-message__avatar--assistant"
            />
          )}
        </div>
      )}
      <div className={cn('copilot-message__content min-w-0 space-y-2.5', isUser ? 'max-w-[80%]' : 'w-full max-w-[960px]')}>
        <div className={cn('copilot-message__meta flex items-center gap-1.5 text-[11px]', isUser && 'justify-end')}>
          {isUser ? (
            <Avatar name="王昊" size={20} />
          ) : null}
          <span className="font-semibold text-[var(--text)]">{isUser ? '王昊' : agentDisplayName}</span>
          {!isUser && !isTool && expertRole && (
            <span className="truncate text-[10px] text-[var(--text-muted)]">{expertRole}</span>
          )}
          {!isUser && m.status && (
            <span className={cn('inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]', isStreaming && 'text-[var(--brand)]')}>
              {isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" aria-hidden="true" />}
              {STATUS_LABEL[m.status]}
            </span>
          )}
          {!isUser && m.metrics?.ttftMs !== undefined && <details className="text-[10px] text-[var(--text-muted)]"><summary className="cursor-pointer">运行详情</summary><span className="font-mono">TTFT {m.metrics.ttftMs}ms · {m.metrics.durationMs ? `${(m.metrics.durationMs / 1000).toFixed(1)}s` : ''}{m.metrics.model ? ` · ${m.metrics.model}` : ''}</span></details>}
          <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums" title={m.createdAt}>{formatShanghaiTime(m.createdAt)}</span>
          {((m.toolCalls?.length ?? 0) > 0 || isTool) && <Badge tone="warn" className="text-[9px]">能力调用</Badge>}
          {m.approvalRequest && <Badge tone="error" className="text-[9px]">写操作</Badge>}
        </div>

        {!isUser && (
          <MessageCapabilityTrace
            message={m}
            onOpenContext={onOpenContext}
            expanded={traceOpen}
            onToggle={() => setTraceOpen((open) => !open)}
          />
        )}

        {needsDecision && <RiskDecisionCard onOpenContext={onOpenContext} messageId={m.id} />}

        {/* 错误条（failed / cancelled / moderated） */}
        {m.status === 'failed' && (
          <div role="alert" className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-[11px] flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
            <span className="text-[var(--text)]">
              {m.error?.message ?? ERROR_HINT[m.error?.category ?? 'unknown']}
            </span>
            <button
              type="button"
              onClick={() => onRetryMessage(m.id)}
              className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--danger)] hover:underline"
            >
              <RotateCcw className="h-3 w-3" />重试
            </button>
          </div>
        )}
        {m.status === 'cancelled' && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] text-[var(--text-muted)] inline-flex items-center gap-1.5">
            <Square className="h-3 w-3" />生成已停止
          </div>
        )}
        {m.status === 'moderated' && m.safety && (
          <div role="alert" className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning-bg)] px-3 py-2 text-[11px] flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-[var(--warning)]" />
            <span className="text-[var(--text)]">
              内容安全：{m.safety.flaggedCategory ?? 'policy'} · 已{m.safety.action === 'block' ? '拦截' : m.safety.action === 'redact' ? '脱敏' : '告警'}
            </span>
            {m.safety.redactedText && (
              <details className="ml-auto text-[10px]">
                <summary className="cursor-pointer text-[var(--text-muted)]">查看脱敏后</summary>
                <pre className="mt-1 max-w-md whitespace-pre-wrap text-[10px]">{m.safety.redactedText}</pre>
              </details>
            )}
          </div>
        )}

        {m.reasoningSteps && m.reasoningSteps.length > 0 && (
          <div className="copilot-message__reasoning max-w-[920px] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]">
            <button
              onClick={() => setExpandedReasoning({ ...expandedReasoning, [m.id]: !expandedReasoning[m.id] })}
              aria-expanded={!!expandedReasoning[m.id]}
              aria-controls={`reasoning-${m.id}`}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Activity className="h-3 w-3" />
              <span className="font-semibold">执行过程 · {m.reasoningSteps.length} 项</span>
              {expandedReasoning[m.id] ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
            </button>
            {expandedReasoning[m.id] && (
              <div id={`reasoning-${m.id}`} className="px-3 pb-2 space-y-1.5">
                {m.reasoningSteps.map((s, i) => (
                  <div key={s.id} className="flex items-start gap-2 text-[11px]">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--brand-light)] text-[var(--brand)] text-[9px] font-mono shrink-0 mt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-secondary)]">
                        <span className="font-mono text-[9px] text-[var(--text-muted)] mr-1">[{s.kind}]</span>
                        {s.title}
                      </div>
                      {s.detail && <div className="text-[var(--text-muted)]">{s.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {m.thinking && m.thinking.length > 0 && (
          <div className="copilot-message__thinking max-w-[920px] rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]">
            <button
              onClick={() => setExpandedThinking({ ...expandedThinking, [m.id]: !expandedThinking[m.id] })}
              aria-expanded={!!expandedThinking[m.id]}
              aria-controls={`thinking-${m.id}`}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Brain className="h-3 w-3" />
              <span className="font-semibold">分析摘要</span>
              {expandedThinking[m.id] ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
            </button>
            {expandedThinking[m.id] && (
              <div id={`thinking-${m.id}`} className="px-3 pb-2 text-[11px] leading-relaxed text-[var(--text-muted)]">{m.thinking}</div>
            )}
          </div>
        )}

        {!isEmpty ? (
          <div className={cn(
            'copilot-message__body relative',
            isUser
              ? 'copilot-message__body--user inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[var(--brand)] px-4 py-2.5 text-[14px] text-white shadow-sm'
              : isTool
              ? 'copilot-message__body--tool rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)]/50 px-3 py-2 text-[12px] text-[var(--text-secondary)] font-mono'
              : 'copilot-message__body--assistant max-w-[920px] text-[14.5px] leading-[1.7] text-[var(--text)] break-words',
          )}>
            {isUser ? (
              <span className="whitespace-pre-wrap">{m.content}</span>
            ) : (
              <div className="md-content">
                <Markdown text={m.content} />
                {isStreaming && <span className="inline-block h-3.5 w-1.5 ml-0.5 align-text-bottom bg-[var(--brand)] animate-pulse rounded-sm" aria-hidden="true" />}
              </div>
            )}
          </div>
        ) : isStreaming ? (
          <div className="copilot-message__body copilot-message__body--pending inline-flex items-center gap-2 text-[var(--text-muted)] text-sm py-1" role="status" aria-label="消息正在生成">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>{agentDisplayName} 正在思考</span>
            <span className="inline-block h-3.5 w-1.5 align-text-bottom bg-[var(--brand)] animate-pulse rounded-sm" aria-hidden="true" />
          </div>
        ) : null}

        {m.codeBlock && (
          <div className="copilot-message__code rounded-md border border-[var(--border)] bg-[var(--bg)] overflow-hidden max-w-2xl">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-1.5 text-[10px]">
                <Code className="h-3 w-3 text-[var(--text-muted)]" />
                <span className="font-mono text-[var(--text-muted)]">{m.codeBlock.lang}</span>
              </div>
              <button
                onClick={async () => { try { await navigator.clipboard.writeText(m.codeBlock!.code); } catch {} }}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1"
              >
                <Download className="h-3 w-3" />复制
              </button>
            </div>
            <pre className="overflow-x-auto p-3 text-[11px] font-mono leading-relaxed text-[var(--text)]">
              {m.codeBlock.code}
            </pre>
          </div>
        )}

        {traceOpen && m.toolCalls && m.toolCalls.length > 0 && (
          <div className="copilot-message__toolcalls max-w-[920px] space-y-1.5">
            <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Wrench className="h-3 w-3 text-[var(--brand)]" />能力调用明细 · {m.toolCalls.length} 项
            </div>
            {m.toolCalls.map((tc) => {
              const argsKey = `${m.id}-${tc.id}`;
              const isOpen = expandedArgs[argsKey];
              const failed = tc.status === 'failed';
              const denied = tc.status === 'denied' || tc.permission === 'denied';
              return (
                <div key={tc.id} className={cn('rounded-md border p-2 text-[11px]', failed || denied ? 'border-[var(--danger)]/40 bg-[var(--danger-bg)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]')}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Wrench className={cn('h-3 w-3', failed || denied ? 'text-[var(--danger)]' : 'text-[var(--brand)]')} />
                    <span className="font-mono font-semibold">{tc.name}</span>
                    {tc.permission === 'approval-required' && (
                      <Badge tone="warn" className="text-[9px]"><ShieldCheck className="mr-0.5 inline h-2.5 w-2.5" />需双重审批</Badge>
                    )}
                    {tc.permission === 'auto' && (
                      <Badge tone="success" className="text-[9px]"><PlugZap className="mr-0.5 inline h-2.5 w-2.5" />auto</Badge>
                    )}
                    {tc.permission === 'denied' && (
                      <Badge tone="error" className="text-[9px]"><Lock className="mr-0.5 inline h-2.5 w-2.5" />已拦截</Badge>
                    )}
                    {failed ? (
                      <Badge tone="error" className="text-[9px]">
                        <AlertCircle className="mr-0.5 inline h-2.5 w-2.5" />失败
                      </Badge>
                    ) : !denied ? (
                      <Badge tone="success" className="text-[9px]">
                        <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" />{tc.durationMs}ms
                      </Badge>
                    ) : null}
                    {tc.sandboxId && (
                      <span className="text-[9px] font-mono text-[var(--text-muted)]" title="gVisor 沙箱 ID">[{tc.sandboxId}]</span>
                    )}
                    {tc.traceId && (
                      <span className="text-[9px] font-mono text-[var(--text-muted)]" title="执行 traceId">{tc.traceId}</span>
                    )}
                    {failed && (
                      <button onClick={() => onRetry(tc.name)} className="text-[10px] text-[var(--danger)] hover:underline ml-auto">
                        <RotateCcw className="inline h-2.5 w-2.5 mr-0.5" />自动重试
                      </button>
                    )}
                    {!failed && !denied && (
                      <button
                        type="button"
                        onClick={() => setExpandedArgs({ ...expandedArgs, [argsKey]: !isOpen })}
                        aria-expanded={!!isOpen}
                        aria-controls={`tool-args-${argsKey}`}
                        className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        {isOpen ? '收起' : '参数'}
                      </button>
                    )}
                  </div>
                  {tc.error && (
                    <div className="mt-1 text-[10px] font-mono text-[var(--danger)]">{tc.error}</div>
                  )}
                  {isOpen && (
                    <div id={`tool-args-${argsKey}`} className="mt-1.5 space-y-1 pl-5">
                      <pre className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg)] rounded p-1.5 overflow-x-auto">
                        {JSON.stringify(tc.args, null, 2)}
                      </pre>
                      {tc.result && (
                        <pre className="text-[10px] font-mono text-[var(--success)] bg-[var(--bg)] rounded p-1.5 overflow-x-auto">
                          → {tc.result}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {traceOpen && m.citations && m.citations.length > 0 && (
          <div className="cite-block max-w-[920px]">
            <div className="cite-block__title">
              <Link2 className="h-3 w-3 text-[var(--brand)]" />
              装配知识依据 · {m.citations.length} 项
            </div>
            {m.citations.map((c, i) => (
              <button
                key={c.id}
                onClick={() => onCitation(c, m.id)}
                className="block w-full text-left px-2 py-1.5 rounded hover:bg-[var(--bg-hover)] text-[11px] font-mono"
              >
                <span className={cn('nav-pill text-[9px] mr-1', SOURCE_COLOR[c.source])}>{c.source}</span>
                <span className="text-[var(--brand)]">[{i + 1}]</span> {c.source}
                {c.page && <span className="text-[var(--text-muted)]"> · p.{c.page}</span>}
                <span className="text-[var(--success)] ml-2">{(c.score * 100).toFixed(0)}%</span>
              </button>
            ))}
          </div>
        )}

        {m.approvalRequest && (
          <div className="copilot-message__approval rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 max-w-md">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--danger)] mb-1 flex-wrap">
              <ShieldCheck className="h-3.5 w-3.5" />受控变更 · 双重审批
              {m.approvalRequest.reason && <Badge tone="warn" className="text-[9px] ml-1">{m.approvalRequest.reason}</Badge>}
              {m.approvalRequest.ticketId && <span className="text-[10px] font-mono text-[var(--text-muted)]">· {m.approvalRequest.ticketId}</span>}
              <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)]">
                {m.approvalRequest.signed}/{m.approvalRequest.required}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text)] mb-2 font-mono break-all">{m.approvalRequest.action}</div>
            {m.approvalRequest.resource && (
              <div className="text-[10px] text-[var(--text-muted)] mb-2">资源：<span className="font-mono">{m.approvalRequest.resource}</span></div>
            )}

            {/* 签名进度条 */}
            <div className="flex gap-1 mb-2" aria-label={`签名进度 ${m.approvalRequest.signed}/${m.approvalRequest.required}`}>
              {m.approvalRequest.signers.map((s, i) => (
                <div
                  key={i}
                  className={cn('flex-1 h-1.5 rounded-full', s.signed ? (s.role === 'auditor' ? 'bg-[var(--info)]' : 'bg-[var(--success)]') : 'bg-[var(--bg)]')}
                  title={`${s.name}（${s.role}）${s.signedAt ? ` · ${s.signedAt.slice(11, 19)}` : ''}`}
                />
              ))}
            </div>

            {/* 签名人列表 */}
            <div className="space-y-1 mb-2">
              {m.approvalRequest.signers.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <span className={cn('w-3 inline-block', s.signed ? 'text-[var(--success)]' : 'text-[var(--text-muted)]')}>{s.signed ? '✓' : '○'}</span>
                  <span className={cn('flex-1', s.signed ? 'text-[var(--success)]' : 'text-[var(--text-muted)]')}>{s.name}</span>
                  <Badge tone={s.role === 'auditor' ? 'info' : 'neutral'} className="text-[9px]">{s.role}</Badge>
                  {s.signedAt && <span className="text-[9px] font-mono text-[var(--text-muted)]">{s.signedAt.slice(11, 19)}</span>}
                  {s.signatureHash && <span className="text-[9px] font-mono text-[var(--text-muted)]" title="签名 hash">#{s.signatureHash.slice(-6)}</span>}
                </div>
              ))}
            </div>

            {/* 操作按钮 */}
            {m.approvalRequest.decision === 'pending' && (
              <div className="flex gap-1.5 flex-wrap">
                {m.approvalRequest.signers.map((s, i) => (
                  !s.signed && (
                    <Button key={i} size="sm" variant={canSign(s) ? 'danger' : 'secondary'} disabled={!canSign(s)} title={canSign(s) ? '使用当前登录身份签发' : `仅 ${s.name} 可签发`} onClick={() => onApproveSigner(m.id, i)}>
                      <ShieldCheck className="h-3 w-3" />{canSign(s) ? `批准（${s.name}）` : `待 ${s.name} 签发`}
                    </Button>
                  )
                ))}
                {m.approvalRequest.signers.some((s) => !s.signed && canSign(s)) && (
                  <Button size="sm" variant="secondary" onClick={() => {
                    const idx = m.approvalRequest!.signers.findIndex((s) => !s.signed && canSign(s));
                    if (idx >= 0) onRequestReject(m.id, idx);
                  }}>
                    <X className="h-3 w-3" />拒绝
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpandedApproval({ ...expandedApproval, [m.id]: !expandedApproval[m.id] })}
                >
                  详情
                </Button>
              </div>
            )}
            {m.approvalRequest.decision === 'approved' && (
              <Badge tone="success" className="text-[10px]">
                <CheckCircle2 className="mr-1 inline h-3 w-3" />已通过双重审批
                {m.approvalRequest.decidedAt && <span className="ml-1 font-mono">{m.approvalRequest.decidedAt.slice(11, 19)}</span>}
              </Badge>
            )}
            {m.approvalRequest.decision === 'rejected' && (
              <Badge tone="error" className="text-[10px]">
                <X className="mr-1 inline h-3 w-3" />已拒绝
                {m.approvalRequest.decidedAt && <span className="ml-1 font-mono">{m.approvalRequest.decidedAt.slice(11, 19)}</span>}
              </Badge>
            )}

            {/* 审计 / 详情展开 */}
            {expandedApproval[m.id] && (
              <div className="mt-2 pt-2 border-t border-[var(--border)] text-[10px] space-y-1">
                <div className="text-[var(--text-muted)]">审计字段：</div>
                <div>policyHash：<span className="font-mono">{m.approvalRequest.policyHash ?? '—'}</span></div>
                <div>resource：<span className="font-mono">{m.approvalRequest.resource ?? '—'}</span></div>
                <div>reason：<span className="font-mono">{m.approvalRequest.reason ?? '—'}</span></div>
              </div>
            )}
          </div>
        )}

        {/* Hover 消息操作栏 — Claude Code 风格 chip row */}
        {!isEmpty && (
          <div className={cn('copilot-message__actions flex items-center gap-0.5 text-[var(--text-muted)]', isUser ? 'justify-end' : '')}>
            <button
              onClick={() => onCopy(m)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              title="复制"
              aria-label="复制消息"
            >
              {copiedId === m.id ? <CheckCircle2 className="h-3 w-3 text-[var(--success)]" /> : <Copy className="h-3 w-3" />}
              <span>{copiedId === m.id ? '已复制' : '复制'}</span>
            </button>
            {isUser && <button onClick={() => onEdit(m)} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]" title="编辑并重新发送" aria-label="编辑并重新发送"><Pencil className="h-3 w-3" /><span>编辑</span></button>}
            {!isUser && (
              <>
                <button
                  onClick={() => onRegenerate(m.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  title="重新生成"
                  aria-label="重新生成"
                  disabled={m.status === 'streaming'}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>重新生成</span>
                </button>
                <div className="mx-1 h-3 w-px bg-[var(--border)]" aria-hidden="true" />
                <button
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)]',
                    m.feedback?.kind === 'like' ? 'text-[var(--success)]' : 'hover:text-[var(--text)]',
                  )}
                  title="点赞 · 写回 RAG eval"
                  aria-label="点赞"
                  aria-pressed={m.feedback?.kind === 'like'}
                  onClick={() => onFeedback(m.id, m.feedback?.kind === 'like' ? null : 'like')}
                >
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)]',
                    m.feedback?.kind === 'dislike' ? 'text-[var(--danger)]' : 'hover:text-[var(--text)]',
                  )}
                  title="点踩 · 写回 RAG eval"
                  aria-label="点踩"
                  aria-pressed={m.feedback?.kind === 'dislike'}
                  onClick={() => onFeedback(m.id, m.feedback?.kind === 'dislike' ? null : 'dislike')}
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDelete(m.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                  title="删除"
                  aria-label="删除消息"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContextDrawerPanel({ tab, messages, onCitation, focusedCitation }: { tab: Exclude<WorkbenchContextTab, 'overview' | 'admin'>; messages: ChatMessageEx[]; onCitation: (citation: any, messageId?: string) => void; focusedCitation?: any | null }) {
  const evidence = messages.flatMap((message) => (message.citations ?? []).map((citation) => ({ ...citation, __messageId: message.id })));
  const tasks = messages.flatMap((message) => {
    const id = message.linkedTaskId ?? message.approvalRequest?.ticketId;
    return id ? [{ id, title: message.approvalRequest?.action ?? '会话关联任务', status: message.approvalRequest?.decision ?? 'pending' }] : [];
  });
  const approvals = messages.flatMap((message) => message.approvalRequest ? [{ id: message.id, approval: message.approvalRequest }] : []);
  const audit = messages.flatMap((message) => [
    ...(message.toolCalls ?? []).map((tool) => ({ id: tool.id, time: message.createdAt, text: `${tool.name} · ${tool.status}`, tone: tool.status === 'failed' || tool.status === 'denied' ? 'error' : 'success' as const })),
    ...(message.approvalRequest ? [{ id: `${message.id}-approval`, time: message.createdAt, text: `审批 · ${message.approvalRequest.decision}`, tone: message.approvalRequest.decision === 'rejected' ? 'error' : 'success' as const }] : []),
  ]);
  const meta = {
    evidence: { label: '证据引用', hint: '回答所依据的可追溯来源', icon: Link2 },
    tasks: { label: '关联任务', hint: '需要持续跟进的执行事项', icon: ListChecksIcon },
    approvals: { label: '审批队列', hint: '涉及人工确认的受控动作', icon: ShieldCheck },
    audit: { label: '审计记录', hint: '工具、审批与状态变更流水', icon: Activity },
  }[tab];
  const PanelIcon = meta.icon;
  const empty = (label: string) => <div className="copilot-details-empty"><span className="copilot-details-empty__icon"><PanelIcon className="h-4 w-4" /></span><strong>暂无{label}</strong><span>当前会话还没有可展示的记录</span></div>;

  if (tab === 'evidence') return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4" />{meta.label}</div><div>{meta.hint}</div></div>{focusedCitation && <div className="copilot-citation-focus"><div className="copilot-citation-focus__header"><span><Hash className="mr-1 inline h-3 w-3 text-[var(--text-muted)]" />当前引用</span><span className="font-mono text-[10px] text-[var(--text-muted)]">{focusedCitation.page ? `p.${focusedCitation.page}` : '可追溯'}</span></div><div className="mt-2 flex items-center gap-2"><span className={cn('nav-pill text-[9px]', SOURCE_COLOR[focusedCitation.source] ?? 'text-[var(--text-secondary)] bg-[var(--bg-elevated)]')}>{focusedCitation.source ?? focusedCitation.src ?? '来源'}</span><span className="truncate text-xs font-semibold">{focusedCitation.docId ?? focusedCitation.src ?? focusedCitation.source ?? '关联文档'}</span></div><div className="mt-2 flex items-center gap-2 text-[10px]"><span className="text-[var(--text-muted)]">相关度</span><span className="copilot-confidence-bar"><span style={{ width: `${(focusedCitation.score ?? 0) * 100}%` }} /></span><span className="font-mono text-[var(--success)]">{((focusedCitation.score ?? 0) * 100).toFixed(0)}%</span></div><div className="copilot-citation-focus__text">{focusedCitation.text ?? '已定位到该来源。当前引用由会话检索结果生成，可继续回到中栏查看关联消息。'}</div></div>}{evidence.length ? <div className="copilot-details-list">{evidence.map((citation) => <button key={citation.id} type="button" onClick={() => onCitation(citation, citation.__messageId)} className={cn('copilot-context-item copilot-context-item--button', focusedCitation?.id === citation.id && 'is-focused')}><div className="flex min-w-0 items-center gap-2"><span className={cn('nav-pill text-[9px]', SOURCE_COLOR[citation.source] ?? 'text-[var(--text-secondary)] bg-[var(--bg-elevated)]')}>{citation.source}</span><span className="truncate text-xs font-semibold">{citation.docId || citation.source}</span></div><div className="mt-2 flex items-center gap-2 text-[10px]"><span className="text-[var(--text-muted)]">置信度</span><span className="copilot-confidence-bar"><span style={{ width: `${citation.score * 100}%` }} /></span><span className="font-mono text-[var(--text-secondary)]">{(citation.score * 100).toFixed(0)}%</span><span className="ml-auto text-[var(--text-muted)]">{citation.page ? `p.${citation.page}` : '可追溯'}</span></div></button>)}</div> : empty('证据')}</section>;
  if (tab === 'tasks') return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4" />{meta.label}</div><div>{meta.hint}</div></div>{tasks.length ? <div className="copilot-details-list">{tasks.map((task) => <div key={task.id} className="copilot-context-item"><div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-xs font-semibold">{task.title}</span><Badge tone={task.status === 'approved' ? 'success' : 'warn'}>{task.status === 'approved' ? '已通过' : '待处理'}</Badge></div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]"><span>任务 ID</span><span className="font-mono">{task.id}</span></div></div>)}</div> : empty('关联任务')}</section>;
  if (tab === 'approvals') return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4" />{meta.label}</div><div>{meta.hint}</div></div>{approvals.length ? <div className="copilot-details-list">{approvals.map(({ id, approval }) => <div key={id} className="copilot-context-item copilot-context-item--approval"><div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold">受控审批</span><Badge tone={approval.decision === 'approved' ? 'success' : approval.decision === 'rejected' ? 'error' : 'warn'}>{approval.decision === 'approved' ? '已通过' : approval.decision === 'rejected' ? '已拒绝' : '待审批'}</Badge></div><p className="mt-2 break-words text-[11px] leading-5 text-[var(--text-secondary)]">{approval.action}</p><div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]"><span>签署进度</span><span className="font-mono">{approval.signed}/{approval.required} 已签</span></div></div>)}</div> : empty('待审批事项')}</section>;
  return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4" />{meta.label}</div><div>{meta.hint}</div></div>{audit.length ? <div className="copilot-details-list">{audit.map((item) => <div key={item.id} className="copilot-context-item copilot-context-item--audit"><span className={cn('copilot-audit-dot', item.tone === 'error' ? 'copilot-audit-dot--error' : 'copilot-audit-dot--success')} /><div className="min-w-0"><div className="text-[11px] font-medium text-[var(--text)]">{item.text}</div><div className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{item.time.slice(11, 19)} · {item.id}</div></div></div>)}</div> : empty('审计事件')}</section>;
}

function ContextOverview({ summary, sessionMode, riskLevel, handoffActive, onOpenTab }: {
  summary: ReturnType<typeof deriveWorkbenchSummary>;
  sessionMode: 'investigate' | 'execute';
  riskLevel: 'low' | 'medium' | 'high';
  handoffActive: boolean;
  onOpenTab: (tab: WorkbenchContextTab) => void;
}) {
  const statusLabel = handoffActive ? '人工接管中' : sessionMode === 'execute' ? '受控执行中' : '研判进行中';
  const statusTone = handoffActive ? 'warn' : sessionMode === 'execute' ? 'warn' : 'brand';
  const riskLabel = riskLevel === 'high' ? '高' : riskLevel === 'medium' ? '中' : '低';
  const cards: { tab: WorkbenchContextTab; label: string; value: number; icon: any; tone: string }[] = [
    { tab: 'tasks', label: '关联任务', value: summary.linkedTasks, icon: ListChecksIcon, tone: 'text-[var(--brand)] bg-[var(--brand-light)]' },
    { tab: 'approvals', label: '待审批', value: summary.pendingApprovals, icon: ShieldCheck, tone: 'text-[var(--warning)] bg-[var(--warning-bg)]' },
    { tab: 'evidence', label: '证据引用', value: summary.evidence, icon: Link2, tone: 'text-[var(--success)] bg-[var(--success-bg)]' },
    { tab: 'audit', label: '执行记录', value: summary.executions, icon: Activity, tone: 'text-[var(--info)] bg-[var(--info-bg)]' },
  ];
  return (
    <section className="copilot-context-overview">
      <div className="copilot-context-overview__hero">
        <div className="copilot-context-overview__eyebrow">
          <span>处置状态</span>
          <Badge tone={statusTone as any} className="text-[10px]">{statusLabel}</Badge>
        </div>
        <div className="mt-2 text-sm font-semibold leading-5 text-[var(--text)]">{summary.nextAction}</div>
        <div className="copilot-context-overview__meta">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', riskLevel === 'high' ? 'bg-[var(--danger)]' : riskLevel === 'medium' ? 'bg-[var(--warning)]' : 'bg-[var(--success)]')} />
            风险 {riskLabel}
          </span>
          <span>数字员工持续监控</span>
        </div>
      </div>
      <div className="copilot-context-overview__summary-head">
        <span>治理摘要</span>
        <span>点击查看明细</span>
      </div>
      <div className="copilot-context-overview__stats">
        {cards.filter((card) => card.value > 0).map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.tab} type="button" onClick={() => onOpenTab(card.tab)} className="copilot-summary-card group">
              <span className={cn('copilot-summary-card__icon grid h-7 w-7 place-items-center rounded-lg', card.tone)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="mt-2 flex items-end justify-between gap-2">
                <span className="text-[10px] text-[var(--text-muted)]">{card.label}</span>
                <span className="font-mono text-base font-semibold text-[var(--text)]">{card.value}</span>
              </span>
              <span className="copilot-summary-card__action">查看明细 <ChevronRight className="h-3 w-3" /></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ============ Agent 详情折叠条 ============
function AgentDetailsCollapsed({ onOpen }: { onOpen: () => void }) {
  return (
    <CollapsedPanelHandle
      Icon={Bot}
      HintIcon={ChevronLeft}
      label="Agent 详情"
      hint="点击展开 Agent 详情"
      onOpen={onOpen}
    />
  );
}


function Mini({ label, value, tone }: { label: string; value: any; tone?: 'success' }) {
  return (
    <div className="copilot-mini-stat">
      <div className="copilot-mini-stat__label">{label}</div>
      <div className={cn('copilot-mini-stat__value', tone === 'success' && 'is-success')}>{value}</div>
    </div>
  );
}

// ============ 反馈表单 ============
function FeedbackForm({ target, onSubmit }: { target: ChatMessageEx; onSubmit: (p: { tags?: FeedbackTag[]; comment?: string }) => void }) {
  const [tags, setTags] = useState<FeedbackTag[]>(target.feedback?.tags ?? []);
  const [comment, setComment] = useState(target.feedback?.comment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const toggle = (k: FeedbackTag) => setTags((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  const handleSubmit = () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    // 模拟提交反馈（含短暂 loading → 成功）
    setTimeout(() => {
      onSubmit({ tags, comment: comment || undefined });
      setSubmitting(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 1500);
    }, 500);
  };
  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2 text-[10px] text-[var(--text-muted)]">
        反馈将用于 RAG eval / 模型训练（仅管理员与训练管线可见）。
      </div>
      <div>
        <div className="text-[10px] text-[var(--text-muted)] mb-1">问题分类（多选）</div>
        <div className="flex flex-wrap gap-1.5">
          {FEEDBACK_TAGS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => toggle(t.key)}
              aria-pressed={tags.includes(t.key)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[10px] border transition-colors',
                tags.includes(t.key)
                  ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                  : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="fb-comment" className="text-[10px] text-[var(--text-muted)] block mb-1">详细说明</label>
        <textarea
          id="fb-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="例如：第 2 步引用文档已过期 / 回答不够具体..."
          className="w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
        />
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={submitting || submitted}
      >
        {submitted ? <><CheckCircle2 className="h-3 w-3" />已提交</> : submitting ? '提交中…' : '提交反馈'}
      </Button>
    </div>
  );
}
