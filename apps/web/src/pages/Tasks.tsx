/**
 * P3 任务 · Kanban
 * 1:1 对齐 docs/01-product/mockups/p3-tasks.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress, Avatar, Empty, Dot } from '@de/web-ui';
import { Clock, AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, Filter, Plus, User as UserIcon, Wrench, Pause } from 'lucide-react';
import { cn, relativeTime } from '@de/web-utils';
import type { Task, TaskStatus, Priority } from '@de/web-types';
import { DualSignModal } from '@/components/DualSignModal';

const COLUMNS: { key: TaskStatus; label: string; icon: any; tone: string }[] = [
  { key: 'in_progress', label: '进行中', icon: Clock, tone: 'border-[var(--brand)]' },
  { key: 'review', label: '待复核', icon: ShieldCheck, tone: 'border-[var(--warning)]' },
  { key: 'completed', label: '已完成', icon: CheckCircle2, tone: 'border-[var(--success)]' },
  { key: 'archived', label: '已归档', icon: RotateCcw, tone: 'border-[var(--border)]' },
];

const PRIORITY_TONE: Record<Priority, 'error' | 'warn' | 'info' | 'neutral'> = {
  P0: 'error', P1: 'warn', P2: 'info', P3: 'neutral',
};

// Kanban 任务卡按 SLA 状态用 3px 左边色（红=超时/紧急，黄=临近，绿=正常）
function slaAccent(t: Task): 'danger' | 'warning' | 'success' | 'info' {
  if (t.priority === 'P0') return 'danger';
  if (t.slaRemainingMin !== undefined && t.slaRemainingMin < 0) return 'danger';
  if (t.slaRemainingMin !== undefined && t.slaRemainingMin < 60) return 'warning';
  return 'success';
}

// 详情面板时间线
const DETAIL_TIMELINE = [
  { tone: 'success' as const, icon: CheckCircle2, text: 'Redis 重启完成', time: '08:24:12' },
  { tone: 'info' as const, icon: Wrench, text: '已执行 CONFIG SET maxmemory 8gb', time: '08:23:48' },
  { tone: 'warning' as const, icon: ShieldCheck, text: '王昊 (SRE) 已批准', time: '08:23:20' },
  { tone: 'info' as const, icon: ShieldCheck, text: '请求双签审批', time: '08:20:10' },
  { tone: 'neutral' as const, icon: UserIcon, text: '王昊 创建任务', time: '08:18:02' },
  { tone: 'info' as const, icon: AlertTriangle, text: '飞书告警接收 → P3 自动建任务', time: '08:12:30' },
];

export default function Tasks() {
  const { data: tasks } = useApiQuery<Task[]>(['tasks'], '/api/tasks');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);

  const active = tasks?.find((t) => t.id === activeId);
  const grouped = COLUMNS.map((c) => ({ ...c, items: (tasks ?? []).filter((t) => t.status === c.key) }));

  return (
    <div className="grid h-full grid-cols-[1fr_360px] divide-x divide-[var(--border)]">
      {/* 主区 */}
      <div className="flex h-full flex-col overflow-hidden">
        {/* 顶部 KPI（PSSP 3 张）============ */}
        <div className="grid grid-cols-3 gap-4 border-b border-[var(--border)] p-6">
          <Stat icon={<Clock className="h-4 w-4" />} label="今日任务" value="38" sub="次/日" />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="成功率" value="98.4" sub="%" tone="success" />
          <Stat icon={<ShieldCheck className="h-4 w-4" />} label="SLA 达成" value="96.8" sub="%" tone="primary" />
        </div>

        {/* 工具栏 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Filter className="h-3.5 w-3.5" />
            P0 · P1 · P2 · P3 · 按 SLA 排序
          </div>
          <Button size="sm"><Plus className="h-3.5 w-3.5" />新建任务</Button>
        </div>

        {/* Kanban 4 列 */}
        <div className="grid flex-1 grid-cols-4 gap-4 overflow-x-auto p-6">
          {grouped.map((col) => {
            const Icon = col.icon;
            return (
              <div key={col.key} className={cn('flex min-w-[260px] flex-col rounded-lg border-t-2 bg-[var(--bg)] border border-[var(--border)]', col.tone)}>
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    {col.label}
                  </div>
                  <Badge tone={col.items.length > 0 ? 'brand' : 'neutral'}>{col.items.length}</Badge>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-2 bg-[var(--bg-elevated)]">
                  {col.items.length === 0 && <Empty title="暂无任务" description="拖拽任务到此处" />}
                  {col.items.map((t) => {
                    const accent = slaAccent(t);
                    const pct = Math.round((t.progress.done / t.progress.total) * 100);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveId(t.id)}
                        className={cn(
                          'task-tile',
                          `task-tile--${accent}`,
                          activeId === t.id && 'card-active',
                        )}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <Badge tone={PRIORITY_TONE[t.priority]} className="text-[10px]">{t.priority}</Badge>
                          <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{t.code}</span>
                        </div>
                        <div className="mb-2 text-xs font-semibold leading-snug">{t.title}</div>
                        <div className="mb-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                          <span>{t.progress.done}/{t.progress.total}</span>
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            {t.assignee}
                          </span>
                        </div>
                        <Progress value={pct} tone={accent === 'danger' ? 'error' : accent === 'warning' ? 'warn' : 'primary'} />
                        {t.slaRemainingMin !== undefined && (
                          <div className={cn('mt-1.5 flex items-center gap-1 text-[10px]', t.slaRemainingMin < 0 ? 'text-[var(--danger)]' : t.slaRemainingMin < 60 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]')}>
                            <Clock className="h-3 w-3" />
                            {t.slaRemainingMin < 0 ? `超时 ${Math.abs(t.slaRemainingMin)}min` : `剩余 ${t.slaRemainingMin}min`}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧详情 */}
      <aside className="flex h-full flex-col overflow-hidden bg-[var(--bg)]">
        {active ? (
          <>
            <div className="border-b border-[var(--border)] p-5">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={PRIORITY_TONE[active.priority]}>{active.priority}</Badge>
                <span className="font-mono text-xs text-[var(--text-muted)]">{active.code}</span>
                {active.relatedTaskCode && <Badge tone="info">关联 {active.relatedTaskCode}</Badge>}
              </div>
              <h3 className="text-base font-semibold">{active.title}</h3>
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Avatar name={active.assignee ?? '?'} size={20} />
                <span>{active.assignee}</span>
                <span>·</span>
                <span>AI Agent: 故障自愈 v1.4.2</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* 步骤进度 */}
              <div>
                <div className="mb-1.5 text-xs font-semibold text-[var(--text-secondary)]">步骤进度</div>
                <Progress value={active.progress.done} max={active.progress.total} />
                <div className="mt-1.5 flex justify-between text-xs">
                  <span>{active.progress.done}/{active.progress.total}</span>
                  <span className="font-mono text-[var(--text-muted)]">{Math.round((active.progress.done / active.progress.total) * 100)}%</span>
                </div>
              </div>

              {/* 审计流水 */}
              <div>
                <div className="mb-3 text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  审计流水（双签）
                </div>
                <div className="activity-timeline">
                  {DETAIL_TIMELINE.map((e, i) => (
                    <div key={i} className="activity-timeline__item">
                      <div className={cn('activity-timeline__dot', e.tone !== 'neutral' && `activity-timeline__dot--${e.tone}`)}>
                        <e.icon className="h-3 w-3" />
                      </div>
                      <div className="activity-timeline__content">
                        <div className="activity-timeline__text">{e.text}</div>
                        <div className="activity-timeline__time">{e.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 标签 */}
              <div>
                <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">标签</div>
                <div className="flex flex-wrap gap-1.5">
                  {active.tags.map((tag) => (
                    <span key={tag} className="nav-pill">#{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--border)] p-4">
              <Button size="sm" variant="secondary" className="flex-1">
                <Pause className="h-3.5 w-3.5" />暂停
              </Button>
              <Button size="sm" onClick={() => setSignOpen(true)} className="flex-1">
                <ShieldCheck className="h-3.5 w-3.5" />批准（双签）
              </Button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-center px-6">
            <div>
              <div className="mb-2 text-4xl">📋</div>
              <div className="text-sm text-[var(--text-muted)]">选择左侧任务查看详情</div>
            </div>
          </div>
        )}
      </aside>

      <DualSignModal
        open={signOpen}
        title={active?.title ?? ''}
        description={active?.code}
        onClose={() => setSignOpen(false)}
        onApprove={(name) => {
          setSignOpen(false);
          alert(`${name} 已签发 (mock)`);
        }}
      />
    </div>
  );
}

function Stat({ label, value, sub, tone, icon }: { label: string; value: any; sub?: string; tone?: 'success' | 'primary'; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 flex items-center justify-between">
      <div>
        <div className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">{label}</div>
        <div className={cn('mt-1 text-2xl font-bold font-mono tracking-tight', tone === 'success' ? 'text-[var(--success)]' : tone === 'primary' ? 'text-[var(--brand)]' : 'text-[var(--text)]')}>
          {value}<span className="ml-1 text-xs text-[var(--text-muted)] font-normal">{sub}</span>
        </div>
      </div>
      <div className="text-[var(--text-muted)]">{icon}</div>
    </div>
  );
}