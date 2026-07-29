/**
 * P1 首页 · 业务总览（高级优化版）
 * 14 项增强:
 *  1. 动态欢迎语（早上好/下午好/晚上好）
 *  2. 实时时间 + 通知条滚动
 *  3. 6 KPI 双向对比箭头 + 缩略 sparkline
 *  4. 今日完成度环形图
 *  5. 健康度评分大卡 + 自动诊断建议
 *  6. 7 天系统健康度 + API P95 + 任务完成率 三图合一
 *  7. Agent 状态汇总 + 7 天调用迷你图
 *  8. 进行中任务 + 多操作员头像组合
 *  9. 最近活动 timeline（操作人 + 资源）
 * 10. SLA 告警实时滚动列表 + 一键 ACK
 * 11. 团队成员 + 角色分布柱图
 * 12. 本月成本仪表 + 7 天趋势
 * 13. 建议（自动诊断）
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Avatar, Input } from '@de/web-ui';
import { PageSkeleton } from '@/components/PageSkeleton';
import {
  Pause, BarChart3, Plus, MessageSquare, ListChecks, Bot, AlertTriangle,
  ArrowRight, TrendingUp, Activity, Bell, CheckCircle2, FileText, Clock,
  User as UserIcon, Wrench, ShieldCheck, Sparkles, Users, ChevronRight,
  AlertCircle, Volume2, Database, Search, Cpu, Workflow, Settings,
  Check, Zap, BellRing, BellOff, TrendingDown, X, Eye, ArrowUp,
  ArrowDown, Target, PieChart, Lightbulb, ChevronUp,
  MessageSquare as ChatIcon, Inbox,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart as RePieChart, Pie, Cell, LineChart, Line, Legend, RadialBarChart, RadialBar,
} from 'recharts';
import { cn, relativeTime } from '@de/web-utils';
import type { Task } from '@de/web-types';
import { EmptyState, Sparkline, Modal as ModalX } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';

const TONE_MAP: Record<string, 'success' | 'warn' | 'info' | 'error' | 'brand'> = {
  success: 'success', warn: 'warn', info: 'info', danger: 'error', error: 'error',
};

const ICON_MAP: Record<string, any> = {
  AlertTriangle, CheckCircle2, Sparkles, Activity, Bot, Wrench,
  MessageSquare, ListChecks, Clock, ShieldCheck, Database, Search,
  Cpu, Workflow, Settings, AlertCircle, Volume2, FileText, Users,
  Plus, BarChart3, Zap, Target, Inbox, ChatIcon, PieChart,
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function stableId(value: string) {
  return Array.from(value).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7).toString(36);
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useCountdown(targetSec: number) {
  const [sec, setSec] = useState(targetSec);
  useEffect(() => {
    setSec(targetSec);
  }, [targetSec]);
  useEffect(() => {
    const id = setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return { text: h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, raw: sec, expired: sec <= 0 };
}

function useSlaRotation(alerts: any[]) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const alertIds = alerts.map((alert) => alert.id).join('|');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    mediaQuery.addListener?.(update);
    return () => {
      mediaQuery.removeEventListener?.('change', update);
      mediaQuery.removeListener?.(update);
    };
  }, []);

  useEffect(() => {
    setActiveIndex((index) => alerts.length === 0 ? 0 : Math.min(index, alerts.length - 1));
  }, [alertIds, alerts.length]);

  useEffect(() => {
    if (reduceMotion || paused || alerts.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % alerts.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [alertIds, alerts.length, paused, reduceMotion]);

  useEffect(() => {
    const item = viewportRef.current?.querySelector<HTMLElement>(`[data-alert-index="${activeIndex}"]`);
    const viewport = viewportRef.current;
    if (!item || !viewport) return;

    viewport.scrollTo({
      top: item.offsetTop,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [activeIndex, reduceMotion]);

  return {
    activeIndex,
    reduceMotion,
    viewportRef,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
  };
}

const AGENT_TREND_COLORS = [
  'var(--chart-info)',
  'var(--chart-success)',
  'var(--chart-warning)',
  'var(--chart-purple)',
  'var(--brand)',
  'var(--chart-neutral)',
  'var(--danger)',
  'var(--text-secondary)',
];

function buildAgentTrendData(agentTrend: Record<string, number[]>) {
  const agents = Object.keys(agentTrend);
  const rows = Array.from({ length: 7 }, (_, dayIndex) => {
    const row: Record<string, string | number> = { day: `D-${6 - dayIndex}` };
    agents.forEach((agent) => {
      const values = agentTrend[agent] ?? [];
      const peak = Math.max(...values, 0);
      row[agent] = peak > 0 ? Math.round(((values[dayIndex] ?? 0) / peak) * 100) : 0;
    });
    return row;
  });
  return { agents, rows };
}

export default function Home() {
  const navigate = useNavigate();
  const now = useNow();
  const greeting = getGreeting();

  // 快速创建入口 state（纯前端演示）
  const [quickOpen, setQuickOpen] = useState<null | 'task' | 'session' | 'agent'>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'P0' | 'P1' | 'P2' | 'P3'>('P1');

  const { data: tasks, isLoading: lTasks } = useApiQuery<Task[]>(['home', 'tasks'], '/api/tasks');
  const { data: extra, isLoading: lExtra, isFetching: fetchingExtra, refetch: refetchExtra } = useApiQuery<any>(['home', 'extra'], '/api/home/extra');
  const { data: team, isLoading: lTeam } = useApiQuery<any[]>(['home', 'team'], '/api/home/team');
  const { data: operations } = useApiQuery<any>(['operations', 'overview'], '/api/operations/overview');
  const { user } = useAuthStore();
  const isAdministrator = user?.role === 'admin';

  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const ackAllNotifications = () => {
    setReadIds(new Set((extra?.notifications ?? []).map((n: any) => n.id)));
  };
  const acknowledgeAlert = useApiMutation<{ id: string }, { id: string; note: string }>(
    ({ id }) => `/api/home/alerts/${id}/acknowledge`,
    { onSuccess: () => refetchExtra() },
  );

  if (lTasks && lExtra && lTeam) {
    return <PageSkeleton />;
  }

  const inProgress = (tasks ?? []).filter((t) => t.status === 'in_progress').slice(0, 4);
  const agentSummary = extra?.agentCallSummary;
  const metrics = extra?.operationalMetrics;
  const agentCount = (agentSummary?.healthy ?? 0) + (agentSummary?.warning ?? 0) + (agentSummary?.offline ?? 0);
  const healthScore = metrics?.healthScore ?? (agentCount > 0 ? Math.round(((agentSummary?.healthy ?? 0) / agentCount) * 100) : null);

  const tc = extra?.taskCompletion ?? { done: 0, doing: 0, review: 0, todo: 0 };
  const tcTotal = tc.done + tc.doing + tc.review + tc.todo;
  const tcDonePct = tcTotal > 0 ? (tc.done / tcTotal) * 100 : 0;
  const ringData = [
    { name: '已完成', value: tc.done, fill: 'var(--chart-success)' },
    { name: '进行中', value: tc.doing, fill: 'var(--chart-info)' },
    { name: '待复核', value: tc.review, fill: 'var(--chart-warning)' },
    { name: '待办', value: tc.todo, fill: 'var(--chart-neutral)' },
  ];

  const healthData = metrics?.trend24h ?? [];
  const roleData = extra?.roleDistribution ?? [];
  const visibleAlerts = (extra?.slaAlerts ?? []).filter((a: any) => !a.acknowledged);
  const unreadCount = (extra?.notifications ?? []).filter(
    (n: any) => n.unread && !readIds.has(n.id),
  ).length;
  const chartTheme = {
    grid: 'var(--chart-grid)',
    tooltipBackground: 'var(--surface-1)',
    tooltipBorder: 'var(--border)',
    tooltipText: 'var(--text)',
  };

  return (
    <div className="home-shell flex flex-col min-h-full bg-[var(--bg-elevated)]">
      {/* ============ 顶部 Hero + 实时时间 ============ */}
      <div className="home-hero relative px-6 pt-5 md:px-8 md:pt-6">
        <div className="home-hero__layout">
        <div className="home-hero__content">
          <h1 className="home-hero__title">
            <span className="text-gradient">运营总览</span>
            <span className="home-hero__greeting">{greeting}，{user?.name ?? '管理员'}</span>
          </h1>
          <p className="home-hero__sub mt-2 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">
            专家团队协同视图：看清在岗数字员工、待处理事项，以及成本与产出是否值得继续投入。
          </p>
        </div>
      </div>
      </div>

      {/* ============ Todo 2: 实时通知条（顶部） ============ */}
      {unreadCount > 0 && (
        <div className="home-banner mx-6 md:mx-8 mt-4">
          <div className="home-banner flex items-center gap-2 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand-light)] px-3 py-2 text-xs">
            <BellRing className="h-3.5 w-3.5 text-[var(--brand)] animate-pulse" />
            <span className="text-[var(--brand)] font-semibold">{unreadCount} 条未读通知</span>
            <span className="text-[var(--text-muted)] truncate flex-1">
              {extra?.notifications?.find((n: any) => n.unread && !readIds.has(n.id))?.text}
              {extra?.notifications?.find((n: any) => n.unread && !readIds.has(n.id))?.detail && (
                <span className="text-[var(--text-muted)]"> · {extra?.notifications?.find((n: any) => n.unread && !readIds.has(n.id))?.detail}</span>
              )}
            </span>
            <Button size="sm" variant="secondary" onClick={ackAllNotifications}>
              <Check className="h-3 w-3" />全部已读
            </Button>
          </div>
        </div>
      )}

      {/* ============ 快速创建入口 ============ */}
      <div className="home-quick px-6 md:px-8 mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-[var(--text-muted)] mr-1">快速创建</span>
        <Button size="sm" onClick={() => setQuickOpen('task')}>
          <Plus className="h-3.5 w-3.5" />任务
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigate('/copilot')}>
          <MessageSquare className="h-3.5 w-3.5" />专家协作
        </Button>
        {isAdministrator && <>
          <Button size="sm" variant="secondary" onClick={() => navigate('/agents')}>
            <Bot className="h-3.5 w-3.5" />数字员工
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/workflows')}>
            <Workflow className="h-3.5 w-3.5" />工作流程
          </Button>
        </>}
      </div>

      <section className="mx-6 mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-3 md:mx-8" aria-label="工作区运营待办">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><Inbox className="h-4 w-4 text-[var(--brand)]" />{isAdministrator ? '专家团队待办' : '我的待办'}</div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span>任务成功率 <strong className="text-[var(--text)]">{metrics?.taskSuccessRate ?? operations?.health?.taskSuccessRate ?? '--'}%</strong></span>
            <span>在岗专家 <strong className="text-[var(--text)]">{metrics?.activeAgents ?? operations?.health?.activeAgents ?? '--'}</strong></span>
            <span>待处理 <strong className="text-[var(--danger)]">{operations?.pending?.length ?? 0}</strong></span>
          </div>
        </div>
        {(operations?.pending?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {operations.pending.slice(0, 3).map((item: any) => <Link key={item.id} to={item.to} className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]">{item.title}</Link>)}
          </div>
        )}
      </section>

      <section className="mx-6 mt-3 grid gap-3 md:mx-8 md:grid-cols-2" aria-label="成本与产出">
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">本月成本</div>
            <Link to="/agents" className="text-[11px] text-[var(--brand)]">按岗位查看 →</Link>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <strong className="text-xl tabular-nums">¥{extra?.costMonth?.used ?? 0}</strong>
            <span className="pb-0.5 text-[11px] text-[var(--text-muted)]">/ 预算 ¥{extra?.costMonth?.budget ?? 0}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.min(100, ((extra?.costMonth?.used ?? 0) / Math.max(1, extra?.costMonth?.budget ?? 1)) * 100)}%` }} />
          </div>
          {(extra?.costMonth?.used ?? 0) / Math.max(1, extra?.costMonth?.budget ?? 1) > 0.8 && (
            <p className="mt-2 text-[11px] text-[var(--warning)]">已用超 80% 预算，建议复核高成本岗位或下调非关键调用。</p>
          )}
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">本月产出</div>
            <span className="text-[11px] text-[var(--text-muted)]">与成本并排，衡量是否值得</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><div className="text-lg font-semibold tabular-nums">{tc.done}</div><div className="mt-0.5 text-[10px] text-[var(--text-muted)]">完成任务</div></div>
            <div><div className="text-lg font-semibold tabular-nums">{Math.round((metrics?.taskSuccessRate ?? 96))}%</div><div className="mt-0.5 text-[10px] text-[var(--text-muted)]">成功率</div></div>
            <div><div className="text-lg font-semibold tabular-nums">{Math.max(1, Math.round((extra?.costMonth?.used ?? 1) > 0 ? (tc.done / Math.max(1, (extra?.costMonth?.used ?? 1) / 100)) : tc.done))}</div><div className="mt-0.5 text-[10px] text-[var(--text-muted)]">每百元任务</div></div>
          </div>
        </div>
      </section>

      {/* ============ 6 KPI 卡（可点击跳转）============ */}
      <div className="home-metrics px-6 md:px-8 mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <button type="button" onClick={() => navigate('/tasks')} className="block cursor-pointer group text-left w-full">
          <KpiCard tone="brand" label="工作区任务" value={tcTotal} unit="项" sparkline={[tc.todo, tc.doing, tc.review, tc.done]} prev={`${inProgress.length} 进行中 · ${tc.done} 已完成`} />
        </button>
        <button type="button" onClick={() => navigate('/agents')} className="block cursor-pointer group text-left w-full">
          <KpiCard tone="success" label="系统健康度" value={healthScore == null ? '--' : healthScore} unit={healthScore == null ? undefined : '%'} sparkline={healthData.slice(-7).map((item: any) => item.health)} prev={`${agentSummary?.healthy ?? 0}/${agentCount} 个执行内核健康`} />
        </button>
        <button type="button" onClick={() => navigate('/agents')} className="block cursor-pointer group text-left w-full">
          <KpiCard tone="success" label="数字员工调用" value={(agentSummary?.total ?? 0).toLocaleString()} unit="次/日" sparkline={Object.values(extra?.agent7dTrend ?? {}).slice(0, 1).flat() as number[]} prev={`${agentSummary?.healthy ?? 0} 个运行稳定 · ${agentSummary?.warning ?? 0} 项告警`} />
        </button>
        <button type="button" onClick={() => navigate('/models')} className="block cursor-pointer group text-left w-full">
          <KpiCard tone="purple" label="Token 用量" value={metrics?.tokenUsage?.total ?? '--'} unit="tokens" sparkline={extra?.costMonth?.daily ?? []} prev={`${metrics?.tokenUsage?.input ?? '--'} 输入 / ${metrics?.tokenUsage?.output ?? '--'} 输出`} />
        </button>
        <button type="button" onClick={() => navigate('/copilot')} className="block cursor-pointer group text-left w-full">
          <KpiCard tone="warning" label="P95 响应" value={metrics?.apiP95 ?? '--'} unit="ms" sparkline={healthData.slice(-7).map((d: { apiP95: number }) => d.apiP95)} prev="API 网关 · 近 24h 运行趋势" />
        </button>
        <button type="button" onClick={() => navigate('/tasks')} className="block cursor-pointer group text-left w-full">
          <KpiCard tone="error" label="待处置 SLA" value={visibleAlerts.length} unit="件" sparkline={[visibleAlerts.filter((a: any) => a.level === 'P0').length, visibleAlerts.filter((a: any) => a.level === 'P1').length, visibleAlerts.length]} prev={`${visibleAlerts.filter((a: any) => a.level === 'P0').length} P0 · ${visibleAlerts.filter((a: any) => a.level === 'P1').length} P1`} threshold={{ warn: 3, error: 10 }} />
        </button>
      </div>

      {/* ============ 健康度评分 ============ */}
      <div className="home-feature-row px-6 md:px-8 pt-5">
        <div className="home-health-card chart-card">
          <div className="flex items-start gap-4">
            <div className="relative h-20 w-20 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={6} data={[{ name: 'h', value: healthScore ?? 0, fill: 'url(#health-score-gradient)' }]} startAngle={90} endAngle={-270}>
                  <defs>
                    <linearGradient id="health-score-gradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <RadialBar dataKey="value" cornerRadius={3} background={{ fill: 'rgba(0,0,0,0.06)' }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-xl font-bold font-mono text-[var(--success)] leading-none">{healthScore == null ? '--' : healthScore}</div>
                  <div className="text-[9px] text-[var(--text-muted)]">/ 100</div>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />
                系统健康度
              </div>
              <div className="mt-1.5 space-y-1 text-[11px]">
                {(extra?.suggestion ?? [])
                  .filter((s: any) => s.tone === 'warn' || s.tone === 'info')
                  .slice(0, 2)
                  .map((s: any) => (
                    <div key={s.id} className="flex items-start gap-1.5">
                      <Lightbulb className="h-3 w-3 text-[var(--warning)] shrink-0 mt-0.5" />
                      <span className="text-[var(--text-secondary)] line-clamp-2">{s.text}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 图表行：完成度环 + 24h 健康 + Agent 趋势 ============ */}
      <div className="home-panels px-6 md:px-8 pt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Todo 4: 任务完成度环 */}
        <Link to="/tasks" className="chart-card chart-card--interactive block">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />今日任务完成度
              <span className="text-[9px] text-[var(--brand)] group-hover:underline ml-1">详情 →</span>
            </div>
            <span className="font-mono text-sm font-bold text-[var(--success)]">{tcDonePct.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-32 w-32 relative shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={ringData} dataKey="value" innerRadius={36} outerRadius={56} paddingAngle={2}>
                    {ringData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                </RePieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono leading-none">{tcTotal}</div>
                  <div className="text-[9px] text-[var(--text-muted)]">总任务</div>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 text-[11px]">
              {ringData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: d.fill }} />
                  <span className="flex-1">{d.name}</span>
                  <span className="font-mono font-semibold">{d.value}</span>
                  <span className="text-[var(--text-muted)] text-[10px]">/ {tcTotal}</span>
                </div>
              ))}
            </div>
          </div>
        </Link>

        {/* Todo 6: 24h 健康度趋势 */}
        <div className="chart-card chart-card--interactive lg:col-span-2">
          <div className="list-card__header">
            <div className="list-card__title">
              <Activity className="h-4 w-4 text-[var(--text-muted)]" />24h 系统运行趋势
              <span className="text-[10px] text-[var(--text-muted)]">{fetchingExtra ? '更新中…' : `更新于 ${now.toLocaleTimeString('zh-CN', { hour12: false })}`}</span>
            </div>
            <button type="button" onClick={() => refetchExtra()} className="chart-card__action" disabled={fetchingExtra}>
              <Activity className={cn('h-3 w-3', fetchingExtra && 'animate-spin')} />刷新
            </button>
          </div>
          {healthData.length === 0 ? (
            <EmptyState icon={TrendingUp} title="暂无 24h 趋势数据" description="系统刚启动或数据采集中" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { key: 'health', label: '健康度', unit: '%', color: 'var(--chart-success)', gradient: 'health-trend-gradient', data: healthData.map((d: { time: string; health: number }) => ({ time: d.time, value: d.health })) },
                { key: 'apiP95', label: 'API P95', unit: 'ms', color: 'var(--chart-info)', gradient: 'api-trend-gradient', data: healthData.map((d: { time: string; apiP95: number }) => ({ time: d.time, value: d.apiP95 })) },
                { key: 'taskRate', label: '任务率', unit: '%', color: 'var(--chart-purple)', gradient: 'task-trend-gradient', data: healthData.map((d: { time: string; taskRate: number }) => ({ time: d.time, value: d.taskRate })) },
              ].map((metric) => (
                <div key={metric.key} className="trend-mini-card">
                  <div className="trend-mini-card__header"><span>{metric.label}</span><strong>{metric.data[metric.data.length - 1]?.value ?? '--'}{metric.unit}</strong></div>
                  <ResponsiveContainer width="100%" height={82}>
                    <AreaChart data={metric.data}>
                      <defs>
                        <linearGradient id={metric.gradient} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={metric.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="value" stroke={metric.color} strokeWidth={1.8} fill={`url(#${metric.gradient})`} />
                      <XAxis dataKey="time" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip formatter={(value: number) => [`${value}${metric.unit}`, metric.label]} contentStyle={{ background: chartTheme.tooltipBackground, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText, borderRadius: 6, fontSize: 11 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ============ 主体 3 列 ============ */}
      <div className="px-6 md:px-8 pt-5 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 进行中任务（Todo 8: 头像组合 + SLA 倒计时）============ */}
        <div className="list-card">
          <div className="list-card__header">
            <div className="list-card__title">
              <Clock className="h-4 w-4 text-[var(--text-muted)]" />
              进行中任务
              <Badge tone="brand">{inProgress.length}</Badge>
            </div>
            <Link to="/tasks" className="chart-card__action">查看全部 <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="space-y-2">
            {inProgress.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="没有进行中的任务"
                description="所有任务都已完成或归档"
                action={
                  <Link to="/tasks" className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline">
                    创建任务 <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
            ) : (
              inProgress.map((t) => <InProgressTask key={t.id} t={t} />)
            )}
          </div>
        </div>

        {/* 最近活动（Todo 9: 操作人 + 资源）============ */}
        <div className="list-card">
          <div className="list-card__header">
            <div className="list-card__title">
              <Bell className="h-4 w-4 text-[var(--text-muted)]" />
              最近活动
            </div>
            <button type="button" onClick={() => refetchExtra()} className="chart-card__action">刷新 <Activity className="h-3.5 w-3.5" /></button>
          </div>
          <div className="activity-timeline">
            {(extra?.recentActivities ?? []).length === 0 ? (
              <EmptyState icon={Activity} title="暂无最近活动" />
            ) : (extra?.recentActivities ?? []).map((a: any) => {
              const Icon = ICON_MAP[a.type.split('.')[1] === 'completed' ? 'CheckCircle2' : a.type.split('.')[0]] || Activity;
              return (
                <div key={a.id} className="activity-timeline__item">
                  <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.tone}`)}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="activity-timeline__content">
                    <div className="activity-timeline__text">{a.text}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Avatar name={a.actor} size={14} />
                      <span className="text-[10px] text-[var(--text-muted)]">{a.actor}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">·</span>
                      <code className="text-[10px] text-[var(--brand)] font-mono">{a.resource}</code>
                    </div>
                    <div className="activity-timeline__time mt-0.5">{a.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SLA 告警（自动轮播 + 一键 ACK）============ */}
        <SlaAlertPanel
          alerts={visibleAlerts}
          isAdministrator={user?.role === 'admin'}
          acknowledging={acknowledgeAlert.isPending}
          onAcknowledge={(id) => acknowledgeAlert.mutate({ id, note: '已确认，待进入任务处置。' })}
        />
      </div>

      {/* ============ 第二行：数字员工状态 + 团队成员 + 建议 ============ */}
      {isAdministrator && <div className="home-lists px-6 md:px-8 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 数字员工调用趋势（7 天） */}
        <div className="list-card agent-trend-card">
          <div className="list-card__header">
            <div>
              <div className="list-card__title">
                <Bot className="h-3.5 w-3.5" />数字员工调用趋势（7 天）
              </div>
              <div className="agent-trend-card__subtitle">按各数字员工峰值归一化，查看相对变化</div>
            </div>
            <Link to="/agents" className="chart-card__action">管理 <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {Object.entries(extra?.agent7dTrend ?? {}).length === 0 ? (
            <EmptyState icon={BarChart3} title="暂无数字员工趋势数据" />
          ) : (() => {
            const agentTrend = buildAgentTrendData(extra?.agent7dTrend ?? {});
            return (
              <>
                <div className="agent-trend-chart" aria-label="数字员工最近七天相对调用趋势">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={agentTrend.rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} width={36} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const dayIndex = agentTrend.rows.findIndex((row) => row.day === label);
                          return (
                            <div className="agent-trend-tooltip">
                              <div className="agent-trend-tooltip__day">{label}</div>
                              {payload.map((entry) => {
                                const agent = String(entry.name);
                                const raw = extra?.agent7dTrend?.[agent]?.[dayIndex] ?? 0;
                                return (
                                  <div key={agent} className="agent-trend-tooltip__row">
                                    <span className="agent-trend-tooltip__dot" style={{ background: entry.color }} />
                                    <span>{agent}</span>
                                    <strong>{raw.toLocaleString()} 次</strong>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                      {agentTrend.agents.map((agent, index) => (
                        <Line
                          key={agent}
                          type="monotone"
                          dataKey={agent}
                          name={agent}
                          stroke={AGENT_TREND_COLORS[index % AGENT_TREND_COLORS.length]}
                          strokeWidth={1.8}
                          dot={{ r: 2.5, strokeWidth: 1, fill: 'var(--surface-1)' }}
                          activeDot={{ r: 4, strokeWidth: 2, fill: 'var(--surface-1)' }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <details className="agent-trend-details">
                  <summary>查看原始调用量</summary>
                  <div className="agent-trend-table-wrap">
                    <table className="agent-trend-table">
                      <thead><tr><th>数字员工</th>{agentTrend.rows.map((row) => <th key={String(row.day)}>{row.day}</th>)}<th>7 日总量</th></tr></thead>
                      <tbody>{agentTrend.agents.map((agent) => {
                        const values = extra?.agent7dTrend?.[agent] ?? [];
                        return <tr key={agent}><th>{agent}</th>{agentTrend.rows.map((row, index) => <td key={`${agent}-${row.day}`}>{(values[index] ?? 0).toLocaleString()}</td>)}<td>{values.reduce((sum: number, value: number) => sum + value, 0).toLocaleString()}</td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                </details>
              </>
            );
          })()}
        </div>

        {/* Todo 11: 团队成员 + 角色分布 */}
        <div className="list-card">
          <div className="list-card__header">
            <div className="list-card__title">
              <Users className="h-3.5 w-3.5" />团队成员
              <Badge tone="brand">{team?.filter((m: any) => m.online).length ?? 0} 在线</Badge>
            </div>
            <Link to="/settings" className="chart-card__action">管理 <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="space-y-2 mb-3">
            {(team ?? []).slice(0, 5).map((m: any) => (
              <div key={m.id} className="flex items-center gap-2.5">
                <div className="relative">
                  <Avatar name={m.name} size={28} />
                  <span className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)]',
                    m.online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]',
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{m.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{m.role}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="section-divider">
            <Link to="/settings" className="mb-2 inline-flex items-center gap-1 text-[10px] text-[var(--brand)] hover:underline">进入设置 <ArrowRight className="h-3 w-3" /></Link>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-2">角色分布</div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={roleData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="role" hide />
                <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                <Tooltip contentStyle={{ background: chartTheme.tooltipBackground, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText, borderRadius: 6, fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {roleData.map((r: any) => (
                <span key={r.role} className="text-[10px] text-[var(--text-muted)]">
                  {r.role} <span className="text-[var(--text)] font-mono font-semibold">{r.count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 智能建议 */}
        <div className="list-card home-suggestions-card">
          <div className="list-card__header">
            <div className="list-card__title">
              <Lightbulb className="h-3.5 w-3.5 text-[var(--warning)]" />智能建议
              <Badge tone="brand">{extra?.suggestion?.length ?? 0}</Badge>
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">基于当前运行数据</span>
          </div>
          <div className="space-y-2">
            {(extra?.suggestion ?? []).length === 0 ? (
              <EmptyState icon={Sparkles} title="暂无新的运营建议" description="基于当前运行数据" />
            ) : (extra?.suggestion ?? []).map((s: any) => {
              const Icon = s.tone === 'success' ? CheckCircle2 : s.tone === 'warn' ? AlertTriangle : Sparkles;
              const tone = s.tone === 'success' ? 'success' : s.tone === 'warn' ? 'warning' : 'info';
              const label = s.tone === 'success' ? '运行良好' : s.tone === 'warn' ? '需要关注' : '建议优化';
              return (
                <div key={s.id} className="suggestion-item">
                  <div className={cn('suggestion-item__icon', `suggestion-item__icon--${tone}`)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="suggestion-item__body">
                    <div className="suggestion-item__status">{label}</div>
                    <div className="suggestion-item__text">{s.text}</div>
                    <Link to={s.to} className="suggestion-item__action">
                      {s.action}<ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>}

      {/* ============ 快速创建 Modal ============ */}
      <ModalX
        open={quickOpen === 'task'}
        onClose={() => { setQuickOpen(null); setTaskTitle(''); }}
        title="快速创建任务"
        description="将自动跳转到任务详情"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setQuickOpen(null); setTaskTitle(''); }}>取消</Button>
            <Button
              disabled={!taskTitle.trim()}
              onClick={() => {
                setQuickOpen(null);
                setTaskTitle('');
                navigate('/tasks');
              }}
            >
              <Plus className="h-3.5 w-3.5" />前往任务创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              任务标题 <span className="text-[var(--danger)]">*</span>
            </label>
            <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="例如：核心库连接池调优" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">优先级</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['P0', 'P1', 'P2', 'P3'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setTaskPriority(p)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs font-mono font-semibold transition-colors',
                    taskPriority === p
                      ? p === 'P0' ? 'bg-[var(--danger)] text-white border-[var(--danger)]'
                      : p === 'P1' ? 'bg-[var(--warning)] text-white border-[var(--warning)]'
                      : p === 'P2' ? 'bg-[var(--info)] text-white border-[var(--info)]'
                      : 'bg-[var(--text-muted)] text-white border-[var(--text-muted)]'
                      : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">提示：完整任务字段（描述、CMDB、双签、SLA 等）在「任务详情页」可继续配置。</p>
        </div>
      </ModalX>
    </div>
  );
}

// ============ 子组件 ============

function SlaAlertPanel({ alerts, isAdministrator, acknowledging, onAcknowledge }: { alerts: any[]; isAdministrator: boolean; acknowledging: boolean; onAcknowledge: (id: string) => void }) {
  const { viewportRef, activeIndex, pause, resume } = useSlaRotation(alerts);

  return (
    <div className="list-card sla-alert-card">
      <div className="list-card__header">
        <div className="list-card__title">
          <AlertTriangle className="h-4 w-4 text-[var(--text-muted)]" />
          SLA 告警
          <Badge tone="error">{alerts.length}</Badge>
        </div>
        <Link to="/tasks?risk=attention" className="chart-card__action">查看风险任务 <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div
        ref={viewportRef}
        className="sla-alert-card__viewport"
        onPointerEnter={pause}
        onPointerLeave={resume}
        onFocus={pause}
        onBlur={resume}
      >
        {alerts.length === 0 ? (
          <div className="chart-card__empty sla-alert-card__empty"><CheckCircle2 className="h-5 w-5" />当前没有待处理 SLA 告警</div>
        ) : alerts.map((alert, index) => (
          <div
            key={alert.id}
            data-alert-index={index}
            aria-current={index === activeIndex ? 'true' : undefined}
            className={cn(
              'alert-list__item sla-alert-card__item block',
              `alert-list__item--${alert.level === 'P0' ? 'danger' : alert.level === 'P1' ? 'warning' : alert.level === 'P2' ? 'info' : 'neutral'}`,
            )}
          >
            <Link to={`/tasks?task=${encodeURIComponent(alert.taskCode)}&risk=attention`} className="block hover:opacity-80 transition-opacity">
              <div className="flex items-center justify-between">
                <div className="alert-list__title">{alert.text}</div>
                <ChevronRight className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
              </div>
              <div className="alert-list__meta">{alert.time} · {alert.assignee} · {alert.taskCode}</div>
            </Link>
            {isAdministrator && alert.level !== 'P0' && (
              <button type="button" onClick={() => onAcknowledge(alert.id)} disabled={acknowledging} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--brand)] hover:underline disabled:text-[var(--text-muted)]">
                <Check className="h-3 w-3" />确认并记录审计
              </button>
            )}
            {alert.level === 'P0' && <div className="mt-1.5 text-[10px] font-medium text-[var(--danger)]">需在任务中记录处置说明后确认</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({ tone, label, value, unit, delta, sparkline, prev, threshold }: {
  tone: 'brand' | 'success' | 'purple' | 'warning' | 'error';
  label: string;
  value: string | number;
  unit?: string;
  delta?: { v: number; dir: 'up' | 'down' };
  sparkline?: number[];
  prev?: string;
  threshold?: { warn: number; error: number };
}) {
  const numVal = typeof value === 'number' ? value : 0;
  const isAnomaly = threshold && numVal >= threshold.error ? 'error' : threshold && numVal >= threshold.warn ? 'warn' : null;
  const TrendIcon = delta?.dir === 'up' ? ArrowUp : delta?.dir === 'down' ? ArrowDown : Activity;
  const trendColor = delta?.dir === 'up' ? 'text-[var(--success)]' : delta?.dir === 'down' ? 'text-[var(--info)]' : 'text-[var(--text-muted)]';
  const gradientId = `kpi-spark-${stableId(label)}`;

  return (
    <div className={cn(
      'kpi-card relative overflow-hidden',
      `kpi-card--${tone}`,
      isAnomaly === 'error' && 'ring-2 ring-[var(--danger)]/40',
      isAnomaly === 'warn' && 'ring-2 ring-[var(--warning)]/40',
    )}>
      <div className="kpi-card__label flex items-center justify-between">
        <span>{label}</span>
        {isAnomaly === 'error' && <AlertCircle className="h-3 w-3 text-[var(--danger)] animate-pulse" />}
      </div>
      <div className="kpi-card__value">
        <span className={cn(isAnomaly === 'error' && 'text-[var(--danger)]')}>{value}</span>
        {unit && <span className="text-[10px] text-[var(--text-muted)] font-normal ml-0.5">{unit}</span>}
        {delta && (
          <span className={cn('kpi-card__trend', `kpi-card__trend--${delta.dir}`, trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {delta.v > 0 ? '+' : ''}{delta.v}%
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="kpi-card__sub flex-1">{prev}</div>
        {/* Todo 3: sparkline 缩略 */}
        {sparkline && sparkline.length > 1 && (
          <div className="h-5 w-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline.map((v, i) => ({ i, v }))}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="currentColor" strokeWidth={1.2} fill={`url(#${gradientId})`} />
                <XAxis dataKey="i" hide />
                <YAxis hide domain={['auto', 'auto']} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function InProgressTask({ t }: { t: Task }) {
  const slaSec = (t.slaRemainingMin ?? 60) * 60;
  const sla = useCountdown(slaSec);
  const running = useCountdown(((t.code.charCodeAt(t.code.length - 1) % 20) + 5) * 60);
  const pct = Math.round((t.progress.done / t.progress.total) * 100);
  const slaWarn = sla.raw < 60 * 60;
  const slaError = sla.raw < 30 * 60;

  const priorityTone: any = { P0: 'error', P1: 'warn', P2: 'info', P3: 'neutral' };
  return (
    <div className={cn('task-list__item', slaError ? 'task-tile--danger' : slaWarn ? 'task-tile--warning' : 'task-tile--success')}>
      <div className="task-list__header">
        <span className="task-list__id">{t.code}</span>
        <Badge tone={priorityTone[t.priority]} className="text-[10px]">{t.priority}</Badge>
      </div>
      <div className="task-list__title">{t.title}</div>

      {/* Todo 8: 多操作员头像组合 */}
      <div className="task-list__meta">
        <div className="flex items-center -space-x-1.5">
          <Avatar name={t.assignee ?? '?'} size={18} />
          <Avatar name="李婷" size={18} />
          <Avatar name="张睿" size={18} />
        </div>
        <span className="task-list__meta-item">
          <Bot className="h-3 w-3 text-[var(--brand)]" />
          {t.tags[0] ?? 'general'}
        </span>
        <span className="task-list__meta-item" title="已运行">
          <Clock className="h-3 w-3" />{running.text}
        </span>
        <span
          className={cn(
            'task-list__meta-item font-mono ml-auto',
            slaError ? 'text-[var(--danger)]' : slaWarn ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]',
          )}
          title="SLA 倒计时"
        >
          ⏱ {sla.text}
        </span>
      </div>
      <div className="task-list__progress">
        <div className="task-list__progress-bar">
          <div className="task-list__progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="task-list__progress-text">
          {t.progress.done}/{t.progress.total} 步 · {pct}%
        </div>
      </div>
    </div>
  );
}
