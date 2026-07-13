/**
 * P2 会话 · Copilot
 * 1:1 对齐 docs/01-product/mockups/p2-chat.html
 */
import { useState, useRef, useEffect } from 'react';
import { useApiQuery } from '@/services/query';
import { Avatar, Badge, Button, Input, Dot } from '@de/web-ui';
import {
  Bot, User as UserIcon, Send, Paperclip, Wrench, FileText, ShieldCheck, StopCircle,
  AlertTriangle, GraduationCap, Shield, Search, Upload, MoreHorizontal, Download,
  Link2, CheckCircle2, BarChart3, Volume2, Zap, X, Clock,
} from 'lucide-react';
import { cn, relativeTime } from '@de/web-utils';
import type { Agent, Conversation } from '@de/web-types';

// ============ 会话列表（左侧）============
const SESSIONS = [
  { id: 's1', title: 'Redis OOM 处理', icon: AlertTriangle, iconColor: 'var(--danger)', time: '14:28', preview: '需要，关联到 INC-019', agent: '故障自愈', status: 'P0', statusTone: 'error' as const },
  { id: 's2', title: '合规审计报告', icon: Shield, iconColor: 'var(--purple)', time: '今天 11:20', preview: '生成本月安全合规审计报告', agent: '合规审计', status: '已完成', statusTone: 'success' as const },
  { id: 's3', title: '客户问题解答', icon: GraduationCap, iconColor: 'var(--info)', time: '昨天 16:45', preview: '关于产品定价的咨询', agent: '客户支持', status: '已完成', statusTone: 'success' as const },
  { id: 's4', title: '漏洞修复建议', icon: Shield, iconColor: 'var(--warning)', time: '昨天 14:30', preview: '检测到 Log4j 漏洞，请确认修复方案', agent: '漏洞修复', status: '待确认', statusTone: 'warn' as const },
  { id: 's5', title: '容量预测分析', icon: BarChart3, iconColor: 'var(--brand)', time: '7月12日', preview: '下季度服务器容量需求预测', agent: '容量预测', status: '分析中', statusTone: 'info' as const },
];

// ============ 状态更新列表（agent 消息内的多步反馈）============
const STATUS_UPDATES = [
  { icon: CheckCircle2, tone: 'success' as const, text: '已完成 volatile-lru 策略切换' },
  { icon: BarChart3, tone: 'info' as const, text: 'OOM 频率从 5 次/小时 下降到 0 次' },
  { icon: Clock, tone: 'warning' as const, text: '预计扩容 +20% 将在下个维护窗口执行' },
];

// ============ 引用知识库 ============
const CITATIONS = [
  { idx: 1, text: 'Runbook-cache-oom §3.1', meta: 'v3.2，2026-05-15' },
  { idx: 2, text: 'INC-019 历史处理记录', meta: '2026-05-22' },
];

// ============ 工具调用记录 ============
const TOOL_CALLS = [
  { name: 'execute_k8s_resource', args: '{action: "patch-configmap", target: "redis-config"}', status: 'success' as const, ms: 240 },
  { name: 'redis-cli CONFIG SET', args: '{maxmemory-policy: "volatile-lru"}', status: 'success' as const, ms: 120 },
  { name: 'prometheus_query', args: '{query: "rate(redis_oom[5m])"}', status: 'success' as const, ms: 380 },
];

// ============ 时间线（右侧）============
const ACTIVITIES = [
  { icon: CheckCircle2, dot: 'success' as const, text: '故障自愈 完成 Runbook 执行', time: '14:27' },
  { icon: ShieldCheck, dot: 'success' as const, text: '双签审批通过（王昊 + 张三）', time: '14:26' },
  { icon: Search, dot: 'info' as const, text: '检索到 2 个相关 Runbook 文档', time: '14:25' },
  { icon: Volume2, dot: 'info' as const, text: '收到用户提问，已开始处理', time: '14:25' },
];

// ============ 快捷指令 ============
const QUICK = ['查看 K8s 节点状态', '生成今日告警报告', '列出 P0 任务', '检查合规评分'];

export default function Copilot() {
  const [activeSessionId, setActiveSessionId] = useState('s1');
  const [activeAgentId, setActiveAgentId] = useState('a1');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: agents } = useApiQuery<Agent[]>(['agents'], '/api/agents');
  const { data: conv } = useApiQuery<Conversation>(['conv', activeAgentId], '/api/conversations/cv1');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conv?.messages.length]);

  const onSend = () => {
    if (!input.trim()) return;
    setInput('');
  };

  const activeSession = SESSIONS.find((s) => s.id === activeSessionId);
  const activeAgent = agents?.find((a) => a.id === activeAgentId);

  return (
    <div className="flex h-full">
      {/* ============ 左侧：会话列表 ============ */}
      <aside className="w-[260px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-2">会话</div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <Input placeholder="搜索会话..." className="h-8 pl-8 text-xs" />
          </div>
          <div className="mt-2 flex gap-1 text-[11px]">
            <button className="px-2.5 py-1 rounded-md bg-[var(--brand-light)] text-[var(--brand)] font-semibold">全部 12</button>
            <button className="px-2.5 py-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]">进行中 3</button>
            <button className="px-2.5 py-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]">已完成 9</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {SESSIONS.map((s) => {
            const Icon = s.icon;
            const active = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={cn('session-item', active && 'session-item--active')}
              >
                <div className="flex items-center justify-between">
                  <div className="session-item__title">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: s.iconColor }} />
                    <span className="truncate">{s.title}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">{s.time}</span>
                </div>
                <div className="session-item__preview">{s.preview}</div>
                <div className="session-item__meta">
                  <span className="nav-pill text-[10px] !py-0.5">{s.agent}</span>
                  <Badge tone={s.statusTone} className="text-[10px]">{s.status}</Badge>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ============ 中间：对话 ============ */}
      <section className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
        {/* 对话头 */}
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-[var(--danger)] to-[#f97316] text-white">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{activeAgent?.name ?? '故障自愈'}</div>
              <div className="text-[10px] text-[var(--text-muted)]">SRE · 数字员工</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="nav-pill nav-pill--success">
              <Dot tone="success" />在线
            </span>
            <Button variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" />导出对话
            </Button>
            <Button variant="secondary" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* 消息流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 日期分隔 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[10px] text-[var(--text-muted)] font-mono">2026年7月13日</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* 安全提示 */}
          <div className="flex justify-center">
            <span className="nav-pill nav-pill--info text-[10px]">
              <ShieldCheck className="h-3 w-3" /> 对话已加密 · SignedLog 记录 · 等保 3 合规
            </span>
          </div>

          {/* 用户消息 1 */}
          <div className="flex gap-3 flex-row-reverse">
            <Avatar name="王昊" size={36} />
            <div className="flex-1 flex flex-col items-end max-w-[80%]">
              <div className="flex items-center gap-2 mb-1 text-[11px]">
                <span className="font-semibold text-[var(--text-secondary)]">王昊</span>
                <span className="text-[var(--text-muted)] font-mono">14:25</span>
              </div>
              <div className="chat-bubble chat-bubble--user">
                我们的 Redis 集群出现了频繁的 OOM，cache-oom 触发了 5 次告警。能帮我处理一下吗？
                <div className="flex gap-3 mt-2 text-[11px] opacity-80">
                  <button className="hover:underline">复制</button>
                  <button className="hover:underline">引用</button>
                </div>
              </div>
            </div>
          </div>

          {/* Agent 消息 1 */}
          <div className="flex gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
              <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
            </div>
            <div className="flex-1 max-w-[80%]">
              <div className="flex items-center gap-2 mb-1 text-[11px]">
                <span className="font-semibold text-[var(--text-secondary)]">故障自愈</span>
                <span className="text-[var(--text-muted)] font-mono">14:25</span>
              </div>
              <div className="chat-bubble">
                我已经定位到问题，正在按 Runbook 执行：{'\n\n'}
                1. 切换 volatile-lru 策略{'\n'}
                2. 扩容 +20%{'\n'}
                3. 加监控告警{'\n\n'}
                请确认是否执行：
                <div className="flex gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
                  <button className="hover:text-[var(--brand)]">复制</button>
                  <button className="hover:text-[var(--brand)]">引用</button>
                </div>
              </div>
              <div className="cite-block">
                <div className="cite-block__title">
                  <Link2 className="h-3 w-3 text-[var(--brand)]" />
                  引用知识库
                </div>
                <div className="text-[var(--text-secondary)] font-mono text-[11px]">
                  {CITATIONS.map((c) => (
                    <div key={c.idx}>
                      [{c.idx}] {c.text} <span className="text-[var(--text-muted)]">（{c.meta}）</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 用户确认 */}
          <div className="flex gap-3 flex-row-reverse">
            <Avatar name="王昊" size={36} />
            <div className="flex-1 flex flex-col items-end max-w-[80%]">
              <div className="flex items-center gap-2 mb-1 text-[11px]">
                <span className="font-semibold text-[var(--text-secondary)]">王昊</span>
                <span className="text-[var(--text-muted)] font-mono">14:26</span>
              </div>
              <div className="chat-bubble chat-bubble--user">确认执行</div>
            </div>
          </div>

          {/* Agent 工具调用 */}
          <div className="flex gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
              <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
            </div>
            <div className="flex-1 max-w-[80%]">
              <div className="flex items-center gap-2 mb-1 text-[11px]">
                <span className="font-semibold text-[var(--text-secondary)]">故障自愈</span>
                <span className="text-[var(--text-muted)] font-mono">14:26</span>
                <Badge tone="info" className="text-[10px]">工具调用</Badge>
              </div>
              <div className="chat-bubble">
                <div className="space-y-2">
                  {TOOL_CALLS.map((tc, i) => (
                    <div key={i} className="tool-call">
                      <Wrench className="h-3 w-3 text-[var(--brand)]" />
                      <span className="tool-call__name">{tc.name}</span>
                      <span className="text-[var(--text-muted)] truncate">{tc.args}</span>
                      <span className="tool-call__result">
                        <CheckCircle2 className="inline h-3 w-3 mr-1" />success ({tc.ms}ms)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Agent 状态更新 */}
          <div className="flex gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
              <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
            </div>
            <div className="flex-1 max-w-[80%]">
              <div className="flex items-center gap-2 mb-1 text-[11px]">
                <span className="font-semibold text-[var(--text-secondary)]">故障自愈</span>
                <span className="text-[var(--text-muted)] font-mono">14:27</span>
              </div>
              <div className="chat-bubble">
                <div className="status-list">
                  {STATUS_UPDATES.map((s, i) => (
                    <div key={i} className="status-list__item">
                      <s.icon className={cn('status-list__icon h-3.5 w-3.5', `status-list__icon--${s.tone}`)} />
                      <span>{s.text}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3">需要我创建工单跟踪吗？</div>
                <div className="flex gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
                  <button className="hover:text-[var(--brand)]">复制</button>
                  <button className="hover:text-[var(--brand)]">引用</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-[var(--border)] p-4 bg-[var(--bg)]">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="px-3 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_var(--brand-light)] transition-all">
            <button className="grid h-8 w-8 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-3)]">
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="输入问题... (Shift+Enter 换行)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
            />
            <Button onClick={onSend} disabled={!input.trim()} size="sm">
              <Send className="h-3.5 w-3.5" />发送
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> 对话存档 · SignedLog</span>
            <span>·</span>
            <span>P95 680ms · 99.4% 成功率</span>
          </div>
        </div>
      </section>

      {/* ============ 右侧：详情 ============ */}
      <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        {/* 会话信息 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            会话信息
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">会话 ID</span><span className="font-mono">cv-019a7f</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Agent</span><span className="text-[var(--brand)]">故障自愈</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">开始时间</span><span className="font-mono">14:25:08</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">多轮深度</span><span>4.2 轮</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Token 用量</span><span className="font-mono">1.2k / 200k</span></div>
            <div>
              <div className="text-[var(--text-muted)] mb-1">上下文窗口</div>
              <div className="h-1.5 bg-[var(--bg-hover)] rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--brand)] to-[var(--purple)]" style={{ width: '0.6%' }} />
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">0.6% · 剩余 198.8k tokens</div>
            </div>
          </div>
        </div>

        {/* RAG 检索 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            RAG 检索
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">召回</span><span className="font-mono">320ms</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">重排</span><span>BGE-reranker-large</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">命中率</span><span className="text-[var(--success)]">92%</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Top-K</span><Badge tone="brand" className="text-[10px]">8</Badge></div>
          </div>
          <div className="mt-3 space-y-1.5">
            {CITATIONS.map((c) => (
              <div key={c.idx} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-semibold text-[var(--brand)]">[{c.idx}] {c.text}</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">{c.meta}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 工具调用 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <Wrench className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            工具调用
          </div>
          <div className="space-y-1.5 text-xs">
            {TOOL_CALLS.map((tc, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-[var(--bg-elevated)] px-2 py-1.5">
                <span className="font-mono text-[11px] truncate flex-1">{tc.name}</span>
                <Badge tone="success" className="text-[10px]">{tc.ms}ms</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* 活动时间线 */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            活动时间线
          </div>
          <div className="activity-timeline">
            {ACTIVITIES.map((a, i) => (
              <div key={i} className="activity-timeline__item">
                <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.dot}`)}>
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

        {/* 快捷指令 */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
            <Zap className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            快捷指令
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['查看状态', '重新生成', '导出', '复制', '反馈', '停止'].map((q) => (
              <button key={q} className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors">
                {q}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="w-full mt-4">
            <StopCircle className="h-3.5 w-3.5" />停止生成
          </Button>
        </div>
      </aside>
    </div>
  );
}