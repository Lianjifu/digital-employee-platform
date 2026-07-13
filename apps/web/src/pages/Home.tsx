import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge } from '@de/web-ui';
import { TrendingUp, TrendingDown, Minus, Activity, AlertTriangle, CheckCircle2, Zap, ShieldCheck } from 'lucide-react';
import { cn, relativeTime } from '@de/web-utils';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid,
} from 'recharts';
import type { KpiCard as Kpi } from '@de/web-types';

const TONE: Record<string, string> = {
  ok: 'text-emerald-500',
  warn: 'text-amber-500',
  error: 'text-rose-500',
};

function KpiTile({ k }: { k: Kpi }) {
  const TrendIcon = k.delta?.trend === 'up' ? TrendingUp : k.delta?.trend === 'down' ? TrendingDown : Minus;
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--color-text-muted)]">{k.label}</div>
          {k.status === 'warn' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          {k.status === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
        </div>
        <div className="flex items-baseline gap-1.5">
          <div className={cn('text-2xl font-semibold', TONE[k.status ?? 'ok'])}>{k.value}</div>
          {k.unit && <div className="text-xs text-[var(--color-text-muted)]">{k.unit}</div>}
        </div>
        {k.delta && (
          <div className={cn('flex items-center gap-1 text-xs', k.delta.trend === 'up' ? 'text-emerald-500' : k.delta.trend === 'down' ? 'text-rose-500' : 'text-[var(--color-text-muted)]')}>
            <TrendIcon className="h-3 w-3" />
            <span>较昨日 {k.delta.value > 0 ? '+' : ''}{k.delta.value}{k.unit ?? ''}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const ACTIVITY_DATA = [
  { time: '00', active: 12, review: 3, done: 28 },
  { time: '04', active: 8, review: 2, done: 14 },
  { time: '08', active: 24, review: 6, done: 32 },
  { time: '12', active: 38, review: 5, done: 41 },
  { time: '16', active: 32, review: 8, done: 38 },
  { time: '20', active: 18, review: 4, done: 22 },
];

const PROVIDER_PIE = [
  { name: 'Anthropic', value: 68, color: '#3b82f6' },
  { name: 'Qwen2.5', value: 26, color: '#10b981' },
  { name: 'DeepSeek', value: 4, color: '#a78bfa' },
  { name: 'Other', value: 2, color: '#64748b' },
];

export default function Home() {
  const { data: kpis } = useApiQuery<Kpi[]>(['home', 'kpis'], '/api/home/kpis');
  const { data: events } = useApiQuery<any[]>(['home', 'events'], '/api/home/events');
  const { data: tasks } = useApiQuery<any[]>(['home', 'tasks'], '/api/tasks');

  const inProgress = (tasks ?? []).filter((t) => t.status === 'in_progress');
  const review = (tasks ?? []).filter((t) => t.status === 'review');
  const completed = (tasks ?? []).filter((t) => t.status === 'completed');

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">系统总览</h1>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">实时刷新 · 数据来源：P3 任务 · P5 智能体 · P9 模型 · P11 合规</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          最后更新：刚刚
        </div>
      </div>

      {/* 8 KPI */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {(kpis ?? []).map((k) => (
          <KpiTile key={k.id} k={k} />
        ))}
      </div>

      {/* 4 块活动区 */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {/* 进行中任务 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--color-primary)]" />
              进行中任务
              <Badge tone="primary">{inProgress.length}</Badge>
            </CardTitle>
            <a className="text-xs text-[var(--color-primary)] hover:underline" href="/tasks">查看全部</a>
          </CardHeader>
          <CardBody className="space-y-2">
            {inProgress.slice(0, 4).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs">
                <div className="flex-1 truncate">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{t.code} · {t.assignee}</div>
                </div>
                <Badge tone={t.priority === 'P0' ? 'error' : t.priority === 'P1' ? 'warn' : 'info'}>{t.priority}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* 待复核 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              待双签复核
              <Badge tone="warn">{review.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {review.slice(0, 4).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                <div className="flex-1 truncate">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{t.code}</div>
                </div>
                <Badge tone="warn">双签</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* 今日完成 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              今日完成
              <Badge tone="success">{completed.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {completed.slice(0, 4).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
                <div className="flex-1 truncate">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{relativeTime(t.updatedAt)}</div>
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[var(--color-primary)]" />
              24h 任务活动
            </CardTitle>
            <div className="flex gap-3 text-[10px] text-[var(--color-text-muted)]">
              <span>● 进行中</span>
              <span className="text-amber-500">● 待复核</span>
              <span className="text-emerald-500">● 已完成</span>
            </div>
          </CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ACTIVITY_DATA}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1a2540" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#8a9bc4" fontSize={10} />
                <YAxis stroke="#8a9bc4" fontSize={10} />
                <Tooltip contentStyle={{ background: '#111a2e', border: '1px solid #2a3a64', borderRadius: 6 }} />
                <Area type="monotone" dataKey="active" stroke="#3b82f6" fill="url(#g1)" />
                <Area type="monotone" dataKey="done" stroke="#10b981" fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Token 用量分布</CardTitle>
            <span className="text-xs text-[var(--color-text-muted)]">本月 12.4M</span>
          </CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={PROVIDER_PIE} dataKey="value" innerRadius={50} outerRadius={80}>
                  {PROVIDER_PIE.map((p) => (
                    <Cell key={p.name} fill={p.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#111a2e', border: '1px solid #2a3a64', borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
              {PROVIDER_PIE.map((p) => (
                <div key={p.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                  <span className="text-[var(--color-text-muted)]">{p.name}</span>
                  <span className="ml-auto">{p.value}%</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 最近事件 */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>最近 5 次事件</CardTitle>
          <a className="text-xs text-[var(--color-primary)] hover:underline" href="#">查看全部</a>
        </CardHeader>
        <CardBody className="divide-y divide-[var(--color-border)]">
          {(events ?? []).map((e: any) => (
            <div key={e.id} className="flex items-center justify-between py-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge tone={e.type.startsWith('sla') ? 'warn' : e.type.includes('completed') ? 'success' : 'info'}>{e.type.split('.')[0]}</Badge>
                <span>{e.text}</span>
              </div>
              <span className="text-[var(--color-text-muted)]">{relativeTime(e.time)}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}