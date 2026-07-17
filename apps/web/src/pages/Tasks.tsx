/**
 * P3 任务 · 企业级数字员工控制台
 *
 * 能力：
 *  1. 多视图：看板 / 列表 / 时间线 / 我的（segmented control）
 *  2. 6 KPI 卡 + SLA 风险地图
 *  3. 左侧筛选面板（优先级 / Agent / 负责人 / SLA 状态 / 标签 / 状态）
 *  4. 全局搜索（标题 / 编号 / 标签）+ 排序
 *  5. 任务卡：依赖指示 / 评论 / 附件 / 子任务 / 最近活动
 *  6. 看板拖拽（原生 drag & drop，列内排序 + 跨列）
 *  7. 列表视图：表格列（可排序）+ 复选框
 *  8. 时间线：按 createdAt 倒序 / 按 SLA 截止正序切换
 *  9. 批量操作（批准 / 委派 / 改优先级 / 归档 / 导出）
 * 10. 新建任务：标题 / 描述 / 优先级 / 负责人 / Agent / CMDB / SLA / 标签 / 依赖 / 模板
 * 11. 任务模板（5 个预设）
 * 12. 详情侧栏 Tabs：详情 / 步骤 / CMDB / 双签 / 审计 / 评论
 * 13. 双签多签人 + 拒绝原因
 * 14. localStorage 持久化（schema 版本）
 * 15. Saved view（localStorage 存当前筛选快照）
 * 16. 导出选中任务 JSON
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress, Avatar, Modal, Dot, Input, KpiCard, KpiMini, Row, FilterGroup, FilterRadio, ChipBtn, Section, FormField } from '@de/web-ui';
import {
  Clock, AlertTriangle, CheckCircle2, ShieldCheck, Filter, Plus,
  Wrench, ChevronRight, X, Tag as TagIcon,
  Bot, Database, Search, GitBranch, Inbox, ChevronDown, ListChecks,
  Trash2, Archive, KanbanSquare, List, Calendar, Activity, User as UserIcon,
  Sparkles, Save, Eye, Link2, MessageSquare, Paperclip, Hash,
  ArrowUp, ArrowDown, MoreHorizontal, Layers, TrendingUp, Zap, ZapOff, Server, Rocket,
  Copy, RotateCcw, AlertOctagon, ChevronUp, Pause, Play, FileText, GripVertical,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Task, TaskStatus, Priority } from '@de/web-types';
import { DualSignModal } from '@/components/DualSignModal';
import { Drawer, EmptyState, Modal as ModalX } from '@/components/shared';

type ViewMode = 'kanban' | 'list' | 'timeline' | 'mine';
type SlaBand = 'all' | 'overdue' | 'critical' | 'warning' | 'healthy';

const STORAGE_KEY = 'de-tasks-state-v2';

const COLUMNS: { key: TaskStatus; label: string; icon: any; tone: string; capacity: number }[] = [
  { key: 'pending', label: '待开始', icon: Inbox, tone: 'border-[var(--text-muted)]', capacity: 30 },
  { key: 'in_progress', label: '进行中', icon: Clock, tone: 'border-[var(--brand)]', capacity: 20 },
  { key: 'review', label: '待复核', icon: ShieldCheck, tone: 'border-[var(--warning)]', capacity: 10 },
  { key: 'completed', label: '已完成', icon: CheckCircle2, tone: 'border-[var(--success)]', capacity: 50 },
  { key: 'archived', label: '已归档', icon: Archive, tone: 'border-[var(--border)]', capacity: 100 },
];

const PRIORITY_TONE: Record<Priority, 'error' | 'warn' | 'info' | 'neutral'> = {
  P0: 'error', P1: 'warn', P2: 'info', P3: 'neutral',
};

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];
const AGENTS = ['全部', '故障自愈', '变更辅助', '告警降噪', '漏洞修复', '容量预测', '威胁狩猎'];
const ASSIGNEES = ['全部', '王昊', '李婷', '张睿', '陈雪', '赵明', '孙博', '周慧'];
const SLA_BANDS: { key: SlaBand; label: string; tone: 'success' | 'warning' | 'danger' | 'idle' }[] = [
  { key: 'all', label: '全部', tone: 'idle' },
  { key: 'overdue', label: '已超时', tone: 'danger' },
  { key: 'critical', label: '< 1h', tone: 'danger' },
  { key: 'warning', label: '< 24h', tone: 'warning' },
  { key: 'healthy', label: '> 24h', tone: 'success' },
];

const EXEC_STEPS = ['检测异常', '检索 Runbook', 'Agent 决策', '双签审批', '执行恢复', '审计收尾'];

const CMDB_ASSETS = [
  { code: 'PRD-CACHE-019', name: 'prod-redis-01', env: '生产', region: 'cn-east-1', type: 'Redis', version: '7.2.3', owner: '王昊' },
  { code: 'PRD-K8S-N12', name: 'k8s-prod-cluster', env: '生产', region: 'cn-east-1', type: 'K8s Worker', version: '1.28', owner: '李婷' },
  { code: 'PRD-API-GW', name: 'api-gateway-prod', env: '生产', region: 'cn-east-1', type: 'Gateway', version: 'v3.0', owner: '孙博' },
  { code: 'PRD-DB-M05', name: 'mysql-prod-master', env: '生产', region: 'cn-east-1', type: 'MySQL', version: '8.0.36', owner: '周慧' },
];

const TASK_TEMPLATES = [
  { id: 'tpl-redis', name: 'Redis 故障自愈', iconKey: 'zap' as const, priority: 'P0' as Priority, tags: ['redis', 'OOM'], slaMin: 240, agent: '故障自愈', asset: 'PRD-CACHE-019' },
  { id: 'tpl-k8s', name: 'K8s 节点扩容', iconKey: 'server' as const, priority: 'P1' as Priority, tags: ['k8s', '扩容'], slaMin: 1440, agent: '变更辅助', asset: 'PRD-K8S-N12' },
  { id: 'tpl-cve', name: 'CVE 漏洞修复', iconKey: 'shield' as const, priority: 'P1' as Priority, tags: ['cve', '安全'], slaMin: 4320, agent: '漏洞修复', asset: '' },
  { id: 'tpl-gray', name: '灰度发布', iconKey: 'rocket' as const, priority: 'P2' as Priority, tags: ['灰度'], slaMin: 720, agent: '变更辅助', asset: 'PRD-API-GW' },
  { id: 'tpl-cap', name: '容量预测', iconKey: 'trending' as const, priority: 'P3' as Priority, tags: ['容量'], slaMin: 10080, agent: '容量预测', asset: '' },
];

const TEMPLATE_ICONS: Record<typeof TASK_TEMPLATES[number]['iconKey'], any> = {
  zap: Zap,
  server: Server,
  shield: ShieldCheck,
  rocket: Rocket,
  trending: TrendingUp,
};

function uid(p = 't'): string { return `${p}${Math.random().toString(36).slice(2, 10)}`; }

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

function slaBand(min: number | undefined): 'overdue' | 'critical' | 'warning' | 'healthy' {
  if (min === undefined) return 'healthy';
  if (min < 0) return 'overdue';
  if (min < 60) return 'critical';
  if (min < 1440) return 'warning';
  return 'healthy';
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

const SEED_TASKS: Task[] = [
  { id: 't1', code: 'TSK-20260713-001', title: 'Redis 集群 OOM 自愈', description: 'prod-redis-01 触发 OOM，需双签扩容并切换策略。', priority: 'P0', status: 'in_progress', assignee: '王昊', agentId: 'a1', progress: { done: 4, total: 6 }, slaRemainingMin: -8, tags: ['redis', '生产', 'OOM'], relatedTaskCode: 'INC-019', createdAt: '2026-07-13T08:12:00Z', updatedAt: '2026-07-13T08:24:00Z' },
  { id: 't2', code: 'TSK-20260713-002', title: 'K8s 节点扩容审批', description: '为 cn-east-1 增加 2 个 c5.2xlarge，影响 5 个核心服务。', priority: 'P1', status: 'review', assignee: '李婷', agentId: 'a2', progress: { done: 3, total: 4 }, slaRemainingMin: 32, tags: ['k8s', '扩容'], relatedTaskCode: 'INC-019', createdAt: '2026-07-13T07:55:00Z', updatedAt: '2026-07-13T08:20:00Z' },
  { id: 't3', code: 'TSK-20260713-003', title: '威胁狩猎 - 横向移动检测', description: '基于 ATT&CK 框架排查 23 个被窃凭据，ATT&CK T1021。', priority: 'P1', status: 'in_progress', assignee: '张睿', agentId: 'a5', progress: { done: 2, total: 5 }, slaRemainingMin: 120, tags: ['siem', 'edr'], createdAt: '2026-07-13T07:30:00Z', updatedAt: '2026-07-13T08:00:00Z' },
  { id: 't4', code: 'TSK-20260713-004', title: '告警降噪 - 重复规则合并', description: '将 R-019 / k8s-pod-restart / disk_usage 合并降噪。', priority: 'P2', status: 'in_progress', assignee: '陈雪', agentId: 'a6', progress: { done: 1, total: 3 }, slaRemainingMin: 240, tags: ['siem'], createdAt: '2026-07-13T06:40:00Z', updatedAt: '2026-07-13T07:50:00Z' },
  { id: 't5', code: 'TSK-20260712-019', title: '漏洞修复 CVE-2026-3321', description: 'Log4j 远程代码执行，CVSS 9.8，影响 12 个 K8s 节点。', priority: 'P1', status: 'review', assignee: '赵明', agentId: 'a7', progress: { done: 5, total: 5 }, tags: ['cve', '安全'], createdAt: '2026-07-12T16:20:00Z', updatedAt: '2026-07-13T02:00:00Z' },
  { id: 't6', code: 'TSK-20260712-018', title: '容量预测 - Q3 评估', description: '预测 Q3 增长 24%，建议提前扩容。', priority: 'P3', status: 'completed', assignee: '周慧', agentId: 'a4', progress: { done: 4, total: 4 }, tags: ['容量'], createdAt: '2026-07-12T10:00:00Z', updatedAt: '2026-07-12T18:00:00Z' },
  { id: 't7', code: 'TSK-20260712-017', title: '变更辅助 - 网关灰度', description: '蓝绿 → 5% → 25% → 100%，3 阶段监控。', priority: 'P2', status: 'completed', assignee: '孙博', agentId: 'a3', progress: { done: 6, total: 6 }, tags: ['灰度'], createdAt: '2026-07-12T09:15:00Z', updatedAt: '2026-07-12T11:30:00Z' },
  { id: 't8', code: 'TSK-20260715-002', title: 'MySQL 慢查询治理', description: '排查最近 24h 慢查询，定位缺失索引。', priority: 'P2', status: 'pending', assignee: '周慧', agentId: 'a8', progress: { done: 0, total: 4 }, slaRemainingMin: 2880, tags: ['mysql', '性能'], createdAt: '2026-07-15T09:00:00Z', updatedAt: '2026-07-15T09:00:00Z' },
  { id: 't9', code: 'TSK-20260715-003', title: '告警 - 磁盘使用率告警', description: '5 台机器 disk > 90%，需扩容。', priority: 'P1', status: 'pending', assignee: '王昊', agentId: 'a6', progress: { done: 0, total: 3 }, slaRemainingMin: 180, tags: ['容量', '磁盘'], createdAt: '2026-07-15T08:30:00Z', updatedAt: '2026-07-15T08:30:00Z' },
];

export default function Tasks() {
  /* ============ 状态 ============ */
  const [view, setView] = useState<ViewMode>('kanban');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'detail' | 'steps' | 'cmdb' | 'sign' | 'audit' | 'comments'>('detail');
  const [searchQ, setSearchQ] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'sla' | 'updated' | 'created'>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterAgent, setFilterAgent] = useState('全部');
  const [filterAssignee, setFilterAssignee] = useState('全部');
  const [filterPriority, setFilterPriority] = useState<string>('全部');
  const [filterSla, setFilterSla] = useState<SlaBand>('all');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signDrawerOpen, setSignDrawerOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<string>('');
  const [cmdbAsset, setCmdbAsset] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<typeof TASK_TEMPLATES[number] | null>(null);
  const [rejectionReason, setRejectionReason] = useState<{ signer: number; open: boolean }>({ signer: -1, open: false });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 持久化（仅筛选 + 视图）
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const s = JSON.parse(stored);
        setView(s.view ?? 'kanban');
        setFilterAgent(s.filterAgent ?? '全部');
        setFilterAssignee(s.filterAssignee ?? '全部');
        setFilterPriority(s.filterPriority ?? '全部');
        setFilterSla(s.filterSla ?? 'all');
        setFilterTag(s.filterTag ?? null);
        setFilterStatus(s.filterStatus ?? 'all');
        setSortBy(s.sortBy ?? 'priority');
        setSortDir(s.sortDir ?? 'asc');
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ view, filterAgent, filterAssignee, filterPriority, filterSla, filterTag, filterStatus, sortBy, sortDir }));
    } catch {}
  }, [view, filterAgent, filterAssignee, filterPriority, filterSla, filterTag, filterStatus, sortBy, sortDir]);

  // 任务列表（带派生字段：依赖 / 评论 / 附件 / 子任务 / 审计）
  const [tasks, setTasks] = useState<(Task & {
    description?: string;
    blockedBy?: string[];
    comments?: number;
    attachments?: number;
    subtasks?: number;
    signers?: { name: string; role: 'operator' | 'auditor' | 'approver'; signed: boolean; signedAt?: string; signatureHash?: string }[];
    approvers?: { name: string; role: string; signed: boolean; signedAt?: string }[];
    auditLog?: { ts: string; actor: string; action: string; tone: 'info' | 'success' | 'warn' | 'error' }[];
  })[]>(() => SEED_TASKS.map((t) => ({
    ...t,
    description: t.description ?? '',
    blockedBy: t.id === 't2' ? ['t1'] : t.id === 't5' ? ['t1'] : [],
    comments: t.id === 't1' ? 3 : t.id === 't2' ? 1 : 0,
    attachments: t.id === 't1' ? 2 : 0,
    subtasks: t.id === 't1' ? 4 : 0,
    signers: t.id === 't1' || t.id === 't2' || t.id === 't5'
      ? [
          { name: '王昊', role: 'operator', signed: t.id === 't2', signedAt: t.id === 't2' ? '2026-07-13T08:20:00Z' : undefined, signatureHash: t.id === 't2' ? 'sig_4r1l4y' : undefined },
          { name: '李婷', role: 'auditor', signed: false },
        ]
      : [],
    auditLog: [
      { ts: '2026-07-13T08:24:00Z', actor: '王昊', action: '执行 CONFIG SET maxmemory 16GB', tone: 'success' },
      { ts: '2026-07-13T08:23:48Z', actor: '系统', action: '双签通过（王昊 + 李婷）', tone: 'success' },
      { ts: '2026-07-13T08:23:20Z', actor: '王昊', action: '已批准第一签', tone: 'info' },
      { ts: '2026-07-13T08:20:10Z', actor: '故障自愈', action: '请求双签审批', tone: 'warn' },
      { ts: '2026-07-13T08:18:02Z', actor: '王昊', action: '创建任务', tone: 'info' },
    ],
  })));

  /* ============ 派生 ============ */
  const allTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return tasks.filter((t) => {
      if (view === 'mine' && t.assignee !== '王昊') return false;
      if (filterAgent !== '全部' && t.agentId !== filterAgent) return false;
      if (filterAssignee !== '全部' && t.assignee !== filterAssignee) return false;
      if (filterPriority !== '全部' && t.priority !== filterPriority) return false;
      if (filterSla !== 'all' && slaBand(t.slaRemainingMin) !== filterSla) return false;
      if (filterTag && !t.tags.includes(filterTag)) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (q && !`${t.title} ${t.code} ${t.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, searchQ, view, filterAgent, filterAssignee, filterPriority, filterSla, filterTag, filterStatus]);

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sortBy === 'priority') return dir * a.priority.localeCompare(b.priority);
      if (sortBy === 'sla') return dir * ((a.slaRemainingMin ?? 9999) - (b.slaRemainingMin ?? 9999));
      if (sortBy === 'updated') return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      if (sortBy === 'created') return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return 0;
    });
    return arr;
  }, [filteredTasks, sortBy, sortDir]);

  const active = useMemo(() => tasks.find((t) => t.id === activeId) ?? null, [tasks, activeId]);

  // KPI
  const kpis = useMemo(() => {
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const review = tasks.filter((t) => t.status === 'review').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const p0 = tasks.filter((t) => t.priority === 'P0' && t.status !== 'completed' && t.status !== 'archived').length;
    const slaRisk = tasks.filter((t) => (t.slaRemainingMin ?? 9999) < 60 && t.status !== 'completed' && t.status !== 'archived').length;
    const overdue = tasks.filter((t) => (t.slaRemainingMin ?? 0) < 0 && t.status !== 'completed' && t.status !== 'archived').length;
    return { total, inProgress, review, completed, p0, slaRisk, overdue, successRate: total ? Math.round((completed / total) * 100) : 0 };
  }, [tasks]);

  // SLA 风险条（按截止时间排序）
  const slaBands = useMemo(() => {
    return [...tasks]
      .filter((t) => t.status !== 'completed' && t.status !== 'archived' && t.slaRemainingMin !== undefined)
      .sort((a, b) => (a.slaRemainingMin ?? 0) - (b.slaRemainingMin ?? 0))
      .slice(0, 6);
  }, [tasks]);

  /* ============ 操作 ============ */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);
  const clearSelect = () => setSelectedIds(new Set());
  const selectAllVisible = () => setSelectedIds(new Set(sortedTasks.map((t) => t.id)));

  const onDragStart = (e: React.DragEvent, id: string) => e.dataTransfer.setData('text/plain', id);
  const onDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t));
    setDragOver(null);
    setFeedback({ type: 'success', text: '任务状态已更新' });
    setTimeout(() => setFeedback(null), 2000);
  };

  const batchAction = useCallback((action: 'approve' | 'archive' | 'setPriority' | 'setStatus' | 'export', payload?: string) => {
    if (selectedIds.size === 0) return;
    if (action === 'approve') {
      setTasks((prev) => prev.map((t) => selectedIds.has(t.id) && t.signers ? {
        ...t,
        signers: t.signers.map((s, i) => i === 0 ? { ...s, signed: true, signedAt: new Date().toISOString(), signatureHash: uid('sig_') } : s),
        status: 'review' as TaskStatus,
        updatedAt: new Date().toISOString(),
      } : t));
      setFeedback({ type: 'success', text: `已对 ${selectedIds.size} 个任务执行批量第一签` });
    } else if (action === 'archive') {
      setTasks((prev) => prev.map((t) => selectedIds.has(t.id) ? { ...t, status: 'archived' as TaskStatus, updatedAt: new Date().toISOString() } : t));
      setFeedback({ type: 'success', text: `已归档 ${selectedIds.size} 个任务` });
    } else if (action === 'setPriority' && payload) {
      setTasks((prev) => prev.map((t) => selectedIds.has(t.id) ? { ...t, priority: payload as Priority, updatedAt: new Date().toISOString() } : t));
      setFeedback({ type: 'success', text: `已批量改优先级为 ${payload}` });
    } else if (action === 'setStatus' && payload) {
      setTasks((prev) => prev.map((t) => selectedIds.has(t.id) ? { ...t, status: payload as TaskStatus, updatedAt: new Date().toISOString() } : t));
      setFeedback({ type: 'success', text: `已批量改状态为 ${payload}` });
    } else if (action === 'export') {
      const data = JSON.stringify(tasks.filter((t) => selectedIds.has(t.id)), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `tasks-batch-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      setFeedback({ type: 'success', text: `已导出 ${selectedIds.size} 个任务` });
    }
    setTimeout(() => setFeedback(null), 2500);
    clearSelect();
  }, [selectedIds, tasks]);

  // 新建任务
  const [newForm, setNewForm] = useState<{
    title: string; description: string; priority: Priority; assignee: string; agentId: string; tags: string; slaMin: number; asset: string; blockedBy: string;
  }>({ title: '', description: '', priority: 'P2', assignee: '王昊', agentId: '故障自愈', tags: '', slaMin: 240, asset: '', blockedBy: '' });
  const applyTemplate = (tpl: typeof TASK_TEMPLATES[number]) => {
    setActiveTemplate(tpl);
    setNewForm((f) => ({
      ...f,
      title: `${tpl.name} - ${new Date().toLocaleDateString('zh-CN')}`,
      priority: tpl.priority,
      agentId: tpl.agent,
      tags: tpl.tags.join(','),
      slaMin: tpl.slaMin,
      asset: tpl.asset,
    }));
    setTemplatePickerOpen(false);
    setNewModalOpen(true);
  };
  const createTask = () => {
    if (!newForm.title.trim()) return;
    const id = uid('t');
    const code = `TSK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(tasks.length + 1).padStart(3, '0')}`;
    setTasks((prev) => [
      {
        id, code, title: newForm.title, description: newForm.description, priority: newForm.priority,
        status: 'pending', assignee: newForm.assignee, agentId: newForm.agentId,
        progress: { done: 0, total: 1 }, slaRemainingMin: newForm.slaMin,
        tags: newForm.tags.split(',').map((s) => s.trim()).filter(Boolean),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        blockedBy: newForm.blockedBy ? [newForm.blockedBy] : [],
        auditLog: [{ ts: new Date().toISOString(), actor: newForm.assignee, action: '创建任务', tone: 'info' }],
        signers: newForm.priority === 'P0' ? [{ name: newForm.assignee, role: 'operator', signed: false }, { name: '李婷', role: 'auditor', signed: false }] : [],
      } as any,
      ...prev,
    ]);
    setNewModalOpen(false);
    setActiveTemplate(null);
    setNewForm({ title: '', description: '', priority: 'P2', assignee: '王昊', agentId: '故障自愈', tags: '', slaMin: 240, asset: '', blockedBy: '' });
    setFeedback({ type: 'success', text: '任务已创建' });
    setTimeout(() => setFeedback(null), 2000);
  };

  const openSign = (title: string) => { setSignTarget(title); setSignDrawerOpen(true); };
  const approveSign = (taskId: string, signerIndex: number) => {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== taskId || !t.signers) return t;
      const signers = t.signers.map((s, i) => i === signerIndex && !s.signed
        ? { ...s, signed: true, signedAt: new Date().toISOString(), signatureHash: uid('sig_') }
        : s);
      const allSigned = signers.every((s) => s.signed);
      return {
        ...t,
        signers,
        status: allSigned ? ('review' as TaskStatus) : t.status,
        updatedAt: new Date().toISOString(),
        auditLog: [{ ts: new Date().toISOString(), actor: signers[signerIndex].name, action: '完成签名', tone: 'success' }, ...(t.auditLog ?? [])],
      };
    }));
    setFeedback({ type: 'success', text: '已签发' });
    setTimeout(() => setFeedback(null), 2000);
  };
  const rejectSign = (taskId: string, signerIndex: number, reason: string) => {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== taskId || !t.signers) return t;
      const signers = t.signers.map((s, i) => i === signerIndex ? { ...s, signed: true, signedAt: new Date().toISOString(), signatureHash: uid('sig_') } : s);
      return { ...t, signers, status: 'pending' as TaskStatus, updatedAt: new Date().toISOString(),
        auditLog: [{ ts: new Date().toISOString(), actor: signers[signerIndex].name, action: `拒绝: ${reason}`, tone: 'error' as const }, ...(t.auditLog ?? [])] };
    }));
    setRejectionReason({ signer: -1, open: false });
  };

  const resetFilters = () => {
    setFilterAgent('全部');
    setFilterAssignee('全部');
    setFilterPriority('全部');
    setFilterSla('all');
    setFilterTag(null);
    setFilterStatus('all');
    setSearchQ('');
  };

  const activeFilterCount = (filterAgent !== '全部' ? 1 : 0) + (filterAssignee !== '全部' ? 1 : 0) + (filterPriority !== '全部' ? 1 : 0) + (filterSla !== 'all' ? 1 : 0) + (filterTag ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0);

  return (
    <div className="tasks-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)]">
      {/* （左侧筛选栏已移到主区顶部） */}

      {/* ============ 主区 ============ */}
      <section className="mx-auto min-w-0 w-full max-w-[1680px] bg-[var(--bg)]">
        {/* 顶栏 */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-[var(--brand)]" />
                任务控制台
                <Badge tone="brand" className="text-[9px]">企业版</Badge>
              </h1>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                {sortedTasks.length}/{tasks.length} 任务 · {kpis.inProgress} 进行中 · {kpis.slaRisk} SLA 风险
              </div>
            </div>
            {feedback && (
              <Badge tone={feedback.type === 'success' ? 'success' : 'error'} className="text-[10px] animate-pulse">
                <CheckCircle2 className="h-3 w-3 mr-0.5" />{feedback.text}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 排序 */}
            <div className="hidden md:flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-[10px]">
              <span className="text-[var(--text-muted)] px-1">排序</span>
              {(['priority', 'sla', 'updated', 'created'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { if (sortBy === s) setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortBy(s); setSortDir('asc'); } }}
                  className={cn('px-1.5 py-0.5 rounded font-mono uppercase', sortBy === s ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]')}
                >
                  {s === 'priority' ? '优先级' : s === 'sla' ? 'SLA' : s === 'updated' ? '更新' : '创建'}
                  {sortBy === s && (sortDir === 'asc' ? <ChevronUp className="inline h-2.5 w-2.5" /> : <ChevronDown className="inline h-2.5 w-2.5" />)}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setTemplatePickerOpen(true)} className="hidden md:inline-flex">
              <Sparkles className="h-3.5 w-3.5" />模板
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDetailDrawerOpen(true)}
              disabled={!active}
              className="hidden sm:inline-flex"
            >
              <Eye className="h-3.5 w-3.5" />详情
            </Button>
            <Button size="sm" onClick={() => setNewModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />新建
            </Button>
          </div>
        </div>

        {/* ============ 顶部筛选条（先于 SLA + KPI） ============ */}
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-5 py-2.5 space-y-2">
          {/* 第 1 行：搜索 + 视图 tab + 重置 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative min-w-[180px] flex-1 max-w-[260px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜索 标题 / 编号 / 标签"
                className="h-7 pl-7 text-xs"
              />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold ml-1">视图</span>
            {([
              { k: 'kanban' as ViewMode, label: '看板', icon: KanbanSquare },
              { k: 'list' as ViewMode, label: '列表', icon: List },
              { k: 'timeline' as ViewMode, label: '时间线', icon: Calendar },
              { k: 'mine' as ViewMode, label: '我的', icon: UserIcon },
            ]).map((v) => (
              <button
                key={v.k}
                onClick={() => setView(v.k)}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
                  view === v.k
                    ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                    : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                )}
              >
                <v.icon className="h-3 w-3" />{v.label}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="ml-auto rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-2 py-1 text-[11px] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors flex items-center gap-1"
              >
                <X className="h-3 w-3" />重置 ({activeFilterCount})
              </button>
            )}
          </div>

          {/* 第 2 行：状态 + 优先级 + SLA */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">状态</span>
            <button
              onClick={() => setFilterStatus('all')}
              className={cn('rounded-md border px-2 py-1 text-[11px]', filterStatus === 'all' ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]')}
            >
              全部 <span className="ml-0.5 font-mono opacity-70">({tasks.length})</span>
            </button>
            {COLUMNS.map((c) => (
              <button
                key={c.key}
                onClick={() => setFilterStatus(c.key)}
                className={cn('rounded-md border px-2 py-1 text-[11px]', filterStatus === c.key ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]')}
              >
                {c.label} <span className="ml-0.5 font-mono opacity-70">({tasks.filter((t) => t.status === c.key).length})</span>
              </button>
            ))}
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold ml-3">优先级</span>
            {(['全部', ...PRIORITIES] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={cn('rounded-md border px-2 py-1 text-[11px] font-mono', filterPriority === p ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]')}
              >
                {p}
              </button>
            ))}
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold ml-3">SLA</span>
            {SLA_BANDS.map((b) => (
              <button
                key={b.key}
                onClick={() => setFilterSla(b.key)}
                className={cn('rounded-md border px-2 py-1 text-[11px]', filterSla === b.key ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]')}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* 第 3 行：负责人 + Agent + 标签 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">负责人</span>
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="h-7 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-[11px]"
            >
              {ASSIGNEES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold ml-2">Agent</span>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="h-7 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-[11px]"
            >
              {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {allTags.length > 0 && (
              <>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold ml-2">标签</span>
                <button
                  onClick={() => setFilterTag(null)}
                  className={cn('rounded-full border px-2 py-0.5 text-[10px] font-mono', !filterTag ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]')}
                >
                  全部
                </button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterTag(filterTag === t ? null : t)}
                    className={cn('rounded-full border px-2 py-0.5 text-[10px] font-mono', filterTag === t ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]')}
                  >
                    #{t}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* KPI 矩阵（先）+ SLA 风险地图（后）*/}
        <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 px-5 py-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <KpiCard label="今日任务" value={kpis.total} sub="次" tone="brand" icon={ListChecks} />
            <KpiCard label="进行中" value={kpis.inProgress} sub="件" tone="info" icon={Clock} />
            <KpiCard label="待复核" value={kpis.review} sub="件" tone="warn" icon={ShieldCheck} />
            <KpiCard label="P0 进行中" value={kpis.p0} sub="件" tone="error" icon={AlertOctagon} />
            <KpiCard label="SLA 风险" value={kpis.slaRisk} sub="< 1h" tone="error" icon={ZapOff} />
            <KpiCard label="成功率" value={kpis.successRate} sub="%" tone="success" icon={TrendingUp} />
          </div>
          {slaBands.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  <Activity className="h-3 w-3" />SLA 风险地图
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{slaBands.length} 条即将到期</span>
              </div>
              <div className="space-y-1">
                {slaBands.map((t) => {
                  const band = slaBand(t.slaRemainingMin);
                  const pct = Math.max(0, Math.min(100, ((t.slaRemainingMin ?? 0) + 240) / 480 * 100));
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveId(t.id)}
                      className="flex w-full items-center gap-2 text-[10px] hover:bg-[var(--bg-hover)] rounded px-1.5 py-0.5"
                    >
                      <Badge tone={PRIORITY_TONE[t.priority]} className="text-[9px] shrink-0 w-9 justify-center">{t.priority}</Badge>
                      <span className="font-mono text-[var(--text-muted)] shrink-0 w-32 truncate text-left">{t.code}</span>
                      <span className="flex-1 truncate text-left text-[var(--text)]">{t.title}</span>
                      <div className="hidden md:block w-32 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                        <div className={cn('h-full', band === 'overdue' ? 'bg-[var(--danger)]' : band === 'critical' ? 'bg-[var(--danger)]' : band === 'warning' ? 'bg-[var(--warning)]' : 'bg-[var(--success)]')} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={cn('font-mono w-14 text-right shrink-0', band === 'overdue' ? 'text-[var(--danger)] animate-pulse' : band === 'critical' ? 'text-[var(--danger)]' : band === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]')}>
                        {t.slaRemainingMin! < 0 ? `超时 ${Math.abs(t.slaRemainingMin!)}m` : t.slaRemainingMin! < 60 ? `${t.slaRemainingMin}m` : `${Math.floor(t.slaRemainingMin! / 60)}h`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 批量操作栏 */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--brand-light)] px-5 py-2 text-xs">
            <div className="flex items-center gap-2 text-[var(--brand)] font-semibold">
              <input type="checkbox" checked readOnly className="accent-[var(--brand)]" />
              已选 {selectedIds.size} 个任务
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="secondary" onClick={() => batchAction('approve')}>
                <ShieldCheck className="h-3 w-3" />批量第一签
              </Button>
              <Button size="sm" variant="secondary" onClick={() => batchAction('setPriority', 'P0')}>改 P0</Button>
              <Button size="sm" variant="secondary" onClick={() => batchAction('setStatus', 'in_progress')}>进行中</Button>
              <Button size="sm" variant="secondary" onClick={() => batchAction('export')}>
                <FileText className="h-3 w-3" />导出
              </Button>
              <Button size="sm" variant="secondary" onClick={() => batchAction('archive')}>
                <Archive className="h-3 w-3" />归档
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelect} aria-label="清空选择">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* 视图区 */}
        <div className="pb-5">
          {view === 'kanban' && (
            <KanbanView
              tasks={sortedTasks}
              activeId={activeId}
              selectedIds={selectedIds}
              onSelect={(id) => setActiveId(id)}
              onToggleSelect={toggleSelect}
              onDragStart={onDragStart}
              onDrop={onDrop}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onApprove={(id, idx) => approveSign(id, idx)}
            />
          )}
          {view === 'list' && (
            <ListView
              tasks={sortedTasks}
              activeId={activeId}
              selectedIds={selectedIds}
              onSelect={(id) => setActiveId(id)}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAllVisible}
              onApprove={(id, idx) => approveSign(id, idx)}
            />
          )}
          {view === 'timeline' && (
            <TimelineView
              tasks={sortedTasks}
              activeId={activeId}
              onSelect={(id) => setActiveId(id)}
            />
          )}
          {view === 'mine' && (
            <KanbanView
              tasks={sortedTasks}
              activeId={activeId}
              selectedIds={selectedIds}
              onSelect={(id) => setActiveId(id)}
              onToggleSelect={toggleSelect}
              onDragStart={onDragStart}
              onDrop={onDrop}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onApprove={(id, idx) => approveSign(id, idx)}
            />
          )}
        </div>
      </section>

      <Drawer
        open={detailDrawerOpen && !!active}
        onClose={() => setDetailDrawerOpen(false)}
        title={active ? `${active.code} · 任务详情` : '任务详情'}
        description="任务步骤、资产、双签、审计与协作记录"
        width={480}
      >
        {active ? (
          <DetailPanel
            task={active}
            onClose={() => setDetailDrawerOpen(false)}
            tab={detailTab}
            setTab={setDetailTab}
            onOpenSign={() => openSign(active.title)}
            onApprove={(idx) => approveSign(active.id, idx)}
            onReject={(idx) => setRejectionReason({ signer: idx, open: true })}
            onCMDB={setCmdbAsset}
            cmdbAsset={cmdbAsset}
            onUpdate={(patch) => setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)))}
          />
        ) : (
          <EmptyState icon={ListChecks} title="选择任务查看详情" />
        )}
      </Drawer>

      {/* ============ 新建任务 Modal ============ */}
      <Modal open={newModalOpen} onClose={() => { setNewModalOpen(false); setActiveTemplate(null); }} title={activeTemplate ? `从模板创建：${activeTemplate.name}` : '新建任务'} width={560} footer={
        <div className="flex w-full gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => { setNewModalOpen(false); setActiveTemplate(null); }}>取消</Button>
          <Button className="flex-1" onClick={createTask} disabled={!newForm.title.trim()}>
            <Plus className="h-3.5 w-3.5" />创建
          </Button>
        </div>
      }>
        <div className="space-y-3">
          <FormField label="标题 *">
            <Input value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} placeholder="例如：Redis 集群扩容" autoFocus />
          </FormField>
          <FormField label="描述">
            <textarea value={newForm.description} onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))} placeholder="补充背景、目标、约束..." rows={3} className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="优先级">
              <select value={newForm.priority} onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value as Priority }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                {PRIORITIES.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </FormField>
            <FormField label="负责人">
              <select value={newForm.assignee} onChange={(e) => setNewForm((f) => ({ ...f, assignee: e.target.value }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                {ASSIGNEES.filter((a) => a !== '全部').map((n) => (<option key={n}>{n}</option>))}
              </select>
            </FormField>
            <FormField label="Agent">
              <select value={newForm.agentId} onChange={(e) => setNewForm((f) => ({ ...f, agentId: e.target.value }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                {AGENTS.filter((a) => a !== '全部').map((a) => (<option key={a}>{a}</option>))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SLA (分钟)">
              <input type="number" min={15} step={15} value={newForm.slaMin} onChange={(e) => setNewForm((f) => ({ ...f, slaMin: parseInt(e.target.value) || 60 }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm font-mono" />
            </FormField>
            <FormField label="关联 CMDB 资产">
              <select value={newForm.asset} onChange={(e) => setNewForm((f) => ({ ...f, asset: e.target.value }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                <option value="">不关联</option>
                {CMDB_ASSETS.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="标签（逗号分隔）">
            <Input value={newForm.tags} onChange={(e) => setNewForm((f) => ({ ...f, tags: e.target.value }))} placeholder="例如：redis,生产,OOM" />
          </FormField>
          <FormField label="依赖任务（被此任务阻塞）">
            <select value={newForm.blockedBy} onChange={(e) => setNewForm((f) => ({ ...f, blockedBy: e.target.value }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
              <option value="">无</option>
              {tasks.filter((t) => t.status !== 'completed' && t.status !== 'archived').map((t) => (<option key={t.id} value={t.id}>{t.code} · {t.title}</option>))}
            </select>
          </FormField>
        </div>
      </Modal>

      {/* ============ 模板选择 Modal ============ */}
      <Modal open={templatePickerOpen} onClose={() => setTemplatePickerOpen(false)} title="任务模板 · 5 个预设" width={640}>
        <div className="grid grid-cols-2 gap-2">
          {TASK_TEMPLATES.map((tpl) => {
            const Icon = TEMPLATE_ICONS[tpl.iconKey];
            return (
              <button
                key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-left hover:border-[var(--brand)] hover:bg-[var(--brand-light)]/30 transition-colors"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)]">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-sm">{tpl.name}</span>
                    <Badge tone={PRIORITY_TONE[tpl.priority]} className="text-[9px]">{tpl.priority}</Badge>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">SLA {tpl.slaMin / 60}h · {tpl.agent}</div>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {tpl.tags.map((t) => <span key={t} className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[9px] text-[var(--text-muted)]">#{t}</span>)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* ============ 双签 Modal + Drawer ============ */}
      <DualSignModal open={signOpen} title={signTarget} description={active?.code} onClose={() => setSignOpen(false)} onApprove={(name) => {
        if (active) approveSign(active.id, 0);
        setSignOpen(false);
        setSignDrawerOpen(false);
      }} />

      {signDrawerOpen && active && (
        <div className="fixed inset-0 z-40" onClick={() => setSignDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute right-0 top-0 h-full w-[440px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[var(--danger)]" /><span className="text-base font-semibold">双签审批</span></div>
              <button onClick={() => setSignDrawerOpen(false)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 mb-4 text-xs">
              <div className="font-semibold text-[var(--danger)]">等保 3 强制</div>
              <div className="text-[var(--text-muted)] mt-0.5">需要 operator + auditor 两个不同角色签发，结果写入 SignedLog。</div>
            </div>
            <div className="space-y-2 text-xs">
              <Row label="任务" value={active.title} />
              <Row label="编号" value={<span className="font-mono">{active.code}</span>} />
              <Row label="优先级" value={<Badge tone={PRIORITY_TONE[active.priority]}>{active.priority}</Badge>} />
              <Row label="执行人" value={active.assignee} />
              <Row label="操作" value="CONFIG SET maxmemory 16GB + volatile-lru" />
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setSignDrawerOpen(false)}>关闭</Button>
              <Button variant="danger" className="flex-1" onClick={() => setSignOpen(true)}><ShieldCheck className="h-3.5 w-3.5" />签发（第一签）</Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 拒绝原因 Modal ============ */}
      {rejectionReason.open && active && active.signers && (
        <div className="fixed inset-0 z-50" onClick={() => setRejectionReason({ signer: -1, open: false })}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-[var(--danger)]" />拒绝双签
            </div>
            <div className="space-y-2 text-xs">
              <label className="block text-[10px] text-[var(--text-muted)]">拒绝原因（必填，写入审计）</label>
              <textarea id="rejection-reason" className="w-full h-24 rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-xs" placeholder="例如：维护窗口未到 / 影响范围过大 / 配置错误..." />
              <div className="flex gap-1.5 pt-2">
                <div className="flex-1" />
                <Button size="sm" variant="secondary" onClick={() => setRejectionReason({ signer: -1, open: false })}>取消</Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    const reason = (document.getElementById('rejection-reason') as HTMLTextAreaElement | null)?.value ?? '';
                    if (active) rejectSign(active.id, rejectionReason.signer, reason);
                  }}
                >
                  确认拒绝
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ============ 任务卡（看板/我的） ============ */
function TaskCard({
  t, active, selected, onSelect, onToggleSelect, onDragStart, onApprove,
}: {
  t: any; active: boolean; selected: boolean; onSelect: () => void; onToggleSelect: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void; onApprove: (id: string, idx: number) => void;
}) {
  const pct = Math.round((t.progress.done / t.progress.total) * 100);
  const band = slaBand(t.slaRemainingMin);
  return (
    <div
      id={t.id}
      draggable
      onDragStart={(e) => onDragStart(e, t.id)}
      onClick={onSelect}
      className={cn(
        'group relative cursor-grab rounded-lg border bg-[var(--surface-1)] p-2.5 transition-all hover:border-[var(--brand)] hover:shadow-sm active:cursor-grabbing',
        active ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]/30' : 'border-[var(--border)]',
        selected && 'ring-2 ring-[var(--brand)]',
        band === 'overdue' && 'border-l-[3px] border-l-[var(--danger)]',
        band === 'critical' && 'border-l-[3px] border-l-[var(--danger)]',
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="accent-[var(--brand)] h-3 w-3" />
        <Badge tone={PRIORITY_TONE[t.priority as Priority]} className="text-[9px]">{t.priority}</Badge>
        <span className="font-mono text-[9px] text-[var(--text-muted)] truncate">{t.code}</span>
        <GripVertical className="ml-auto h-3 w-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-60" />
      </div>
      <div className="mb-1.5 text-xs font-semibold leading-snug line-clamp-2">{t.title}</div>
      {t.description && <div className="mb-1.5 text-[10px] text-[var(--text-muted)] line-clamp-1">{t.description}</div>}

      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-[var(--text-muted)]">
        <Avatar name={t.assignee ?? '?'} size={14} />
        <span className="truncate">{t.assignee}</span>
        <Bot className="h-2.5 w-2.5 text-[var(--brand)] shrink-0" />
        <span className="text-[var(--brand)] truncate">{t.agentId}</span>
      </div>

      <Progress value={pct} tone={t.priority === 'P0' ? 'error' : t.priority === 'P1' ? 'warn' : 'primary'} />
      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className="text-[var(--text-muted)] font-mono">{t.progress.done}/{t.progress.total}</span>
        <span className={cn('font-mono flex items-center gap-0.5', band === 'overdue' ? 'text-[var(--danger)] animate-pulse' : band === 'critical' ? 'text-[var(--danger)]' : band === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]')}>
          <Clock className="h-2.5 w-2.5" />
          {t.slaRemainingMin === undefined ? '—' : t.slaRemainingMin < 0 ? `超时 ${Math.abs(t.slaRemainingMin)}m` : t.slaRemainingMin < 60 ? `${t.slaRemainingMin}m` : `${Math.floor(t.slaRemainingMin / 60)}h${t.slaRemainingMin % 60}m`}
        </span>
      </div>

      {/* 底部 chip：依赖 / 评论 / 附件 / 子任务 / 待签 */}
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--text-muted)] flex-wrap">
        {t.blockedBy?.length > 0 && <span className="flex items-center gap-0.5 text-[var(--warning)]" title="依赖未完成"><Link2 className="h-2.5 w-2.5" />{t.blockedBy.length}</span>}
        {t.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{t.comments}</span>}
        {t.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-2.5 w-2.5" />{t.attachments}</span>}
        {t.subtasks > 0 && <span className="flex items-center gap-0.5"><ListChecks className="h-2.5 w-2.5" />{t.subtasks}</span>}
        {t.signers?.some((s: any) => !s.signed) && <Badge tone="warn" className="text-[8px]"><ShieldCheck className="h-2 w-2 mr-0.5" />待签</Badge>}
        {t.tags.slice(0, 2).map((tag: string) => <span key={tag} className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[9px]">#{tag}</span>)}
      </div>
    </div>
  );
}

/* ============ 看板视图 ============ */
function KanbanView({ tasks, activeId, selectedIds, onSelect, onToggleSelect, onDragStart, onDrop, dragOver, setDragOver, onApprove }: {
  tasks: any[]; activeId: string | null; selectedIds: Set<string>;
  onSelect: (id: string) => void; onToggleSelect: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, status: TaskStatus) => void;
  dragOver: string | null; setDragOver: (s: string | null) => void;
  onApprove: (id: string, idx: number) => void;
}) {
  const grouped = COLUMNS.map((c) => ({ ...c, items: tasks.filter((t: any) => t.status === c.key) }));
  return (
    <div className="overflow-x-auto bg-[var(--bg-elevated)]/30 p-4">
      <div className="grid min-w-[1320px] grid-cols-5 gap-3">
        {grouped.map((col) => {
        const ratio = col.items.length / col.capacity;
        const overCap = ratio > 0.8;
        return (
          <div
            key={col.key}
            className={cn('flex min-w-0 flex-col rounded-lg border-t-2 bg-[var(--bg)] border border-[var(--border)] transition-all', col.tone, dragOver === col.key && 'ring-2 ring-[var(--brand)]/40 shadow-lg')}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setDragOver(col.key)}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <col.icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                {col.label}
                {col.items.length > 0 && <span className="text-[10px] text-[var(--text-muted)] font-mono">({col.items.length})</span>}
              </div>
              <Badge tone={col.items.length > 0 ? (overCap ? 'error' : 'brand') : 'neutral'} className="text-[9px]">
                {col.items.length}/{col.capacity}
              </Badge>
            </div>
            <div className="space-y-2 p-2 bg-[var(--bg-elevated)]/30" role="list">
              {col.items.length === 0 && (
                <div className="text-center text-xs text-[var(--text-muted)] py-8 flex flex-col items-center gap-1">
                  <Inbox className="h-5 w-5 opacity-30" />拖拽任务到此处
                </div>
              )}
              {col.items.map((t: any) => (
                <TaskCard
                  key={t.id}
                  t={t}
                  active={t.id === activeId}
                  selected={selectedIds.has(t.id)}
                  onSelect={() => onSelect(t.id)}
                  onToggleSelect={() => onToggleSelect(t.id)}
                  onDragStart={onDragStart}
                  onApprove={onApprove}
                />
              ))}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}

/* ============ 列表视图 ============ */
function ListView({ tasks, activeId, selectedIds, onSelect, onToggleSelect, onSelectAll, onApprove }: {
  tasks: any[]; activeId: string | null; selectedIds: Set<string>;
  onSelect: (id: string) => void; onToggleSelect: (id: string) => void;
  onSelectAll: () => void; onApprove: (id: string, idx: number) => void;
}) {
  const allSelected = tasks.length > 0 && tasks.every((t: any) => selectedIds.has(t.id));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1040px] w-full text-xs">
        <thead className="sticky top-0 bg-[var(--bg-elevated)] z-10 border-b border-[var(--border)]">
          <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="w-8 p-2"><input type="checkbox" checked={allSelected} onChange={onSelectAll} className="accent-[var(--brand)]" /></th>
            <th className="text-left p-2">任务</th>
            <th className="text-left p-2 w-20">状态</th>
            <th className="text-left p-2 w-14">优先级</th>
            <th className="text-left p-2 w-24">负责人</th>
            <th className="text-left p-2 w-28">Agent</th>
            <th className="text-left p-2 w-20">SLA</th>
            <th className="text-left p-2 w-24">进度</th>
            <th className="text-left p-2 w-32">标签</th>
            <th className="text-left p-2 w-24">更新</th>
            <th className="p-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr><td colSpan={11} className="text-center py-12 text-[var(--text-muted)]">没有符合条件的任务</td></tr>
          )}
          {tasks.map((t: any) => {
            const band = slaBand(t.slaRemainingMin);
            return (
              <tr
                key={t.id}
                onClick={() => onSelect(t.id)}
                className={cn(
                  'border-b border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-hover)]',
                  activeId === t.id && 'bg-[var(--brand-light)]/30',
                  selectedIds.has(t.id) && 'bg-[var(--brand-light)]/20',
                )}
              >
                <td className="p-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => onToggleSelect(t.id)} className="accent-[var(--brand)]" /></td>
                <td className="p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{t.code}</span>
                    {t.signers?.some((s: any) => !s.signed) && <ShieldCheck className="h-3 w-3 text-[var(--warning)]" />}
                  </div>
                  <div className="font-semibold leading-tight">{t.title}</div>
                </td>
                <td className="p-2">
                  <Badge tone={t.status === 'completed' ? 'success' : t.status === 'review' ? 'warn' : t.status === 'archived' ? 'neutral' : 'info'} className="text-[9px]">
                    {COLUMNS.find((c) => c.key === t.status)?.label}
                  </Badge>
                </td>
                <td className="p-2"><Badge tone={PRIORITY_TONE[t.priority as Priority]} className="text-[9px]">{t.priority}</Badge></td>
                <td className="p-2"><span className="flex items-center gap-1"><Avatar name={t.assignee} size={16} />{t.assignee}</span></td>
                <td className="p-2 text-[var(--brand)]">{t.agentId}</td>
                <td className="p-2">
                  <span className={cn('font-mono', band === 'overdue' ? 'text-[var(--danger)] animate-pulse' : band === 'critical' ? 'text-[var(--danger)]' : band === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]')}>
                    {t.slaRemainingMin === undefined ? '—' : t.slaRemainingMin < 0 ? `超时 ${Math.abs(t.slaRemainingMin)}m` : t.slaRemainingMin < 60 ? `${t.slaRemainingMin}m` : `${Math.floor(t.slaRemainingMin / 60)}h`}
                  </span>
                </td>
                <td className="p-2"><div className="flex items-center gap-1.5"><Progress value={Math.round((t.progress.done / t.progress.total) * 100)} tone={t.priority === 'P0' ? 'error' : t.priority === 'P1' ? 'warn' : 'primary'} className="!h-1 flex-1" /><span className="text-[10px] font-mono text-[var(--text-muted)]">{t.progress.done}/{t.progress.total}</span></div></td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-0.5">
                    {t.tags.slice(0, 2).map((tag: string) => <span key={tag} className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[9px]">#{tag}</span>)}
                  </div>
                </td>
                <td className="p-2 text-[10px] text-[var(--text-muted)] font-mono">{formatRelative(t.updatedAt)}</td>
                <td className="p-2"><MoreHorizontal className="h-3.5 w-3.5 text-[var(--text-muted)]" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============ 时间线视图 ============ */
function TimelineView({ tasks, activeId, onSelect }: { tasks: any[]; activeId: string | null; onSelect: (id: string) => void }) {
  const sorted = [...tasks].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const groupedByDay = sorted.reduce<Record<string, any[]>>((acc, t) => {
    const day = new Date(t.createdAt).toLocaleDateString('zh-CN');
    acc[day] = acc[day] ?? [];
    acc[day].push(t);
    return acc;
  }, {});
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {Object.entries(groupedByDay).map(([day, dayTasks]) => (
          <div key={day}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span className="text-xs font-semibold">{day}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">{dayTasks.length} 任务</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>
            <div className="space-y-2 pl-4 border-l-2 border-[var(--border)]">
              {dayTasks.map((t) => {
                const band = slaBand(t.slaRemainingMin);
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t.id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-md border bg-[var(--surface-1)] p-2.5 text-left transition-colors',
                      activeId === t.id ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]/30' : 'border-[var(--border)] hover:border-[var(--brand)]',
                    )}
                  >
                    <span className={cn('mt-1 h-2 w-2 rounded-full shrink-0', band === 'overdue' || band === 'critical' ? 'bg-[var(--danger)]' : band === 'warning' ? 'bg-[var(--warning)]' : 'bg-[var(--brand)]')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge tone={PRIORITY_TONE[t.priority as Priority]} className="text-[9px]">{t.priority}</Badge>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">{t.code}</span>
                        <Badge tone={t.status === 'completed' ? 'success' : t.status === 'review' ? 'warn' : 'info'} className="text-[9px]">{COLUMNS.find((c) => c.key === t.status)?.label}</Badge>
                      </div>
                      <div className="font-semibold text-sm mt-0.5">{t.title}</div>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mt-1">
                        <Avatar name={t.assignee} size={14} />{t.assignee}
                        <span>·</span><Bot className="h-2.5 w-2.5" /><span className="text-[var(--brand)]">{t.agentId}</span>
                        {t.slaRemainingMin !== undefined && (
                          <>
                            <span>·</span>
                            <span className={cn('font-mono', band === 'overdue' ? 'text-[var(--danger)]' : band === 'critical' ? 'text-[var(--danger)]' : band === 'warning' ? 'text-[var(--warning)]' : '')}>
                              SLA {t.slaRemainingMin < 0 ? `超时 ${Math.abs(t.slaRemainingMin)}m` : t.slaRemainingMin < 60 ? `${t.slaRemainingMin}m` : `${Math.floor(t.slaRemainingMin / 60)}h`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">{new Date(t.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ 详情侧栏 ============ */
function DetailPanel({ task, onClose, tab, setTab, onOpenSign, onApprove, onReject, onCMDB, cmdbAsset, onUpdate }: {
  task: any; onClose: () => void; tab: string; setTab: (t: any) => void;
  onOpenSign: () => void; onApprove: (idx: number) => void; onReject: (idx: number) => void;
  onCMDB: (a: any) => void; cmdbAsset: any;
  onUpdate?: (patch: any) => void;
}) {
  const { text: countdownText, expired } = useCountdown(((task.slaRemainingMin ?? 60) * 60) || 3600);
  const band = slaBand(task.slaRemainingMin);

  // 详情交互 state（评论 / 附件 / 子任务 / 依赖 / 暂停）
  const [commentDraft, setCommentDraft] = useState('');
  const [commentList, setCommentList] = useState<Array<{ id: string; author: string; text: string; ts: string; tone: 'info' | 'success' | 'warn' | 'error' }>>([]);
  const [attachmentModal, setAttachmentModal] = useState(false);
  const [attachmentDraft, setAttachmentDraft] = useState<{ name: string; size: string; type: 'doc' | 'log' | 'image' | 'config' }>({ name: '', size: '', type: 'doc' });
  const [attachmentList, setAttachmentList] = useState<Array<{ id: string; name: string; size: string; type: 'doc' | 'log' | 'image' | 'config'; ts: string }>>([]);
  const [subtaskModal, setSubtaskModal] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtaskList, setSubtaskList] = useState<Array<{ id: string; title: string; done: boolean }>>([]);
  const [depModal, setDepModal] = useState(false);
  const [depDraft, setDepDraft] = useState('');

  const appendAudit = (action: string, tone: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    if (!onUpdate) return;
    const entry = { ts: new Date().toISOString(), actor: '当前用户', action, tone };
    onUpdate({
      auditLog: [...(task.auditLog ?? []), entry],
      updatedAt: entry.ts,
    });
  };

  const submitComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    const newItem = { id: `c_${Date.now().toString(36)}`, author: '当前用户', text, ts: new Date().toISOString(), tone: 'info' as const };
    setCommentList((prev) => [newItem, ...prev]);
    setCommentDraft('');
    if (onUpdate) onUpdate({ comments: (task.comments ?? 0) + 1, updatedAt: new Date().toISOString() });
    appendAudit(`评论: ${text.slice(0, 24)}${text.length > 24 ? '…' : ''}`, 'info');
  };

  const addAttachment = () => {
    if (!attachmentDraft.name.trim()) return;
    const newItem = { id: `at_${Date.now().toString(36)}`, name: attachmentDraft.name.trim(), size: attachmentDraft.size.trim() || '0 KB', type: attachmentDraft.type, ts: new Date().toISOString() };
    setAttachmentList((prev) => [newItem, ...prev]);
    setAttachmentDraft({ name: '', size: '', type: 'doc' });
    setAttachmentModal(false);
    appendAudit(`附件上传: ${newItem.name}`, 'success');
  };

  const addSubtask = () => {
    if (!subtaskDraft.trim()) return;
    setSubtaskList((prev) => [...prev, { id: `st_${Date.now().toString(36)}`, title: subtaskDraft.trim(), done: false }]);
    setSubtaskDraft('');
    appendAudit(`子任务 +1`, 'info');
  };

  const toggleSubtask = (id: string) => {
    setSubtaskList((prev) => prev.map((s) => s.id === id ? { ...s, done: !s.done } : s));
  };

  const addDependency = () => {
    if (!depDraft.trim()) return;
    const blockedBy = [...((task as any).blockedBy ?? []), depDraft.trim()];
    if (onUpdate) onUpdate({ blockedBy, updatedAt: new Date().toISOString() });
    setDepDraft('');
    setDepModal(false);
    appendAudit(`依赖 +1: ${depDraft}`, 'warn');
  };

  const togglePause = () => {
    const newStatus = task.status === 'paused' ? 'in_progress' : 'paused';
    if (onUpdate) onUpdate({ status: newStatus, updatedAt: new Date().toISOString() });
    appendAudit(newStatus === 'paused' ? '暂停任务' : '恢复任务', newStatus === 'paused' ? 'warn' : 'success');
  };
  const tabs = [
    { k: 'detail', label: '详情', icon: FileText },
    { k: 'steps', label: '步骤', icon: ListChecks },
    { k: 'cmdb', label: 'CMDB', icon: Database },
    { k: 'sign', label: '双签', icon: ShieldCheck, badge: task.signers?.filter((s: any) => !s.signed).length },
    { k: 'audit', label: '审计', icon: Activity },
    { k: 'comments', label: '评论', icon: MessageSquare, badge: task.comments || 0 },
  ];
  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone={PRIORITY_TONE[task.priority as Priority]} className="text-[10px]">{task.priority}</Badge>
          <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{task.code}</span>
        </div>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="关闭详情">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold leading-snug">{task.title}</h3>
        {task.description && <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">{task.description}</p>}
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <Avatar name={task.assignee} size={16} />{task.assignee}
          <span>·</span><Bot className="h-3 w-3 text-[var(--brand)]" /><span className="text-[var(--brand)]">{task.agentId}</span>
          {task.relatedTaskCode && <><span>·</span><GitBranch className="h-3 w-3" /><span className="font-mono">{task.relatedTaskCode}</span></>}
        </div>
      </div>

      <div className="border-b border-[var(--border)] flex overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={cn(
              'relative flex items-center gap-1 px-3 py-2 text-[10px] whitespace-nowrap',
              tab === t.k ? 'text-[var(--brand)] font-semibold border-b-2 border-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            <t.icon className="h-3 w-3" />{t.label}
            {t.badge ? <span className="ml-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[var(--danger)] text-white text-[8px] px-0.5">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === 'detail' && (
          <>
            <div className={cn('rounded-md border p-3', band === 'overdue' ? 'border-[var(--danger)]/40 bg-[var(--danger-bg)]' : band === 'critical' ? 'border-[var(--danger)]/40 bg-[var(--danger-bg)]' : band === 'warning' ? 'border-[var(--warning)]/40 bg-[var(--warning-bg)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]')}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />SLA 倒计时</span>
                <Badge tone={band === 'overdue' ? 'error' : band === 'critical' ? 'error' : band === 'warning' ? 'warn' : 'success'} className="text-[9px]">
                  {band === 'overdue' ? '超时' : band === 'critical' ? '临近' : band === 'warning' ? '警告' : '正常'}
                </Badge>
              </div>
              <div className={cn('font-mono text-2xl font-bold tracking-tight', band === 'overdue' || band === 'critical' ? 'text-[var(--danger)] animate-pulse' : band === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--text)]')}>
                {countdownText}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">最后更新 {formatRelative(task.updatedAt)}</div>
            </div>
            <Section label="标签" icon={TagIcon}>
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag: string) => <span key={tag} className="rounded-md bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-mono">#{tag}</span>)}
              </div>
            </Section>
            {task.blockedBy?.length > 0 && (
              <Section label="依赖任务" icon={Link2}>
                <div className="space-y-1">
                  {task.blockedBy.map((id: string) => <div key={id} className="flex items-center gap-1.5 text-[11px] font-mono"><AlertTriangle className="h-3 w-3 text-[var(--warning)]" />{id}</div>)}
                </div>
              </Section>
            )}
            <Section label="快速操作" icon={Activity}>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => setTab('comments')}><MessageSquare className="h-3 w-3" />评论</Button>
                <Button size="sm" variant="secondary" onClick={() => setAttachmentModal(true)}><Paperclip className="h-3 w-3" />附件</Button>
                <Button size="sm" variant="secondary" onClick={() => setSubtaskModal(true)}><ListChecks className="h-3 w-3" />子任务</Button>
                <Button size="sm" variant="secondary" onClick={() => setDepModal(true)}><Link2 className="h-3 w-3" />依赖</Button>
              </div>
            </Section>
          </>
        )}

        {tab === 'steps' && (
          <Section label="执行步骤" icon={ListChecks}>
            <div className="grid grid-cols-6 gap-1">
              {EXEC_STEPS.map((s, i) => {
                const done = i < task.progress.done;
                const cur = i === task.progress.done;
                return (
                  <div key={s} className={cn('rounded-md border px-1 py-1.5 text-center text-[9px] cursor-pointer transition-all', done ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]' : cur ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)] animate-pulse' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]')}>
                    {done ? <CheckCircle2 className="h-2.5 w-2.5 mx-auto mb-0.5" /> : <div className="text-[9px] font-mono">{i + 1}</div>}
                    {s}
                  </div>
                );
              })}
            </div>
            <Progress value={Math.round((task.progress.done / task.progress.total) * 100)} tone="primary" className="mt-3" />
          </Section>
        )}

        {tab === 'cmdb' && (
          <Section label="CMDB 关联资产" icon={Database}>
            <div className="space-y-1.5">
              {CMDB_ASSETS.map((a) => (
                <button key={a.code} onClick={() => onCMDB(cmdbAsset?.code === a.code ? null : a)} className="flex w-full items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-left text-xs hover:border-[var(--brand)] transition-colors">
                  <div>
                    <div className="font-mono font-semibold text-[var(--brand)]">{a.code}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{a.name} · {a.region}</div>
                  </div>
                  <Badge tone="error">{a.env}</Badge>
                </button>
              ))}
            </div>
            {cmdbAsset && (
              <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-[var(--brand)]">{cmdbAsset.code}</span>
                  <button onClick={() => onCMDB(null)} aria-label="关闭"><X className="h-3 w-3 text-[var(--text-muted)]" /></button>
                </div>
                <Row label="名称" value={cmdbAsset.name} />
                <Row label="类型" value={cmdbAsset.type} />
                <Row label="版本" value={cmdbAsset.version} />
                <Row label="责任人" value={cmdbAsset.owner} />
                <Row label="区域" value={cmdbAsset.region} />
                <Row label="环境" value={<Badge tone="error">{cmdbAsset.env}</Badge>} />
              </div>
            )}
          </Section>
        )}

        {tab === 'sign' && (
          <Section label="双签审批（等保 3）" icon={ShieldCheck}>
            {task.signers && task.signers.length > 0 ? (
              <>
                <div className="space-y-1.5">
                  {task.signers.map((s: any, i: number) => (
                    <div key={i} className={cn('flex items-center gap-2 rounded-md border p-2 text-[11px]', s.signed ? (s.role === 'auditor' ? 'border-[var(--info)]/40 bg-[var(--info-bg)]/30' : 'border-[var(--success)]/40 bg-[var(--success-bg)]/30') : 'border-[var(--border)] bg-[var(--bg-elevated)]')}>
                      <span className={cn('grid h-6 w-6 place-items-center rounded-full', s.signed ? (s.role === 'auditor' ? 'bg-[var(--info)]' : 'bg-[var(--success)]') : 'bg-[var(--bg-hover)] text-[var(--text-muted)]')}>
                        {s.signed ? <CheckCircle2 className="h-3 w-3 text-white" /> : <Clock className="h-3 w-3" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                          <Badge tone={s.role === 'auditor' ? 'info' : 'neutral'} className="text-[8px]">{s.role}</Badge>
                          {s.signedAt && <span className="font-mono">{s.signedAt.slice(11, 19)}</span>}
                        </div>
                      </div>
                      {s.signatureHash && <span className="text-[9px] font-mono text-[var(--text-muted)]" title="签名 hash">#{s.signatureHash.slice(-6)}</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-1.5">
                  {task.signers.some((s: any) => !s.signed) ? (
                    <>
                      <Button size="sm" variant="danger" className="flex-1" onClick={onOpenSign}>
                        <ShieldCheck className="h-3 w-3" />批准
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => onReject(task.signers.findIndex((s: any) => !s.signed))}>
                        拒绝
                      </Button>
                    </>
                  ) : (
                    <Badge tone="success" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />已通过双签</Badge>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center text-xs text-[var(--text-muted)] py-6">
                <ShieldCheck className="h-6 w-6 mx-auto mb-1 opacity-30" />
                此任务无需双签
              </div>
            )}
          </Section>
        )}

        {tab === 'audit' && (
          <Section label="审计流水（SignedLog）" icon={Activity}>
            <div className="activity-timeline">
              {(task.auditLog ?? []).map((a: any, i: number) => (
                <div key={i} className="activity-timeline__item">
                  <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.tone}`)}>
                    {a.tone === 'success' ? <CheckCircle2 className="h-3 w-3" /> : a.tone === 'warn' ? <AlertTriangle className="h-3 w-3" /> : a.tone === 'error' ? <X className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                  </div>
                  <div className="activity-timeline__content">
                    <div className="activity-timeline__text"><span className="font-mono text-[10px] text-[var(--brand)] mr-1">{a.actor}</span>{a.action}</div>
                    <div className="activity-timeline__time">{new Date(a.ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {tab === 'comments' && (
          <Section label="评论" icon={MessageSquare}>
            {commentList.length === 0 ? (
              <EmptyState icon={MessageSquare} title="还没有评论" description="在下方输入并提交，第一条评论将由你发起" />
            ) : (
              <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
                {commentList.map((c) => (
                  <div key={c.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{c.author}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">{c.ts.slice(11, 19)}</span>
                    </div>
                    <div className="mt-0.5 text-[var(--text-secondary)] whitespace-pre-wrap">{c.text}</div>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment(); }}
              className="w-full h-20 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
              placeholder="添加评论... (⌘+Enter 提交)"
            />
            <Button size="sm" className="mt-2 w-full" onClick={submitComment} disabled={!commentDraft.trim()}>
              发表评论
            </Button>
          </Section>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={togglePause}
        >
          {task.status === 'paused' ? <><Play className="h-3.5 w-3.5" />恢复</> : <><Pause className="h-3.5 w-3.5" />暂停</>}
        </Button>
        <Button size="sm" onClick={onOpenSign} className="flex-1" disabled={!task.signers?.length}>
          <ShieldCheck className="h-3.5 w-3.5" />批准（双签）
        </Button>
      </div>

      {/* ===== 详情交互 Modal ===== */}
      <ModalX open={attachmentModal} onClose={() => setAttachmentModal(false)} title="添加附件" size="sm" footer={
        <>
          <Button variant="ghost" onClick={() => setAttachmentModal(false)}>取消</Button>
          <Button disabled={!attachmentDraft.name.trim()} onClick={addAttachment}>添加</Button>
        </>
      }>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">文件名 <span className="text-[var(--danger)]">*</span></label>
            <Input value={attachmentDraft.name} onChange={(e) => setAttachmentDraft((s) => ({ ...s, name: e.target.value }))} placeholder="例如：oom-trace-20260716.log" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">大小</label>
              <Input value={attachmentDraft.size} onChange={(e) => setAttachmentDraft((s) => ({ ...s, size: e.target.value }))} placeholder="128 KB" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">类型</label>
              <select value={attachmentDraft.type} onChange={(e) => setAttachmentDraft((s) => ({ ...s, type: e.target.value as any }))} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
                <option value="doc">文档</option><option value="log">日志</option><option value="image">截图</option><option value="config">配置</option>
              </select>
            </div>
          </div>
          {attachmentList.length > 0 && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
              <div className="text-[10px] text-[var(--text-muted)] mb-1">已添加 {attachmentList.length} 个附件</div>
              {attachmentList.slice(0, 3).map((a) => <div key={a.id} className="font-mono">· {a.name} ({a.size})</div>)}
            </div>
          )}
        </div>
      </ModalX>

      <ModalX open={subtaskModal} onClose={() => setSubtaskModal(false)} title="子任务管理" size="md" footer={
        <Button onClick={() => setSubtaskModal(false)}>关闭</Button>
      }>
        <div className="space-y-2 mb-3">
          {subtaskList.length === 0 ? (
            <EmptyState icon={ListChecks} title="还没有子任务" />
          ) : (
            subtaskList.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs">
                <input type="checkbox" checked={s.done} onChange={() => toggleSubtask(s.id)} className="accent-[var(--brand)]" />
                <span className={cn('flex-1', s.done && 'line-through text-[var(--text-muted)]')}>{s.title}</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{s.done ? '已完成' : '待办'}</span>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3">
          <Input
            value={subtaskDraft}
            onChange={(e) => setSubtaskDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
            placeholder="添加子任务..."
            className="flex-1 text-xs"
          />
          <Button size="sm" onClick={addSubtask} disabled={!subtaskDraft.trim()}>添加</Button>
        </div>
      </ModalX>

      <ModalX open={depModal} onClose={() => setDepModal(false)} title={`依赖关系 · ${((task as any).blockedBy ?? []).length} 个依赖`} size="sm" footer={
        <>
          <Button variant="ghost" onClick={() => setDepModal(false)}>关闭</Button>
        </>
      }>
        <div className="space-y-3">
          {((task as any).blockedBy ?? []).length === 0 ? (
            <EmptyState icon={Link2} title="无依赖" />
          ) : (
            <div className="space-y-1.5">
              {((task as any).blockedBy as string[]).map((d) => (
                <div key={d} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px] flex items-center gap-2">
                  <Link2 className="h-3 w-3 text-[var(--warning)]" />
                  <span className="font-mono">{d}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3">
            <Input
              value={depDraft}
              onChange={(e) => setDepDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDependency()}
              placeholder="任务 ID / TSK-20260713-001"
              className="flex-1 text-xs"
            />
            <Button size="sm" onClick={addDependency} disabled={!depDraft.trim()}>添加依赖</Button>
          </div>
        </div>
      </ModalX>
    </>
  );
}
