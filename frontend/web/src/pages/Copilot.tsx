/**
 * P2 会话 · Copilot（企业级数字员工会话）
 * 核心能力:
 *  1. 消息状态机（queued / streaming / succeeded / failed / cancelled / expired / moderated）
 *  2. 多会话管理（增/删/置顶/星标/归档/分享/TTL）
 *  3. 流式响应（chunk 级 + AbortController + 超时）
 *  4. 双签审批（operator + auditor 角色 + 时间戳 + hash）
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
import { useState, useRef, useEffect, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Avatar, Badge, Button, Input, Dot, Row, CollapsedPanelHandle } from '@de/web-ui';
import {
  Bot, Search, ListChecks as ListChecksIcon, Wrench, Workflow as WorkflowIcon, FileText, ShieldCheck,
  AlertTriangle, Upload, MoreHorizontal, Download,
  Link2, CheckCircle2, BarChart3, Volume2, Zap, Clock, Server, BellOff,
  Star, Share2, Settings, X, Pin, ChevronDown, ChevronLeft,
  Sparkles, Database, Code, Cpu, Users, Loader2, AlertCircle, AtSign,
  Hash, Activity, Languages, BookOpenCheck, Brain, RotateCcw,
  Paperclip, Mic, Send, ChevronRight, ThumbsUp, ThumbsDown,
  Copy, Trash2, Square, Plus, Archive, ArchiveRestore, FileDown, Lock, Eye, EyeOff, ArrowUp,
  Archive as ArchiveIcon, MessageSquareWarning, ShieldAlert, Check, Hourglass, Plug, PlugZap,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import { DualSignModal } from '@/components/DualSignModal';
import { DebugPanel } from '@/components/DebugPanel';
import { useChat } from '@/hooks/useChat';
import { useT } from '@/i18n';
import { Markdown } from '@/components/Markdown';
import { deriveWorkbenchSummary, type WorkbenchContextTab } from '@/features/copilot/workbench';
import { sessionHistoryPresentation } from '@/features/copilot/layout';
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
  title: string;
  preview: string;
  agent: string;
  status: 'active' | 'done';
  group: 'today' | 'yesterday' | 'week';
  time: string;
  pinned?: boolean;
  unread?: number;
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
  Runbook: 'text-[var(--brand)] bg-[var(--brand-light)] border-[var(--brand)]/30',
  CMDB: 'text-[var(--info)] bg-[var(--info-bg)] border-[var(--info)]/30',
  CVE: 'text-[var(--danger)] bg-[var(--danger-bg)] border-[var(--danger)]/30',
  SIEM: 'text-[var(--warning)] bg-[var(--warning-bg)] border-[var(--warning)]/30',
};

const MENTIONS = [
  { key: '@agent', label: 'Agent', icon: Bot, desc: '故障自愈 / 变更辅助 ...' },
  { key: '@skill', label: 'Skill', icon: Wrench, desc: 'redis-cli / kubectl ...' },
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
  { key: 'kubectl', name: 'kubectl', desc: 'K8s 资源管理（需双签）', requiresApproval: true },
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
  const { t } = useT();
  const [searchQ, setSearchQ] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [showApproval, setShowApproval] = useState<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedArgs, setExpandedArgs] = useState<Record<string, boolean>>({});
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [expandedApproval, setExpandedApproval] = useState<Record<string, boolean>>({});
  const [focusedCitation, setFocusedCitation] = useState<any | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(() => typeof window !== 'undefined' && sessionHistoryPresentation(window.innerWidth) === 'pinned');
  // 右栏由消息上下文驱动：没有可追溯信息时保持隐藏，避免空面板占用工作区。
  const [contextSelection, setContextSelection] = useState<ContextSelection>({ open: false, scope: 'session', tab: 'overview', pinned: false });
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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [shareDialog, setShareDialog] = useState<{ open: boolean; token?: string }>({ open: false });
  const [rejectionReason, setRejectionReason] = useState<{ mid: string; idx: number; open: boolean }>({ mid: '', idx: -1, open: false });

  // Composer 增强状态
  const [modelOpen, setModelOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [currentModelKey, setCurrentModelKey] = useState('sonnet-4');
  const [enabledTools, setEnabledTools] = useState<string[]>(availableTools.map((t) => t.key));
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentModel = MODELS.find((m) => m.key === currentModelKey) ?? MODELS[0];
  const enabledToolCount = enabledTools.length;

  // 真实状态管理（持久化 + 流式响应 + 多会话）
  const { data: agentMeta } = useApiQuery<AgentMeta>(['agent', 'meta'], '/api/agents/a1/meta');
  const { data: slashCmds = [] } = useApiQuery<{ cmd: string; desc: string; icon: string; category: string }[]>(
    ['slash-cmds'], '/api/slash-commands'
  );
  const chat = useChat(agentMeta);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionToggleRef = useRef<HTMLButtonElement>(null);
  const detailsToggleRef = useRef<HTMLButtonElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const historyIdx = useRef(0);

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
    setExportMenuOpen(false);
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
    setExportMenuOpen(false);
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
    const list = Object.values(chat.state.sessions);
    const q = searchQ.trim().toLowerCase();
    return list.filter((s) => !q || s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q));
  }, [chat.state.sessions, searchQ]);

  const grouped = useMemo(() => ({
    pinned: filteredSessions.filter((s) => s.pinned),
    today: filteredSessions.filter((s) => !s.pinned && s.group === 'today'),
    yesterday: filteredSessions.filter((s) => !s.pinned && s.group === 'yesterday'),
    week: filteredSessions.filter((s) => !s.pinned && s.group === 'week'),
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
    if (!chat.state.draftInput.trim() || chat.state.typing || isClosed) return;
    chat.send(chat.state.draftInput);
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
    setSessionsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openCitation = (citation: any, messageId?: string) => {
    openContext('evidence', messageId);
    setFocusedCitation(citation);
  };

  const currentSession = chat.activeSession;
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
    if (contextSelection.scope === 'session' && hasSessionContext) return;
    if (contextSelection.scope === 'message' && hasSelectedContext) return;
    setContextSelection((selection) => ({ ...selection, open: false, messageId: undefined }));
  }, [contextSelection.open, contextSelection.scope, hasSelectedContext, hasSessionContext]);

  // P2：Cmd/Ctrl + Shift + E 快速打开或关闭当前会话上下文。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'e' || !hasSessionContext) return;
      event.preventDefault();
      if (contextSelection.open) {
        closeContext();
      } else {
        openContext('overview');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextSelection.open, hasSessionContext]);

  return (
    <div className="copilot-shell relative flex h-full min-h-0 min-w-0 bg-[var(--bg-elevated)]" data-sessions-open={sessionsOpen ? 'true' : 'false'} data-details-open={detailsOpen ? 'true' : 'false'}>
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
        className={cn(
          'copilot-sessions absolute inset-y-0 left-0 z-30 flex w-[300px] max-w-[calc(100%-40px)] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg)] shadow-xl transition-transform duration-200',
          sessionsOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="会话列表"
        data-open={sessionsOpen ? 'true' : 'false'}
      >
        <div className="px-3 py-3 border-b border-[var(--border)] space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[var(--text-secondary)]">会话记录</h2>
            <span className="text-[10px] text-[var(--text-muted)]">固定保留</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1" onClick={chat.newSession}>
              <Plus className="h-3.5 w-3.5" />新会话
            </Button>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">{Object.keys(chat.state.sessions).length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="搜索会话..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {(['pinned', 'today', 'yesterday', 'week'] as const).map((g) =>
            grouped[g].length === 0 ? null : (
              <div key={g} className="mb-2.5 last:mb-0">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  {g === 'pinned' && <Pin className="h-3 w-3" />}
                  {g === 'today' ? '今天' : g === 'yesterday' ? '昨天' : g === 'week' ? '本周' : '置顶'}
                  {g === 'pinned' && <Badge tone="brand" className="text-[9px] ml-auto">置顶</Badge>}
                </div>
                {grouped[g].map((s) => {
                  const active = s.id === chat.state.activeId;
                  return (
                    <div key={s.id} className="copilot-session-item__wrap relative group">
                      <button
                        type="button"
                        onClick={() => switchSession(s.id)}
                        onDoubleClick={() => chat.togglePin(s.id)}
                        className={cn('session-item copilot-session-item w-full text-left', active && 'session-item--active')}
                        aria-current={active ? 'page' : undefined}
                        aria-label={`${s.title}，${s.status === 'active' ? '进行中' : '已完成'}${s.unread ? `，${s.unread} 条未读` : ''}`}
                      >
                        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <div className="session-item__title min-w-0">
                            {s.pinned && <Pin className="h-3 w-3 shrink-0 text-[var(--brand)]" />}
                            <span className="truncate">{s.title}</span>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            {s.unread ? (
                              <span className="min-w-[16px] h-4 rounded-full bg-[var(--danger)] text-white text-[9px] font-mono flex items-center justify-center px-1">{s.unread}</span>
                            ) : (
                              <span className="text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap">{s.time}</span>
                            )}
                          </div>
                        </div>
                        <div className="session-item__preview">{s.preview || '(空)'}</div>
                        <div className="session-item__meta">
                          <span className="nav-pill text-[10px] !py-0.5">{s.agent}</span>
                          <Badge tone={s.status === 'active' ? 'brand' : 'success'} className="text-[10px]">
                            {s.status === 'active' ? '进行中' : '已完成'}
                          </Badge>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => chat.delSession(s.id)}
                        className="copilot-session-item__delete absolute right-2 bottom-2 grid h-5 w-5 place-items-center rounded text-[var(--text-muted)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all"
                        aria-label={`删除会话：${s.title}`}
                        title="删除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}
          {Object.keys(chat.state.sessions).length === 0 && (
            <div className="text-center text-xs text-[var(--text-muted)] py-8">
              <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
              还没有会话，点'新会话'开始
            </div>
          )}
        </div>
      </aside>

      {/* ============ 中间对话 ============ */}
      <section className="copilot-conversation flex min-w-0 min-h-0 flex-1 flex-col bg-[var(--bg)] overflow-hidden">
        {/* 当前事件工作头：对话页首先呈现处置对象和下一待办。 */}
        <header className="copilot-header border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-5">
          <div className="copilot-work-header flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', workbench.tone === 'warning' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : 'bg-[var(--brand-light)] text-[var(--brand)]')}>
                {workbench.tone === 'warning' ? <AlertTriangle className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="copilot-work-title truncate font-semibold">{workbench.title}</span>
                  <Badge tone={workbench.tone === 'warning' ? 'warn' : 'brand'} className="text-[10px]">{workbench.pendingApprovals ? '待处置' : sessionMode === 'execute' ? '受控执行' : '研判中'}</Badge>
                  {riskLevel !== 'low' && <Badge tone={riskLevel === 'high' ? 'error' : 'warn'} className="text-[10px]">{riskLevel === 'high' ? '高风险' : '中风险'}</Badge>}
                </div>
                <div className="copilot-header__meta copilot-work-next mt-0.5 flex items-center gap-1.5 text-[var(--text-muted)]">
                  <span className="truncate">下一步：{workbench.nextAction}</span>
                  {handoffActive && <span className="hidden sm:inline">· 已由 {handoffOwner} 接管</span>}
                </div>
              </div>
            </div>
            <div className="copilot-header__actions flex flex-wrap items-center justify-end gap-1.5 shrink-0">
              <button ref={sessionToggleRef} type="button" onClick={() => { setSessionsOpen((open) => !open); closeContext(); }} className="copilot-mobile-toggle grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="打开会话列表" aria-expanded={sessionsOpen} aria-controls="copilot-sessions"><ListChecksIcon className="h-4 w-4" /></button>
              {hasSessionContext && <Button ref={detailsToggleRef} variant="secondary" size="sm" className="copilot-header-action" onClick={() => openContext('overview')}>
                <FileText className="h-3.5 w-3.5" />{detailsOpen ? '查看上下文' : '打开上下文'}
              </Button>}
              <Button variant="secondary" size="sm" className="copilot-header-action" onClick={() => setCloseoutOpen(true)}>
                <CheckCircle2 className="h-3.5 w-3.5" />会话结案
              </Button>
              <Button variant="secondary" size="sm" className="copilot-header-action" onClick={() => setHandoffOpen(true)}>
                <Users className="h-3.5 w-3.5" />人工接管
              </Button>
              <Button variant="secondary" size="sm" className="copilot-header-action" onClick={printAuditRecord}>
                <ShieldCheck className="h-3.5 w-3.5" />导出审计
              </Button>
            </div>
          </div>
        </header>

        {/* 消息流 */}
        <div ref={scrollRef} className="copilot-message-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden" aria-label="消息列表">
          <div className="copilot-message-stream">
            {currentSession && currentSession.messages.length > 0 ? (
              <>
                <div className="copilot-conversation-intro flex flex-col items-center gap-2 pt-6 pb-2" aria-label="会话安全与审计状态">
                  <div className="flex w-full items-center gap-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[var(--border)]" />
                    <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums">{new Date(currentSession.createdAt).toLocaleDateString('zh-CN')}</span>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[var(--border)]" />
                  </div>
                  <div className="copilot-conversation-intro__security inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                    <ShieldCheck className="h-3 w-3 text-[var(--success)]" />
                    对话已加密 · SignedLog 审计 · 等保 3 合规
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
                      onApprove={(mid) => setShowApproval(mid)}
                      onCitation={(citation) => openCitation(citation, m.id)}
                      onRetry={(name) => chat.regenerate(m.id)}
                      onCopy={copyMessage}
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
                      onApproveSigner={(mid, idx) => chat.approve(mid, idx)}
                      onRequestReject={(mid, idx) => setRejectionReason({ mid, idx, open: true })}
                      hoverMsgId={hoverMsgId}
                      setHoverMsgId={setHoverMsgId}
                      copiedId={copiedId}
                      agentName={agentMeta?.name}
                      onOpenContext={openContext}
                      selectedContextMessageId={contextSelection.scope === 'message' ? contextSelection.messageId : undefined}
                      messageRef={(element) => { messageRefs.current[m.id] = element; }}
                    />
                  ))}
                </div>

                {chat.state.typing && (
                  <div className="copilot-streaming-status flex gap-3 px-4 sm:px-8 md:px-12 pb-4" aria-live="polite" aria-label="Agent 正在思考">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white" aria-hidden="true">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="inline-flex items-center gap-1.5 pt-2 text-[12px] text-[var(--text-muted)]">
                      {[0, 1, 2].map((i) => (
                        <span key={i} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                      <span className="ml-1.5">{agentMeta?.name ?? '故障自愈'} 正在思考</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="copilot-empty-state h-full grid place-items-center px-6">
                <div className="w-full max-w-2xl">
                  <div className="text-center mb-8">
                    <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white shadow-lg">
                      <Bot className="h-7 w-7" />
                    </div>
                    <h2 className="text-xl font-semibold text-[var(--text)]">{agentMeta?.name ?? '故障自愈'}</h2>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{agentMeta?.description ?? '基于 Runbook 的自动故障定位与恢复 · 内置 8 个 Skill'}</p>
                  </div>
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
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============ 输入区（企业级 Composer） ============ */}
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

          {/* 上下文条：Agent · 会话 · 按需运行配置 */}
          <div className="copilot-composer__context" aria-label="会话运行上下文">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white shrink-0">
                <Bot className="h-3 w-3" />
              </span>
              <span className="font-semibold text-[11px] text-[var(--text)] truncate">{agentMeta?.name ?? '故障自愈'}</span>
              <Badge tone="success" className="text-[9px]"><Dot tone="success" />在线</Badge>
              <span className="text-[var(--text-muted)] text-[10px]">·</span>
              <span className="text-[10px] text-[var(--text-muted)] truncate">{currentSession?.title ?? '新会话'}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  setModelOpen((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={modelOpen}
                className="copilot-composer__model-pill flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--text)] transition-colors"
                title="调整本次会话的模型与工具链"
              >
                <Settings className="h-3 w-3 text-[var(--brand)]" />
                <span className="font-medium">运行配置</span>
                <span className="font-mono text-[var(--text-muted)]">{currentModel.label} · {enabledToolCount} 工具</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </div>
          </div>

          {/* 运行配置 popover */}
          {modelOpen && (
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
                    currentModelKey === m.key && 'bg-[var(--brand-light)]/40',
                  )}
                >
                  <Cpu className="h-3.5 w-3.5 text-[var(--brand)] mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {m.label}
                      <Badge tone={m.tone} className="text-[9px]">{m.tier}</Badge>
                      {currentModelKey === m.key && <Check className="h-3 w-3 text-[var(--brand)] ml-auto" />}
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
                <button className="ml-auto text-[10px] text-[var(--brand)] hover:underline" onClick={() => setEnabledTools(availableTools.map((t) => t.key))}>全选</button>
              </div>
              {availableTools.map((t) => {
                const on = enabledTools.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => setEnabledTools((prev) => on ? prev.filter((k) => k !== t.key) : [...prev, t.key])}
                    role="menuitemcheckbox"
                    aria-checked={on}
                    className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-[var(--bg-hover)]', on && 'bg-[var(--brand-light)]/30')}
                  >
                    <span className={cn('grid h-5 w-5 place-items-center rounded border text-[10px]', on ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border)] text-[var(--text-muted)]')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <Plug className="h-3.5 w-3.5 text-[var(--brand)]" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-semibold">{t.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{t.desc}</div>
                    </div>
                    {t.requiresApproval && <Badge tone="warn" className="text-[9px]">需双签</Badge>}
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
                className="copilot-composer__attach-chip flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--text)]"
              >
                <Plus className="h-3 w-3" />添加
              </button>
            </div>
          )}

          {/* 编辑器卡片 */}
          <div className={cn(
            'copilot-composer__editor group relative rounded-xl border bg-[var(--surface-1)] shadow-sm transition-all',
            'border-[var(--border)]',
            isDragging && 'border-[var(--brand)] shadow-[0_0_0_3px_var(--brand-light)]',
          )}>
            {/* 自动 @ token 渲染预览（输入含 @ 时显示） */}
            {/[@#]\w+/.test(chat.state.draftInput) && (
              <div className="copilot-composer__chips flex flex-wrap items-center gap-1 px-3 pt-2 text-[10px]">
                {Array.from(new Set(chat.state.draftInput.match(/[@#]\w+/g) ?? [])).map((tok, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-[var(--brand-light)] text-[var(--brand)] px-1.5 py-0.5 font-mono">
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
              placeholder="向 故障自愈 提问 · 试试 / 唤起命令、@ 提及资源、粘贴截图 (Shift+Enter 换行 · Esc 停止)"
              maxLength={MAX_CHARS}
              rows={2}
              className="copilot-composer__textarea block w-full resize-none bg-transparent px-3.5 py-2.5 text-sm leading-relaxed outline-none placeholder:text-[var(--text-muted)]/80"
            />

            {/* 操作栏 */}
            <div className="copilot-composer__footer flex items-center justify-between gap-2 border-t border-[var(--border)]/60 px-2 py-1.5">
              <div className="copilot-composer__tools flex items-center gap-0.5">
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
                  onClick={() => setVoiceOn((v) => !v)}
                  className={cn(
                    'copilot-composer__tool grid h-7 w-7 place-items-center rounded-md transition-colors',
                    voiceOn ? 'text-[var(--danger)] bg-[var(--danger-bg)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
                  )}
                  title={voiceOn ? '语音输入已开启' : '语音输入'}
                  aria-label="语音输入"
                  aria-pressed={voiceOn}
                >
                  <Mic className="h-3.5 w-3.5" />
                </button>
                <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden="true" />
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
                  <Badge tone="info" className="ml-1 text-[9px]" title="AI 正在等待输入">
                    <Hourglass className="h-2.5 w-2.5 mr-0.5" />就绪
                  </Badge>
                )}
              </div>

              <div className="copilot-composer__send flex items-center gap-2">
                <span className="copilot-composer__model hidden sm:inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-mono">
                  <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[9px]">Enter</kbd>
                  <span>发送 ·</span>
                  <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[9px]">Shift+Enter</kbd>
                  <span>换行</span>
                </span>
                <span className={cn('copilot-composer__usage hidden sm:flex', tokenPercent > 90 && 'copilot-composer__usage--danger', tokenPercent > 60 && tokenPercent <= 90 && 'copilot-composer__usage--warning')}>
                  <Hash className="h-3 w-3" aria-hidden="true" />
                  <span className="font-mono">{charCount}/{MAX_CHARS}</span>
                  <div className="copilot-composer__usage-bar" aria-hidden="true"><div style={{ width: `${Math.min(100, tokenPercent)}%` }} /></div>
                </span>
                <Button
                  onClick={handleSend}
                  disabled={!chat.state.draftInput.trim() || chat.state.typing || isClosed}
                  size="sm"
                  className="copilot-composer__send-btn"
                  aria-label={isClosed ? '会话已结案，发送已禁用' : chat.state.typing ? '生成中，发送已禁用' : '发送消息（Enter）'}
                >
                  <Send className="h-3.5 w-3.5" />发送
                </Button>
              </div>
            </div>
          </div>

          {/* 提示条 */}
          <div className="mt-1.5 px-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <ShieldCheck className={cn('h-3 w-3', sessionMode === 'execute' ? 'text-[var(--warning)]' : 'text-[var(--success)]')} />{isClosed ? '会话已结案 · 仅可查看和导出' : handoffActive ? `人工接管中 · 由 ${handoffOwner} 处理后续变更` : sessionMode === 'execute' ? `受控执行 · ${riskLevel === 'high' ? '高风险双签与回滚必需' : '写操作将进入审批与审计'}` : '研判模式 · 默认不执行写操作'}
            </span>
            <span className="hidden sm:flex items-center gap-2 font-mono">
              <span>{enabledToolCount} 工具 · {attachments.length} 附件</span>
              <span>·</span>
              <span>{tokenEstimate} tokens / 8k</span>
            </span>
          </div>
        </div>
      </section>

      {/* ============ 右侧详情 ============ */}
      <aside
        id="copilot-agent-details"
        className={cn(
          'copilot-agent-details absolute inset-y-0 right-0 z-30 flex w-[460px] max-w-[calc(100%-40px)] min-h-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg)] shadow-xl transition-transform duration-200 ease-out',
          detailsOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-label="会话上下文"
        data-open={detailsOpen ? 'true' : 'false'}
        aria-expanded={detailsOpen}
      >
        {detailsOpen ? (
        <div className="copilot-agent-details__inner flex min-h-0 flex-1 flex-col">
          <header className="copilot-agent-details__header shrink-0 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="copilot-agent-details__avatar grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--brand-light)] text-[var(--brand)]"><Bot className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <div className="copilot-agent-details__eyebrow">{contextSelection.scope === 'message' ? '消息上下文' : '会话上下文'}</div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{workbench.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                    {contextSelection.scope === 'message' && selectedContextMessage ? `来源消息 · ${selectedContextMessage.createdAt.slice(11, 16)}` : `下一步：${contextSummary.nextAction}`}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {contextSelection.scope === 'message' && <button type="button" onClick={() => jumpToMessage(contextSelection.messageId)} title="回到来源消息" aria-label="回到来源消息" className="copilot-details-header-action grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-light)] hover:text-[var(--brand)]"><ArrowUp className="h-4 w-4" /></button>}
                <button type="button" onClick={() => setContextSelection((selection) => ({ ...selection, pinned: !selection.pinned }))} title={contextSelection.pinned ? '取消固定上下文' : '固定当前上下文'} aria-label={contextSelection.pinned ? '取消固定上下文' : '固定当前上下文'} aria-pressed={contextSelection.pinned} className={cn('copilot-details-header-action grid h-8 w-8 place-items-center rounded-lg border bg-[var(--surface-1)] transition-colors', contextSelection.pinned ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]')}><Pin className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={closeContext} title="关闭会话上下文" aria-label="关闭会话上下文" className="copilot-details-header-action grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] transition-colors hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="copilot-agent-details__status-row mt-3 flex flex-wrap items-center gap-2">
              <span className={cn('copilot-agent-details__status-dot', handoffActive || sessionMode === 'execute' ? 'copilot-agent-details__status-dot--warning' : 'copilot-agent-details__status-dot--active')} aria-hidden="true" />
              <Badge tone={handoffActive || sessionMode === 'execute' ? 'warn' : 'brand'} className="text-[10px]">{handoffActive ? '人工接管中' : sessionMode === 'execute' ? '受控执行中' : '研判进行中'}</Badge>
              <span className={cn('copilot-agent-details__risk', riskLevel === 'high' ? 'copilot-agent-details__risk--high' : riskLevel === 'medium' ? 'copilot-agent-details__risk--medium' : 'copilot-agent-details__risk--low')}>
                风险 {riskLevel === 'high' ? '高' : riskLevel === 'medium' ? '中' : '低'}
              </span>
              {handoffActive && <span className="copilot-agent-details__handoff">由 {handoffOwner} 处理后续变更</span>}
            </div>
          </header>
          <div className="copilot-agent-details__body min-h-0 flex-1 overflow-y-auto">
            <nav className="copilot-agent-details__tabs sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg)] px-4" aria-label="会话上下文分区">
              {visibleContextTabs.map(({ tab, label, count }) => (
                <button key={tab} type="button" onClick={() => setContextTab(tab)} aria-current={contextTab === tab ? 'page' : undefined} className={cn('copilot-agent-details__tab shrink-0', contextTab === tab && 'is-active')}>
                  <span>{label}</span>
                  {count !== undefined && <span className="copilot-agent-details__tab-count">{count}</span>}
                </button>
              ))}
            </nav>
            {contextTab === 'admin' && (
              <section className="copilot-agent-details__section copilot-agent-details__section--admin space-y-3 border-b border-[var(--border)] px-4 py-4">
                <div className="copilot-agent-details__section-heading flex items-center gap-1.5"><Settings className="h-3.5 w-3.5 text-[var(--brand)]" />运行控制 <Badge tone="brand" className="ml-auto text-[9px]">管理员</Badge></div>
                <Row label="当前模型" value={<span className="font-mono text-[11px]">{currentModel.label} · {currentModel.tier}</span>} />
                <Row label="启用工具" value={<span className="font-mono text-[11px]">{enabledToolCount}/{availableTools.length}</span>} />
                <label className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-muted)]">执行风险</span><select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as 'low' | 'medium' | 'high')} className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px]"><option value="low">低 · 仅可逆操作</option><option value="medium">中 · 需审批</option><option value="high">高 · 双签与回滚</option></select></label>
                <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => setDebugOpen(true)}><Activity className="h-3.5 w-3.5" />查看调试与链路指标</Button>
              </section>
            )}
            {contextTab !== 'overview' && contextTab !== 'admin' && (
              <ContextDrawerPanel tab={contextTab} messages={contextMessages} onCitation={openCitation} focusedCitation={focusedCitation} />
            )}
            {contextTab === 'overview' && <>
            <ContextOverview summary={contextSummary} sessionMode={sessionMode} riskLevel={riskLevel} handoffActive={handoffActive} onOpenTab={setContextTab} />
            <section className="copilot-agent-details__section border-b border-[var(--border)] px-4 py-4">
              <div className="copilot-details-card space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
                <div className="copilot-details-card__heading"><Bot className="h-3.5 w-3.5 text-[var(--brand)]" />数字员工</div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">分类</span><Badge tone="info">{agentMeta?.category}</Badge></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">SLA</span><span className="text-[var(--success)] font-mono">{agentMeta?.sla}%</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">错误率</span><span className="font-mono">{((agentMeta?.errorRate ?? 0) * 100).toFixed(2)}%</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">知识库</span><span className="font-mono">{agentMeta?.knowledgeBases} 个</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">工具</span><span className="font-mono">{agentMeta?.tools} 个</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">语言</span><span className="font-mono text-[10px]">{agentMeta?.languages?.join(' · ')}</span></div>
                <div className="pt-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">{agentMeta?.description}</div>
              </div>
            </section>

            <section className="copilot-agent-details__section border-b border-[var(--border)] px-4 py-4">
              <div className="copilot-details-card__heading mb-3">
                <Database className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                RAG 检索
                <Badge tone="success" className="ml-auto text-[10px]">实时</Badge>
              </div>
          <div className="space-y-2 text-xs">
            <Row label="召回耗时" value={<span className="font-mono text-[11px]">320ms</span>} />
            <Row label="Top-K" value={<Badge tone="brand" className="text-[10px]">8</Badge>} />
            <Row label="重排模型" value="bge-reranker-large" />
            <Row label="命中率" value={<span className="text-[var(--success)]">92%</span>} />
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-[var(--text-muted)]">上下文 Token</span>
              <span className="font-mono">1.2k / 200k</span>
            </div>
            <div className="h-1.5 bg-[var(--bg-hover)] rounded overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[var(--brand)] to-[var(--purple)]" style={{ width: '0.6%' }} />
            </div>
          </div>
            </section>

            <section className="copilot-agent-details__section border-b border-[var(--border)] px-4 py-4">
              <div className="copilot-details-card__heading mb-3">
                <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                最近引用（带置信度）
              </div>
          <div className="space-y-2">
            {[
              { src: 'Redis Runbook v3.2', source: 'Runbook', page: 12, score: 0.92 },
              { src: 'CMDB PRD-CACHE-019', source: 'CMDB', page: null, score: 0.78 },
              { src: 'INC-019 处理记录', source: 'Runbook', page: 5, score: 0.71 },
              { src: 'CVE-2026-3321', source: 'CVE', page: null, score: 0.65 },
            ].map((c, i) => (
              <button
                key={i}
                onClick={() => openCitation(c)}
                className="copilot-evidence-item block w-full text-left rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 transition-colors hover:border-[var(--brand)] hover:shadow-[var(--shadow-xs)]"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={cn('nav-pill text-[9px]', SOURCE_COLOR[c.source])}>{c.source}</span>
                  <span className="font-mono text-[10px] text-[var(--brand)]">[{i + 1}]</span>
                  <span className="font-semibold text-[11px] truncate flex-1">{c.src}</span>
                  {c.page && <span className="text-[10px] text-[var(--text-muted)]">p.{c.page}</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--text-muted)] shrink-0">置信</span>
                  <div className="flex-1 h-1 bg-[var(--bg-hover)] rounded overflow-hidden">
                    <div
                      className={cn('h-full', c.score >= 0.85 ? 'bg-[var(--success)]' : c.score >= 0.7 ? 'bg-[var(--brand)]' : 'bg-[var(--warning)]')}
                      style={{ width: `${c.score * 100}%` }}
                    />
                  </div>
                  <span className={cn('font-mono', c.score >= 0.85 ? 'text-[var(--success)]' : c.score >= 0.7 ? 'text-[var(--brand)]' : 'text-[var(--warning)]')}>
                    {(c.score * 100).toFixed(0)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
            </section>

            <section className="copilot-agent-details__section border-b border-[var(--border)] px-4 py-4">
              <div className="copilot-details-card__heading mb-3">
                <Wrench className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                工具调用统计
                <Badge tone="brand" className="ml-auto text-[10px]">3</Badge>
              </div>
          <div className="grid grid-cols-2 gap-2">
            <Mini label="成功" value="3" tone="success" />
            <Mini label="失败" value="0" tone="success" />
            <Mini label="平均" value="42ms" />
            <Mini label="缓存" value="32%" tone="success" />
              </div>
            </section>

            <section className="copilot-agent-details__section px-4 py-4">
              <div className="copilot-details-card__heading mb-3">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />活动时间线
              </div>
              <div className="activity-timeline">
            {[
              { tone: 'success' as const, icon: CheckCircle2, text: '故障自愈 完成恢复', time: '14:32' },
              { tone: 'success' as const, icon: ShieldCheck, text: '双签审批通过（王昊 + 李婷）', time: '14:28' },
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
            </>}
          </div>
        </div>
        ) : null}
      </aside>

      {closeoutOpen && currentSession && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onClick={() => setCloseoutOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="closeout-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><div><h2 id="closeout-title" className="text-sm font-semibold">会话结案摘要</h2><p className="mt-1 text-[11px] text-[var(--text-muted)]">将当前研判、证据和待办固化为可追溯记录。</p></div><button type="button" onClick={() => setCloseoutOpen(false)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]"><X className="h-4 w-4" /></button></header>
            <div className="space-y-3 px-5 py-4 text-xs"><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="font-semibold">结论</div><p className="mt-1 leading-relaxed text-[var(--text-secondary)]">已完成 {sessionSignals.executions} 项行动研判，关联 {sessionSignals.evidence} 条证据；{sessionSignals.pendingApprovals ? `仍有 ${sessionSignals.pendingApprovals} 项审批待处理。` : '当前无待审批变更。'}</p></div><div className="grid grid-cols-3 gap-2"><Mini label="行动" value={sessionSignals.executions} /><Mini label="证据" value={sessionSignals.evidence} tone="success" /><Mini label="待办" value={sessionSignals.pendingApprovals} /></div><div className="rounded-lg border border-[var(--border)] p-3"><div className="mb-1 font-semibold">任务回链</div><p className="text-[var(--text-muted)]">受控执行完成后会生成并回链任务；审批中的变更将保留在当前会话直到责任人处理。</p></div></div>
            <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3"><Button size="sm" variant="secondary" onClick={() => setCloseoutOpen(false)}>返回会话</Button><Button size="sm" onClick={() => { setIsClosed(true); setCloseoutOpen(false); }}>确认结案</Button></footer>
          </section>
        </div>
      )}

      {handoffOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onClick={() => setHandoffOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="handoff-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl"><header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><div><h2 id="handoff-title" className="text-sm font-semibold">人工接管</h2><p className="mt-1 text-[11px] text-[var(--text-muted)]">接管后，自动写操作保持暂停，已生成的证据与审批记录不变。</p></div><button type="button" onClick={() => setHandoffOpen(false)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]"><X className="h-4 w-4" /></button></header><div className="space-y-3 px-5 py-4"><label className="block text-xs font-medium">接管人<Input value={handoffOwner} onChange={(event) => setHandoffOwner(event.target.value)} className="mt-1.5" /></label><div className="rounded-md bg-[var(--warning-bg)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-[var(--warning)]" />交接包含当前结论、{sessionSignals.evidence} 条证据与 {sessionSignals.pendingApprovals} 项待审批。</div></div><footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3"><Button size="sm" variant="secondary" onClick={() => setHandoffOpen(false)}>取消</Button><Button size="sm" onClick={() => { setHandoffOpen(false); setHandoffActive(true); setSessionMode('investigate'); }}>确认接管</Button></footer></section>
        </div>
      )}

      <DualSignModal
        open={!!showApproval}
        title="写操作 · 等保 3 双签"
        description="执行 CONFIG SET maxmemory 16GB + volatile-lru"
        onClose={() => setShowApproval(null)}
        onApprove={() => {
          if (showApproval) chat.approveSign(showApproval);
          setShowApproval(null);
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

      {/* ============ 拒绝双签 ============ */}
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
              <X className="h-4 w-4 text-[var(--danger)]" />拒绝双签
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
  return { agent: 'Agent', kb: '知识', task: '任务', tool: '工具', collab: '协作' }[c] ?? c;
}

function MessageWorkCards({ message, onOpenContext }: { message: ChatMessageEx; onOpenContext: (tab: WorkbenchContextTab, messageId?: string) => void }) {
  const taskRef = message.linkedTaskId ?? message.approvalRequest?.ticketId;
  const cards = [
    message.toolCalls?.length ? { key: 'tools', icon: Wrench, title: '工具执行', meta: `${message.toolCalls.length} 项 · ${message.toolCalls.filter((item) => item.status === 'success').length} 成功`, tone: 'brand' as const } : null,
    message.approvalRequest ? { key: 'approval', icon: ShieldCheck, title: '受控审批', meta: `${message.approvalRequest.signed}/${message.approvalRequest.required} 已签 · ${message.approvalRequest.decision === 'approved' ? '已通过' : '待决'}`, tone: message.approvalRequest.decision === 'approved' ? 'success' as const : 'warn' as const } : null,
    message.citations?.length ? { key: 'evidence', icon: Link2, title: '证据依据', meta: `${message.citations.length} 条已引用 · 可追溯`, tone: 'success' as const } : null,
    taskRef ? { key: 'task', icon: ListChecksIcon, title: '关联任务', meta: taskRef, tone: 'brand' as const } : null,
  ].filter(Boolean) as { key: string; icon: typeof Wrench; title: string; meta: string; tone: 'brand' | 'success' | 'warn' }[];
  if (!cards.length) return null;
  return <div className="copilot-message-workcards flex max-w-[920px] flex-wrap gap-2" aria-label="消息关联工作项">{cards.map((card) => {
    const Icon = card.icon;
    const contextTab: WorkbenchContextTab = card.key === 'tools' ? 'audit' : card.key === 'approval' ? 'approvals' : card.key === 'evidence' ? 'evidence' : 'tasks';
    return <button key={card.key} type="button" onClick={() => onOpenContext(contextTab, message.id)} className="copilot-message-workcard flex min-w-[188px] flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-left text-[11px] shadow-sm transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-light)]/20">
      <span className={cn('grid h-6 w-6 place-items-center rounded', card.tone === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : card.tone === 'warn' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : 'bg-[var(--brand-light)] text-[var(--brand)]')}><Icon className="h-3.5 w-3.5" /></span>
      <span className="min-w-0"><span className="block font-semibold text-[var(--text-secondary)]">{card.title}</span><span className="block truncate text-[10px] text-[var(--text-muted)]">{card.meta}</span></span>
    </button>;
  })}</div>;
}

// ============ 消息气泡 ============
function MessageBubble({
  m, expandedThinking, setExpandedThinking, expandedArgs, setExpandedArgs,
  expandedReasoning, setExpandedReasoning, expandedApproval, setExpandedApproval,
  onApprove, onCitation, onRetry, onCopy, onRegenerate, onDelete, onRetryMessage, onFeedback,
  onApproveSigner, onRequestReject,
  hoverMsgId, setHoverMsgId, copiedId, agentName, onOpenContext, selectedContextMessageId, messageRef,
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
  onRegenerate: (mid: string) => void;
  onDelete: (mid: string) => void;
  onRetryMessage: (mid: string) => void;
  onFeedback: (mid: string, kind: FeedbackKind) => void;
  onApproveSigner: (mid: string, idx: number) => void;
  onRequestReject: (mid: string, idx: number) => void;
  hoverMsgId: string | null;
  setHoverMsgId: (v: string | null) => void;
  copiedId: string | null;
  agentName?: string;
  onOpenContext: (tab: WorkbenchContextTab, messageId?: string) => void;
  selectedContextMessageId?: string;
  messageRef?: (element: HTMLDivElement | null) => void;
}) {
  const isUser = m.role === 'user';
  const isTool = m.role === 'tool';
  const isEmpty = !m.content;
  const isStreaming = m.status === 'streaming';
  const agentDisplayName = agentName ?? '故障自愈';

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
            <div className="copilot-message__avatar copilot-message__avatar--assistant grid h-7 w-7 place-items-center rounded-full bg-[var(--brand-light)] text-[var(--brand)]">
              <Bot className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      )}
      <div className={cn('copilot-message__content min-w-0 space-y-3', isUser ? 'max-w-[80%]' : 'w-full max-w-[960px]')}>
        {/* Header row: avatar + name + role + time, compact single line */}
        <div className={cn('copilot-message__meta flex items-center gap-1.5 text-[11px]', isUser && 'justify-end')}>
          {isUser ? (
            <Avatar name="王昊" size={20} />
          ) : null}
          <span className="font-semibold text-[var(--text)]">{m.agentName ?? (isUser ? '王昊' : isTool ? '工具调用' : '故障自愈')}</span>
          {!isUser && m.status && (
            <span className={cn('inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]', isStreaming && 'text-[var(--brand)]')}>
              {isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" aria-hidden="true" />}
              {STATUS_LABEL[m.status]}
            </span>
          )}
          {!isUser && m.metrics?.ttftMs !== undefined && (
            <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums" title="首 token 时间 · 耗时 · 模型">
              TTFT {m.metrics.ttftMs}ms · {m.metrics.durationMs ? `${(m.metrics.durationMs / 1000).toFixed(1)}s` : ''}{m.metrics.model ? ` · ${m.metrics.model}` : ''}
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums" title={m.createdAt}>{m.createdAt.slice(11, 16)}</span>
          {isTool && <Badge tone="warn" className="text-[9px]">工具</Badge>}
          {m.approvalRequest && <Badge tone="error" className="text-[9px]">写操作</Badge>}
        </div>

        <MessageWorkCards message={m} onOpenContext={onOpenContext} />

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

        {m.toolCalls && m.toolCalls.length > 0 && (
          <div className="copilot-message__toolcalls max-w-[920px] space-y-1.5">
            <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Wrench className="h-3 w-3 text-[var(--brand)]" />行动执行 · {m.toolCalls.length} 项
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
                      <Badge tone="warn" className="text-[9px]"><ShieldCheck className="mr-0.5 inline h-2.5 w-2.5" />需双签</Badge>
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

        {m.citations && m.citations.length > 0 && (
          <div className="cite-block max-w-[920px]">
            <div className="cite-block__title">
              <Link2 className="h-3 w-3 text-[var(--brand)]" />
              证据与依据 · {m.citations.length} 项
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
              <ShieldCheck className="h-3.5 w-3.5" />受控变更 · 双签审批
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
                    <Button key={i} size="sm" variant="danger" onClick={() => onApproveSigner(m.id, i)}>
                      <ShieldCheck className="h-3 w-3" />批准（{s.name}）
                    </Button>
                  )
                ))}
                {m.approvalRequest.signers.some((s) => !s.signed) && (
                  <Button size="sm" variant="secondary" onClick={() => {
                    const idx = m.approvalRequest!.signers.findIndex((s) => !s.signed);
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
                <CheckCircle2 className="mr-1 inline h-3 w-3" />已通过双签
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

  if (tab === 'evidence') return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4 text-[var(--brand)]" />{meta.label}</div><div>{meta.hint}</div></div>{focusedCitation && <div className="copilot-citation-focus"><div className="copilot-citation-focus__header"><span><Hash className="mr-1 inline h-3 w-3 text-[var(--brand)]" />当前引用</span><span className="font-mono text-[10px] text-[var(--text-muted)]">{focusedCitation.page ? `p.${focusedCitation.page}` : '可追溯'}</span></div><div className="mt-2 flex items-center gap-2"><span className={cn('nav-pill text-[9px]', SOURCE_COLOR[focusedCitation.source] ?? 'text-[var(--brand)] bg-[var(--brand-light)]')}>{focusedCitation.source ?? focusedCitation.src ?? '来源'}</span><span className="truncate text-xs font-semibold">{focusedCitation.docId ?? focusedCitation.src ?? focusedCitation.source ?? '关联文档'}</span></div><div className="mt-2 flex items-center gap-2 text-[10px]"><span className="text-[var(--text-muted)]">相关度</span><span className="copilot-confidence-bar"><span style={{ width: `${(focusedCitation.score ?? 0) * 100}%` }} /></span><span className="font-mono text-[var(--success)]">{((focusedCitation.score ?? 0) * 100).toFixed(0)}%</span></div><div className="copilot-citation-focus__text">{focusedCitation.text ?? '已定位到该来源。当前引用由会话检索结果生成，可继续回到中栏查看关联消息。'}</div></div>}{evidence.length ? <div className="copilot-details-list">{evidence.map((citation) => <button key={citation.id} type="button" onClick={() => onCitation(citation, citation.__messageId)} className={cn('copilot-context-item copilot-context-item--button', focusedCitation?.id === citation.id && 'is-focused')}><div className="flex min-w-0 items-center gap-2"><span className={cn('nav-pill text-[9px]', SOURCE_COLOR[citation.source] ?? 'text-[var(--brand)] bg-[var(--brand-light)]')}>{citation.source}</span><span className="truncate text-xs font-semibold">{citation.docId || citation.source}</span></div><div className="mt-2 flex items-center gap-2 text-[10px]"><span className="text-[var(--text-muted)]">置信度</span><span className="copilot-confidence-bar"><span style={{ width: `${citation.score * 100}%` }} /></span><span className="font-mono text-[var(--brand)]">{(citation.score * 100).toFixed(0)}%</span><span className="ml-auto text-[var(--text-muted)]">{citation.page ? `p.${citation.page}` : '可追溯'}</span></div></button>)}</div> : empty('证据')}</section>;
  if (tab === 'tasks') return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4 text-[var(--brand)]" />{meta.label}</div><div>{meta.hint}</div></div>{tasks.length ? <div className="copilot-details-list">{tasks.map((task) => <div key={task.id} className="copilot-context-item"><div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-xs font-semibold">{task.title}</span><Badge tone={task.status === 'approved' ? 'success' : 'warn'}>{task.status === 'approved' ? '已通过' : '待处理'}</Badge></div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]"><span>任务 ID</span><span className="font-mono">{task.id}</span></div></div>)}</div> : empty('关联任务')}</section>;
  if (tab === 'approvals') return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4 text-[var(--warning)]" />{meta.label}</div><div>{meta.hint}</div></div>{approvals.length ? <div className="copilot-details-list">{approvals.map(({ id, approval }) => <div key={id} className="copilot-context-item copilot-context-item--approval"><div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold">受控审批</span><Badge tone={approval.decision === 'approved' ? 'success' : approval.decision === 'rejected' ? 'error' : 'warn'}>{approval.decision === 'approved' ? '已通过' : approval.decision === 'rejected' ? '已拒绝' : '待审批'}</Badge></div><p className="mt-2 break-words text-[11px] leading-5 text-[var(--text-secondary)]">{approval.action}</p><div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]"><span>签署进度</span><span className="font-mono">{approval.signed}/{approval.required} 已签</span></div></div>)}</div> : empty('待审批事项')}</section>;
  return <section className="copilot-details-panel"><div className="copilot-details-panel__intro"><div className="copilot-details-panel__title"><PanelIcon className="h-4 w-4 text-[var(--info)]" />{meta.label}</div><div>{meta.hint}</div></div>{audit.length ? <div className="copilot-details-list">{audit.map((item) => <div key={item.id} className="copilot-context-item copilot-context-item--audit"><span className={cn('copilot-audit-dot', item.tone === 'error' ? 'copilot-audit-dot--error' : 'copilot-audit-dot--success')} /><div className="min-w-0"><div className="text-[11px] font-medium text-[var(--text)]">{item.text}</div><div className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{item.time.slice(11, 19)} · {item.id}</div></div></div>)}</div> : empty('审计事件')}</section>;
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
  return <section className="copilot-context-overview border-b border-[var(--border)] px-4 py-4">
    <div className="copilot-context-overview__hero">
      <div className="copilot-context-overview__eyebrow"><span>处置状态</span><Badge tone={statusTone as any} className="text-[10px]">{statusLabel}</Badge></div>
      <div className="mt-2 text-sm font-semibold leading-5 text-[var(--text)]">{summary.nextAction}</div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] pt-3 text-[10px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', riskLevel === 'high' ? 'bg-[var(--danger)]' : riskLevel === 'medium' ? 'bg-[var(--warning)]' : 'bg-[var(--success)]')} />风险 {riskLabel}</span>
        <span>·</span><span>数字员工持续监控</span>
      </div>
    </div>
    <div className="copilot-context-overview__summary-head"><span>治理摘要</span><span>点击查看明细</span></div>
    <div className="copilot-context-overview__stats">
      {cards.filter((card) => card.value > 0).map((card) => { const Icon = card.icon; return <button key={card.tab} type="button" onClick={() => onOpenTab(card.tab)} className="copilot-summary-card group"><span className={cn('copilot-summary-card__icon grid h-7 w-7 place-items-center rounded-lg', card.tone)}><Icon className="h-3.5 w-3.5" /></span><span className="mt-2 flex items-end justify-between gap-2"><span className="text-[10px] text-[var(--text-muted)]">{card.label}</span><span className="font-mono text-base font-semibold text-[var(--text)]">{card.value}</span></span><span className="copilot-summary-card__action">查看明细 <ChevronRight className="h-3 w-3" /></span></button>; })}
    </div>
  </section>;
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
  const color = tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-sm font-mono font-bold', color)}>{value}</div>
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
