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
 * 13. 快捷链接面板
 * 14. 建议（自动诊断）
 */
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress, Avatar, Dot } from '@de/web-ui';
import { PageSkeleton } from '@/components/PageSkeleton';
import {
  Pause, BarChart3, Plus, MessageSquare, ListChecks, Bot, AlertTriangle,
  ArrowRight, TrendingUp, Activity, Bell, CheckCircle2, FileText, Clock,
  User as UserIcon, Wrench, ShieldCheck, Sparkles, Users, ChevronRight,
  AlertCircle, Volume2, Database, Search, Cpu, Workflow, Settings,
  Check, Zap, BellRing, BellOff, TrendingDown, X, Eye, ArrowUp,
  ArrowDown, Target, DollarSign, PieChart, Lightbulb, ChevronUp,
  MessageSquare as ChatIcon, Inbox,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart as RePieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar,
} from 'recharts';
import { cn, relativeTime } from '@de/web-utils';
import type { Task } from '@de/web-types';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n';

const TONE_MAP: Record<string, 'success' | 'warn' | 'info' | 'error' | 'brand'> = {
  success: 'success', warn: 'warn', info: 'info', danger: 'error', error: 'error',
};

const ICON_MAP: Record<string, any> = {
  AlertTriangle, CheckCircle2, Sparkles, Activity, Bot, Wrench,
  MessageSquare, ListChecks, Clock, ShieldCheck, Database, Search,
  Cpu, Workflow, Settings, AlertCircle, Volume2, FileText, Users,
  Plus, BarChart3, Zap, Target, DollarSign, Inbox, ChatIcon, PieChart,
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
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

export default function Home() {
  const { t } = useT();
  const now = useNow();
  const greeting = getGreeting();

  const { data: tasks, isLoading: lTasks } = useApiQuery<Task[]>(['home', 'tasks'], '/api/tasks');
  const { data: extra, isLoading: lExtra } = useApiQuery<any>(['home', 'extra'], '/api/home/extra');
  const { data: team, isLoading: lTeam } = useApiQuery<any[]>(['home', 'team'], '/api/home/team');
  const { data: alerts, isLoading: lAlerts } = useApiQuery<any[]>(['home', 'alerts'], '/api/home/alerts');
  const { current } = useWorkspaceStore();
  const { user } = useAuthStore();

  // 通知条已读态
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const ackAll = () => {
    setReadIds(new Set((extra?.notifications ?? []).map((n: any) => n.id)));
  };

  if (lTasks && lExtra && lTeam && lAlerts) {
    return <PageSkeleton />;
  }

  const inProgress = (tasks ?? []).filter((t) => t.status === 'in_progress').slice(0, 4);
  const review = (tasks ?? []).filter((t) => t.status === 'review');
  const completed = (tasks ?? []).filter((t) => t.status === 'completed');

  const healthScore = extra?.agentCallSummary
    ? Math.round((extra.agentCallSummary.healthy / 8) * 100)
    : 75;

  // 任务完成度（环形图数据）
  const tc = extra?.taskCompletion ?? { done: 18, doing: 14, review: 5, todo: 9 };
  const tcTotal = tc.done + tc.doing + tc.review + tc.todo;
  const tcDonePct = (tc.done / tcTotal) * 100;
  const ringData = [
    { name: '已完成', value: tc.done, fill: '#10b981' },
    { name: '进行中', value: tc.doing, fill: '#3b82f6' },
    { name: '待复核', value: tc.review, fill: '#f59e0b' },
    { name: '待办', value: tc.todo, fill: '#64748b' },
  ];

  // 24h 健康度数据
  const healthData = (extra?.healthTrend24h ?? []).map((v: number, i: number) => ({
    time: `${String(i).padStart(2, '0')}:00`,
    health: v,
    apiP95: 580 + Math.round(Math.cos(i / 4) * 80 + Math.random() * 50),
    taskRate: 85 + Math.round(Math.sin(i / 5) * 8 + Math.random() * 5),
  }));

  // 7 天成本
  const costData = (extra?.costMonth?.daily ?? []).map((v: number, i: number) => ({
    day: `D${i + 1}`,
    cost: v,
  }));

  // 角色分布
  const roleData = extra?.roleDistribution ?? [];

  // 未读通知
  const unreadCount = (extra?.notifications ?? []).filter(
    (n: any) => n.unread && !readIds.has(n.id),
  ).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[var(--bg-elevated)]">
      {/* ============ 顶部 Hero + 实时时间 ============ */}
      <div className="relative px-6 pt-5 md:px-8 md:pt-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[24px] md:text-[28px] font-bold tracking-tight">
              <span className="text-[var(--text-muted)] font-normal mr-2">{greeting}，</span>
              <span className="text-gradient">{user?.name ?? '管理员'}</span>
              <span className="ml-2">👋</span>
            </h1>
            <p className="page-header__sub">
              {current?.name ?? 'ACME 生产'} · {current?.region ?? 'cn-east-1'} ·{' '}
              <span className="text-[var(--text-secondary)]">今日 {tasks?.length ?? 38} 任务</span> ·{' '}
              <span className="text-[var(--text-secondary)]">8 Agent 在线</span> ·{' '}
              <span className="text-[var(--text-secondary)]">18 成员</span> ·{' '}
              <span className="text-[var(--success)]">99.4% SLA</span> ·{' '}
              <span className="text-[var(--brand)]">$1.24k / $5k</span>
              <span className="ml-2 font-mono text-[var(--text-muted)]">
                {now.toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
            </p>
          </div>
          <div className="page-header__actions flex items-center gap-2">
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

      {/* ============ Todo 2: 实时通知条（顶部） ============ */}
      {unreadCount > 0 && (
        <div className="mx-6 md:mx-8 mt-4">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand-light)] px-3 py-2 text-xs">
            <BellRing className="h-3.5 w-3.5 text-[var(--brand)] animate-pulse" />
            <span className="text-[var(--brand)] font-semibold">{unreadCount} 条未读通知</span>
            <span className="text-[var(--text-muted)] truncate flex-1">
              {extra?.notifications?.find((n: any) => n.unread && !readIds.has(n.id))?.text}
              {extra?.notifications?.find((n: any) => n.unread && !readIds.has(n.id))?.detail && (
                <span className="text-[var(--text-muted)]"> · {extra?.notifications?.find((n: any) => n.unread && !readIds.has(n.id))?.detail}</span>
              )}
            </span>
            <Button size="sm" variant="secondary" onClick={ackAll}>
              <Check className="h-3 w-3" />全部已读
            </Button>
          </div>
        </div>
      )}

      {/* ============ 6 KPI 卡（可点击跳转）============ */}
      <div className="px-6 md:px-8 mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Link to="/tasks" className="block cursor-pointer group">
          <KpiCard tone="brand" label="今日任务" value={38} unit="次" delta={{ v: 12, dir: 'up' }} sparkline={[5, 8, 6, 9, 11, 10, 12]} prev="昨日 26 · P0×2 P1×5" />
        </Link>
        <Link to="/home" className="block cursor-pointer group">
          <KpiCard tone="success" label="系统健康度" value={98.4} unit="%" delta={{ v: 0.3, dir: 'up' }} sparkline={extra?.healthTrend24h?.slice(-7) ?? [95, 96, 98, 97, 99, 100, 99]} prev="18/19 服务正常 · 1 故障" />
        </Link>
        <Link to="/agents" className="block cursor-pointer group">
          <KpiCard tone="success" label="AI 调用量" value="8.2k" unit="次/日" delta={{ v: 18, dir: 'up' }} sparkline={[120, 180, 220, 190, 240, 280, 310]} prev="8,180 成功 · 240 失败" />
        </Link>
        <Link to="/models" className="block cursor-pointer group">
          <KpiCard tone="purple" label="Token 用量" value="12.4M" unit="tokens" delta={{ v: 6, dir: 'up' }} sparkline={[10, 12, 11, 13, 14, 12.4, 12.4]} prev="8.4M 输入 / 2.8M 输出" />
        </Link>
        <Link to="/copilot" className="block cursor-pointer group">
          <KpiCard tone="warning" label="P95 响应" value={680} unit="ms" delta={{ v: -8, dir: 'down' }} sparkline={[720, 700, 690, 680, 670, 660, 680]} prev="API 680 / Agent 1100 / RAG 320" />
        </Link>
        <Link to="/tasks" className="block cursor-pointer group">
          <KpiCard tone="error" label="SLA 告警" value={3} unit="件" delta={{ v: 1, dir: 'up' }} sparkline={[1, 0, 2, 1, 0, 2, 3]} prev="1 P0 · 2 P1 · 8min 响应" threshold={{ warn: 3, error: 10 }} />
        </Link>
      </div>

      {/* ============ 快捷入口 + 健康度评分（Todo 5 增强） ============ */}
      <div className="px-6 md:px-8 pt-5 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: '/copilot', icon: MessageSquare, iconClass: 'quick-entry__icon--brand', title: '发起会话', desc: `与故障自愈 v1.4.2 对话` },
            { to: '/tasks', icon: ListChecks, iconClass: 'quick-entry__icon--success', title: '查看任务', desc: `${inProgress.length} 进行中 · 5 待复核` },
            { to: '/agents', icon: Bot, iconClass: 'quick-entry__icon--warning', title: '管理 Agent', desc: '8 在线 · 1 告警 · 0 离线' },
            { to: '/home', icon: AlertTriangle, iconClass: 'quick-entry__icon--danger', title: '告警中心', desc: `${extra?.slaAlerts?.length ?? 3} P0/P1 · 1 临近超时` },
          ].map((q) => (
            <Link
              key={q.title}
              to={q.to}
              className="quick-entry__item transition-transform hover:-translate-y-0.5"
            >
              <div className={cn('quick-entry__icon', q.iconClass)}>
                <q.icon className="h-5 w-5" />
              </div>
              <div className="quick-entry__content">
                <div className="quick-entry__title">{q.title}</div>
                <div className="quick-entry__desc">{q.desc}</div>
              </div>
              <ArrowRight className="quick-entry__arrow h-4 w-4" />
            </Link>
          ))}
        </div>

        {/* Todo 5: 健康度评分 + 诊断建议 */}
        <div className="rounded-xl border border-[var(--border)] bg-gradient-to-br from-[var(--brand-light)] to-[var(--purple-bg)] p-4">
          <div className="flex items-start gap-4">
            <div className="relative h-20 w-20 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={6} data={[{ name: 'h', value: healthScore, fill: 'url(#g)' }]} startAngle={90} endAngle={-270}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <RadialBar dataKey="value" cornerRadius={3} background={{ fill: 'rgba(0,0,0,0.06)' }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-xl font-bold font-mono text-[var(--success)] leading-none">{healthScore}</div>
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
      <div className="px-6 md:px-8 pt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Todo 4: 任务完成度环 */}
        <Link to="/tasks" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 block hover:border-[var(--brand)] transition-all group">
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
        <Link to="/home" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 block lg:col-span-2 hover:border-[var(--brand)] transition-all group">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />24h 系统健康度趋势
              <span className="text-[9px] text-[var(--brand)] group-hover:underline ml-1">刷新</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />健康度</span>
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />API P95</span>
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--purple)]" />任务率</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={healthData}>
              <defs>
                <linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hg3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1a2540" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="health" stroke="#10b981" strokeWidth={2} fill="url(#hg1)" />
              <Area type="monotone" dataKey="apiP95" stroke="#3b82f6" strokeWidth={1.5} fill="url(#hg2)" />
              <Area type="monotone" dataKey="taskRate" stroke="#a78bfa" strokeWidth={1.5} fill="url(#hg3)" />
              <XAxis dataKey="time" hide />
              <YAxis hide />
              <Tooltip contentStyle={{ background: '#131a2d', border: '1px solid #2a3654', borderRadius: 6, fontSize: 11 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Link>
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
              <div className="text-center text-xs text-[var(--text-muted)] py-8">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                没有进行中的任务
              </div>
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
            <button className="chart-card__action">更多 <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="activity-timeline">
            {(extra?.recentActivities ?? []).map((a: any) => {
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

        {/* SLA 告警（Todo 10: 实时滚动 + 一键 ACK）============ */}
        <div className="space-y-4">
          <div className="list-card">
            <div className="list-card__header">
              <div className="list-card__title">
                <AlertTriangle className="h-4 w-4 text-[var(--text-muted)]" />
                SLA 告警
                <Badge tone="error">{(extra?.slaAlerts ?? []).length}</Badge>
              </div>
              <button onClick={ackAll} className="chart-card__action">
                <Check className="h-3 w-3" />全部 ACK
              </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {(extra?.slaAlerts ?? []).map((a: any) => (
                <Link
                  key={a.id}
                  to="/tasks"
                  className={cn(
                    'alert-list__item block hover:opacity-80 transition-opacity',
                    `alert-list__item--${a.level === 'P0' ? 'danger' : a.level === 'P1' ? 'warning' : a.level === 'P2' ? 'info' : 'neutral'}`,
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="alert-list__title">{a.text}</div>
                    <ChevronRight className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                  </div>
                  <div className="alert-list__meta">{a.time} · {a.assignee} · {a.taskCode}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* Todo 12: 本月成本仪表 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />本月成本
              </div>
              <span className="font-mono text-sm font-bold">${extra?.costMonth?.used ?? 1240}</span>
            </div>
            <Progress value={((extra?.costMonth?.used ?? 0) / (extra?.costMonth?.budget ?? 5000)) * 100} tone="success" />
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
              <span>预算 ${extra?.costMonth?.budget ?? 5000}</span>
              <span>{(((extra?.costMonth?.used ?? 0) / (extra?.costMonth?.budget ?? 5000)) * 100).toFixed(0)}%</span>
            </div>
            <ResponsiveContainer width="100%" height={40} className="mt-2">
              <AreaChart data={costData}>
                <defs>
                  <linearGradient id="costG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={1.5} fill="url(#costG)" />
                <XAxis dataKey="day" hide />
                <YAxis hide />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ============ 第二行：Agent 状态 + 团队成员 + 建议 ============ */}
      <div className="px-6 md:px-8 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Todo 7: Agent 状态 + 7 天趋势 */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" />8 类 Agent 调用趋势（7 天）
            </div>
            <Link to="/agents" className="text-[10px] text-[var(--brand)] hover:underline">管理</Link>
          </div>
          <div className="space-y-2.5">
            {Object.entries(extra?.agent7dTrend ?? {}).map(([name, values]) => {
              const total = (values as number[]).reduce((s, v) => s + v, 0);
              const max = Math.max(...(values as number[]), 1);
              return (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-20 text-[11px] truncate">{name}</div>
                  <div className="flex-1 h-6 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={(values as number[]).map((v, i) => ({ i, v }))}>
                        <defs>
                          <linearGradient id={`ag${name}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="v" stroke="#4f46e5" strokeWidth={1.5} fill={`url(#ag${name})`} />
                        <XAxis dataKey="i" hide />
                        <YAxis hide domain={[0, max * 1.2]} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-12 text-right font-mono text-[10px] text-[var(--text-muted)]">
                    {total.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Todo 11: 团队成员 + 角色分布 */}
        <Link to="/settings" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 block hover:border-[var(--brand)] transition-all group">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />团队成员 ({team?.filter((m: any) => m.online).length ?? 0} 在线)
              <span className="text-[9px] text-[var(--brand)] group-hover:underline ml-1">详情 →</span>
            </div>
            <Link to="/settings" className="text-[10px] text-[var(--brand)] hover:underline">管理</Link>
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
          <div className="border-t border-[var(--border)] pt-3">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-2">角色分布</div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={roleData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="role" hide />
                <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                <Tooltip contentStyle={{ background: '#131a2d', border: '1px solid #2a3654', borderRadius: 6, fontSize: 11 }} />
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
        </Link>

        {/* Todo 14: 智能建议 + Todo 13: 快捷链接 */}
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-[var(--warning)]" />智能建议
            </div>
            <div className="space-y-2">
              {(extra?.suggestion ?? []).map((s: any) => {
                const Icon = s.tone === 'success' ? CheckCircle2 : s.tone === 'warn' ? AlertTriangle : Sparkles;
                const tone = s.tone === 'success' ? 'text-[var(--success)]' : s.tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--info)]';
                return (
                  <div key={s.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                    <div className="flex items-start gap-1.5">
                      <Icon className={cn('h-3 w-3 shrink-0 mt-0.5', tone)} />
                      <span className="flex-1 text-[var(--text-secondary)]">{s.text}</span>
                    </div>
                    <Link to={s.to} className="mt-1 inline-block text-[10px] text-[var(--brand)] hover:underline">
                      {s.action} →
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />快捷直达
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(extra?.quickLinks ?? []).map((l: any) => {
                const Icon = ICON_MAP[l.icon] ?? Sparkles;
                return (
                  <Link
                    key={l.to + l.label}
                    to={l.to}
                    title={l.desc}
                    className="flex flex-col items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[10px] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate w-full text-center">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 子组件 ============

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
                  <linearGradient id={`sp${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="currentColor" strokeWidth={1.2} fill={`url(#sp${label})`} />
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