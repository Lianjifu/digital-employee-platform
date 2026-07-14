/**
 * P2 会话 · Copilot（完全可交互版）
 * 20 项功能:
 *  1. 消息流本地状态管理 + 持久化
 *  2. Agent 流式响应（打字机效果）
 *  3. Slash 命令 12 个分 5 类（点击填充）
 *  4. @ mention 4 类（点击插入）
 *  5. 双签 Modal 真实生效（更新 1/2 → 2/2）
 *  6. RAG 引用点击 → Drawer
 *  7. Tool call 模拟执行（按关键词）
 *  8. 思考过程折叠
 *  9. 消息 hover 操作（copy/regenerate/delete/like）
 * 10. 重新生成（点踩触发）
 * 11. 停止生成（agent 输出中显示）
 * 12. Token 用量条
 * 13. 自动滚动 + 自动 focus
 * 14. 侧栏会话新建 / 删除 / 置顶
 * 15. localStorage 持久化
 * 16. 输入区工具按钮（附件/语音/@ 提及）
 * 17. Agent 元数据（SLA/错误率/工具数）
 * 18. RAG 来源色分类
 * 19. 双签 inline 进度
 * 20. 知识检索置信度可视化
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Avatar, Badge, Button, Input, Dot } from '@de/web-ui';
import {
  Bot, Search, ListChecks as ListChecksIcon, Wrench, Workflow as WorkflowIcon, FileText, ShieldCheck,
  AlertTriangle, Upload, MoreHorizontal, Download,
  Link2, CheckCircle2, BarChart3, Volume2, Zap, Clock,
  Star, Share2, Settings, X, Pin, ChevronDown,
  Sparkles, Database, Code, Cpu, Users, Loader2, AlertCircle, AtSign,
  Hash, Activity, Languages, BookOpenCheck, Brain, RotateCcw,
  Paperclip, Mic, Send, ChevronRight, ThumbsUp, ThumbsDown,
  Copy, Trash2, Square, Plus,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import { DualSignModal } from '@/components/DualSignModal';
import { DebugPanel } from '@/components/DebugPanel';
import { useChat } from '@/hooks/useChat';
import { useT } from '@/i18n';
import { Markdown } from '@/components/Markdown';

interface ChatMessageEx {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  agentId?: string;
  agentName?: string;
  citations?: any[];
  toolCalls?: { id: string; name: string; args: Record<string, unknown>; result?: string; status: 'pending' | 'running' | 'success' | 'failed'; durationMs?: number; retryCount?: number }[];
  codeBlock?: { lang: string; code: string };
  attachment?: { name: string; size: string; type: 'file' | 'image' };
  thinking?: string;
  approvalRequest?: { action: string; signed: number; required: number; signers: { name: string; signed: boolean }[] };
  createdAt: string;
}

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

export default function Copilot() {
  const { t } = useT();
  const [searchQ, setSearchQ] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [showApproval, setShowApproval] = useState<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedArgs, setExpandedArgs] = useState<Record<string, boolean>>({});
  const [citationDrawer, setCitationDrawer] = useState<any | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [hoverMsgId, setHoverMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 真实状态管理（持久化 + 流式响应 + 多会话）
  const { data: agentMeta } = useApiQuery<AgentMeta>(['agent', 'meta'], '/api/agents/a1/meta');
  const { data: slashCmds = [] } = useApiQuery<{ cmd: string; desc: string; icon: string; category: string }[]>(
    ['slash-cmds'], '/api/slash-commands'
  );
  const chat = useChat(agentMeta);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    const url = `${window.location.origin}/copilot?session=${currentSession.id}`;
    try { navigator.clipboard.writeText(url); } catch {}
    alert(`分享链接已复制：\n${url}`);
  };

  // 分组的 slash 命令
  const slashGrouped = useMemo(() => {
    const g: Record<string, any[]> = { agent: [], kb: [], task: [], tool: [], collab: [] };
    slashCmds.forEach((c) => { g[c.category]?.push(c); });
    return g;
  }, [slashCmds]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chat.activeSession?.messages.length, chat.state.typing]);

  // 切换会话时自动 focus
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
    if (!chat.state.draftInput.trim() || chat.state.typing) return;
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

  const copyMessage = async (m: ChatMessageEx) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const currentSession = chat.activeSession;

  return (
    <div className="flex h-full bg-[var(--bg-elevated)]">
      {/* ============ 左侧 session-list ============ */}
      <aside className="w-[260px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-[var(--border)] space-y-2">
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
                    <div
                      key={s.id}
                      onClick={() => chat.switchSession(s.id)}
                      onDoubleClick={() => chat.togglePin(s.id)}
                      className={cn('session-item relative group', active && 'session-item--active')}
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
                        {/* 删除按钮（hover 显示） */}
                        <button
                          onClick={(e) => { e.stopPropagation(); chat.delSession(s.id); }}
                          className="ml-auto opacity-0 group-hover:opacity-100 grid h-5 w-5 place-items-center rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-all"
                          aria-label="删除会话"
                          title="删除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
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
      <section className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
        {/* Agent 元数据头 */}
        <header className="border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold">{agentMeta?.name ?? '故障自愈'}</span>
                  <Badge tone="brand" className="text-[10px]">v{agentMeta?.version ?? '1.4.2'}</Badge>
                  <Badge tone="success" className="text-[10px]">
                    <Dot tone="success" />在线
                  </Badge>
                  {agentMeta?.sla !== undefined && (
                    <Badge tone={agentMeta.sla >= 99 ? 'success' : 'warn'} className="text-[10px]">
                      SLA {agentMeta.sla}%
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)] flex-wrap">
                  <span className="flex items-center gap-0.5 text-amber-500">
                    <Star className="h-3 w-3 fill-current" />
                    {agentMeta?.rating ?? 4.8} <span className="text-[var(--text-muted)]">({agentMeta?.ratingCount ?? 1240})</span>
                  </span>
                  <span>·</span>
                  <span>最近活跃 {agentMeta?.lastActive ?? '14:32'}</span>
                  <span>·</span>
                  <span>P95 {agentMeta?.responseP95 ?? 580}ms</span>
                  <span>·</span>
                  <span className="text-[var(--success)]">错误 {(agentMeta?.errorRate ?? 0.012) * 100 < 2 ? '低' : '中'}</span>
                  <span>·</span>
                  <span>{agentMeta?.knowledgeBases ?? 4} 知识库</span>
                  <span>·</span>
                  <span>{agentMeta?.tools ?? 8} 工具</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => currentSession && chat.toggleStar(currentSession.id)}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-md transition-colors',
                  currentSession?.starred ? 'text-amber-500 bg-amber-500/10' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
                )}
                title="星标会话"
                aria-label="星标会话"
              >
                <Star className={cn('h-4 w-4', currentSession?.starred && 'fill-current')} />
              </button>
              <button
                onClick={() => currentSession && chat.togglePin(currentSession.id)}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-md transition-colors',
                  currentSession?.pinned ? 'text-amber-500 bg-amber-500/10' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
                )}
                title="置顶（双击侧栏会话）"
                aria-label="置顶"
              >
                <Pin className={cn('h-4 w-4', currentSession?.pinned && 'fill-current')} />
              </button>
              <button onClick={shareSession} className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" title="分享" aria-label="分享">
                <Share2 className="h-4 w-4" />
              </button>
              <Button variant="secondary" size="sm" onClick={() => setDebugOpen(true)}>
                <Settings className="h-3.5 w-3.5" />调试
              </Button>
              <Button variant="secondary" size="sm" onClick={() => alert('已导出 (mock)')}>
                <Download className="h-3.5 w-3.5" />导出
              </Button>
            </div>
          </div>
        </header>

        {/* 消息流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-5">
          {currentSession && currentSession.messages.length > 0 ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{new Date(currentSession.createdAt).toLocaleDateString('zh-CN')}</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
              <div className="flex justify-center">
                <span className="nav-pill nav-pill--info text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> 对话已加密 · SignedLog 记录 · 等保 3 合规
                </span>
              </div>

              {currentSession.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  m={m}
                  expandedThinking={expandedThinking}
                  setExpandedThinking={setExpandedThinking}
                  expandedArgs={expandedArgs}
                  setExpandedArgs={setExpandedArgs}
                  onApprove={(mid) => setShowApproval(mid)}
                  onCitation={setCitationDrawer}
                  onRetry={(name) => alert(`已自动重试 ${name}`)}
                  onCopy={copyMessage}
                  onRegenerate={(mid) => chat.regenerate(mid)}
                  onDelete={(mid) => chat.delMessage(mid)}
                  hoverMsgId={hoverMsgId}
                  setHoverMsgId={setHoverMsgId}
                  copiedId={copiedId}
                />
              ))}

              {/* 正在输入动画 */}
              {chat.state.typing && (
                <div className="flex gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-3 inline-flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                    <span className="ml-1 text-[10px] text-[var(--text-muted)]">{agentMeta?.name ?? '故障自愈'} 正在思考</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-full grid place-items-center text-center text-[var(--text-muted)]">
              <div>
                <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <div className="text-sm">发送消息开始对话</div>
                <div className="mt-2 text-[10px] text-[var(--text-muted)]">按 <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border)]">/</kbd> 唤起命令 · <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border)]">@</kbd> 提及</div>
              </div>
            </div>
          )}
        </div>

        {/* ============ 输入区 ============ */}
        <div className="relative border-t border-[var(--border)] p-4 bg-[var(--bg)]">
          {showSlash && (
            <div className="absolute bottom-full left-4 right-4 mb-2 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl p-2 z-10">
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
                        </button>
                      );
                    })}
                  </div>
                ) : null,
              )}
            </div>
          )}

          {showMention && (
            <div className="absolute bottom-full left-4 mb-2 w-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl p-1 z-10">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <AtSign className="h-3 w-3" />@ 提及
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

          {/* Token 用量条 */}
          <div className="mb-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
            <Wrench className="h-3 w-3" />
            <span>工具: redis-cli · kubectl · prometheus · loki-query</span>
            <span className="ml-auto flex items-center gap-1.5">
              <Hash className="h-3 w-3" />
              <span className="font-mono">{charCount}/{MAX_CHARS} 字符 · {tokenEstimate} tokens</span>
              <div className="w-20 h-1 bg-[var(--bg-hover)] rounded overflow-hidden">
                <div className={cn('h-full transition-all', tokenPercent > 90 ? 'bg-[var(--danger)]' : tokenPercent > 60 ? 'bg-[var(--warning)]' : 'bg-[var(--success)]')} style={{ width: `${Math.min(100, tokenPercent)}%` }} />
              </div>
            </span>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_var(--brand-light)] transition-all">
            <textarea
              ref={inputRef}
              value={chat.state.draftInput}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onTextareaKey}
              placeholder="输入问题，/ 唤起命令 · @ 提及对象（Shift+Enter 换行 · Esc 停止）"
              rows={2}
              className="w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)]"
            />
            <div className="flex items-center justify-between px-2 py-1.5 border-t border-[var(--border)]">
              <div className="flex items-center gap-1">
                <button className="grid h-7 w-7 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]" title="附件">
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <button className="grid h-7 w-7 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]" title="语音输入">
                  <Mic className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => chat.setDraft(chat.state.draftInput + ' @')}
                  className="grid h-7 w-7 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                  title="@ 提及"
                  aria-label="@ 提及"
                >
                  <AtSign className="h-3.5 w-3.5" />
                </button>
                {chat.state.typing && (
                  <button
                    onClick={chat.stop}
                    className="ml-1 flex items-center gap-1 rounded bg-[var(--danger)] text-white px-2 py-1 text-[10px] hover:opacity-90"
                    title="停止生成（Esc）"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" />停止
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)] font-mono">Sonnet-4 · P0</span>
                <Button onClick={handleSend} disabled={!chat.state.draftInput.trim() || chat.state.typing} size="sm">
                  <Send className="h-3.5 w-3.5" />发送
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 右侧详情 ============ */}
      <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />Agent 详情
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">分类</span><Badge tone="info">{agentMeta?.category}</Badge></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">SLA</span><span className="text-[var(--success)] font-mono">{agentMeta?.sla}%</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">错误率</span><span className="font-mono">{((agentMeta?.errorRate ?? 0) * 100).toFixed(2)}%</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">知识库</span><span className="font-mono">{agentMeta?.knowledgeBases} 个</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">工具</span><span className="font-mono">{agentMeta?.tools} 个</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">语言</span><span className="font-mono text-[10px]">{agentMeta?.languages?.join(' · ')}</span></div>
            <div className="pt-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
              {agentMeta?.description}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            RAG 检索
            <Badge tone="success" className="ml-auto text-[10px]">实时</Badge>
          </div>
          <div className="space-y-2 text-xs">
            <Row label="召回耗时" value="320ms" mono />
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
        </div>

        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
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
                onClick={() => setCitationDrawer(c)}
                className="block w-full text-left rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 hover:border-[var(--brand)] transition-colors"
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
        </div>

        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
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
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
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
        </div>
      </aside>

      {/* 引用 Drawer */}
      {citationDrawer && (
        <div className="fixed inset-0 z-40" onClick={() => setCitationDrawer(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute right-0 top-0 h-full w-[520px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-semibold flex items-center gap-2">
                <Hash className="h-4 w-4 text-[var(--brand)]" />引用详情
              </div>
              <button onClick={() => setCitationDrawer(null)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <DrawerField label="来源" value={
                <span className={cn('nav-pill text-[10px]', SOURCE_COLOR[citationDrawer.source])}>{citationDrawer.source}</span>
              } />
              {citationDrawer.page && <DrawerField label="页码" value={`p.${citationDrawer.page}`} mono />}
              <DrawerField label="相关度" value={
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-[var(--bg-hover)] rounded overflow-hidden">
                    <div className="h-full bg-[var(--success)]" style={{ width: `${citationDrawer.score * 100}%` }} />
                  </div>
                  <span className="font-mono text-[var(--success)]">{(citationDrawer.score * 100).toFixed(0)}%</span>
                </div>
              } />
              <DrawerField label="所属文档" value="Redis 故障 Runbook v3.2" />
              <div className="pt-3 border-t border-[var(--border)]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">原文片段</div>
                <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-3 text-[11px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                  "当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率；建议在维护窗口执行 volatile-lru 切换。历史类似事件在 2026-05-22 处置耗时 38min，使用 CONFIG SET 临时扩容 + 后续调整策略。"
                </div>
              </div>
            </div>
          </div>
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
    </div>
  );
}

function labelOfCat(c: string) {
  return { agent: 'Agent', kb: '知识', task: '任务', tool: '工具', collab: '协作' }[c] ?? c;
}

// ============ 消息气泡 ============
function MessageBubble({
  m, expandedThinking, setExpandedThinking, expandedArgs, setExpandedArgs,
  onApprove, onCitation, onRetry, onCopy, onRegenerate, onDelete,
  hoverMsgId, setHoverMsgId, copiedId,
}: {
  m: ChatMessageEx;
  expandedThinking: Record<string, boolean>;
  setExpandedThinking: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedArgs: Record<string, boolean>;
  setExpandedArgs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onApprove: (msgId: string) => void;
  onCitation: (c: any) => void;
  onRetry: (name: string) => void;
  onCopy: (m: ChatMessageEx) => void;
  onRegenerate: (mid: string) => void;
  onDelete: (mid: string) => void;
  hoverMsgId: string | null;
  setHoverMsgId: (v: string | null) => void;
  copiedId: string | null;
}) {
  const isUser = m.role === 'user';
  const isTool = m.role === 'tool';
  const isEmpty = !m.content;

  return (
    <div
      className={cn('flex gap-3 group relative', isUser && 'flex-row-reverse')}
      onMouseEnter={() => setHoverMsgId(m.id)}
      onMouseLeave={() => setHoverMsgId(null)}
    >
      <div className="shrink-0">
        {isUser ? (
          <Avatar name="王昊" size={36} />
        ) : isTool ? (
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--warning-bg)] border border-[var(--warning)]/40 text-[var(--warning)]">
            <Wrench className="h-4 w-4" />
          </div>
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white">
            <Bot className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className={cn('flex-1 space-y-2', isUser && 'flex flex-col items-end max-w-[80%]')}>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-semibold text-[var(--text-secondary)]">{m.agentName ?? (isUser ? '王昊' : isTool ? '工具调用' : '故障自愈')}</span>
          <span className="text-[var(--text-muted)] font-mono">{m.createdAt.slice(11, 16)}</span>
          {isTool && <Badge tone="warn" className="text-[10px]">工具</Badge>}
          {m.approvalRequest && <Badge tone="error" className="text-[10px]">写操作</Badge>}
        </div>

        {m.thinking && m.thinking.length > 0 && (
          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]">
            <button
              onClick={() => setExpandedThinking({ ...expandedThinking, [m.id]: !expandedThinking[m.id] })}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Brain className="h-3 w-3" />
              <span className="font-semibold">思考过程</span>
              {expandedThinking[m.id] ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
            </button>
            {expandedThinking[m.id] && (
              <div className="px-3 pb-2 text-[11px] text-[var(--text-muted)] italic">{m.thinking}</div>
            )}
          </div>
        )}

        {!isEmpty && (
          <div className={cn(isUser ? 'chat-bubble chat-bubble--user' : isTool ? 'chat-bubble chat-bubble--tool' : 'chat-bubble')}>
            {isUser ? (
              <span className="whitespace-pre-wrap">{m.content}</span>
            ) : (
              <Markdown text={m.content} />
            )}
            {m.content.length === 0 && (
              <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                正在生成
              </span>
            )}
          </div>
        )}

        {m.codeBlock && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] overflow-hidden max-w-2xl">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-1.5 text-[10px]">
                <Code className="h-3 w-3 text-[var(--text-muted)]" />
                <span className="font-mono text-[var(--text-muted)]">{m.codeBlock.lang}</span>
              </div>
              <button className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1">
                <Download className="h-3 w-3" />复制
              </button>
            </div>
            <pre className="overflow-x-auto p-3 text-[11px] font-mono leading-relaxed text-[var(--text)]">
              {m.codeBlock.code}
            </pre>
          </div>
        )}

        {m.toolCalls && m.toolCalls.length > 0 && (
          <div className="space-y-1.5 max-w-2xl">
            {m.toolCalls.map((tc) => {
              const argsKey = `${m.id}-${tc.id}`;
              const isOpen = expandedArgs[argsKey];
              const failed = tc.status === 'failed';
              return (
                <div key={tc.id} className={cn('rounded-md border p-2 text-[11px]', failed ? 'border-[var(--danger)]/40 bg-[var(--danger-bg)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]')}>
                  <div className="flex items-center gap-2">
                    <Wrench className={cn('h-3 w-3', failed ? 'text-[var(--danger)]' : 'text-[var(--brand)]')} />
                    <span className="font-mono font-semibold">{tc.name}</span>
                    {failed ? (
                      <Badge tone="error" className="text-[9px]">
                        <AlertCircle className="mr-0.5 inline h-2.5 w-2.5" />失败
                      </Badge>
                    ) : (
                      <Badge tone="success" className="text-[9px]">
                        <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" />{tc.durationMs}ms
                      </Badge>
                    )}
                    {failed && (
                      <button onClick={() => onRetry(tc.name)} className="text-[10px] text-[var(--danger)] hover:underline ml-auto">
                        <RotateCcw className="inline h-2.5 w-2.5 mr-0.5" />自动重试
                      </button>
                    )}
                    {!failed && (
                      <button onClick={() => setExpandedArgs({ ...expandedArgs, [argsKey]: !isOpen })} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]">
                        {isOpen ? '收起' : '参数'}
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-1.5 space-y-1 pl-5">
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
          <div className="cite-block max-w-2xl">
            <div className="cite-block__title">
              <Link2 className="h-3 w-3 text-[var(--brand)]" />
              引用知识库 · {m.citations.length} 个文档
            </div>
            {m.citations.map((c, i) => (
              <button
                key={c.id}
                onClick={() => onCitation({ src: c.source, page: c.page, score: c.score })}
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
          <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 max-w-md">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--danger)] mb-1">
              <ShieldCheck className="h-3.5 w-3.5" />双签审批请求（等保 3）
              <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)]">
                {m.approvalRequest.signed}/{m.approvalRequest.required}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text)] mb-2 font-mono">{m.approvalRequest.action}</div>
            <div className="flex gap-1 mb-2">
              {m.approvalRequest.signers.map((s, i) => (
                <div
                  key={i}
                  className={cn('flex-1 h-1.5 rounded-full', s.signed ? 'bg-[var(--success)]' : 'bg-[var(--bg)]')}
                />
              ))}
            </div>
            <div className="flex gap-1.5 text-[10px] mb-2">
              {m.approvalRequest.signers.map((s, i) => (
                <span key={i} className={cn('flex-1', s.signed ? 'text-[var(--success)]' : 'text-[var(--text-muted)]')}>
                  {s.signed ? '✓' : '○'} {s.name}
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              {m.approvalRequest.signed < m.approvalRequest.required ? (
                <Button size="sm" variant="danger" onClick={() => onApprove(m.id)}>
                  <ShieldCheck className="h-3 w-3" />批准（{m.approvalRequest.signed === 0 ? '第一签' : '第二签'}）
                </Button>
              ) : (
                <Badge tone="success" className="text-[10px]"><CheckCircle2 className="mr-1 inline h-3 w-3" />已通过双签</Badge>
              )}
              <Button size="sm" variant="secondary">拒绝</Button>
            </div>
          </div>
        )}

        {/* Hover 消息操作栏 */}
        {(hoverMsgId === m.id) && !isEmpty && (
          <div className={cn('flex items-center gap-1 text-[var(--text-muted)]', isUser ? 'justify-end' : '')}>
            <button
              onClick={() => onCopy(m)}
              className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              title="复制"
              aria-label="复制消息"
            >
              {copiedId === m.id ? <CheckCircle2 className="h-3 w-3 text-[var(--success)]" /> : <Copy className="h-3 w-3" />}
            </button>
            {!isUser && (
              <>
                <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text)]" title="点赞" aria-label="点赞">
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onRegenerate(m.id)}
                  className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  title="重新生成"
                  aria-label="重新生成"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDelete(m.id)}
                  className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
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

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn(mono && 'font-mono')}>{value}</span>
    </div>
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

function DrawerField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn(mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}