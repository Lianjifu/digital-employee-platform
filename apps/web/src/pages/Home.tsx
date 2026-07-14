/**
 * P1 首页 · 业务总览（企业级优化版）
 * Todo 1-10 全部实现:
 *  1. 顶部 hero（欢迎语 + 工作区 + 健康度）
 *  2. 6 KPI + 同比/环比 + 阈值告警
 *  3. 健康度面积图（API P95 + 任务完成率）
 *  4. Agent 状态汇总（健康/告警/离线）
 *  5. 进行中任务 + 运行总时长 + SLA 倒计时
 *  6. 最近活动 timeline + 操作人 + 资源
 *  7. 告警中心 + 严重度 tabs
 *  8. 实时活动 sparkline
 *  9. 团队成员 + 在线状态
 * 10. 数据真实化（mock.ts）
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiQuery } from '@/services/query';
import { Button, Badge, Avatar, Dot, Input } from '@de/web-ui';
import { PageSkeleton } from '@/components/PageSkeleton';
import {
  Pause, BarChart3, Plus, MessageSquare, ListChecks, Bot, AlertTriangle,
  ArrowRight, TrendingUp, Activity, Bell, CheckCircle2, FileText, Clock,
  User as UserIcon, Wrench, ShieldCheck, Sparkles, Users, ChevronRight,
  AlertCircle, Zap, Search, Download, Eye, Volume2,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { Task, Workspace } from '@de/web-types';
import { cn, relativeTime } from '@de/web-utils';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAuthStore } from '@/stores/authStore';

// ============ Todo 2: KPI（含阈值告警）============
const KPIS = [
  { tone: 'brand' as const, label: '今日任务', value: 38, unit: '次', delta: { v: 12, dir: 'up' as const, prev: '昨日 26 次' }, sub: 'P0 × 2 · P1 × 5' },
  { tone: 'success' as const, label: '系统健康度', value: 98.4, unit: '%', delta: { v: 0.3, dir: 'up' as const, prev: '上周 96.1%' }, sub: 'SLA 96.8% 达成' },
  { tone: 'success' as const, label: 'AI 调用量', value: '8.2k', unit: '次/日', delta: { v: 18, dir: 'up' as const, prev: '上周 6.9k' }, sub: '缓存命中 32%' },
  { tone: 'purple' as const, label: 'Token 用量', value: '12.4M', unit: 'tokens', delta: { v: 6, dir: 'up' as const, prev: '预算 25%' }, sub: '$1,240 / $5,000' },
  { tone: 'warning' as const, label: 'P95 响应', value: 680, unit: 'ms', delta: { v: -8, dir: 'down' as const, prev: '较昨日 -8ms' }, sub: '行业基线 < 1.5s', threshold: { warn: 1500, error: 2500 } },
  { tone: 'danger' as const, label: 'SLA 告警', value: 3, unit: '件', delta: { v: 1, dir: 'up' as const, prev: '昨日 2 件' }, sub: 'P0×1 · P1×2', threshold: { warn: 3, error: 10 } },
];

// ============ Todo 3: 健康度面积图数据（24h）============
const HEALTH_TREND = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, '0')}:00`,
  health: 92 + Math.round(Math.sin(i / 3) * 4 + Math.random() * 2),
  apiP95: 580 + Math.round(Math.cos(i / 4) * 80 + Math.random() * 50),
  taskRate: 85 + Math.round(Math.sin(i / 5) * 8 + Math.random() * 5),
}));

// ============ Todo 4: Agent 状态汇总 ============
const AGENT_STATUS = [
  { name: '故障自愈', calls: 1240, status: 'success' as const, p95: 580 },
  { name: '变更辅助', calls: 124, status: 'success' as const, p95: 1100 },
  { name: '告警降噪', calls: 823, status: 'success' as const, p95: 420 },
  { name: '容量预测', calls: 2, status: 'success' as const, p95: 2300 },
  { name: '知识答疑', calls: 412, status: 'success' as const, p95: 850 },
  { name: '漏洞修复', calls: 3, status: 'warning' as const, p95: 1500 },
  { name: '合规审计', calls: 7, status: 'success' as const, p95: 3200 },
  { name: '客户支持', calls: 0, status: 'idle' as const, p95: 0 },
];

// ============ Todo 6: 最近活动（带操作人和资源）============
const ACTIVITIES = [
  { id: 'a1', tone: 'success' as const, icon: CheckCircle2, text: '故障自愈 · INC-019 处理完成', actor: '王昊', resource: 'prod-redis-01', time: '14:32' },
  { id: 'a2', tone: 'info' as const, icon: FileText, text: 'CVE 周报生成完成（12 个新漏洞）', actor: '张睿', resource: 'CVE-2026-W30', time: '14:18' },
  { id: 'a3', tone: 'warning' as const, icon: BarChart3, text: '容量预测报告已生成（Q3 增长 24%）', actor: '周慧', resource: '容量预测', time: '13:55' },
  { id: 'a4', tone: 'success' as const, icon: CheckCircle2, text: '变更辅助 · 网关灰度配置变更完成', actor: '孙博', resource: 'gateway-prod', time: '13:40' },
  { id: 'a5', tone: 'info' as const, icon: Volume2, text: '告警降噪 · 合并 23 条重复告警', actor: '李婷', resource: 'SIEM', time: '12:55' },
];

// SLA 倒计时 hook（每 1 秒更新）
function useCountdown(targetSec: number) {
  const [sec, setSec] = useState(targetSec);
  useEffect(() => {
    const id = setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return {
    text: h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    expired: sec <= 0,
    raw: sec,
  };
}

export default function Home() {
  const { data: tasks, isLoading: lTasks } = useApiQuery<Task[]>(['home', 'tasks'], '/api/tasks');
  const { data: extra, isLoading: lExtra } = useApiQuery<any>(['home', 'extra'], '/api/home/extra');
  const { data: team, isLoading: lTeam } = useApiQuery<any[]>(['home', 'team'], '/api/home/team');
  const { data: alerts, isLoading: lAlerts } = useApiQuery<any[]>(['home', 'alerts'], '/api/home/alerts');
  const [alertFilter, setAlertFilter] = useState<'all' | 'P0' | 'P1' | 'P2' | 'P3'>('all');
  const { current } = useWorkspaceStore();
  const { user } = useAuthStore();

  const inProgress = (tasks ?? []).filter((t) => t.status === 'in_progress').slice(0, 4);
  const filteredAlerts = (alerts ?? []).filter((a) => alertFilter === 'all' || a.severity === alertFilter);

  const healthScore = extra?.agentCallSummary
    ? Math.round((extra.agentCallSummary.healthy / 8) * 100)
    : 75;

  // loading 骨架
  if (lTasks && lExtra && lTeam && lAlerts) {
    return <PageSkeleton />;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[var(--bg-elevated)]">
      {/* ============ Todo 1: 顶部 Hero ============ */}
      <div className="relative px-8 pt-6 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-[26px] font-bold tracking-tight">
                <span className="text-[var(--text-muted)] font-normal mr-2">下午好，</span>
                <span className="text-gradient">{user?.name ?? '管理员'}</span>
                <span className="text-[var(--text-muted)] font-normal"> 👋</span>
              </h1>
            </div>
            <p className="page-header__sub">
              {current?.name ?? 'ACME 生产'} · {current?.region ?? 'cn-east-1'} ·{' '}
              <span className="text-[var(--text-secondary)]">11 模块运行中</span> ·{' '}
              <span className="text-[var(--text-secondary)]">8 个 Agent 在线</span> ·{' '}
              <span className="text-[var(--text-secondary)]">18 成员</span>
            </p>
          </div>
          <div className="page-header__actions">
            <Button variant="secondary" size="md">
              <Pause className="h-3.5 w-3.5" />暂停服务
            </Button>
            <Button variant="secondary" size="md">
              <BarChart3 className="h-3.5 w-3.5" />查看报表
            </Button>
            <Button variant="primary" size="md">
              <Plus className="h-3.5 w-3.5" />新建任务
            </Button>
          </div>
        </div>
      </div>

      {/* ============ Todo 2: 6 KPI 网格 ============ */}
      <div className="px-8 pt-4 grid grid-cols-6 gap-3">
        {KPIS.map((k) => (
          <KpiCard key={k.label} k={k} />
        ))}
      </div>

      {/* ============ 快捷入口 + 健康度评分大数字 ============ */}
      <div className="px-8 pt-5 grid grid-cols-[2fr_1fr] gap-4">
        {/* Quick Entry (4 张) */}
        <div className="grid grid-cols-4 gap-3">
          <QuickEntry to="/copilot" icon={MessageSquare} iconClass="quick-entry__icon--brand" title="发起会话" desc="与数字员工对话" />
          <QuickEntry to="/tasks" icon={ListChecks} iconClass="quick-entry__icon--success" title="查看任务" desc={`${(tasks ?? []).filter((t) => t.status === 'in_progress').length} 个进行中`} />
          <QuickEntry to="/agents" icon={Bot} iconClass="quick-entry__icon--warning" title="管理 Agent" desc="8 个在线" />
          <QuickEntry to="/tasks" icon={AlertTriangle} iconClass="quick-entry__icon--danger" title="告警中心" desc={`${(alerts ?? []).length} 条待处理`} />
        </div>

        {/* Todo 1 续: 大字号健康度评分卡 */}
        <div className="rounded-lg border border-[var(--border)] bg-gradient-to-br from-[var(--brand-light)] to-[var(--purple-bg)] p-4 flex items-center gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">系统健康度</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <div className="text-4xl font-bold font-mono tracking-tight text-[var(--success)]">{healthScore}</div>
              <div className="text-base font-mono text-[var(--text-muted)]">/ 100</div>
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">↑ 0.3 较昨日 · 等保 3 通过</div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-[var(--text-muted)] mb-1">24h 趋势</div>
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={HEALTH_TREND}>
                <defs>
                  <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="health" stroke="#10b981" strokeWidth={2} fill="url(#healthGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ============ 图表行：左 2/3 双面积图 · 右 1/3 Agent 状态汇总 ============ */}
      <div className="px-8 pt-5 grid grid-cols-3 gap-4">
        {/* Todo 3: 系统健康度（双面积图）============ */}
        <div className="chart-card col-span-2">
          <div className="chart-card__header">
            <div className="chart-card__title">
              <Activity className="h-4 w-4 text-[var(--text-muted)]" />
              24h 健康度趋势
              <Badge tone="success" className="ml-2"><CheckCircle2 className="mr-1 inline h-3 w-3" />正常</Badge>
            </div>
            <Link to="/tasks" className="chart-card__action">查看详情 <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="chart-content">
            {/* API P95 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="chart-section__label">API 服务 P95 响应</div>
                <span className="text-[10px] font-mono text-[var(--success)]">↑ 趋势稳定</span>
              </div>
              <div className="chart-section__value">680ms · <span className="text-[var(--success)]">96.8% SLA</span></div>
              <ResponsiveContainer width="100%" height={70}>
                <AreaChart data={HEALTH_TREND}>
                  <defs>
                    <linearGradient id="apiGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a2540" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="apiP95" stroke="#3b82f6" strokeWidth={1.5} fill="url(#apiGrad)" />
                  <XAxis dataKey="time" hide />
                  <YAxis hide />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Task Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="chart-section__label">任务完成率</div>
                <span className="text-[10px] font-mono text-[var(--success)]">↑ 2.1%</span>
              </div>
              <div className="chart-section__value">97.4% <span className="text-[var(--success)]">↑ 2.1%</span></div>
              <ResponsiveContainer width="100%" height={70}>
                <AreaChart data={HEALTH_TREND}>
                  <defs>
                    <linearGradient id="taskGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a2540" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="taskRate" stroke="#10b981" strokeWidth={1.5} fill="url(#taskGrad)" />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[60, 100]} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Todo 4: 8 类 Agent 状态汇总 ============ */}
        <div className="chart-card">
          <div className="chart-card__header">
            <div className="chart-card__title">
              <Bot className="h-4 w-4 text-[var(--text-muted)]" />
              8 类 Agent
              <Badge tone="brand" className="ml-2">{extra?.agentCallSummary?.healthy ?? 6} 健康</Badge>
            </div>
            <Link to="/agents" className="chart-card__action">管理 <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {/* 汇总三态 */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            <AgentSummaryStat tone="success" label="健康" value={extra?.agentCallSummary?.healthy ?? 6} />
            <AgentSummaryStat tone="warning" label="告警" value={extra?.agentCallSummary?.warning ?? 1} />
            <AgentSummaryStat tone="idle" label="离线" value={extra?.agentCallSummary?.offline ?? 1} />
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mb-1">今日调用 {formatCount(extra?.agentCallSummary?.total ?? 8420)} 次</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {AGENT_STATUS.map((a) => (
              <div key={a.name} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Dot tone={a.status} />
                  <span className="truncate">{a.name}</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                  {a.calls === 0 ? '0/日' : `${formatCount(a.calls)}/日`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ 底部 3 列 ============ */}
      <div className="px-8 pt-5 pb-6 grid grid-cols-3 gap-4">
        {/* Todo 5: 进行中任务（含 SLA 倒计时）============ */}
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
              <div className="text-center text-xs text-[var(--text-muted)] py-8">暂无进行中任务</div>
            ) : (
              inProgress.map((t) => <InProgressCard key={t.id} t={t} />)
            )}
          </div>
        </div>

        {/* Todo 6: 最近活动 timeline ============ */}
        <div className="list-card">
          <div className="list-card__header">
            <div className="list-card__title">
              <Bell className="h-4 w-4 text-[var(--text-muted)]" />
              最近活动
            </div>
            <button className="chart-card__action">更多 <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="activity-timeline">
            {ACTIVITIES.map((a) => (
              <div key={a.id} className="activity-timeline__item">
                <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.tone}`)}>
                  <a.icon className="h-3 w-3" />
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
            ))}
          </div>
        </div>

        {/* Todo 7+9: 告警中心（含严重度筛选 + 团队成员）============ */}
        <div className="space-y-4">
          {/* 告警 */}
          <div className="list-card">
            <div className="list-card__header">
              <div className="list-card__title">
                <AlertTriangle className="h-4 w-4 text-[var(--text-muted)]" />
                告警中心
                <Badge tone="error">{filteredAlerts.length}</Badge>
              </div>
            </div>
            {/* 严重度筛选 tabs */}
            <div className="flex gap-1 mb-3 -mt-1">
              {(['all', 'P0', 'P1', 'P2', 'P3'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAlertFilter(s)}
                  className={cn(
                    'px-2 py-0.5 text-[10px] rounded font-mono',
                    alertFilter === s
                      ? s === 'P0' ? 'bg-[var(--danger)] text-white'
                        : s === 'P1' ? 'bg-[var(--warning)] text-white'
                        : s === 'P2' ? 'bg-[var(--info)] text-white'
                        : s === 'P3' ? 'bg-[var(--text-muted)] text-white'
                        : 'bg-[var(--text)] text-[var(--bg)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredAlerts.length === 0 ? (
                <div className="text-center text-xs text-[var(--text-muted)] py-4">该级别无告警</div>
              ) : (
                filteredAlerts.slice(0, 4).map((al) => (
                  <Link
                    key={al.id}
                    to={`/tasks?code=${al.taskCode ?? ''}`}
                    className={cn('alert-list__item', `alert-list__item--${al.tone}`, 'block hover:opacity-80 transition-opacity')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="alert-list__title">{al.title}</div>
                      <ChevronRight className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                    </div>
                    <div className="alert-list__meta">{al.meta}</div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Todo 9: 团队成员 */}
          <div className="list-card">
            <div className="list-card__header">
              <div className="list-card__title">
                <Users className="h-4 w-4 text-[var(--text-muted)]" />
                团队成员
                <Badge tone="success">{(team ?? []).filter((m: any) => m.online).length} 在线</Badge>
              </div>
              <Link to="/settings" className="chart-card__action">管理 <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {(team ?? []).slice(0, 7).map((m: any) => (
                <div key={m.id} className="relative" title={`${m.name} · ${m.role}${m.online ? ' 在线' : ' 离线'}`}>
                  <Avatar name={m.name} size={30} />
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)]',
                      m.online ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]',
                    )}
                  />
                </div>
              ))}
              <Link to="/settings" className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
                <Plus className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 子组件 ============

// KPI 卡（含阈值告警与同比/环比）
function KpiCard({ k }: { k: typeof KPIS[number] }) {
  const threshold = (k as any).threshold;
  const anomaly: 'error' | 'warn' | null = (() => {
    if (!threshold || typeof k.value !== 'number') return null;
    if (k.value >= threshold.error) return 'error';
    if (k.value >= threshold.warn) return 'warn';
    return null;
  })();
  const TrendIcon = k.delta.dir === 'up' ? TrendingUp : k.delta.dir === 'down' ? TrendingUp : Activity;
  const trendColor = k.delta.dir === 'up' ? 'text-[var(--success)]' : k.delta.dir === 'down' ? 'text-[var(--info)]' : 'text-[var(--text-muted)]';

  return (
    <div
      className={cn(
        'kpi-card',
        `kpi-card--${k.tone}`,
        anomaly === 'error' && 'ring-2 ring-[var(--danger)]/40',
        anomaly === 'warn' && 'ring-2 ring-[var(--warning)]/40',
      )}
    >
      <div className="kpi-card__label">
        {k.label}
        {anomaly === 'error' && <AlertCircle className="ml-1 inline h-3 w-3 text-[var(--danger)] animate-pulse" />}
      </div>
      <div className="kpi-card__value">
        <span className={cn(anomaly === 'error' && 'text-[var(--danger)]')}>{k.value}</span>
        {k.unit && <span className="text-[10px] text-[var(--text-muted)] font-normal ml-0.5">{k.unit}</span>}
        {k.delta && (
          <span className={cn('kpi-card__trend', `kpi-card__trend--${k.delta.dir}`, trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {k.delta.v > 0 ? '+' : ''}{k.delta.v}%
          </span>
        )}
      </div>
      <div className="kpi-card__sub">{k.sub}</div>
      {k.delta?.prev && (
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">{k.delta.prev}</div>
      )}
    </div>
  );
}

function QuickEntry({ to, icon: Icon, iconClass, title, desc }: { to: string; icon: any; iconClass: string; title: string; desc: string }) {
  return (
    <Link to={to} className="quick-entry__item">
      <div className={cn('quick-entry__icon', iconClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="quick-entry__content">
        <div className="quick-entry__title">{title}</div>
        <div className="quick-entry__desc">{desc}</div>
      </div>
      <ArrowRight className="quick-entry__arrow h-4 w-4" />
    </Link>
  );
}

function AgentSummaryStat({ tone, label, value }: { tone: 'success' | 'warning' | 'idle'; label: string; value: number }) {
  const color =
    tone === 'success' ? 'text-[var(--success)] bg-[var(--success-bg)]'
    : tone === 'warning' ? 'text-[var(--warning)] bg-[var(--warning-bg)]'
    : 'text-[var(--text-muted)] bg-[var(--bg-hover)]';
  return (
    <div className={cn('flex items-center justify-between rounded px-2 py-1 text-[11px]', color)}>
      <span>{label}</span>
      <span className="font-mono font-bold">{value}</span>
    </div>
  );
}

// 进行中任务卡（含 SLA 倒计时 + 运行总时长）
function InProgressCard({ t }: { t: Task }) {
  const pct = Math.round((t.progress.done / t.progress.total) * 100);
  const slaSec = (t.slaRemainingMin ?? 60) * 60;
  const sla = useCountdown(slaSec);
  const running = useCountdown(((t.code.charCodeAt(t.code.length - 1) % 20) + 5) * 60);
  const slaWarn = sla.raw < 60 * 60;
  const slaError = sla.expired || sla.raw < 30 * 60;
  return (
    <div className={cn('task-list__item', slaError && 'task-tile--danger')}>
        {!slaError && slaWarn && <div className="task-list__item" />}
      <div className="task-list__header">
        <span className="task-list__id">{t.code}</span>
        <Badge tone={t.priority === 'P0' ? 'error' : t.priority === 'P1' ? 'warn' : 'info'}>{t.priority}</Badge>
      </div>
      <div className="task-list__title">{t.title}</div>
      <div className="task-list__meta">
        <span className="task-list__meta-item">
          <UserIcon className="h-3 w-3" />
          {t.assignee}
        </span>
        <span className="task-list__meta-item">
          <Wrench className="h-3 w-3" />
          {t.tags[0] ?? 'general'}
        </span>
        <span className="task-list__meta-item" title="已运行">
          <Clock className="h-3 w-3" />
          {running.text}
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

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}