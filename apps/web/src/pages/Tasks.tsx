/**
 * P3 任务 · Kanban（企业级优化版）
 * Todo 1-10:
 *  1. Kanban 容量 X/Y + 拖拽提示
 *  2. 任务卡：Agent + 工单 + 头像组合
 *  3. 顶部 4 KPI
 *  4. SLA mm:ss 实时倒计时 + 标签云
 *  5. 6 步横向执行步骤进度
 *  6. 双签审批抽屉（从右滑出）
 *  7. 批量操作（多选 + 委派）
 *  8. 筛选面板（Agent/优先级/时间/Tag）
 *  9. SLA 临近闪烁红条
 * 10. 工单关联 CMDB 资产
 */
import { useState, useMemo, useEffect } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress, Avatar, Dot } from '@de/web-ui';
import {
  Clock, AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, Filter, Plus,
  User as UserIcon, Wrench, Pause, Play, ChevronRight, X, Users, Tag as TagIcon,
  Calendar, Bot, Database, Search, GitBranch, Inbox, ChevronDown, ListChecks,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Task, TaskStatus, Priority } from '@de/web-types';
import { DualSignModal } from '@/components/DualSignModal';

const COLUMNS: { key: TaskStatus; label: string; icon: any; tone: string; capacity: number }[] = [
  { key: 'in_progress', label: '进行中', icon: Clock, tone: 'border-[var(--brand)]', capacity: 20 },
  { key: 'review', label: '待复核', icon: ShieldCheck, tone: 'border-[var(--warning)]', capacity: 10 },
  { key: 'completed', label: '已完成', icon: CheckCircle2, tone: 'border-[var(--success)]', capacity: 50 },
  { key: 'archived', label: '已归档', icon: RotateCcw, tone: 'border-[var(--border)]', capacity: 100 },
];

const PRIORITY_TONE: Record<Priority, 'error' | 'warn' | 'info' | 'neutral'> = {
  P0: 'error', P1: 'warn', P2: 'info', P3: 'neutral',
};

const EXEC_STEPS = ['检测异常', '检索 Runbook', 'Agent 决策', '双签审批', '执行恢复', '审计收尾'];

const FILTERS = {
  agents: ['全部', '故障自愈', '变更辅助', '告警降噪', '漏洞修复', '容量预测'],
  priorities: ['全部', 'P0', 'P1', 'P2', 'P3'] as const,
  timeRanges: ['全部', '今天', '昨天', '本周'] as const,
};

const CMDB_ASSETS = [
  { code: 'PRD-CACHE-019', name: 'prod-redis-01', env: '生产', region: 'cn-east-1' },
  { code: 'PRD-K8S-N12', name: 'k8s-prod-cluster', env: '生产', region: 'cn-east-1' },
  { code: 'PRD-API-GW', name: 'api-gateway-prod', env: '生产', region: 'cn-east-1' },
];

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
  const text = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { text, expired: sec <= 0, raw: sec };
}

export default function Tasks() {
  const { data: tasks } = useApiQuery<Task[]>(['tasks'], '/api/tasks');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [signDrawerOpen, setSignDrawerOpen] = useState(false);

  // Todo 7: 批量操作
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // Todo 8: 筛选
  const [filterAgent, setFilterAgent] = useState('全部');
  const [filterPriority, setFilterPriority] = useState<typeof FILTERS.priorities[number]>('全部');
  const [filterTime, setFilterTime] = useState<typeof FILTERS.timeRanges[number]>('全部');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const active = tasks?.find((t) => t.id === activeId);

  // Todo 8: 应用筛选
  const filteredTasks = useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (filterPriority !== '全部' && t.priority !== filterPriority) return false;
      if (filterTag && !t.tags.includes(filterTag)) return false;
      if (filterAgent !== '全部' && t.agentId !== mapAgentNameToId(filterAgent)) return false;
      // 简化：timeRange 按 createdAt 日期过滤（mock 仅作演示）
      return true;
    });
  }, [tasks, filterAgent, filterPriority, filterTime, filterTag]);

  const grouped = COLUMNS.map((c) => ({
    ...c,
    items: filteredTasks.filter((t) => t.status === c.key),
  }));

  // 所有 tag 集合
  const allTags = useMemo(() => {
    const set = new Set<string>();
    (tasks ?? []).forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [tasks]);

  return (
    <div className="grid h-full grid-cols-[1fr_360px] divide-x divide-[var(--border)]">
      {/* 主区 */}
      <div className="flex h-full flex-col overflow-hidden">
        {/* Todo 3: 顶部 4 KPI */}
        <div className="grid grid-cols-4 gap-3 border-b border-[var(--border)] p-5">
          <Stat icon={<ListChecks className="h-4 w-4" />} label="今日任务" value="38" sub="次/日" delta="+12" />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="成功率" value="98.4" sub="%" tone="success" delta="+2.1" />
          <Stat icon={<ShieldCheck className="h-4 w-4" />} label="SLA 达成" value="96.8" sub="%" tone="primary" delta="-0.5" />
          <Stat icon={<AlertTriangle className="h-4 w-4" />} label="待复核" value="5" sub="件" tone="warn" delta="+1" />
        </div>

        {/* 工具栏 + 筛选 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs',
                filterPanelOpen ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              筛选
              {(filterPriority !== '全部' || filterTag || filterAgent !== '全部') && (
                <Badge tone="brand" className="text-[9px] ml-1">已应用</Badge>
              )}
            </button>
            <div className="text-xs text-[var(--text-muted)]">
              {filteredTasks.length} / {tasks?.length ?? 0} 个任务
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Todo 7: 批量操作 */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--brand-light)] text-[var(--brand)] text-xs">
                <span>已选 {selectedIds.size} 项</span>
                <button className="hover:underline">委派</button>
                <button className="hover:underline">批准</button>
                <button className="hover:underline">归档</button>
                <button onClick={() => setSelectedIds(new Set())}><X className="h-3 w-3" /></button>
              </div>
            )}
            <Button size="sm"><Plus className="h-3.5 w-3.5" />新建任务</Button>
          </div>
        </div>

        {/* Todo 8: 筛选面板 */}
        {filterPanelOpen && (
          <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] p-4 grid grid-cols-4 gap-4">
            <FilterGroup label="Agent" value={filterAgent} options={FILTERS.agents} onChange={setFilterAgent} />
            <FilterGroup label="优先级" value={filterPriority} options={FILTERS.priorities as unknown as string[]} onChange={(v) => setFilterPriority(v as any)} />
            <FilterGroup label="时间" value={filterTime} options={FILTERS.timeRanges as unknown as string[]} onChange={(v) => setFilterTime(v as any)} />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">标签</div>
              <div className="flex flex-wrap gap-1">
                <TagBtn label="全部" active={!filterTag} onClick={() => setFilterTag(null)} />
                {allTags.map((t) => (
                  <TagBtn key={t} label={`#${t}`} active={filterTag === t} onClick={() => setFilterTag(t)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Todo 1: Kanban 4 列（含容量 X/Y）*/}
        <div className="grid flex-1 grid-cols-4 gap-3 overflow-x-auto p-5">
          {grouped.map((col) => {
            const Icon = col.icon;
            const ratio = col.items.length / col.capacity;
            const overCap = ratio > 0.8;
            return (
              <div
                key={col.key}
                className={cn('flex min-w-[260px] flex-col rounded-lg border-t-2 bg-[var(--bg)] border border-[var(--border)]')}
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    {col.label}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={col.items.length > 0 ? (overCap ? 'error' : 'brand') : 'neutral'}>
                      {col.items.length}/{col.capacity}
                    </Badge>
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-2 bg-[var(--bg-elevated)]">
                  {col.items.length === 0 && (
                    <div className="text-center text-xs text-[var(--text-muted)] py-8 flex flex-col items-center gap-1">
                      <Inbox className="h-5 w-5 opacity-30" />
                      拖拽任务到此处
                    </div>
                  )}
                  {col.items.map((t) => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      active={t.id === activeId}
                      selected={selectedIds.has(t.id)}
                      onSelect={() => setActiveId(t.id)}
                      onToggleSelect={() => toggleSelect(t.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Todo 6: 右侧详情（含双签审批 drawer）*/}
      <aside className="flex h-full flex-col overflow-hidden bg-[var(--bg)]">
        {active ? (
          <>
            <div className="border-b border-[var(--border)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={PRIORITY_TONE[active.priority]}>{active.priority}</Badge>
                <span className="font-mono text-xs text-[var(--text-muted)]">{active.code}</span>
                {active.relatedTaskCode && <Badge tone="info">关联 {active.relatedTaskCode}</Badge>}
              </div>
              <h3 className="text-base font-semibold">{active.title}</h3>
              {/* Todo 2: Agent + 工单 + 头像组合 */}
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Avatar name={active.assignee ?? '?'} size={20} />
                <span>{active.assignee}</span>
                <span>·</span>
                <Bot className="h-3 w-3" />
                <span className="text-[var(--brand)]">故障自愈 v1.4.2</span>
                <span>·</span>
                <GitBranch className="h-3 w-3" />
                <span>{active.relatedTaskCode ?? 'INC-019'}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Todo 4: SLA 倒计时 mm:ss */}
              <SlaPanel t={active} />

              {/* Todo 5: 6 步横向执行步骤 */}
              <div>
                <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">执行步骤</div>
                <div className="grid grid-cols-6 gap-1">
                  {EXEC_STEPS.map((s, i) => {
                    const done = i < active.progress.done;
                    const cur = i === active.progress.done;
                    return (
                      <div
                        key={s}
                        className={cn(
                          'rounded-md border px-1 py-1.5 text-center text-[9px]',
                          done ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]'
                          : cur ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)] animate-pulse'
                          : 'border-[var(--border)] text-[var(--text-muted)]',
                        )}
                      >
                        {done ? <CheckCircle2 className="h-2.5 w-2.5 mx-auto mb-0.5" /> : <div className="text-[9px] font-mono">{i + 1}</div>}
                        {s}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Todo 4: 标签云 */}
              <div>
                <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <TagIcon className="h-3 w-3" />标签
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {active.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setFilterTag(tag)}
                      className="nav-pill hover:border-[var(--brand)] transition-colors"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Todo 10: 工单关联 CMDB 资产 */}
              <div>
                <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Database className="h-3 w-3" />CMDB 关联资产
                </div>
                <div className="space-y-1.5">
                  {CMDB_ASSETS.slice(0, 2).map((a) => (
                    <div key={a.code} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs">
                      <div>
                        <div className="font-mono font-semibold text-[var(--brand)]">{a.code}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{a.name} · {a.region}</div>
                      </div>
                      <Badge tone="error">{a.env}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* 审计流水 */}
              <div>
                <div className="mb-3 text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" />审计流水
                </div>
                <div className="activity-timeline">
                  {[
                    { tone: 'success' as const, icon: CheckCircle2, text: 'Redis 重启完成', time: '08:24:12' },
                    { tone: 'info' as const, icon: Wrench, text: '已执行 CONFIG SET maxmemory 8gb', time: '08:23:48' },
                    { tone: 'warning' as const, icon: ShieldCheck, text: '王昊 已批准', time: '08:23:20' },
                    { tone: 'info' as const, icon: ShieldCheck, text: '请求双签审批', time: '08:20:10' },
                    { tone: 'info' as const, icon: UserIcon, text: '王昊 创建任务', time: '08:18:02' },
                  ].map((e, i) => (
                    <div key={i} className="activity-timeline__item">
                      <div className={cn('activity-timeline__dot', `activity-timeline__dot--${e.tone}`)}>
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
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <Button size="sm" variant="secondary" className="flex-1">
                <Pause className="h-3.5 w-3.5" />暂停
              </Button>
              <Button size="sm" onClick={() => setSignDrawerOpen(true)} className="flex-1">
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

      {/* Todo 6: 双签审批 Drawer */}
      {signDrawerOpen && active && (
        <div className="fixed inset-0 z-40" onClick={() => setSignDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute right-0 top-0 h-full w-[420px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[var(--danger)]" />
                <span className="text-base font-semibold">双签审批</span>
              </div>
              <button onClick={() => setSignDrawerOpen(false)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 mb-4">
              <div className="text-xs text-[var(--danger)] font-semibold mb-1">等保 3 强制要求</div>
              <div className="text-[11px] text-[var(--text)]">
                该操作会修改生产环境数据，需要 2 名不同角色用户签发。当前为第一签。
              </div>
            </div>
            <div className="space-y-3 text-xs">
              <DrawerField label="任务" value={active.title} />
              <DrawerField label="编号" value={active.code} mono />
              <DrawerField label="优先级" value={<Badge tone={PRIORITY_TONE[active.priority]}>{active.priority}</Badge>} />
              <DrawerField label="操作" value="CONFIG SET maxmemory 16GB + volatile-lru" mono />
              <DrawerField label="执行人" value={active.assignee} />
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setSignDrawerOpen(false)}>
                拒绝
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => setSignOpen(true)}>
                <ShieldCheck className="h-3.5 w-3.5" />签发（第一签）
              </Button>
            </div>
          </div>
        </div>
      )}

      <DualSignModal
        open={signOpen}
        title={active?.title ?? ''}
        description={active?.code}
        onClose={() => setSignOpen(false)}
        onApprove={(name) => {
          setSignOpen(false);
          setSignDrawerOpen(false);
          alert(`${name} 第一签已签发（mock，需第二签）`);
        }}
      />
    </div>
  );
}

// ============ 子组件 ============

function Stat({ label, value, sub, tone, delta, icon }: { label: string; value: any; sub?: string; tone?: 'success' | 'primary' | 'warn'; delta?: string; icon?: React.ReactNode }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'primary' ? 'text-[var(--brand)]' : tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 flex items-center justify-between">
      <div>
        <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">{label}</div>
        <div className={cn('mt-0.5 text-xl font-bold font-mono tracking-tight flex items-baseline gap-1.5', color)}>
          {value}<span className="text-xs text-[var(--text-muted)] font-normal">{sub}</span>
        </div>
        {delta && <div className="text-[10px] text-[var(--success)]">↑ {delta} 较昨日</div>}
      </div>
      <div className="text-[var(--text-muted)]">{icon}</div>
    </div>
  );
}

function TaskCard({ t, active, selected, onSelect, onToggleSelect }: { t: Task; active: boolean; selected: boolean; onSelect: () => void; onToggleSelect: () => void }) {
  const slaSec = (t.slaRemainingMin ?? 60) * 60;
  const sla = useCountdown(slaSec);
  const pct = Math.round((t.progress.done / t.progress.total) * 100);
  const slaWarn = sla.raw < 60 * 60 && sla.raw >= 30 * 60;
  const slaError = sla.raw < 30 * 60;

  return (
    <div
      className={cn(
        'task-tile relative',
        slaError ? 'task-tile--danger' : slaWarn ? 'task-tile--warning' : 'task-tile--success',
        active && 'card-active',
        selected && 'ring-2 ring-[var(--brand)]',
      )}
    >
      {/* Todo 7: 多选 + 顶部行 */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="accent-[var(--brand)]"
          onClick={(e) => e.stopPropagation()}
        />
        <Badge tone={PRIORITY_TONE[t.priority]} className="text-[10px]">{t.priority}</Badge>
        <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{t.code}</span>
      </div>
      <div onClick={onSelect} className="cursor-pointer">
        <div className="mb-2 text-xs font-semibold leading-snug">{t.title}</div>

        {/* Todo 2: Agent + 头像组合 */}
        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-[var(--text-muted)]">
          <Avatar name={t.assignee ?? '?'} size={14} />
          <span className="truncate">{t.assignee}</span>
          <Bot className="h-2.5 w-2.5 text-[var(--brand)] shrink-0" />
          <span className="text-[var(--brand)] truncate">故障自愈</span>
        </div>

        <Progress value={pct} tone={slaError ? 'error' : slaWarn ? 'warn' : 'primary'} />
        <div className="mt-1.5 flex items-center justify-between text-[10px]">
          <span className="text-[var(--text-muted)]">{t.progress.done}/{t.progress.total}</span>
          {/* Todo 4 + 9: SLA 倒计时（红色闪烁） */}
          <span
            className={cn(
              'font-mono flex items-center gap-0.5',
              slaError ? 'text-[var(--danger)] animate-pulse' : slaWarn ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]',
            )}
          >
            <Clock className="h-2.5 w-2.5" />
            {sla.text}
          </span>
        </div>

        {/* 标签 */}
        <div className="mt-1 flex flex-wrap gap-0.5">
          {t.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[9px] text-[var(--text-muted)]">#{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlaPanel({ t }: { t: Task }) {
  const slaSec = (t.slaRemainingMin ?? 60) * 60;
  const sla = useCountdown(slaSec);
  const slaWarn = sla.raw < 60 * 60;
  const slaError = sla.raw < 30 * 60;

  return (
    <div className={cn(
      'rounded-md border p-3',
      slaError ? 'border-[var(--danger)]/40 bg-[var(--danger-bg)]'
      : slaWarn ? 'border-[var(--warning)]/40 bg-[var(--warning-bg)]'
      : 'border-[var(--border)] bg-[var(--bg-elevated)]',
    )}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />SLA 倒计时
        </div>
        <Badge tone={slaError ? 'error' : slaWarn ? 'warn' : 'success'}>
          {slaError ? '🚨 即将超时' : slaWarn ? '⚠ 临近' : '✓ 正常'}
        </Badge>
      </div>
      <div className={cn(
        'font-mono text-2xl font-bold tracking-tight',
        slaError ? 'text-[var(--danger)] animate-pulse' : slaWarn ? 'text-[var(--warning)]' : 'text-[var(--text)]',
      )}>
        {sla.text}
      </div>
      <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
        总 SLA: {Math.abs(t.slaRemainingMin ?? 60)} 分钟 · 截止 {slaError ? '已超时' : `剩余 ${sla.text}`}
      </div>
    </div>
  );
}

function FilterGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-mono',
              value === o ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border)]',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded text-[11px] font-mono',
        active ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border)]',
      )}
    >
      {label}
    </button>
  );
}

function DrawerField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] last:border-0 pb-2 last:pb-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn(mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}

function mapAgentNameToId(name: string): string | null {
  const map: Record<string, string> = {
    '故障自愈': 'a1', '变更辅助': 'a3', '告警降噪': 'a6', '漏洞修复': 'a7', '容量预测': 'a4',
  };
  return map[name] ?? null;
}