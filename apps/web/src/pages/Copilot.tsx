/**
 * P2 会话 · Copilot（企业级优化版）
 * Todo 1-10:
 *  1. 左侧 session-list：搜索过滤 + 时间分组（今天/昨天/本周）
 *  2. 顶部 Agent 元数据：版本/最后活跃/评分 + 操作（收藏/分享/调试）
 *  3. 消息气泡：代码高亮 + 文件附件卡片 + 思考折叠
 *  4. tool call 块：参数可折叠 + 时间轴
 *  5. RAG 引用：可点击展开（drawer）
 *  6. 写动作：双签审批集成
 *  7. 输入区：附件 + 语音 + 字符计数 + slash 命令
 *  8. 右侧 RAG：实时检索 + token 饼图
 *  9. 工具调用统计：成功率 + 缓存命中
 * 10. slash 命令面板
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Avatar, Badge, Button, Input, Dot } from '@de/web-ui';
import {
  Bot, User as UserIcon, Send, Paperclip, Mic, Wrench, FileText, ShieldCheck,
  AlertTriangle, Search, Upload, MoreHorizontal, Download,
  Link2, CheckCircle2, BarChart3, Volume2, Zap, Clock,
  Star, Share2, Settings, X, Pin, ChevronDown, ChevronRight,
  Sparkles, Database, FileCode2, Image as ImageIcon,
  Cpu, Brain, ListChecks, Workflow, MessageSquare, BookOpen, StopCircle, Pencil,
} from 'lucide-react';
import { cn, relativeTime, formatBytes } from '@de/web-utils';
import { DualSignModal } from '@/components/DualSignModal';
import type { Conversation } from '@de/web-types';

interface ChatMessageEx {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  agentId?: string;
  agentName?: string;
  citations?: any[];
  toolCalls?: { id: string; name: string; args: Record<string, unknown>; result?: string; status: 'pending' | 'running' | 'success' | 'failed'; durationMs?: number }[];
  codeBlock?: { lang: string; code: string };
  attachment?: { name: string; size: string; type: 'file' | 'image' };
  thinking?: string;
  approvalRequest?: { action: string; status: 'pending' | 'approved' | 'rejected' };
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
}

interface AgentMeta {
  id: string; name: string; version: string; category: string;
  rating: number; ratingCount: number; lastActive: string;
  installCount: number; responseP95: number; totalTokens: number;
  description: string;
}

// Slash 命令图标映射
const SLASH_ICON: Record<string, any> = {
  Bot, Search, ListChecks, Wrench, Workflow, Brain, Sparkles,
};

export default function Copilot() {
  const [sessionId, setSessionId] = useState('s1');
  const [input, setInput] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [showApproval, setShowApproval] = useState<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedArgs, setExpandedArgs] = useState<Record<string, boolean>>({});
  const [citationDrawer, setCitationDrawer] = useState<any | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [starred, setStarred] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 会话按时间分组
  const { data: sessions = [] } = useApiQuery<SessionItem[]>(['sessions'], '/api/sessions');
  const filteredSessions = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return sessions.filter((s) => !q || s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q));
  }, [sessions, searchQ]);
  const grouped = {
    pinned: filteredSessions.filter((s) => s.pinned),
    today: filteredSessions.filter((s) => !s.pinned && s.group === 'today'),
    yesterday: filteredSessions.filter((s) => !s.pinned && s.group === 'yesterday'),
    week: filteredSessions.filter((s) => !s.pinned && s.group === 'week'),
  };

  // Agent 元数据
  const { data: agentMeta } = useApiQuery<AgentMeta>(['agent', 'meta'], '/api/agents/a1/meta');
  // 当前会话消息
  const { data: conv } = useApiQuery<{ agent: AgentMeta; messages: ChatMessageEx[] }>(
    ['conv', sessionId, 'ex'], `/api/conversations/${sessionId}/ex`
  );

  // Slash 命令
  const { data: slashCmds = [] } = useApiQuery<{ cmd: string; desc: string; icon: string }[]>(
    ['slash-cmds'], '/api/slash-commands'
  );

  // 工具调用统计（来自当前会话）
  const toolStats = useMemo(() => {
    if (!conv) return { total: 0, success: 0, failed: 0, avgMs: 0 };
    const calls = conv.messages.flatMap((m) => m.toolCalls ?? []);
    const success = calls.filter((c) => c.status === 'success').length;
    const failed = calls.filter((c) => c.status === 'failed').length;
    const total = calls.length;
    const avgMs = total > 0 ? Math.round(calls.reduce((s, c) => s + (c.durationMs ?? 0), 0) / total) : 0;
    return { total, success, failed, avgMs };
  }, [conv]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conv?.messages.length, sessionId]);

  const charCount = input.length;
  const MAX_CHARS = 4000;

  const onSend = () => {
    if (!input.trim()) return;
    setInput('');
    setShowSlash(false);
  };

  const onInputChange = (v: string) => {
    setInput(v);
    // 检测 / 触发 slash 命令面板
    if (v === '/') setShowSlash(true);
    else if (showSlash && !v.startsWith('/')) setShowSlash(false);
    else if (v.startsWith('/') && v.length > 1 && !v.includes(' ')) setShowSlash(true);
    else setShowSlash(false);
  };

  const approve = (msgId: string) => {
    setShowApproval(null);
    alert('双签通过 (mock)');
  };

  return (
    <div className="flex h-full bg-[var(--bg-elevated)]">
      {/* ============ Todo 1: 左侧 session-list（搜索 + 时间分组）============ */}
      <aside className="w-[260px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-[var(--border)] space-y-2">
          <Button size="sm" className="w-full">
            <Pencil className="h-3.5 w-3.5" />新会话
          </Button>
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
              <div key={g} className="mb-3">
                <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  {g === 'pinned' && <Pin className="h-3 w-3" />}
                  {g === 'today' ? '今天' : g === 'yesterday' ? '昨天' : g === 'week' ? '本周' : '置顶'}
                </div>
                {grouped[g].map((s) => {
                  const active = s.id === sessionId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSessionId(s.id)}
                      className={cn('session-item', active && 'session-item--active')}
                    >
                      <div className="flex items-center justify-between">
                        <div className="session-item__title">
                          {s.pinned && <Pin className="h-3 w-3 shrink-0 text-[var(--brand)]" />}
                          <span className="truncate">{s.title}</span>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">{s.time}</span>
                      </div>
                      <div className="session-item__preview">{s.preview}</div>
                      <div className="session-item__meta">
                        <span className="nav-pill text-[10px] !py-0.5">{s.agent}</span>
                        <Badge tone={s.status === 'active' ? 'brand' : 'success'} className="text-[10px]">
                          {s.status === 'active' ? '进行中' : '已完成'}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </aside>

      {/* ============ 中间对话 ============ */}
      <section className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
        {/* Todo 2: Agent 元数据头 */}
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">{agentMeta?.name ?? '故障自愈'}</span>
                <Badge tone="brand" className="text-[10px]">v{agentMeta?.version ?? '1.4.2'}</Badge>
                <Badge tone="success" className="text-[10px]">
                  <Dot tone="success" />在线
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-0.5 text-amber-500">
                  <Star className="h-3 w-3 fill-current" />
                  {agentMeta?.rating ?? 4.8} <span className="text-[var(--text-muted)]">({agentMeta?.ratingCount ?? 1240})</span>
                </span>
                <span>·</span>
                <span>最近活跃 {agentMeta?.lastActive ?? '14:32'}</span>
                <span>·</span>
                <span>P95 {agentMeta?.responseP95 ?? 580}ms</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setStarred(!starred)}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-md transition-colors',
                starred ? 'text-amber-500 bg-amber-500/10' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
              )}
              title="收藏"
            >
              <Star className={cn('h-4 w-4', starred && 'fill-current')} />
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" title="分享">
              <Share2 className="h-4 w-4" />
            </button>
            <Button variant="secondary" size="sm">
              <Settings className="h-3.5 w-3.5" />调试
            </Button>
            <Button variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" />导出
            </Button>
          </div>
        </header>

        {/* 消息流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 日期分隔 + 安全提示 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[10px] text-[var(--text-muted)] font-mono">2026年7月13日</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="flex justify-center">
            <span className="nav-pill nav-pill--info text-[10px]">
              <ShieldCheck className="h-3 w-3" /> 对话已加密 · SignedLog 记录 · 等保 3 合规
            </span>
          </div>

          {(conv?.messages ?? []).map((m) => (
            <MessageBubble
              key={m.id}
              m={m}
              expandedThinking={expandedThinking}
              setExpandedThinking={setExpandedThinking}
              expandedArgs={expandedArgs}
              setExpandedArgs={setExpandedArgs}
              onApprove={(msgId) => setShowApproval(msgId)}
              onCitation={setCitationDrawer}
            />
          ))}
        </div>

        {/* ============ Todo 7: 输入区（附件 + 语音 + 字符 + slash 命令）============ */}
        <div className="relative border-t border-[var(--border)] p-4 bg-[var(--bg)]">
          {/* Todo 10: Slash 命令面板 */}
          {showSlash && (
            <div className="absolute bottom-full left-4 right-4 mb-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl p-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />Slash 命令
              </div>
              {slashCmds.map((c) => {
                const Icon = SLASH_ICON[c.icon] ?? Sparkles;
                return (
                  <button
                    key={c.cmd}
                    onClick={() => { setInput(c.cmd + ' '); setShowSlash(false); }}
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
          )}

          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <Wrench className="h-3 w-3" />
            <span>工具: redis-cli · kubectl · prometheus · loki-query</span>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_var(--brand-light)] transition-all">
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="输入问题，/ 唤起命令面板 (Shift+Enter 换行)"
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
                <span className={cn('ml-2 text-[10px] font-mono', charCount > MAX_CHARS * 0.9 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]')}>
                  {charCount} / {MAX_CHARS}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)] font-mono">Sonnet-4 · P0</span>
                <Button onClick={onSend} disabled={!input.trim()} size="sm">
                  <Send className="h-3.5 w-3.5" />发送
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Todo 8 + 9: 右侧详情（实时检索 + token 饼图 + 工具统计）============ */}
      <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        {/* Agent 详情 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />Agent 详情
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">分类</span><Badge tone="info">{agentMeta?.category}</Badge></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">版本</span><span className="font-mono">v{agentMeta?.version}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">安装数</span><span className="font-mono">{agentMeta?.installCount.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">累计 Token</span><span className="font-mono">{(agentMeta?.totalTokens ?? 0).toLocaleString()}</span></div>
            <div className="pt-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
              {agentMeta?.description}
            </div>
          </div>
        </div>

        {/* Todo 8: RAG 实时检索 + Token 用量 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-2">
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
          {/* Token 用量 */}
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

        {/* Todo 9: 工具调用统计 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            工具调用统计
            <Badge tone="brand" className="ml-auto text-[10px]">{toolStats.total}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Mini label="成功" value={toolStats.success} tone="success" />
            <Mini label="失败" value={toolStats.failed} tone={toolStats.failed > 0 ? 'error' : 'neutral'} />
            <Mini label="平均" value={`${toolStats.avgMs}ms`} />
            <Mini label="缓存命中" value="32%" tone="success" />
          </div>
          {/* 缓存命中进度 */}
          <div className="mt-2 h-1.5 bg-[var(--bg-hover)] rounded overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[var(--success)] to-[var(--brand)]" style={{ width: '32%' }} />
          </div>
        </div>

        {/* 最近引用 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            最近引用
          </div>
          <div className="space-y-1.5">
            {[
              { src: 'Redis Runbook v3.2', page: 12, score: 0.92 },
              { src: 'CMDB PRD-CACHE-019', page: null, score: 0.78 },
              { src: 'INC-019 处理记录', page: 5, score: 0.71 },
            ].map((c, i) => (
              <button
                key={i}
                onClick={() => setCitationDrawer(c)}
                className="w-full text-left rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 hover:border-[var(--brand)] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="font-mono text-[var(--brand)]">[{i + 1}]</span>
                  <span className="font-semibold truncate flex-1">{c.src}</span>
                  <span className="text-[var(--success)]">{(c.score * 100).toFixed(0)}%</span>
                </div>
                {c.page && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">p.{c.page}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* 活动时间线 */}
        <div className="px-5 py-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />活动时间线
          </div>
          <div className="activity-timeline">
            {[
              { tone: 'success' as const, icon: CheckCircle2, text: '故障自愈 完成恢复', time: '14:32' },
              { tone: 'success' as const, icon: ShieldCheck, text: '双签审批通过', time: '14:28' },
              { tone: 'info' as const, icon: Search, text: '检索 2 个 Runbook', time: '14:25' },
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

      {/* ============ Todo 5: 引用详情 Drawer ============ */}
      {citationDrawer && (
        <div className="fixed inset-0 z-40" onClick={() => setCitationDrawer(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute right-0 top-0 h-full w-[480px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--text-muted)]" />
                引用详情
              </div>
              <button onClick={() => setCitationDrawer(null)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">来源</span>
                <span className="font-semibold">{citationDrawer.src}</span>
              </div>
              {citationDrawer.page && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">页码</span>
                  <span className="font-mono">p.{citationDrawer.page}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">相关度</span>
                <Badge tone="success">{(citationDrawer.score * 100).toFixed(0)}%</Badge>
              </div>
              <div className="pt-3 border-t border-[var(--border)]">
                <div className="text-xs text-[var(--text-muted)] mb-2">原文片段</div>
                <div className="text-xs leading-relaxed text-[var(--text)]">
                  "当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率；建议在维护窗口执行 volatile-lru 切换。历史类似事件在 2026-05-22 处置耗时 38min，使用 CONFIG SET 临时扩容 + 后续调整策略。"
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1">
                <Download className="h-3.5 w-3.5" />下载文档
              </Button>
              <Button size="sm" className="flex-1">查看完整文档</Button>
            </div>
          </div>
        </div>
      )}

      {/* Todo 6: 双签审批 */}
      <DualSignModal
        open={!!showApproval}
        title="写操作 · 等保 3 双签"
        description="执行 CONFIG SET maxmemory 16GB + volatile-lru"
        onClose={() => setShowApproval(null)}
        onApprove={() => approve(showApproval!)}
      />
    </div>
  );
}

// ============ 子组件 ============

function MessageBubble({
  m, expandedThinking, setExpandedThinking, expandedArgs, setExpandedArgs,
  onApprove, onCitation,
}: {
  m: ChatMessageEx;
  expandedThinking: Record<string, boolean>;
  setExpandedThinking: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedArgs: Record<string, boolean>;
  setExpandedArgs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onApprove: (msgId: string) => void;
  onCitation: (c: any) => void;
}) {
  const isUser = m.role === 'user';
  const isTool = m.role === 'tool';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
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
        {/* 头部 */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-semibold text-[var(--text-secondary)]">
            {m.agentName ?? (isUser ? '王昊' : isTool ? '工具调用' : '故障自愈')}
          </span>
          <span className="text-[var(--text-muted)] font-mono">{m.createdAt.slice(11, 16)}</span>
          {isTool && <Badge tone="warn" className="text-[10px]">工具</Badge>}
          {m.approvalRequest && <Badge tone="error" className="text-[10px]">写动作</Badge>}
        </div>

        {/* Todo 3: 思考过程（折叠） */}
        {!isUser && m.thinking && (
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

        {/* 主消息气泡 */}
        {m.content && (
          <div className={cn(isUser ? 'chat-bubble chat-bubble--user' : isTool ? 'chat-bubble chat-bubble--tool' : 'chat-bubble')}>
            {m.content}
          </div>
        )}

        {/* Todo 3: 文件附件 */}
        {m.attachment && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2.5 flex items-center gap-2.5 max-w-md">
            <div className={cn(
              'grid h-10 w-10 place-items-center rounded-md shrink-0',
              m.attachment.type === 'image' ? 'bg-[var(--info-bg)] text-[var(--info)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
            )}>
              {m.attachment.type === 'image' ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{m.attachment.name}</div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono">{m.attachment.size}</div>
            </div>
            <button className="text-[var(--text-muted)] hover:text-[var(--text)]">
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Todo 3: 代码块 */}
        {m.codeBlock && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] overflow-hidden max-w-2xl">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-1.5 text-[10px]">
                <FileCode2 className="h-3 w-3 text-[var(--text-muted)]" />
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

        {/* Todo 4: Tool Call 块（参数可折叠） */}
        {m.toolCalls && m.toolCalls.length > 0 && (
          <div className="space-y-1.5 max-w-2xl">
            {m.toolCalls.map((tc) => {
              const argsKey = `${m.id}-${tc.id}`;
              const isOpen = expandedArgs[argsKey];
              return (
                <div key={tc.id} className="tool-call flex-col items-stretch gap-1.5 !p-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3 w-3 text-[var(--brand)] shrink-0" />
                    <span className="tool-call__name">{tc.name}</span>
                    <Badge tone="success" className="text-[10px]">
                      <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" />{tc.durationMs}ms
                    </Badge>
                    <button
                      onClick={() => setExpandedArgs({ ...expandedArgs, [argsKey]: !isOpen })}
                      className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1"
                    >
                      {isOpen ? '收起' : '参数'}
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="space-y-1 pl-5">
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

        {/* Todo 5: RAG 引用（可点击展开 drawer） */}
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
                <span className="text-[var(--brand)]">[{i + 1}]</span> {c.source}
                {c.page && <span className="text-[var(--text-muted)]"> · p.{c.page}</span>}
                <span className="text-[var(--success)] ml-2">{(c.score * 100).toFixed(0)}%</span>
              </button>
            ))}
          </div>
        )}

        {/* Todo 6: 双签审批请求 */}
        {m.approvalRequest && (
          <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 max-w-md">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--danger)] mb-1">
              <ShieldCheck className="h-3.5 w-3.5" />双签审批请求（等保 3）
            </div>
            <div className="text-[11px] text-[var(--text)] mb-2 font-mono">{m.approvalRequest.action}</div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="danger" onClick={() => onApprove(m.id)}>
                <ShieldCheck className="h-3.5 w-3.5" />批准（双签）
              </Button>
              <Button size="sm" variant="secondary">拒绝</Button>
            </div>
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

function Mini({ label, value, tone }: { label: string; value: any; tone?: 'success' | 'error' | 'neutral' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-sm font-mono font-bold', color)}>{value}</div>
    </div>
  );
}