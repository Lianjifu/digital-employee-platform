/**
 * 运营总览 — 现代 SaaS 运营台
 * 页头 → KPI 置顶 → 待办+投入产出 → 工作流三列 → 运行细节（折叠）
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Avatar } from '@de/web-ui';
import { PageSkeleton } from '@/components/PageSkeleton';
import {
  BarChart3, Plus, MessageSquare, ListChecks, Bot, AlertTriangle,
  ArrowRight, TrendingUp, Activity, Bell, CheckCircle2, Clock,
  ShieldCheck, Users, ChevronRight, Inbox, Target, Lightbulb,
  Check, BellRing, Workflow, ChevronDown,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart as RePieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { cn } from '@de/web-utils';
import type { Task } from '@de/web-types';
import { EmptyState, RoleReadonlyBanner } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';
import { roleCanMutate, rolePageCopy } from '@/features/role-nav/role-nav';

const AUDITOR_SUGGESTION_PREFIXES = ['/audit-center', '/zero-trust', '/tasks', '/copilot', '/agents', '/workflows', '/knowledge', '/skills', '/memory', '/home'];

const ICON_MAP: Record<string, typeof Activity> = {
  AlertTriangle, CheckCircle2, Activity, Bot, MessageSquare, ListChecks,
  Clock, ShieldCheck, Users, Inbox, Target, Lightbulb, Workflow,
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function useCountdown(targetSec: number) {
  const [sec, setSec] = useState(targetSec);
  useEffect(() => { setSec(targetSec); }, [targetSec]);
  useEffect(() => {
    const id = setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return {
    text: h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    raw: sec,
  };
}

function useSlaRotation(alerts: Array<{ id: string }>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const alertIds = alerts.map((a) => a.id).join('|');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    mq.addListener?.(update);
    return () => {
      mq.removeEventListener?.('change', update);
      mq.removeListener?.(update);
    };
  }, []);

  useEffect(() => {
    setActiveIndex((i) => (alerts.length === 0 ? 0 : Math.min(i, alerts.length - 1)));
  }, [alertIds, alerts.length]);

  useEffect(() => {
    if (reduceMotion || paused || alerts.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % alerts.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [alertIds, alerts.length, paused, reduceMotion]);

  useEffect(() => {
    const item = viewportRef.current?.querySelector<HTMLElement>(`[data-alert-index="${activeIndex}"]`);
    const viewport = viewportRef.current;
    if (!item || !viewport) return;
    viewport.scrollTo({ top: item.offsetTop, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeIndex, reduceMotion]);

  return {
    activeIndex,
    viewportRef,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
  };
}

const AGENT_TREND_COLORS = [
  'var(--chart-info)', 'var(--chart-success)', 'var(--chart-warning)',
  'var(--brand)', 'var(--chart-neutral)', 'var(--danger)',
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
  const greeting = getGreeting();
  const { user } = useAuthStore();
  const isAdministrator = user?.role === 'admin';
  const isAuditor = user?.role === 'auditor';
  const canMutate = roleCanMutate(user?.role);
  const homeCopy = rolePageCopy('home', user?.role);

  const { data: tasks, isLoading: lTasks } = useApiQuery<Task[]>(['home', 'tasks'], '/api/tasks');
  const { data: extra, isLoading: lExtra, isFetching: fetchingExtra, refetch: refetchExtra } = useApiQuery<any>(['home', 'extra'], '/api/home/extra');
  const { data: team, isLoading: lTeam } = useApiQuery<any[]>(['home', 'team'], '/api/home/team');
  const { data: operations } = useApiQuery<any>(['operations', 'overview'], '/api/operations/overview');

  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [runtimeOpen, setRuntimeOpen] = useState(false);

  const ackAllNotifications = () => {
    setReadIds(new Set((extra?.notifications ?? []).map((n: { id: string }) => n.id)));
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
  const activeAgents = metrics?.activeAgents ?? operations?.health?.activeAgents ?? agentSummary?.healthy ?? 0;

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
  const visibleAlerts = (extra?.slaAlerts ?? []).filter((a: { acknowledged?: boolean }) => !a.acknowledged);
  const p0Count = visibleAlerts.filter((a: { level: string }) => a.level === 'P0').length;
  const unreadNotifications = (extra?.notifications ?? []).filter(
    (n: { unread?: boolean; id: string }) => n.unread && !readIds.has(n.id),
  );
  const unreadCount = unreadNotifications.length;
  const pendingItems = operations?.pending ?? [];
  const costUsed = extra?.costMonth?.used ?? 0;
  const costBudget = extra?.costMonth?.budget ?? 0;
  const costPct = Math.min(100, (costUsed / Math.max(1, costBudget)) * 100);
  const perHundredYuan = Math.max(
    1,
    Math.round(costUsed > 0 ? tc.done / Math.max(1, costUsed / 100) : tc.done),
  );

  const chartTheme = {
    grid: 'var(--chart-grid)',
    tooltipBackground: 'var(--surface-1)',
    tooltipBorder: 'var(--border)',
    tooltipText: 'var(--text)',
  };

  const successRate = metrics?.taskSuccessRate ?? operations?.health?.taskSuccessRate ?? null;
  const suggestions = (extra?.suggestion ?? []).filter((s: { to?: string }) => {
    if (!isAuditor) return true;
    const to = s.to ?? '';
    if (!to) return false;
    return AUDITOR_SUGGESTION_PREFIXES.some((prefix) => to === prefix || to.startsWith(`${prefix}?`) || to.startsWith(`${prefix}/`));
  });

  return (
    <div className="de-employee-page home-page h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      <div className="home-page__stack">
        {/* 1 · 页头 */}
        <header className="home-page__hero de-employee-shell rounded-xl bg-[var(--surface-1)] px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="de-employee-icon-tile grid h-8 w-8 place-items-center rounded-lg">
                <Activity className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-[var(--text)]">{homeCopy.title}</h1>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {greeting}，{user?.name ?? '用户'} · {homeCopy.subtitle}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAuditor ? (
                <>
                  <Button size="sm" onClick={() => navigate('/audit-center')}>
                    <ShieldCheck className="h-3.5 w-3.5" />审计中心
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/tasks')}>
                    <ListChecks className="h-3.5 w-3.5" />任务核查
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => navigate('/copilot')}>
                    <MessageSquare className="h-3.5 w-3.5" />专家协作
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/tasks')}>
                    <Plus className="h-3.5 w-3.5" />{user?.role === 'user' ? '我的待办' : '创建任务'}
                  </Button>
                </>
              )}
              {isAdministrator && (
                <div className="flex items-center gap-2 border-l border-[var(--border)] pl-2 text-[11px]">
                  <Link to="/agents" className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand)]">
                    <Bot className="h-3 w-3" />数字员工
                  </Link>
                  <Link to="/workflows" className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand)]">
                    <Workflow className="h-3 w-3" />工作流程
                  </Link>
                </div>
              )}
            </div>
          </div>
          <RoleReadonlyBanner className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--info-bg)] px-3 py-2 text-[11px] leading-5 text-[var(--info)]" />
        </header>

        {/* 2 · KPI 置顶 */}
        <section className="home-page__kpis" aria-label="关键运营指标">
          <button type="button" className={cn('home-page__kpi', visibleAlerts.length > 0 && 'home-page__kpi--warn')} onClick={() => navigate('/tasks?risk=attention')}>
            <span className="home-page__kpi-icon"><AlertTriangle className="h-4 w-4" /></span>
            <span className="home-page__kpi-body">
              <span>待处置</span>
              <strong>{visibleAlerts.length}<small>{p0Count > 0 ? `${p0Count} P0` : '件'}</small></strong>
            </span>
          </button>
          <button type="button" className="home-page__kpi home-page__kpi--brand" onClick={() => navigate('/agents')}>
            <span className="home-page__kpi-icon"><Bot className="h-4 w-4" /></span>
            <span className="home-page__kpi-body">
              <span>在岗员工</span>
              <strong>{activeAgents}<small>/ {agentCount || '—'}</small></strong>
            </span>
          </button>
          <button type="button" className="home-page__kpi home-page__kpi--success" onClick={() => navigate('/tasks')}>
            <span className="home-page__kpi-icon"><CheckCircle2 className="h-4 w-4" /></span>
            <span className="home-page__kpi-body">
              <span>今日完成</span>
              <strong>{tc.done}<small>项</small></strong>
            </span>
          </button>
          <button type="button" className="home-page__kpi home-page__kpi--info" onClick={() => navigate('/tasks')}>
            <span className="home-page__kpi-icon"><ListChecks className="h-4 w-4" /></span>
            <span className="home-page__kpi-body">
              <span>进行中</span>
              <strong>{inProgress.length}<small>项</small></strong>
            </span>
          </button>
          <button type="button" className="home-page__kpi" onClick={() => navigate('/tasks')}>
            <span className="home-page__kpi-icon"><Target className="h-4 w-4" /></span>
            <span className="home-page__kpi-body">
              <span>成功率</span>
              <strong>{successRate == null ? '--' : successRate}<small>%</small></strong>
            </span>
          </button>
          <button type="button" className="home-page__kpi" onClick={() => setRuntimeOpen(true)}>
            <span className="home-page__kpi-icon"><ShieldCheck className="h-4 w-4" /></span>
            <span className="home-page__kpi-body">
              <span>健康度</span>
              <strong>{healthScore == null ? '--' : healthScore}<small>/100</small></strong>
            </span>
          </button>
        </section>

        {/* 3 · 待办 + 投入产出 */}
        <section className="home-page__mid" aria-label="待办与经营">
          <div className="home-page__attention de-employee-shell rounded-xl bg-[var(--surface-1)]">
            <div className="home-page__section-head">
              <div className="flex min-w-0 items-center gap-2">
                <Inbox className="h-4 w-4 text-[var(--brand)]" />
                <h2 className="text-sm font-semibold">{isAdministrator ? '需要关注' : '我的待办'}</h2>
                {visibleAlerts.length > 0 && <Badge tone="error">{visibleAlerts.length} SLA</Badge>}
                {unreadCount > 0 && <Badge tone="brand">{unreadCount} 未读</Badge>}
              </div>
              <Link to="/tasks?risk=attention" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--brand)] hover:underline">
                全部 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {unreadCount > 0 && (
              <div className="home-page__unread mx-4 mb-1 flex items-center gap-2 text-[11px] md:mx-5">
                <BellRing className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
                <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{unreadNotifications[0]?.text}</span>
                <button type="button" onClick={ackAllNotifications} className="shrink-0 font-medium text-[var(--brand)] hover:underline">全部已读</button>
              </div>
            )}

            <div className="home-page__pending">
              {pendingItems.length > 0 ? (
                pendingItems.slice(0, 5).map((item: { id: string; to: string; title: string }) => (
                  <Link key={item.id} to={item.to} className="home-page__pending-row">
                    <span className="home-page__pending-dot" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  </Link>
                ))
              ) : (
                <p className="px-4 py-5 text-center text-[11px] text-[var(--text-muted)]">当前没有待处理事项</p>
              )}
            </div>
          </div>

          <div className="home-page__roi de-employee-shell rounded-xl bg-[var(--surface-1)]">
            <div className="home-page__section-head">
              <h2 className="text-sm font-semibold">投入产出</h2>
              <Link to="/agents" className="text-[11px] font-medium text-[var(--brand)] hover:underline">按岗位</Link>
            </div>
            <div className="home-page__roi-body">
              <div className="home-page__roi-cost">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">本月成本</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="text-2xl tabular-nums">¥{costUsed}</strong>
                  <span className="text-[11px] text-[var(--text-muted)]">/ ¥{costBudget}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${costPct}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-[var(--text-muted)]">
                  <span>已用 {Math.round(costPct)}%</span>
                  {costPct > 80 && <span className="text-[var(--warning)]">接近预算上限</span>}
                </div>
              </div>
              <div className="home-page__roi-metrics">
                <div className="home-page__roi-metric">
                  <span>完成任务</span>
                  <strong>{tc.done}</strong>
                </div>
                <div className="home-page__roi-metric">
                  <span>成功率</span>
                  <strong>{successRate == null ? '--' : `${Math.round(successRate)}%`}</strong>
                </div>
                <div className="home-page__roi-metric">
                  <span>每百元产出</span>
                  <strong>{perHundredYuan}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4 · 工作流三列 */}
        <div className="home-page__workstream grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="list-card home-page__panel flex flex-col">
            <div className="list-card__header">
              <div className="list-card__title">
                <Clock className="h-4 w-4 text-[var(--text-muted)]" />
                进行中任务
                <Badge tone="brand">{inProgress.length}</Badge>
              </div>
              <Link to="/tasks" className="chart-card__action">全部 <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="home-page__panel-body space-y-2">
              {inProgress.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="没有进行中的任务"
                  description="可从任务中心或专家协作发起"
                  action={
                    <Link to="/tasks" className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline">
                      打开任务中心 <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
              ) : (
                inProgress.map((t) => <InProgressTask key={t.id} t={t} />)
              )}
            </div>
          </div>

          <div className="list-card home-page__panel flex flex-col">
            <div className="list-card__header">
              <div className="list-card__title">
                <Bell className="h-4 w-4 text-[var(--text-muted)]" />
                最近活动
              </div>
              <button type="button" onClick={() => refetchExtra()} className="chart-card__action" disabled={fetchingExtra}>
                刷新 <Activity className={cn('h-3.5 w-3.5', fetchingExtra && 'animate-spin')} />
              </button>
            </div>
            <div className="home-page__panel-body activity-timeline">
              {(extra?.recentActivities ?? []).length === 0 ? (
                <EmptyState icon={Activity} title="暂无最近活动" />
              ) : (extra?.recentActivities ?? []).slice(0, 6).map((a: any) => {
                const Icon = ICON_MAP[a.type?.split?.('.')?.[0]] || Activity;
                return (
                  <div key={a.id} className="activity-timeline__item">
                    <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.tone}`)}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="activity-timeline__content">
                      <div className="activity-timeline__text">{a.text}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Avatar name={a.actor} size={14} />
                        <span className="text-[10px] text-[var(--text-muted)]">{a.actor}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">·</span>
                        <code className="font-mono text-[10px] text-[var(--brand)]">{a.resource}</code>
                      </div>
                      <div className="activity-timeline__time mt-0.5">{a.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <SlaAlertPanel
            alerts={visibleAlerts}
            isAdministrator={isAdministrator}
            canMutate={canMutate}
            acknowledging={acknowledgeAlert.isPending}
            onAcknowledge={(id) => acknowledgeAlert.mutate({ id, note: '已确认，待进入任务处置。' })}
          />
        </div>

      {/* 5 · 运行细节 */}
      <details

        className="home-page__runtime mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]"
        open={runtimeOpen}
        onToggle={(e) => setRuntimeOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold md:px-5">
          <span className="inline-flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            运行细节
            <span className="font-normal text-[var(--text-muted)]">完成度 · 24h 趋势{isAdministrator ? ' · 调用与团队' : ''}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 text-[var(--text-muted)] transition-transform', runtimeOpen && 'rotate-180')} />
        </summary>

        <div className="space-y-3 border-t border-[var(--border)] px-4 py-4 md:px-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Link to="/tasks" className="chart-card chart-card--interactive block">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Target className="h-3.5 w-3.5" />今日任务完成度
                </div>
                <span className="font-mono text-sm font-bold text-[var(--success)]">{tcDonePct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie data={ringData} dataKey="value" innerRadius={32} outerRadius={50} paddingAngle={2}>
                        {ringData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                      </Pie>
                    </RePieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <div className="font-mono text-xl font-bold leading-none">{tcTotal}</div>
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
                    </div>
                  ))}
                </div>
              </div>
            </Link>

            <div className="chart-card lg:col-span-2">
              <div className="list-card__header">
                <div className="list-card__title">
                  <Activity className="h-4 w-4 text-[var(--text-muted)]" />24h 系统运行趋势
                </div>
                <button type="button" onClick={() => refetchExtra()} className="chart-card__action" disabled={fetchingExtra}>
                  <Activity className={cn('h-3 w-3', fetchingExtra && 'animate-spin')} />刷新
                </button>
              </div>
              {healthData.length === 0 ? (
                <EmptyState icon={TrendingUp} title="暂无 24h 趋势数据" description="系统刚启动或数据采集中" />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {[
                    { key: 'health', label: '健康度', unit: '%', color: 'var(--chart-success)', gradient: 'health-trend-gradient', data: healthData.map((d: { time: string; health: number }) => ({ time: d.time, value: d.health })) },
                    { key: 'apiP95', label: 'API P95', unit: 'ms', color: 'var(--chart-info)', gradient: 'api-trend-gradient', data: healthData.map((d: { time: string; apiP95: number }) => ({ time: d.time, value: d.apiP95 })) },
                    { key: 'taskRate', label: '任务率', unit: '%', color: 'var(--brand)', gradient: 'task-trend-gradient', data: healthData.map((d: { time: string; taskRate: number }) => ({ time: d.time, value: d.taskRate })) },
                  ].map((metric) => (
                    <div key={metric.key} className="trend-mini-card">
                      <div className="trend-mini-card__header">
                        <span>{metric.label}</span>
                        <strong>{metric.data[metric.data.length - 1]?.value ?? '--'}{metric.unit}</strong>
                      </div>
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
                          <Tooltip
                            formatter={(value: number) => [`${value}${metric.unit}`, metric.label]}
                            contentStyle={{ background: chartTheme.tooltipBackground, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText, borderRadius: 6, fontSize: 11 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isAdministrator && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="list-card agent-trend-card">
                <div className="list-card__header">
                  <div>
                    <div className="list-card__title"><Bot className="h-3.5 w-3.5" />数字员工调用趋势（7 天）</div>
                    <div className="agent-trend-card__subtitle">按峰值归一化，查看相对变化</div>
                  </div>
                  <Link to="/agents" className="chart-card__action">管理 <ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
                {Object.keys(extra?.agent7dTrend ?? {}).length === 0 ? (
                  <EmptyState icon={BarChart3} title="暂无数字员工趋势数据" />
                ) : (() => {
                  const agentTrend = buildAgentTrendData(extra?.agent7dTrend ?? {});
                  return (
                    <div className="agent-trend-chart" aria-label="数字员工最近七天相对调用趋势">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={agentTrend.rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={36} />
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
                  );
                })()}
              </div>

              <div className="list-card">
                <div className="list-card__header">
                  <div className="list-card__title">
                    <Users className="h-3.5 w-3.5" />团队成员
                    <Badge tone="brand">{team?.filter((m: { online?: boolean }) => m.online).length ?? 0} 在线</Badge>
                  </div>
                  <Link to="/settings" className="chart-card__action">管理 <ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
                <div className="mb-3 space-y-2">
                  {(team ?? []).slice(0, 5).map((m: { id: string; name: string; role: string; online?: boolean }) => (
                    <div key={m.id} className="flex items-center gap-2.5">
                      <div className="relative">
                        <Avatar name={m.name} size={28} />
                        <span className={cn(
                          'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)]',
                          m.online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]',
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{m.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{m.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {roleData.length > 0 && (
                  <div className="section-divider">
                    <div className="mb-2 text-[10px] font-semibold text-[var(--text-muted)]">角色分布</div>
                    <ResponsiveContainer width="100%" height={80}>
                      <BarChart data={roleData} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="role" hide />
                        <Bar dataKey="count" fill="var(--brand)" radius={[0, 4, 4, 0]} />
                        <Tooltip contentStyle={{ background: chartTheme.tooltipBackground, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText, borderRadius: 6, fontSize: 11 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="list-card home-suggestions-card">
                <div className="list-card__header">
                  <div className="list-card__title">
                    <Lightbulb className="h-3.5 w-3.5 text-[var(--warning)]" />智能建议
                    <Badge tone="brand">{suggestions.length}</Badge>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">基于当前运行数据</span>
                </div>
                <div className="space-y-2">
                  {suggestions.length === 0 ? (
                    <EmptyState icon={ShieldCheck} title="暂无新的运营建议" description="基于当前运行数据" />
                  ) : suggestions.map((s: any) => {
                    const Icon = s.tone === 'success' ? CheckCircle2 : s.tone === 'warn' ? AlertTriangle : Lightbulb;
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
            </div>
          )}
        </div>
      </details>
      </div>
    </div>
  );
}

function SlaAlertPanel({
  alerts,
  isAdministrator,
  canMutate,
  acknowledging,
  onAcknowledge,
}: {
  alerts: any[];
  isAdministrator: boolean;
  canMutate: boolean;
  acknowledging: boolean;
  onAcknowledge: (id: string) => void;
}) {
  const { viewportRef, activeIndex, pause, resume } = useSlaRotation(alerts);

  return (
    <div className="list-card sla-alert-card home-page__panel home-page__panel--sla flex flex-col">
      <div className="list-card__header">
        <div className="list-card__title">
          <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
          SLA 处置
          <Badge tone="error">{alerts.length}</Badge>
        </div>
        <Link to="/tasks?risk=attention" className="chart-card__action">风险任务 <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div
        ref={viewportRef}
        className="sla-alert-card__viewport home-page__panel-body"
        onPointerEnter={pause}
        onPointerLeave={resume}
        onFocus={pause}
        onBlur={resume}
      >
        {alerts.length === 0 ? (
          <div className="chart-card__empty sla-alert-card__empty">
            <CheckCircle2 className="h-5 w-5" />当前没有待处理 SLA 告警
          </div>
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
            <Link to={`/tasks?task=${encodeURIComponent(alert.taskCode)}&risk=attention`} className="block transition-opacity hover:opacity-80">
              <div className="flex items-center justify-between">
                <div className="alert-list__title">{alert.text}</div>
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
              </div>
              <div className="alert-list__meta">{alert.time} · {alert.assignee} · {alert.taskCode}</div>
            </Link>
            {isAdministrator && canMutate && alert.level !== 'P0' && (
              <button
                type="button"
                onClick={() => onAcknowledge(alert.id)}
                disabled={acknowledging}
                className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--brand)] hover:underline disabled:text-[var(--text-muted)]"
              >
                <Check className="h-3 w-3" />确认并记录审计
              </button>
            )}
            {!canMutate && (
              <div className="mt-1.5 text-[10px] font-medium text-[var(--info)]">只读核查 · 请在任务核查中查看证据</div>
            )}
            {canMutate && alert.level === 'P0' && (
              <div className="mt-1.5 text-[10px] font-medium text-[var(--danger)]">需在任务中记录处置说明后确认</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InProgressTask({ t }: { t: Task }) {
  const slaSec = (t.slaRemainingMin ?? 60) * 60;
  const sla = useCountdown(slaSec);
  const pct = Math.round((t.progress.done / t.progress.total) * 100);
  const slaWarn = sla.raw < 60 * 60;
  const slaError = sla.raw < 30 * 60;
  const priorityTone: Record<string, 'error' | 'warn' | 'info' | 'neutral'> = {
    P0: 'error', P1: 'warn', P2: 'info', P3: 'neutral',
  };
  const collabNames = (t.collaboratorNames ?? []).slice(0, 2);

  return (
    <Link
      to={`/tasks?task=${encodeURIComponent(t.code)}`}
      className={cn(
        'task-list__item block transition-colors hover:border-[var(--brand)]',
        slaError ? 'task-tile--danger' : slaWarn ? 'task-tile--warning' : 'task-tile--success',
      )}
    >
      <div className="task-list__header">
        <span className="task-list__id">{t.code}</span>
        <Badge tone={priorityTone[t.priority]} className="text-[10px]">{t.priority}</Badge>
      </div>
      <div className="task-list__title">{t.title}</div>
      <div className="task-list__meta">
        <div className="flex items-center -space-x-1.5">
          <Avatar name={t.assignee ?? t.digitalEmployeeName ?? '?'} size={18} />
          {collabNames.map((name) => (
            <Avatar key={name} name={name} size={18} />
          ))}
        </div>
        {t.digitalEmployeeName && (
          <span className="task-list__meta-item">
            <Bot className="h-3 w-3 text-[var(--brand)]" />
            {t.digitalEmployeeName}
          </span>
        )}
        <span
          className={cn(
            'task-list__meta-item ml-auto inline-flex items-center gap-0.5 font-mono',
            slaError ? 'text-[var(--danger)]' : slaWarn ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]',
          )}
          title="SLA 倒计时"
        >
          <Clock className="h-3 w-3" />
          {sla.text}
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
    </Link>
  );
}
