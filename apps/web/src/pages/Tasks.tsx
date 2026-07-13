import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Progress, Avatar, Empty } from '@de/web-ui';
import { Clock, AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, Filter, Plus } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Task, TaskStatus, Priority } from '@de/web-types';
import { DualSignModal } from '@/components/DualSignModal';

const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'in_progress', label: '进行中', color: 'border-[var(--brand)]' },
  { key: 'review', label: '待复核', color: 'border-amber-500' },
  { key: 'completed', label: '已完成', color: 'border-emerald-500' },
  { key: 'archived', label: '已归档', color: 'border-[var(--border)]' },
];

const PRIORITY_TONE: Record<Priority, 'error' | 'warn' | 'info' | 'neutral'> = {
  P0: 'error', P1: 'warn', P2: 'info', P3: 'neutral',
};

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
        {/* 顶部 KPI */}
        <div className="grid grid-cols-4 gap-3 border-b border-[var(--border)] p-4">
          <Stat label="今日任务" value={tasks?.length ?? 0} sub="次/日" tone="brand" />
          <Stat label="平均执行" value="38" sub="min" tone="brand" />
          <Stat label="SLA 达成" value="96.8" sub="%" tone="success" />
          <Stat label="待办积压" value="3" sub="临近超时" tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        </div>

        {/* 工具栏 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Filter className="h-3.5 w-3.5" />
            P0 · P1 · P2 · P3 · 按 SLA 排序
          </div>
          <Button size="sm"><Plus className="h-3.5 w-3.5" />新建任务</Button>
        </div>

        {/* Kanban */}
        <div className="grid flex-1 grid-cols-4 gap-3 overflow-x-auto p-4">
          {grouped.map((col) => (
            <div key={col.key} className={cn('flex min-w-[260px] flex-col rounded-lg border-t-2 bg-[var(--surface-1)]', col.color)}>
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {col.key === 'in_progress' && <Clock className="h-3.5 w-3.5 text-[var(--brand)]" />}
                  {col.key === 'review' && <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />}
                  {col.key === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {col.key === 'archived' && <RotateCcw className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                  {col.label}
                </div>
                <Badge tone={col.items.length > 0 ? 'brand' : 'neutral'}>{col.items.length}</Badge>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {col.items.length === 0 && (
                  <Empty title="暂无任务" description="拖拽任务到此处" />
                )}
                {col.items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      'w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left text-xs transition-all hover:border-[var(--brand)]',
                      activeId === t.id && 'border-[var(--brand)] ring-2 ring-[var(--brand)]/30',
                    )}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{t.code}</span>
                    </div>
                    <div className="mb-2 font-medium leading-snug">{t.title}</div>
                    <div className="mb-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span>{t.progress.done}/{t.progress.total}</span>
                      <span>{t.assignee}</span>
                    </div>
                    <Progress value={t.progress.done} max={t.progress.total} tone={t.priority === 'P0' ? 'error' : t.priority === 'P1' ? 'warn' : 'primary'} />
                    {t.slaRemainingMin !== undefined && (
                      <div className={cn('mt-1.5 flex items-center gap-1 text-[10px]', t.slaRemainingMin < 0 ? 'text-rose-500' : t.slaRemainingMin < 60 ? 'text-amber-500' : 'text-[var(--text-muted)]')}>
                        <Clock className="h-3 w-3" />
                        {t.slaRemainingMin < 0 ? `超时 ${Math.abs(t.slaRemainingMin)}min` : `剩余 ${t.slaRemainingMin}min`}
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[10px] text-[var(--text-muted)]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧详情 */}
      <aside className="flex h-full flex-col overflow-hidden">
        {active ? (
          <>
            <div className="border-b border-[var(--border)] p-4">
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

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <div className="mb-1 text-xs text-[var(--text-muted)]">步骤进度</div>
                <Progress value={active.progress.done} max={active.progress.total} />
                <div className="mt-1 text-xs">{active.progress.done}/{active.progress.total} · {Math.round((active.progress.done / active.progress.total) * 100)}%</div>
              </div>

              <div className="mb-4">
                <div className="mb-2 text-xs font-medium">审计流水</div>
                <div className="space-y-2 text-xs">
                  {[
                    { t: '08:24:12', text: 'Redis 重启完成', icon: '✅' },
                    { t: '08:23:48', text: '已执行 CONFIG SET maxmemory 8gb', icon: '⚙️' },
                    { t: '08:23:20', text: '王昊 (SRE) 已批准', icon: '✍️' },
                    { t: '08:20:10', text: '请求双签审批', icon: '🔐' },
                    { t: '08:18:02', text: '王昊 创建任务', icon: '📝' },
                    { t: '08:12:30', text: '飞书告警接收 → P3 自动建任务', icon: '📨' },
                  ].map((e, i) => (
                    <div key={i} className="flex gap-2 border-l border-[var(--border)] pl-3">
                      <div className="text-base">{e.icon}</div>
                      <div className="flex-1">
                        <div className="font-mono text-[10px] text-[var(--text-muted)]">{e.t}</div>
                        <div>{e.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-1 text-xs text-[var(--text-muted)]">标签</div>
                <div className="flex flex-wrap gap-1">
                  {active.tags.map((tag) => (
                    <span key={tag} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px]">#{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--border)] p-4">
              <Button size="sm" variant="outline" className="flex-1">暂停</Button>
              <Button size="sm" onClick={() => setSignOpen(true)} className="flex-1">
                <ShieldCheck className="h-3.5 w-3.5" />批准（双签）
              </Button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-center">
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

function Stat({ label, value, sub, tone, icon }: { label: string; value: any; sub?: string; tone: 'brand' | 'success' | 'warn'; icon?: React.ReactNode }) {
  const c = tone === 'success' ? 'text-emerald-500' : tone === 'warn' ? 'text-amber-500' : 'text-[var(--brand)]';
  return (
    <Card>
      <CardBody className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
          <div className={cn('mt-0.5 text-xl font-semibold', c)}>{value}{sub && <span className="ml-1 text-xs">{sub}</span>}</div>
        </div>
        {icon}
      </CardBody>
    </Card>
  );
}