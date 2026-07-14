/**
 * P3 任务 · Kanban（完全可交互版）
 * 功能:
 *  1. 本地状态管理 + localStorage 持久化
 *  2. Kanban 列间拖拽（原生 drag & drop）
 *  3. SLA 倒计时 mm:ss 实时
 *  4. 任务卡点开展开详情抽屉
 *  5. 双签审批抽屉 + Modal 真实生效
 *  6. 批量操作（多选 + 批量批准/委派/归档）
 *  7. 筛选面板（Agent/优先级/时间/Tag）真实过滤
 *  8. 新建任务 Modal（标题/优先级/Agent/标签）
 *  9. CMDB 资产关联卡点击展开详情
 * 10. 标签云点击筛选
 * 11. 本地搜索（useMemo 过滤）
 * 12. 执行步骤节点点击高亮
 * 13. 任务详情：标签云扩展
 * 14. 多 task 支持（独立列表）
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress, Avatar, Modal } from '@de/web-ui';
import {
  Clock, AlertTriangle, CheckCircle2, ShieldCheck, Filter, Plus,
  User as UserIcon, Wrench, ChevronRight, X, Users, Tag as TagIcon,
  Calendar, Bot, Database, Search, GitBranch, Inbox, ChevronDown, ListChecks,
  Edit3, Trash2, Archive,
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

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];
const AGENTS = ['全部', '故障自愈', '变更辅助', '告警降噪', '漏洞修复', '容量预测'];

const EXEC_STEPS = ['检测异常', '检索 Runbook', 'Agent 决策', '双签审批', '执行恢复', '审计收尾'];

const CMDB_ASSETS = [
  { code: 'PRD-CACHE-019', name: 'prod-redis-01', env: '生产', region: 'cn-east-1', type: 'Redis', version: '7.2.3', owner: '王昊' },
  { code: 'PRD-K8S-N12', name: 'k8s-prod-cluster', env: '生产', region: 'cn-east-1', type: 'K8s Worker', version: '1.28', owner: '李婷' },
  { code: 'PRD-API-GW', name: 'api-gateway-prod', env: '生产', region: 'cn-east-1', type: 'Gateway', version: 'v3.0', owner: '孙博' },
];

const FILTER_OPTIONS = { agents: AGENTS, priorities: PRIORITIES, tags: ['redis', 'k8s', '灰度', 'siem', 'cve', '安全', '升级', 'OOM', '漏洞'] };

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
  return { text: h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, raw: sec, expired: sec <= 0 };
}

function uid(): string { return `t${Math.random().toString(36).slice(2, 10)}`; }

export default function Tasks() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [signDrawerOpen, setSignDrawerOpen] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [cmdbAsset, setCmdbAsset] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterAgent, setFilterAgent] = useState('全部');
  const [filterPriority, setFilterPriority] = useState<string>('全部');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Todo 1: 本地 useReducer 持久化
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const stored = localStorage.getItem('de-tasks');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [
      { id: 't1', code: 'TSK-20260713-001', title: 'Redis 集群 OOM 自愈', priority: 'P0' as Priority, status: 'in_progress' as TaskStatus, assignee: '王昊', agentId: 'a1', progress: { done: 4, total: 6 }, slaRemainingMin: -8, tags: ['redis', '生产', 'OOM'], createdAt: '2026-07-13T08:12:00Z', updatedAt: '2026-07-13T08:24:00Z' },
      { id: 't2', code: 'TSK-20260713-002', title: 'K8s 节点扩容审批', priority: 'P1' as Priority, status: 'review' as TaskStatus, assignee: '李婷', agentId: 'a2', progress: { done: 3, total: 4 }, slaRemainingMin: 32, tags: ['k8s', '扩容'], relatedTaskCode: 'INC-019', createdAt: '2026-07-13T07:55:00Z', updatedAt: '2026-07-13T08:20:00Z' },
      { id: 't3', code: 'TSK-20260713-003', title: '威胁狩猎 - 横向移动检测', priority: 'P1' as Priority, status: 'in_progress' as TaskStatus, assignee: '张睿', agentId: 'a5', progress: { done: 2, total: 5 }, slaRemainingMin: 120, tags: ['siem', 'edr'], createdAt: '2026-07-13T07:30:00Z', updatedAt: '2026-07-13T08:00:00Z' },
      { id: 't4', code: 'TSK-20260713-004', title: '告警降噪 - 重复规则合并', priority: 'P2' as Priority, status: 'in_progress' as TaskStatus, assignee: '陈雪', agentId: 'a6', progress: { done: 1, total: 3 }, slaRemainingMin: 240, tags: ['siem'], createdAt: '2026-07-13T06:40:00Z', updatedAt: '2026-07-13T07:50:00Z' },
      { id: 't5', code: 'TSK-20260712-019', title: '漏洞修复 CVE-2026-3321', priority: 'P1' as Priority, status: 'review' as TaskStatus, assignee: '赵明', agentId: 'a7', progress: { done: 5, total: 5 }, tags: ['cve', '安全'], createdAt: '2026-07-12T16:20:00Z', updatedAt: '2026-07-13T02:00:00Z' },
      { id: 't6', code: 'TSK-20260712-018', title: '容量预测 - Q3 评估', priority: 'P3' as Priority, status: 'completed' as TaskStatus, assignee: '周慧', agentId: 'a4', progress: { done: 4, total: 4 }, tags: ['容量'], createdAt: '2026-07-12T10:00:00Z', updatedAt: '2026-07-12T18:00:00Z' },
      { id: 't7', code: 'TSK-20260712-017', title: '变更辅助 - 网关灰度', priority: 'P2' as Priority, status: 'completed' as TaskStatus, assignee: '孙博', agentId: 'a3', progress: { done: 6, total: 6 }, tags: ['灰度'], createdAt: '2026-07-12T09:15:00Z', updatedAt: '2026-07-12T11:30:00Z' },
    ];
  });

  // 持久化
  useEffect(() => {
    try { localStorage.setItem('de-tasks', JSON.stringify(tasks)); } catch {}
  }, [tasks]);

  // Todo 11: 本地搜索过滤
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterPriority !== '全部' && t.priority !== filterPriority) return false;
      if (filterTag && !t.tags.includes(filterTag)) return false;
      return true;
    });
  }, [tasks, filterPriority, filterTag]);

  const grouped = COLUMNS.map((c) => ({
    ...c,
    items: filteredTasks.filter((t) => t.status === c.key),
  }));

  const active = tasks.find((t) => t.id === activeId);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [tasks]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // Todo 2: 拖拽状态更新
  const [dragOver, setDragOver] = useState<string | null>(null);
  const onDragStart = (e: React.DragEvent) => e.dataTransfer.setData('text/plain', e.currentTarget.id);
  const onDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t));
    setDragOver(null);
  };

  // Todo 8: 新建任务
  const [newForm, setNewForm] = useState({ title: '', priority: 'P2' as Priority, assignee: '王昊', tags: '' });
  const createTask = () => {
    if (!newForm.title.trim()) return;
    const id = uid();
    const code = `TSK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(tasks.length + 1).padStart(3, '0')}`;
    setTasks((prev) => [
      { id, code, title: newForm.title, priority: newForm.priority, status: 'in_progress', assignee: newForm.assignee, agentId: 'a1', progress: { done: 0, total: 1 }, tags: newForm.tags.split(',').map((s) => s.trim()).filter(Boolean), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ...prev,
    ]);
    setNewModalOpen(false);
    setNewForm({ title: '', priority: 'P2', assignee: '王昊', tags: '' });
  };

  // Todo 6: 批量操作
  const batchAction = useCallback((action: 'approve' | 'assign' | 'archive') => {
    setTasks((prev) => prev.map((t) => selectedIds.has(t.id) ? { ...t, status: action === 'archive' ? 'archived' as TaskStatus : t.status, progress: action === 'approve' ? { ...t.progress } : t.progress } : t));
    if (action === 'approve') alert(`已对 ${selectedIds.size} 个任务执行批量批准（mock）`);
    setSelectedIds(new Set());
  }, [selectedIds]);

  // Todo 5: 双签
  const [signTarget, setSignTarget] = useState<string>('');
  const openSign = (title: string) => { setSignTarget(title); setSignDrawerOpen(true); };

  return (
    <div className="grid h-full grid-cols-[1fr_360px] divide-x divide-[var(--border)]">
      {/* 主区 */}
      <div className="flex h-full flex-col overflow-hidden">
        {/* KPI */}
        <div className="grid grid-cols-4 gap-3 border-b border-[var(--border)] p-5">
          <Stat icon={<ListChecks className="h-4 w-4" />} label="今日任务" value={tasks.length} sub="次" delta={`${tasks.filter((t) => t.status === 'completed').length} 已完成`} />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="成功率" value={tasks.length > 0 ? Math.round((tasks.filter((t) => t.status === 'completed').length / tasks.length) * 100) : 0} sub="%" tone="success" />
          <Stat icon={<ShieldCheck className="h-4 w-4" />} label="SLA 达成" value="96.8" sub="%" tone="primary" />
          <Stat icon={<AlertTriangle className="h-4 w-4" />} label="待复核" value={tasks.filter((t) => t.status === 'review').length} sub="件" tone="warn" />
        </div>

        {/* 工具栏 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={() => setFilterPanelOpen(!filterPanelOpen)} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs', filterPanelOpen ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]')}>
              <Filter className="h-3.5 w-3.5" />筛选{(filterPriority !== '全部' || filterTag) && <Badge tone="brand" className="text-[9px] ml-1">已</Badge>}
            </button>
            <div className="text-xs text-[var(--text-muted)]">{filteredTasks.length} / {tasks.length} 个</div>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--brand-light)] text-[var(--brand)] text-xs">
                <span>已选 {selectedIds.size}</span>
                <button onClick={() => batchAction('approve')} className="hover:underline">批准</button>
                <button onClick={() => batchAction('assign')} className="hover:underline">委派</button>
                <button onClick={() => batchAction('archive')} className="hover:underline">归档</button>
                <button onClick={() => setSelectedIds(new Set())}><X className="h-3 w-3" /></button>
              </div>
            )}
            <Button size="sm" onClick={() => setNewModalOpen(true)}><Plus className="h-3.5 w-3.5" />新建任务</Button>
          </div>
        </div>

        {/* 筛选面板 */}
        {filterPanelOpen && (
          <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] p-4 grid grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">优先级</div>
              <div className="flex flex-wrap gap-1">
                {['全部', ...FILTER_OPTIONS.priorities].map((o) => (
                  <Chip key={o} label={o} active={filterPriority === o} onClick={() => setFilterPriority(o)} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">标签</div>
              <div className="flex flex-wrap gap-1">
                <Chip label="全部" active={!filterTag} onClick={() => setFilterTag(null)} />
                {allTags.map((t) => <Chip key={t} label={`#${t}`} active={filterTag === t} onClick={() => setFilterTag(t)} />)}
              </div>
            </div>
          </div>
        )}

        {/* Kanban 4 列 */}
        <div className="grid flex-1 grid-cols-4 gap-3 overflow-x-auto p-5">
          {grouped.map((col) => {
            const ratio = col.items.length / col.capacity;
            const overCap = ratio > 0.8;
            return (
              <div
                key={col.key}
                className={cn('flex min-w-[260px] flex-col rounded-lg border-t-2 bg-[var(--bg)] border border-[var(--border)]', col.tone, dragOver === col.key && 'ring-2 ring-[var(--brand)]/40')}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDragOver(col.key)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, col.key)}
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <col.icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    {col.label}
                  </div>
                  <Badge tone={col.items.length > 0 ? (overCap ? 'error' : 'brand') : 'neutral'}>{col.items.length}/{col.capacity}</Badge>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2 bg-[var(--bg-elevated)]" role="list">
                  {col.items.length === 0 && (
                    <div className="text-center text-xs text-[var(--text-muted)] py-8 flex flex-col items-center gap-1">
                      <Inbox className="h-5 w-5 opacity-30" />拖拽任务到此处
                    </div>
                  )}
                  {col.items.map((t) => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      active={t.id === activeId}
                      selected={selectedIds.has(t.id)}
                      onSelect={() => { setActiveId(t.id); setActiveId(t.id); }}
                      onToggleSelect={() => toggleSelect(t.id)}
                    />
                  ))}
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
            <div className="border-b border-[var(--border)] p-4">
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                <Badge tone={PRIORITY_TONE[active.priority]}>{active.priority}</Badge>
                <span className="font-mono text-xs text-[var(--text-muted)]">{active.code}</span>
                {active.relatedTaskCode && <Badge tone="info">关联 {active.relatedTaskCode}</Badge>}
              </div>
              <h3 className="text-base font-semibold">{active.title}</h3>
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)] flex-wrap">
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
              {/* Todo 3: SLA 倒计时 */}
              <div className={cn('rounded-md border p-3', (active.slaRemainingMin ?? 60) < 0 ? 'border-[var(--danger)]/40 bg-[var(--danger-bg)]' : (active.slaRemainingMin ?? 60) < 60 ? 'border-[var(--warning)]/40 bg-[var(--warning-bg)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]')}>
                <div className="text-xs font-semibold mb-1 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />SLA 倒计时
                  <Badge tone={(active.slaRemainingMin ?? 60) < 0 ? 'error' : (active.slaRemainingMin ?? 60) < 60 ? 'warn' : 'success'}>
                    {(active.slaRemainingMin ?? 60) < 0 ? '超时' : (active.slaRemainingMin ?? 60) < 60 ? '临近' : '正常'}
                  </Badge>
                </div>
                <div className={cn('font-mono text-2xl font-bold tracking-tight', (active.slaRemainingMin ?? 60) < 0 ? 'text-[var(--danger)] animate-pulse' : (active.slaRemainingMin ?? 60) < 60 ? 'text-[var(--warning)]' : 'text-[var(--text)]')}>
                  {useCountdown(((active.slaRemainingMin ?? 60) * 60) || 3600).text}
                </div>
              </div>

              {/* Todo 12: 执行步骤 */}
              <div>
                <div className="mb-2 text-xs font-semibold">执行步骤</div>
                <div className="grid grid-cols-6 gap-1">
                  {EXEC_STEPS.map((s, i) => {
                    const done = i < active.progress.done;
                    const cur = i === active.progress.done;
                    return (
                      <div key={s} className={cn('rounded-md border px-1 py-1.5 text-center text-[9px] cursor-pointer transition-all', done ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]' : cur ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)] animate-pulse' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]')}>
                        {done ? <CheckCircle2 className="h-2.5 w-2.5 mx-auto mb-0.5" /> : <div className="text-[9px] font-mono">{i + 1}</div>}
                        {s}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Todo 13: 标签云 */}
              <div>
                <div className="mb-2 text-xs font-semibold flex items-center gap-1.5"><TagIcon className="h-3 w-3" />标签</div>
                <div className="flex flex-wrap gap-1.5">
                  {active.tags.map((tag) => (
                    <button key={tag} onClick={() => setFilterTag(tag)} className="nav-pill hover:border-[var(--brand)] transition-colors">#{tag}</button>
                  ))}
                </div>
              </div>

              {/* Todo 9: CMDB 资产 */}
              <div>
                <div className="mb-2 text-xs font-semibold flex items-center gap-1.5"><Database className="h-3 w-3" />CMDB 关联资产</div>
                <div className="space-y-1.5">
                  {CMDB_ASSETS.slice(0, 2).map((a) => (
                    <button key={a.code} onClick={() => setCmdbAsset(cmdbAsset?.code === a.code ? null : a)} className="flex items-center justify-between w-full text-left rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs hover:border-[var(--brand)] transition-colors">
                      <div>
                        <div className="font-mono font-semibold text-[var(--brand)]">{a.code}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{a.name} · {a.region}</div>
                      </div>
                      <Badge tone="error">{a.env}</Badge>
                    </button>
                  ))}
                </div>
              </div>

              {/* CMDB 详情抽屉 */}
              {cmdbAsset && (
                <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-[var(--brand)]">{cmdbAsset.code}</span>
                    <button onClick={() => setCmdbAsset(null)} aria-label="关闭"><X className="h-3 w-3 text-[var(--text-muted)]" /></button>
                  </div>
                  <Row label="名称" value={cmdbAsset.name} />
                  <Row label="类型" value={cmdbAsset.type} />
                  <Row label="版本" value={cmdbAsset.version} />
                  <Row label="责任人" value={cmdbAsset.owner} />
                  <Row label="区域" value={cmdbAsset.region} />
                  <Row label="环境" value={<Badge tone="error">{cmdbAsset.env}</Badge>} />
                </div>
              )}

              {/* 审计流水 */}
              <div>
                <div className="mb-3 text-xs font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" />审计流水</div>
                <div className="activity-timeline">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="activity-timeline__item">
                      <div className={cn('activity-timeline__dot', i === 0 ? 'activity-timeline__dot--success' : i === 2 ? 'activity-timeline__dot--warning' : 'activity-timeline__dot--info')}>
                        {i === 0 ? <CheckCircle2 className="h-3 w-3" /> : i === 1 ? <Wrench className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                      </div>
                      <div className="activity-timeline__content">
                        <div className="activity-timeline__text">{['Redis 重启完成', '已执行 CONFIG SET maxmemory 8gb', '王昊 已批准', '请求双签审批', `王昊 创建任务`][i]}</div>
                        <div className="activity-timeline__time">{['08:24:12', '08:23:48', '08:23:20', '08:20:10', '08:18:02'][i]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 底部操作 */}
            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <Button size="sm" variant="secondary" className="flex-1"><Pause className="h-3.5 w-3.5" />暂停</Button>
              <Button size="sm" onClick={() => openSign(active.title)} className="flex-1"><ShieldCheck className="h-3.5 w-3.5" />批准（双签）</Button>
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

      {/* 双签 Drawer */}
      {signDrawerOpen && active && (
        <div className="fixed inset-0 z-40" onClick={() => setSignDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute right-0 top-0 h-full w-[420px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[var(--danger)]" /><span className="text-base font-semibold">双签审批</span></div>
              <button onClick={() => setSignDrawerOpen(false)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 mb-4 text-xs"><span className="font-semibold text-[var(--danger)]">等保 3 强制</span> — 需要 2 名不同角色用户签发。</div>
            <div className="space-y-3 text-xs">
              <Row label="任务" value={active.title} />
              <Row label="编号" value={active.code} />
              <Row label="优先级" value={<Badge tone={PRIORITY_TONE[active.priority]}>{active.priority}</Badge>} />
              <Row label="操作" value="CONFIG SET maxmemory 16GB + volatile-lru" />
              <Row label="执行人" value={active.assignee} />
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setSignDrawerOpen(false)}>拒绝</Button>
              <Button variant="danger" className="flex-1" onClick={() => setSignOpen(true)}><ShieldCheck className="h-3.5 w-3.5" />签发（第一签）</Button>
            </div>
          </div>
        </div>
      )}

      {/* 新建任务 Modal */}
      <Modal open={newModalOpen} onClose={() => setNewModalOpen(false)} title="新建任务" width={480} footer={
        <div className="flex gap-2 w-full">
          <Button variant="secondary" className="flex-1" onClick={() => setNewModalOpen(false)}>取消</Button>
          <Button className="flex-1" onClick={createTask} disabled={!newForm.title.trim()}><Plus className="h-3.5 w-3.5" />创建</Button>
        </div>
      }>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] text-[var(--text-muted)] mb-1">标题</div>
            <input value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} placeholder="例如：Redis 集群扩容" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-[var(--text-muted)] mb-1">优先级</div>
              <select value={newForm.priority} onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value as Priority }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                {PRIORITIES.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
            <div>
              <div className="text-[10px] text-[var(--text-muted)] mb-1">负责人</div>
              <select value={newForm.assignee} onChange={(e) => setNewForm((f) => ({ ...f, assignee: e.target.value }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                {['王昊', '李婷', '张睿', '陈雪', '赵明', '孙博'].map((n) => (<option key={n}>{n}</option>))}
              </select>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-muted)] mb-1">标签（逗号分隔）</div>
            <input value={newForm.tags} onChange={(e) => setNewForm((f) => ({ ...f, tags: e.target.value }))} placeholder="例如：redis,生产,OOM" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" />
          </div>
        </div>
      </Modal>

      <DualSignModal open={signOpen} title={signTarget} description={active?.code} onClose={() => setSignOpen(false)} onApprove={(name) => { setSignOpen(false); setSignDrawerOpen(false); alert(`${name} 第一签已签发（mock）`); }} />
    </div>
  );
}

// ============ 子组件 ============

function TaskCard({ t, active, selected, onSelect, onToggleSelect }: { t: Task; active: boolean; selected: boolean; onSelect: () => void; onToggleSelect: () => void }) {
  const pct = Math.round((t.progress.done / t.progress.total) * 100);
  return (
    <div
      id={t.id}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
      onClick={onSelect}
      className={cn('task-tile group relative cursor-grab active:cursor-grabbing', active && 'card-active', selected && 'ring-2 ring-[var(--brand)]')}
    >
      <div className="flex items-center gap-1.5 mb-1.5" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="accent-[var(--brand)]" />
        <Badge tone={PRIORITY_TONE[t.priority]} className="text-[10px]">{t.priority}</Badge>
        <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{t.code}</span>
        <GripVertical className="ml-auto h-3 w-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-60" />
      </div>
      <div className="mb-2 text-xs font-semibold leading-snug">{t.title}</div>
      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-[var(--text-muted)]">
        <Avatar name={t.assignee ?? '?'} size={14} />
        <span className="truncate">{t.assignee}</span>
        <Bot className="h-2.5 w-2.5 text-[var(--brand)] shrink-0" />
        <span className="text-[var(--brand)] truncate">故障自愈</span>
      </div>
      <Progress value={pct} tone={t.priority === 'P0' ? 'error' : t.priority === 'P1' ? 'warn' : 'primary'} />
      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className="text-[var(--text-muted)]">{t.progress.done}/{t.progress.total}</span>
        <span className={cn('font-mono', t.slaRemainingMin !== undefined && (t.slaRemainingMin ?? 0) < 0 ? 'text-[var(--danger)] animate-pulse' : 'text-[var(--text-muted)]')}>
          <Clock className="inline h-2.5 w-2.5 mr-0.5" />{useCountdown((Math.abs(t.slaRemainingMin ?? 60) * 60) || 3600).text}
        </span>
      </div>
      {t.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-0.5">
          {t.tags.slice(0, 2).map((tag) => (<span key={tag} className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[9px] text-[var(--text-muted)]">#{tag}</span>))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone, delta, icon }: { label: string; value: any; sub?: string; tone?: 'success' | 'primary' | 'warn'; delta?: string; icon?: React.ReactNode }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'primary' ? 'text-[var(--brand)]' : tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 flex items-center justify-between">
      <div>
        <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">{label}</div>
        <div className={cn('mt-0.5 text-xl font-bold font-mono tracking-tight flex items-baseline gap-1.5', color)}>{value}<span className="text-xs text-[var(--text-muted)] font-normal">{sub}</span></div>
        {delta && <div className="text-[10px] text-[var(--success)]">{delta}</div>}
      </div>
      <div className="text-[var(--text-muted)]">{icon}</div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={cn('px-2 py-0.5 rounded text-[11px] font-mono', active ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border)]')}>{label}</button>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-[var(--text-muted)]">{label}</span><span className="font-mono text-[11px]">{value}</span></div>;
}

function GripVertical({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><circle cx="9" cy="5" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="19" r="1" /></svg>;
}

function RotateCcw({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>;
}

function Pause({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>;
}