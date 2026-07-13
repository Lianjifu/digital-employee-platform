/**
 * P1 首页 · 业务总览
 * 1:1 对齐 docs/01-product/mockups/p1-home.html
 */
import { Link } from 'react-router-dom';
import { useApiQuery } from '@/services/query';
import { Button, Badge, Dot } from '@de/web-ui';
import {
  Pause, BarChart3, Plus, MessageSquare, ListChecks, Bot, AlertTriangle,
  ArrowRight, TrendingUp, Activity, Bell, CheckCircle2, FileText, Clock,
  User as UserIcon, ArrowUp, Volume2, Wrench,
} from 'lucide-react';
import type { KpiCard as Kpi, Task } from '@de/web-types';
import { cn } from '@de/web-utils';

// ============ Quick Entries ============
const QUICK_ENTRIES = [
  { to: '/copilot', icon: MessageSquare, iconClass: 'quick-entry__icon--brand' as const, title: '发起会话', desc: '与数字员工对话' },
  { to: '/tasks', icon: ListChecks, iconClass: 'quick-entry__icon--success' as const, title: '查看任务', desc: '14 个进行中' },
  { to: '/agents', icon: Bot, iconClass: 'quick-entry__icon--warning' as const, title: '管理 Agent', desc: '8 个在线' },
  { to: '/tasks', icon: AlertTriangle, iconClass: 'quick-entry__icon--danger' as const, title: '告警中心', desc: '3 条待处理' },
];

// ============ KPI Cards（PSSP 6 列）============
const KPIS = [
  { tone: 'brand' as const, label: '任务进行中', value: 14, trend: { v: 3, dir: 'up' as const }, sub: 'P0 × 2 · P1 × 5' },
  { tone: 'warning' as const, label: '待复核', value: 5, sub: '较昨日 +1' },
  { tone: 'success' as const, label: '今日完成', value: 18, trend: { v: 5, dir: 'up' as const }, sub: 'SLA 达成 96.8%' },
  { tone: 'danger' as const, label: 'SLA 临近超时', value: 3, sub: '30 min 内超时' },
  { tone: 'purple' as const, label: '月 Token 用量', value: '12.4M', sub: '预算 25% · ¥1,240' },
  { tone: 'success' as const, label: '合规评分', value: 98, sub: '等保 3 · 94/94' },
];

// ============ 健康度柱状图（API P95）============
const API_BARS = [
  { h: 40, tone: 'success' as const },
  { h: 50, tone: 'success' as const },
  { h: 35, tone: 'success' as const },
  { h: 55, tone: 'success' as const },
  { h: 45, tone: 'success' as const },
  { h: 60, tone: 'warning' as const },
  { h: 50, tone: 'success' as const },
  { h: 65, tone: 'warning' as const },
];
const TASK_BARS = [
  { h: 60, tone: 'success' as const },
  { h: 70, tone: 'success' as const },
  { h: 65, tone: 'success' as const },
  { h: 75, tone: 'success' as const },
  { h: 80, tone: 'success' as const },
  { h: 85, tone: 'success' as const },
  { h: 95, tone: 'success' as const },
  { h: 100, tone: 'success' as const },
];

// ============ 8 类 Agent ============
const AGENTS = [
  { name: '故障自愈', count: '1.2k/日', status: 'success' as const },
  { name: '变更辅助', count: '124/日', status: 'success' as const },
  { name: '告警降噪', count: '823/日', status: 'success' as const },
  { name: '容量预测', count: '2/日', status: 'success' as const },
  { name: '知识答疑', count: '412/日', status: 'success' as const },
  { name: '漏洞修复', count: '3/日', status: 'warning' as const },
  { name: '合规审计', count: '7/日', status: 'success' as const },
  { name: '客户支持', count: '0/日', status: 'idle' as const },
];

// ============ Activity Timeline ============
const ACTIVITIES = [
  { dot: 'success' as const, icon: CheckCircle2, text: '故障自愈 · INC-019 处理完成', time: '14:32' },
  { dot: 'info' as const, icon: FileText, text: 'CVE 周报生成完成', time: '14:18' },
  { dot: 'warning' as const, icon: BarChart3, text: '容量预测报告已生成', time: '13:55' },
  { dot: 'success' as const, icon: CheckCircle2, text: '变更辅助 · 配置变更完成', time: '13:40' },
  { dot: 'info' as const, icon: Volume2, text: '告警降噪 · 合并 23 条告警', time: '12:55' },
];

// ============ Alerts ============
const ALERTS = [
  { tone: 'danger' as const, title: 'P0 · Redis cache-oom 临近超时', meta: '8 min 前 · 关联 INC-019' },
  { tone: 'warning' as const, title: 'P1 · 升级窗口确认', meta: '15 min 前 · 需确认' },
  { tone: 'info' as const, title: '提示 · 月度报表就绪', meta: '2h 前 · 可下载' },
];

export default function Home() {
  const { data: tasks } = useApiQuery<Task[]>(['home', 'tasks'], '/api/tasks');
  const inProgress = (tasks ?? []).filter((t) => t.status === 'in_progress').slice(0, 3);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ============ Page Header ============ */}
      <div className="px-8 pt-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="page-header__title">业务总览</h1>
            <p className="page-header__sub">
              ACME 生产环境
              <span>·</span>
              11 模块运行中
              <span>·</span>
              18 个 Agent 已启用
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

        {/* ============ Quick Entry（4 张）============ */}
        <div className="quick-entry">
          {QUICK_ENTRIES.map((q) => (
            <Link to={q.to} key={q.title} className="quick-entry__item">
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
      </div>

      {/* ============ Main Content ============ */}
      <div className="px-8 py-6 space-y-6">

        {/* KPI 6 列 */}
        <div className="grid grid-cols-6 gap-4">
          {KPIS.map((k) => (
            <div key={k.label} className={cn('kpi-card', `kpi-card--${k.tone}`)}>
              <div className="kpi-card__label">{k.label}</div>
              <div className="kpi-card__value">
                {k.value}
                {'trend' in k && k.trend && (
                  <span className={cn('kpi-card__trend', `kpi-card__trend--${k.trend.dir}`)}>
                    {k.trend.dir === 'up' ? <ArrowUp className="h-3 w-3" /> : null}
                    +{k.trend.v}
                  </span>
                )}
              </div>
              <div className="kpi-card__sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* 图表行：左 2/3 健康度 · 右 1/3 Agent 状态 */}
        <div className="grid grid-cols-3 gap-5">
          {/* 系统健康度 */}
          <div className="chart-card col-span-2">
            <div className="chart-card__header">
              <div className="chart-card__title">
                <Activity className="h-4 w-4 text-[var(--text-muted)]" />
                系统健康度
              </div>
              <Link to="/tasks" className="chart-card__action">
                查看详情 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="chart-content">
              {/* 左：API P95 */}
              <div>
                <div className="chart-section__label">API 服务 P95 响应时间</div>
                <div className="chart-section__value">680ms · 96.8% SLA</div>
                <div className="chart-bars">
                  {API_BARS.map((b, i) => (
                    <div
                      key={i}
                      className="chart-bar"
                      style={{ height: `${b.h}%`, background: `var(--${b.tone})` }}
                    />
                  ))}
                </div>
              </div>
              {/* 右：任务完成率 */}
              <div>
                <div className="chart-section__label">任务完成率（7 天）</div>
                <div className="chart-section__value">
                  97.4% <span className="text-[var(--success)]">↑ 2.1%</span>
                </div>
                <div className="chart-bars">
                  {TASK_BARS.map((b, i) => (
                    <div
                      key={i}
                      className="chart-bar"
                      style={{ height: `${b.h}%`, background: `var(--${b.tone})` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 8 类 Agent */}
          <div className="chart-card">
            <div className="chart-card__header">
              <div className="chart-card__title">
                <Bot className="h-4 w-4 text-[var(--text-muted)]" />
                8 类 Agent
              </div>
              <Link to="/agents" className="chart-card__action">
                管理 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="agent-status">
              {AGENTS.map((a) => (
                <div key={a.name} className="agent-status__item">
                  <div className="agent-status__info">
                    <Dot tone={a.status} />
                    <span className="agent-status__name">{a.name}</span>
                  </div>
                  <span className="agent-status__count">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部 3 列 */}
        <div className="grid grid-cols-3 gap-5">

          {/* 进行中任务 */}
          <div className="list-card">
            <div className="list-card__header">
              <div className="list-card__title">
                <Clock className="h-4 w-4 text-[var(--text-muted)]" />
                进行中任务
              </div>
              <Link to="/tasks" className="chart-card__action">
                查看全部 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div>
              {inProgress.length === 0 ? (
                <div className="text-center text-xs text-[var(--text-muted)] py-6">暂无进行中任务</div>
              ) : (
                inProgress.map((t) => {
                  const pct = Math.round((t.progress.done / t.progress.total) * 100);
                  const slaWarn = t.slaRemainingMin !== undefined && t.slaRemainingMin < 0;
                  return (
                    <div key={t.id} className="task-list__item">
                      <div className="task-list__header">
                        <span className="task-list__id">{t.code}</span>
                        <Badge tone={t.priority === 'P0' ? 'error' : t.priority === 'P1' ? 'warn' : 'info'}>
                          {t.priority}
                        </Badge>
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
                        {t.slaRemainingMin !== undefined && (
                          <span
                            className="task-list__meta-item"
                            style={{ color: slaWarn ? 'var(--danger)' : slaWarn === false && t.slaRemainingMin < 60 ? 'var(--warning)' : 'var(--success)' }}
                          >
                            <Clock className="h-3 w-3" />
                            {slaWarn ? `${Math.abs(t.slaRemainingMin)}min 超时` : `${t.slaRemainingMin}min`}
                          </span>
                        )}
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
                })
              )}
            </div>
          </div>

          {/* 最近活动 timeline */}
          <div className="list-card">
            <div className="list-card__header">
              <div className="list-card__title">
                <Bell className="h-4 w-4 text-[var(--text-muted)]" />
                最近活动
              </div>
            </div>
            <div className="activity-timeline">
              {ACTIVITIES.map((a, i) => (
                <div key={i} className="activity-timeline__item">
                  <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.dot}`)}>
                    <a.icon className="h-3 w-3" strokeWidth={a.dot === 'success' ? 3 : 2} />
                  </div>
                  <div className="activity-timeline__content">
                    <div className="activity-timeline__text">{a.text}</div>
                    <div className="activity-timeline__time">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 告警中心 */}
          <div className="list-card">
            <div className="list-card__header">
              <div className="list-card__title">
                <Bell className="h-4 w-4 text-[var(--text-muted)]" />
                告警中心
              </div>
            </div>
            <div>
              {ALERTS.map((al, i) => (
                <div key={i} className={cn('alert-list__item', `alert-list__item--${al.tone}`)}>
                  <div className="alert-list__title">{al.title}</div>
                  <div className="alert-list__meta">{al.meta}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}