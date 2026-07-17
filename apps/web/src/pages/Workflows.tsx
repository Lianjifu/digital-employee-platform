/**
 * P6 工作流（企业级优化版）
 *
 * 页面结构（自上而下）：
 *   1. 顶部 KPI 概览（5 张卡）
 *   2. 主内容区
 *      · 左侧画布（DAG + Webhook 触发器 + 流程时序）
 *      · 右侧节点库 / 调试 / 属性三栏切换
 *   3. 底部三 Tab（画布 / 模板市场 / 执行历史）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Badge, Button } from '@de/web-ui';
import {
  Play, Save, Download, Zap, ShieldCheck, Cpu, GitBranch, Bell, FileText,
  Wrench, Database, PlayCircle, ChevronRight, Activity, CheckCircle2, Clock,
  AlertTriangle, Plus, Sparkles, Settings, Pause, RotateCcw,
  Eye, Bug, Webhook, Layers, Search, History, X, Trash2,
  Edit3, Copy, Box, ArrowRight, GripVertical, RefreshCw,
  Undo2, Redo2, FileJson, MessageSquare, StepForward, StepBack, SkipForward, SkipBack, History as HistoryIcon,
} from 'lucide-react';
import type { Workflow, WorkflowNodeKind } from '@de/web-types';
import { cn } from '@de/web-utils';
import { Drawer, ConfirmDialog } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';

type SidePanelKey = 'library' | 'debug' | 'properties';
type TabKey = 'canvas' | 'templates' | 'history';

/* ============ 节点元数据 ============ */
const NODE_ICONS: Record<WorkflowNodeKind, any> = {
  trigger: PlayCircle, retrieve: Database, decision: Cpu, approval: ShieldCheck,
  branch: GitBranch, execute: Wrench, audit: FileText, notify: Bell,
};
const NODE_LABELS: Record<WorkflowNodeKind, string> = {
  trigger: '触发器', retrieve: '知识检索', decision: 'Agent 决策', approval: '双签审批',
  branch: '条件分支', execute: '执行恢复', audit: '审计日志', notify: '通知收尾',
};
const NODE_COLORS: Record<WorkflowNodeKind, string> = {
  trigger: '#3b82f6', retrieve: '#10b981', decision: '#a78bfa', approval: '#f59e0b',
  branch: '#06b6d4', execute: '#ef4444', audit: '#64748b', notify: '#38bdf8',
};
const NODE_DESCS: Record<WorkflowNodeKind, string> = {
  trigger: '事件 / 定时 / Webhook',
  retrieve: 'RAG 检索（Milvus）',
  decision: 'LangGraph 决策',
  approval: '双人复核（等保 3）',
  branch: '条件 / 并行 / 合并',
  execute: 'Skill / MCP / Tool',
  audit: 'SignedLog 写入',
  notify: '飞书 / 企微 / SMS',
};
const NODE_LIB: WorkflowNodeKind[] = [
  'trigger', 'retrieve', 'decision', 'approval',
  'branch', 'execute', 'audit', 'notify',
];

/* ============ 初始工作流数据（mock） ============ */
const INITIAL_NODES: Node[] = [
  { id: 'n1', type: 'custom', position: { x: 60, y: 80 }, data: { kind: 'trigger', label: 'Webhook 触发' } },
  { id: 'n2', type: 'custom', position: { x: 280, y: 80 }, data: { kind: 'retrieve', label: 'Milvus 检索' } },
  { id: 'n3', type: 'custom', position: { x: 500, y: 80 }, data: { kind: 'decision', label: 'Agent 决策' } },
  { id: 'n4', type: 'custom', position: { x: 720, y: 80 }, data: { kind: 'approval', label: '等保 3 双签' } },
  { id: 'n5', type: 'custom', position: { x: 940, y: 40 }, data: { kind: 'branch', label: '分支：成功路径' } },
  { id: 'n6', type: 'custom', position: { x: 940, y: 160 }, data: { kind: 'branch', label: '分支：回滚路径' } },
  { id: 'n7', type: 'custom', position: { x: 1180, y: 40 }, data: { kind: 'execute', label: 'Skill 执行恢复' } },
  { id: 'n8', type: 'custom', position: { x: 1180, y: 160 }, data: { kind: 'execute', label: '回滚 + 告警' } },
  { id: 'n9', type: 'custom', position: { x: 1420, y: 100 }, data: { kind: 'audit', label: 'SignedLog 写入' } },
  { id: 'n10', type: 'custom', position: { x: 1660, y: 100 }, data: { kind: 'notify', label: '飞书 / 企微通知' } },
];
const INITIAL_EDGES: Edge[] = [
  { id: 'e1-2', source: 'n1', target: 'n2' },
  { id: 'e2-3', source: 'n2', target: 'n3' },
  { id: 'e3-4', source: 'n3', target: 'n4' },
  { id: 'e4-5', source: 'n4', target: 'n5' },
  { id: 'e4-6', source: 'n4', target: 'n6' },
  { id: 'e5-7', source: 'n5', target: 'n7' },
  { id: 'e6-8', source: 'n6', target: 'n8' },
  { id: 'e7-9', source: 'n7', target: 'n9' },
  { id: 'e8-9', source: 'n8', target: 'n9' },
  { id: 'e9-10', source: 'n9', target: 'n10' },
];

const EXECUTING_NODE_ID = 'n4';

const NODE_DEBUG: Record<string, { input: string; output: string; log: string[] }> = {
  n1: {
    input: '{ "event": "redis.oom.alert", "cluster": "prod", "node": "redis-01" }',
    output: '{ "status": "captured", "traceId": "tr-7a3f2c91" }',
    log: ['[14:27:55] Webhook 到达 · POST /webhook/redis-oom', '[14:27:55] 签名校验通过 (HMAC-SHA256)', '[14:27:56] 推入事件总线（traceId=tr-7a3f2c91）'],
  },
  n2: {
    input: '{ "query": "redis maxmemory-policy", "topK": 8 }',
    output: '{ "hits": [ { "score": 0.91, "doc": "sop/redis-tuning.md" }, { "score": 0.84, "doc": "runbook/oom.md" } ] }',
    log: ['[14:27:57] Milvus 检索（topK=8）', '[14:27:58] 命中 2 篇：sop/redis-tuning.md · runbook/oom.md'],
  },
  n3: {
    input: '{ "context": [...], "tools": ["skill_redis_tune", "mcp_k8s"] }',
    output: '{ "decision": "WRITE", "action": "CONFIG SET", "confidence": 0.92 }',
    log: ['[14:28:00] LangGraph 编排：进入决策节点', '[14:28:01] 工具调用：skill_redis_tune.predict()', '[14:28:01] 决策：WRITE（置信度 0.92）'],
  },
  n4: {
    input: '{ "action": "CONFIG SET", "target": "prod-redis-01", "params": { "maxmemory": "16GB", "policy": "volatile-lru" } }',
    output: '{ "status": "pending_approval", "approvers_required": 2, "deadline": "2026-07-13T15:30:00Z" }',
    log: [
      '[14:28:01] 决策节点推送写操作请求',
      '[14:28:02] 检查等保 3 双签策略 → 需要 2 人签发',
      '[14:28:03] 通知 王昊（Admin） + 李婷（SRE）',
      '[14:28:35] 王昊 已签发（第一签）',
      '[14:29:12] 等待 李婷 签发...',
    ],
  },
  n5: {
    input: '{ "branch": "success", "nextNode": "n7" }',
    output: '{ "branch_result": "success" }',
    log: ['[14:30:02] 分支判定：通过（等保 3 双签完成）'],
  },
  n6: {
    input: '{ "branch": "rollback", "nextNode": "n8" }',
    output: '{ "branch_result": "rollback" }',
    log: ['[14:30:02] 分支判定：回滚路径'],
  },
  n7: {
    input: '{ "tool": "skill_redis_tune", "params": { "maxmemory": "16GB", "policy": "volatile-lru" } }',
    output: '{ "ok": true, "appliedAt": "2026-07-13T14:30:18Z" }',
    log: ['[14:30:15] 调用 skill: skill_redis_tune', '[14:30:18] CONFIG SET 应用成功'],
  },
  n8: {
    input: '{ "tool": "mcp_k8s.rollback", "deployment": "redis-01" }',
    output: '{ "ok": true, "revisions": 1 }',
    log: ['[14:30:15] 触发回滚：mcp_k8s.rollback', '[14:30:18] 回滚完成（revisions=1）', '[14:30:19] 触发告警：P2 故障'],
  },
  n9: {
    input: '{ "traceId": "tr-7a3f2c91", "decision": "WRITE", "appliedBy": "redis-recovery-agent" }',
    output: '{ "signed": true, "hash": "0x8f2c…a917" }',
    log: ['[14:30:20] SignedLog 写入（SHA-256 哈希链）'],
  },
  n10: {
    input: '{ "channels": ["feishu", "wecom"], "template": "redis-oom-resolved" }',
    output: '{ "delivered": 2, "failed": 0 }',
    log: ['[14:30:21] 飞书通知已送达（oncall@）', '[14:30:21] 企微通知已送达（ops@）'],
  },
};

/* ============ 自定义节点 ============ */
function CustomNode({ data, selected }: { data: any; selected?: boolean }) {
  const Icon = NODE_ICONS[data.kind as WorkflowNodeKind];
  const color = NODE_COLORS[data.kind as WorkflowNodeKind];
  const isExecuting = data.id === EXECUTING_NODE_ID;
  return (
    <div
      className={cn(
        'relative rounded-md border-2 bg-[var(--surface-1)] px-3 py-2 min-w-[140px] text-center shadow-sm transition-all',
        selected && 'ring-2 ring-[var(--brand)]',
        data.disabled && 'opacity-50 grayscale',
        isExecuting && 'animate-pulse',
      )}
      style={{ borderColor: color, boxShadow: isExecuting ? `0 0 0 4px ${color}33` : undefined }}
      title={data.note || undefined}
    >
      {/* 输入 handle（左侧） */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-[var(--bg)]"
        style={{ background: color, left: -7 }}
      />
      {/* 输出 handle（右侧） */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-[var(--bg)]"
        style={{ background: color, right: -7 }}
      />
      <Icon className="h-3.5 w-3.5 mx-auto" style={{ color }} />
      <div className="text-[10px] uppercase tracking-wide opacity-70 mt-0.5">{data.kind}</div>
      <div className="text-xs font-semibold text-[var(--text)]">{data.label || NODE_LABELS[data.kind as WorkflowNodeKind]}</div>
      {data.note && (
        <div className="mt-1 flex items-center justify-center gap-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/50 px-1 py-0.5">
          <MessageSquare className="h-2.5 w-2.5 text-amber-600 shrink-0" />
          <span className="text-[8px] text-amber-700 dark:text-amber-300 truncate max-w-[110px]">{data.note}</span>
        </div>
      )}
      {isExecuting && (
        <span className="absolute -top-1.5 -right-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--brand)] text-[8px] font-bold text-white">●</span>
      )}
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

/* ============ Mock 模板 ============ */
const TEMPLATES = [
  { id: 't1', name: '故障自愈', category: 'system', description: 'Redis/K8s 故障自动定位→双签→Skill 执行→回滚→审计→通知', nodes: 10, installs: 1284, rating: 4.9 },
  { id: 't2', name: '灰度发布', category: 'system', description: '金丝雀 5%→25%→100%，异常自动回滚 + 双签保护', nodes: 8, installs: 962, rating: 4.8 },
  { id: 't3', name: 'CVE 漏洞修复', category: 'security', description: 'CVE 情报 → 影响面评估 → 离线补丁 → 灰度 → 验证 → 通知', nodes: 12, installs: 743, rating: 4.7 },
  { id: 't4', name: '容量预测', category: 'ai', description: '历史指标 → Prophet/LSTM 预测 → 触发扩容建议 → 自动下单', nodes: 7, installs: 612, rating: 4.6 },
  { id: 't5', name: '报告生成', category: 'business', description: '数据采集 → LLM 总结 → Markdown 报告 → 飞书/邮件分发', nodes: 6, installs: 1502, rating: 4.9 },
  { id: 't6', name: '工单分诊', category: 'business', description: '用户工单 → Agent 分类 → SLA 派发 → 升级 → 关闭', nodes: 9, installs: 884, rating: 4.7 },
];

const TEMPLATE_SEQUENCES: Record<string, WorkflowNodeKind[]> = {
  t1: ['trigger', 'retrieve', 'decision', 'approval', 'branch', 'execute', 'audit', 'notify', 'execute', 'audit'],
  t2: ['trigger', 'retrieve', 'branch', 'execute', 'execute', 'audit', 'notify', 'notify'],
  t3: ['trigger', 'retrieve', 'decision', 'execute', 'approval', 'execute', 'execute', 'audit', 'notify', 'audit', 'notify', 'execute'],
  t4: ['trigger', 'retrieve', 'decision', 'branch', 'execute', 'audit', 'notify'],
  t5: ['trigger', 'retrieve', 'decision', 'execute', 'audit', 'notify'],
  t6: ['trigger', 'retrieve', 'decision', 'branch', 'execute', 'execute', 'audit', 'notify', 'execute'],
};

/* ============ Mock 历史 ============ */
const RUNS = [
  { id: 'r1', time: '14:30:21', trigger: 'Redis OOM 告警', status: 'success', duration: 42, who: 'redis-recovery-agent', steps: 10, error: '' },
  { id: 'r2', time: '13:18:09', trigger: 'K8s 灰度发布', status: 'success', duration: 156, who: 'gray-release-agent', steps: 8, error: '' },
  { id: 'r3', time: '12:45:33', trigger: 'CVE-2025-31324', status: 'failed', duration: 88, who: 'cve-repair-agent', steps: 4, error: '等保 3 双签超时（300s）' },
  { id: 'r4', time: '11:02:48', trigger: '容量预测日报', status: 'success', duration: 24, who: 'capacity-agent', steps: 7, error: '' },
  { id: 'r5', time: '09:30:11', trigger: '周报告生成', status: 'success', duration: 38, who: 'report-agent', steps: 6, error: '' },
];

/* ============ 版本快照（mock 历史版本） ============ */
const VERSIONS = [
  { id: 'v4', label: 'v4 · 当前', time: '刚刚', desc: '新增分支：回滚路径', active: true },
  { id: 'v3', label: 'v3', time: '15 分钟前', desc: '调整审计节点位置' },
  { id: 'v2', label: 'v2', time: '1 小时前', desc: '加入 Webhook 触发器' },
  { id: 'v1', label: 'v1', time: '昨天 18:42', desc: '初始版本 · 故障自愈' },
];

/* ============ KPI ============ */
const KPI = {
  running: 3,
  totalToday: 47,
  successRate: 97.8,
  avgDuration: '42s',
  mttrImprovement: -65,
};

type Snapshot = { nodes: Node[]; edges: Edge[] };
type VersionSnapshot = Snapshot & { id: string; label: string; time: string; desc: string };

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
  };
}

function templateSnapshot(template: typeof TEMPLATES[number]): Snapshot {
  const sequence = TEMPLATE_SEQUENCES[template.id] ?? ['trigger'];
  const nodes = sequence.map((kind, index) => ({
    id: `n${index + 1}`,
    type: 'custom',
    position: { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 140 },
    data: { kind, label: NODE_LABELS[kind] },
  } as Node));
  return {
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `e${index + 1}-${index + 2}`, source: nodes[index].id, target: node.id })),
  };
}

/* ============ 顶层组件 ============ */
export default function Workflows() {
  const canWrite = useAuthStore((state) => state.hasPermission('workflow.write'));
  const canExecute = useAuthStore((state) => state.hasPermission('workflow.execute'));
  const [tab, setTab] = useState<TabKey>('canvas');
  const [sidePanel, setSidePanel] = useState<SidePanelKey>('library');
  const [librarySearchQ, setLibrarySearchQ] = useState('');
  const [canvasSearchQ, setCanvasSearchQ] = useState('');

  // 节点数据（可增删）
  const [nodes, setNodes] = useState<Node[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<Edge[]>(INITIAL_EDGES);

  // 选中 / 右键菜单
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('n4');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [deleteConfirmNodeId, setDeleteConfirmNodeId] = useState<string | null>(null);

  // 模板筛选
  const [filterGroup, setFilterGroup] = useState<'all' | 'business' | 'system' | 'security' | 'ai'>('all');

  // 顶部操作按钮组
  const [webhookEnabled, setWebhookEnabled] = useState(true);

  // 版本选择
  const [activeVersion, setActiveVersion] = useState('v4');
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [versions, setVersions] = useState<VersionSnapshot[]>(() => VERSIONS.map((version) => ({
    ...version,
    nodes: cloneSnapshot({ nodes: INITIAL_NODES, edges: INITIAL_EDGES }).nodes,
    edges: cloneSnapshot({ nodes: INITIAL_NODES, edges: INITIAL_EDGES }).edges,
  })));

  // 模板预览
  const [previewTemplate, setPreviewTemplate] = useState<typeof TEMPLATES[number] | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((msg: string, tone: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2200);
  }, []);

  // 拖拽
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [draggedKind, setDraggedKind] = useState<WorkflowNodeKind | null>(null);

  // 撤销/重做栈
  const historyRef = useRef<{ stack: Snapshot[]; idx: number }>({ stack: [{ nodes: INITIAL_NODES, edges: INITIAL_EDGES }], idx: 0 });
  const pushHistory = useCallback((next: Snapshot) => {
    const h = historyRef.current;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(cloneSnapshot(next));
    if (h.stack.length > 50) h.stack.shift();
    h.idx = h.stack.length - 1;
  }, []);
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx <= 0) { showToast('已是最早版本，无法撤销', 'info'); return; }
    h.idx -= 1;
    const snap = h.stack[h.idx];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    showToast('已撤销', 'info');
  }, [showToast]);
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx >= h.stack.length - 1) { showToast('已是最新版本，无法重做', 'info'); return; }
    h.idx += 1;
    const snap = h.stack[h.idx];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    showToast('已重做', 'info');
  }, [showToast]);

  // 命令式 ReactFlow 控制
  const reactFlowRef = useRef<any>(null);
  const focusNode = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node || !reactFlowRef.current) return;
    const { x, y } = node.position;
    reactFlowRef.current.setCenter?.(x + 70, y + 30, { zoom: 1.3, duration: 500 });
    setSelectedNodeId(id);
    setSidePanel('debug');
    showToast(`已定位到节点 ${id}`, 'info');
  }, [nodes, showToast]);

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      // Esc 关闭弹层
      if (e.key === 'Escape') {
        if (contextMenu) { setContextMenu(null); return; }
        if (versionMenuOpen) { setVersionMenuOpen(false); return; }
        if (previewTemplate) { setPreviewTemplate(null); return; }
      }
      if (isInput) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') { e.preventDefault(); saveCanvasRef.current?.(); return; }
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        deleteNodeRef.current?.(selectedNodeId);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNodeId, contextMenu, versionMenuOpen, previewTemplate, undo, redo]);

  const filteredTemplates = TEMPLATES.filter((t) => filterGroup === 'all' || t.category === filterGroup);
  const filteredLibrary = NODE_LIB.filter((k) =>
    !librarySearchQ || NODE_LABELS[k].includes(librarySearchQ) || NODE_DESCS[k].toLowerCase().includes(librarySearchQ.toLowerCase()),
  );

  // 当前选中节点
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  // ReactFlow 节点（增加 selected 标记 + 当前执行高亮动画）
  const rfNodes = useMemo<Node[]>(
    () => nodes.map((n) => ({
      ...n,
      selected: n.id === selectedNodeId,
      data: { ...n.data, id: n.id },
    })),
    [nodes, selectedNodeId],
  );
  const rfEdges = useMemo<Edge[]>(
    () => edges.map((e) => ({
      ...e,
      type: 'smoothstep',
      animated: e.target === EXECUTING_NODE_ID,
      markerEnd: { type: MarkerType.ArrowClosed, color: e.target === EXECUTING_NODE_ID ? '#3b82f6' : '#94a3b8' },
      style: { stroke: e.target === EXECUTING_NODE_ID ? '#3b82f6' : '#94a3b8', strokeWidth: e.target === EXECUTING_NODE_ID ? 2 : 1.2 },
    })),
    [edges],
  );

  const nodeDragSnapshotRef = useRef<Snapshot | null>(null);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      const next = applyNodeChanges(changes, prev);
      const positionChanges = changes.filter((change) => change.type === 'position');
      if (positionChanges.length) {
        if (positionChanges.some((change) => change.type === 'position' && change.dragging) && !nodeDragSnapshotRef.current) {
          nodeDragSnapshotRef.current = cloneSnapshot({ nodes: prev, edges });
        }
        if (positionChanges.some((change) => change.type === 'position' && !change.dragging)) {
          pushHistory({ nodes: next, edges });
          nodeDragSnapshotRef.current = null;
        }
      }
      return next;
    });
  }, [edges, pushHistory]);

  /* —— 节点操作 —— */
  const addNode = useCallback((kind: WorkflowNodeKind, position?: { x: number; y: number }) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    const id = `n${Date.now().toString(36)}`;
    const pos = position ?? { x: 200 + Math.random() * 200, y: 240 + Math.random() * 120 };
    const newNode: Node = { id, type: 'custom', position: pos, data: { kind, label: NODE_LABELS[kind] } };
    setNodes((prev) => {
      const next = [...prev, newNode];
      pushHistory({ nodes: next, edges });
      return next;
    });
    setSelectedNodeId(id);
    setSidePanel('properties');
    showToast(`已添加节点 ${NODE_LABELS[kind]}（${id}）`, 'success');
  }, [edges, pushHistory, showToast]);

  const deleteNode = useCallback((id: string) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    setNodes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      setEdges((prevE) => {
        const nextE = prevE.filter((e) => e.source !== id && e.target !== id);
        pushHistory({ nodes: next, edges: nextE });
        return nextE;
      });
      return next;
    });
    if (selectedNodeId === id) setSelectedNodeId(null);
    showToast(`节点 ${id} 已删除`, 'info');
  }, [selectedNodeId, showToast, pushHistory]);

  const duplicateNode = useCallback((id: string) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    const src = nodes.find((n) => n.id === id);
    if (!src) return;
    const newId = `n${Date.now().toString(36)}`;
    const cloned: Node = {
      ...src,
      id: newId,
      position: { x: src.position.x + 40, y: src.position.y + 40 },
      data: { ...src.data, label: (src.data?.label ?? NODE_LABELS[src.data.kind as WorkflowNodeKind]) + ' (副本)' },
    };
    setNodes((prev) => {
      const next = [...prev, cloned];
      pushHistory({ nodes: next, edges });
      return next;
    });
    setSelectedNodeId(newId);
    showToast(`节点 ${id} 已复制为 ${newId}`, 'success');
  }, [nodes, edges, pushHistory, showToast]);

  const updateNodeLabel = useCallback((id: string, label: string) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n));
      pushHistory({ nodes: next, edges });
      return next;
    });
  }, [canWrite, edges, pushHistory, showToast]);

  const updateNodeDescription = useCallback((id: string, desc: string) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, desc } } : n));
      pushHistory({ nodes: next, edges });
      return next;
    });
  }, [canWrite, edges, pushHistory, showToast]);

  const updateNodeNote = useCallback((id: string, note: string) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, note } } : n));
      pushHistory({ nodes: next, edges });
      return next;
    });
  }, [canWrite, edges, pushHistory, showToast]);

  const disableNode = useCallback((id: string) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    setNodes((prev) => {
      const wasDisabled = prev.find((n) => n.id === id)?.data?.disabled;
      const next = prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, disabled: !n.data?.disabled } } : n));
      pushHistory({ nodes: next, edges });
      showToast(`节点 ${id} ${wasDisabled ? '已启用' : '已禁用'}（运行时跳过）`, 'info');
      return next;
    });
  }, [edges, pushHistory, showToast]);

  const clearCanvas = useCallback(() => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    setClearConfirmOpen(true);
  }, [canWrite, showToast]);

  const confirmClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    pushHistory({ nodes: [], edges: [] });
    setSelectedNodeId(null);
    showToast('画布已清空（本地草稿）', 'info');
  }, [showToast, pushHistory]);

  const resetCanvas = useCallback(() => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    const snapshot = cloneSnapshot({ nodes: INITIAL_NODES, edges: INITIAL_EDGES });
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    pushHistory(snapshot);
    setSelectedNodeId('n4');
    showToast('画布已重置为初始状态（本地草稿）', 'success');
  }, [canWrite, showToast, pushHistory]);

  const saveCanvas = useCallback(() => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    const id = activeVersion;
    const version = versions.find((item) => item.id === id);
    setVersions((prev) => prev.map((item) => item.id === id ? {
      ...item,
      nodes: cloneSnapshot({ nodes, edges }).nodes,
      edges: cloneSnapshot({ nodes, edges }).edges,
      time: '刚刚',
      desc: '保存当前本地草稿',
    } : item));
    showToast(`已保存 ${version?.label ?? id}（本地演示草稿）`, 'success');
  }, [activeVersion, canWrite, edges, nodes, showToast, versions]);

  const loadSnapshot = useCallback((snapshot: Snapshot, versionId: string) => {
    const next = cloneSnapshot(snapshot);
    setNodes(next.nodes);
    setEdges(next.edges);
    setActiveVersion(versionId);
    setSelectedNodeId(next.nodes[0]?.id ?? null);
    pushHistory(next);
  }, [pushHistory]);

  const runWorkflow = useCallback(() => {
    if (!canExecute) { showToast('当前账号没有工作流执行权限', 'error'); return; }
    if (!nodes.length) { showToast('画布为空，无法运行工作流', 'error'); return; }
    showToast(`已触发工作流执行（本地演示），当前节点：双签审批（n4）`, 'success');
  }, [canExecute, nodes.length, showToast]);
  const exportWorkflow = useCallback(() => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        kind: n.data?.kind,
        label: n.data?.label,
        desc: n.data?.desc,
        note: n.data?.note,
        position: n.position,
        disabled: !!n.data?.disabled,
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${activeVersion}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`已导出工作流（${nodes.length} 节点 / ${edges.length} 连线）`, 'success');
  }, [nodes, edges, activeVersion, showToast]);

  // 把高频 handler 用 ref 暴露给键盘监听器
  const saveCanvasRef = useRef(saveCanvas); saveCanvasRef.current = saveCanvas;
  const deleteNodeRef = useRef(deleteNode); deleteNodeRef.current = deleteNode;

  // 节点连线
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) return;
    // 避免重复
    if (edges.some((e) => e.source === connection.source && e.target === connection.target)) {
      showToast('连线已存在', 'info');
      return;
    }
    const newEdge: Edge = {
      id: `e${connection.source}-${connection.target}-${Date.now().toString(36)}`,
      source: connection.source!,
      target: connection.target!,
    };
    setEdges((prev) => {
      const next = [...prev, newEdge];
      pushHistory({ nodes, edges: next });
      return next;
    });
    showToast(`已连线：${connection.source} → ${connection.target}`, 'success');
  }, [edges, nodes, pushHistory, showToast]);

  const deleteEdge = useCallback((id: string) => {
    setEdges((prev) => {
      const next = prev.filter((e) => e.id !== id);
      pushHistory({ nodes, edges: next });
      showToast(`连线 ${id} 已删除`, 'info');
      return next;
    });
  }, [nodes, pushHistory, showToast]);

  // 节点搜索（精确 id 或 label 包含）
  const searchMatch = useMemo(() => {
    if (!canvasSearchQ || tab !== 'canvas') return null;
    const q = canvasSearchQ.trim().toLowerCase();
    if (!q) return null;
    return nodes.find((n) =>
      n.id.toLowerCase() === q ||
      (n.data?.label ?? '').toLowerCase().includes(q) ||
      (n.data?.kind ?? '').toLowerCase().includes(q),
    );
  }, [canvasSearchQ, nodes, tab]);

  /* —— 节点交互 —— */
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setSidePanel('properties');
  }, []);

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    setSelectedNodeId(node.id);
  }, []);

  /* —— 拖拽到画布 —— */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/wf-node') as WorkflowNodeKind;
    if (!kind || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const screenPosition = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const position = reactFlowRef.current?.screenToFlowPosition
      ? reactFlowRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      : reactFlowRef.current?.project
        ? reactFlowRef.current.project(screenPosition)
        : { x: screenPosition.x - 80, y: screenPosition.y - 30 };
    addNode(kind, position);
    setDraggedKind(null);
  }, [addNode]);

  const filteredNodes = nodes; // 留作以后按筛选条件过滤

  return (
    <div className="workflow-page flex h-full min-w-0 flex-col overflow-hidden bg-[var(--bg-elevated)]">
      {/* ======== 顶部 KPI（5 张） ======== */}
      <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 md:grid md:grid-cols-3 md:gap-3 md:px-6 lg:grid-cols-5">
        <div className="min-w-[148px] md:min-w-0"><Stat icon={<Play className="h-4 w-4 text-[var(--brand)]" />} label="执行中" value={KPI.running} sub="个" tone="primary" /></div>
        <div className="min-w-[148px] md:min-w-0"><Stat icon={<Activity className="h-4 w-4" />} label="今日总数" value={KPI.totalToday} sub="次" /></div>
        <div className="min-w-[148px] md:min-w-0"><Stat icon={<CheckCircle2 className="h-4 w-4 text-[var(--success)]" />} label="成功率" value={KPI.successRate} sub="%" tone="success" /></div>
        <div className="min-w-[148px] md:min-w-0"><Stat icon={<Clock className="h-4 w-4" />} label="平均完成" value={KPI.avgDuration} /></div>
        <div className="min-w-[148px] md:min-w-0"><Stat icon={<Sparkles className="h-4 w-4 text-[var(--purple)]" />} label="MTTR 降低" value={`${KPI.mttrImprovement}%`} tone="purple" /></div>
      </div>

      {/* ======== Tab Bar（与 KPI 区分明确） ======== */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 md:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="shrink-0 text-sm font-semibold text-[var(--text)]">工作流</h2>
            <span className="truncate text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {tab === 'canvas' ? `DAG 画布 · ${nodes.length} 节点 / ${edges.length} 连线` : tab === 'templates' ? `模板市场 · ${TEMPLATES.length} 套` : `执行历史 · ${RUNS.length} 条`}
            </span>
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setVersionMenuOpen(!versionMenuOpen)}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] hover:border-[var(--brand)]"
            >
              <HistoryIcon className="h-3 w-3 text-[var(--text-muted)]" />
              <span className="font-mono font-semibold">{versions.find((v) => v.id === activeVersion)?.label ?? activeVersion}</span>
              <ChevronRight className="h-3 w-3 rotate-90 text-[var(--text-muted)]" />
            </button>
            {versionMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVersionMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 max-w-[calc(100vw-24px)] min-w-[260px] rounded-md border border-[var(--border)] bg-[var(--surface-1)] py-1 shadow-xl">
                  <div className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    版本历史 · 共 {versions.length} 版
                  </div>
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        if (v.id === activeVersion) { setVersionMenuOpen(false); return; }
                        loadSnapshot(v, v.id);
                        setVersionMenuOpen(false);
                        showToast(`已加载 ${v.label}（本地快照）`, 'info');
                      }}
                      className={cn(
                        'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)]',
                        v.id === activeVersion && 'bg-[var(--brand-light)]',
                      )}
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-[11px] font-semibold text-[var(--brand)]">{v.label}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-[var(--text-muted)]">{v.time}</div>
                        <div className="truncate text-[11px] text-[var(--text-secondary)]">{v.desc}</div>
                      </div>
                      {v.id === activeVersion && <Badge tone="success" className="shrink-0 text-[9px]">当前</Badge>}
                    </button>
                  ))}
                  <div className="flex gap-1 border-t border-[var(--border)] px-3 py-1.5">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                      if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
                      const current = versions.find((v) => v.id === activeVersion);
                      if (current) loadSnapshot(current, current.id);
                      setVersionMenuOpen(false);
                      showToast(`已回滚到 ${current?.label ?? activeVersion}（本地快照）`, 'info');
                    }} disabled={!canWrite}>
                      <RotateCcw className="h-3 w-3" />回滚当前
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => {
                      if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
                      const nextId = `v${versions.length + 1}`;
                      setVersions((prev) => [...prev.map((v) => ({ ...v })), {
                        id: nextId,
                        label: `${nextId} · 草稿`,
                        time: '刚刚',
                        desc: '从当前画布另存的本地快照',
                        nodes: cloneSnapshot({ nodes, edges }).nodes,
                        edges: cloneSnapshot({ nodes, edges }).edges,
                      }]);
                      setActiveVersion(nextId);
                      setVersionMenuOpen(false);
                      showToast(`已另存为 ${nextId}（本地快照）`, 'success');
                    }} disabled={!canWrite}>
                      <Save className="h-3 w-3" />另存
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-x-auto border-t border-[var(--border)] pt-2">
          {([
            { k: 'canvas' as TabKey, label: '画布', icon: GitBranch },
            { k: 'templates' as TabKey, label: '模板市场', icon: Layers },
            { k: 'history' as TabKey, label: '执行历史', icon: History },
          ]).map((v) => (
            <button
              key={v.k}
              onClick={() => setTab(v.k)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                tab === v.k
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
              <span className={cn(
                'ml-1 rounded px-1.5 text-[10px] font-mono',
                tab === v.k ? 'bg-white/20 text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]',
              )}>
                {v.k === 'canvas' ? nodes.length : v.k === 'templates' ? TEMPLATES.length : RUNS.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ======== 主内容区 ======== */}
      <div className="flex-1 overflow-hidden">
        {tab === 'canvas' && (
          <CanvasView
            wrapperRef={wrapperRef}
            rfNodes={rfNodes}
            rfEdges={rfEdges}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodesChange={onNodesChange}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            sidePanel={sidePanel}
            setSidePanel={setSidePanel}
            librarySearchQ={librarySearchQ}
            setLibrarySearchQ={setLibrarySearchQ}
            canvasSearchQ={canvasSearchQ}
            setCanvasSearchQ={setCanvasSearchQ}
            searchMatch={searchMatch ?? null}
            focusNode={focusNode}
            filteredLibrary={filteredLibrary}
            draggedKind={draggedKind}
            setDraggedKind={setDraggedKind}
            selectedNode={selectedNode}
            selectedNodeId={selectedNodeId}
            nodes={filteredNodes}
            webhookEnabled={webhookEnabled}
            setWebhookEnabled={setWebhookEnabled}
            saveCanvas={saveCanvas}
            runWorkflow={runWorkflow}
            resetCanvas={resetCanvas}
            clearCanvas={clearCanvas}
            addNode={addNode}
            deleteNode={deleteNode}
            duplicateNode={duplicateNode}
            disableNode={disableNode}
            updateNodeLabel={updateNodeLabel}
            updateNodeDescription={updateNodeDescription}
            updateNodeNote={updateNodeNote}
            showToast={showToast}
            onConnect={onConnect}
            deleteEdge={deleteEdge}
            undo={undo}
            redo={redo}
            canUndo={historyRef.current.idx > 0}
            canRedo={historyRef.current.idx < historyRef.current.stack.length - 1}
            exportWorkflow={exportWorkflow}
            reactFlowRef={reactFlowRef}
            canWrite={canWrite}
            canExecute={canExecute}
          />
        )}

        {tab === 'templates' && (
          <TemplatesView
            filterGroup={filterGroup}
            setFilterGroup={setFilterGroup}
            filteredTemplates={filteredTemplates}
            showToast={showToast}
            onPreview={(t) => setPreviewTemplate(t)}
            onUseTemplate={(t) => {
              if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
              const snapshot = templateSnapshot(t);
              setNodes(snapshot.nodes);
              setEdges(snapshot.edges);
              pushHistory(snapshot);
              setSelectedNodeId(snapshot.nodes[0]?.id ?? null);
              setTab('canvas');
              setSidePanel('properties');
              showToast(`已加载「${t.name}」为本地草稿`, 'success');
            }}
          />
        )}

        {tab === 'history' && (
          <HistoryView showToast={showToast} />
        )}
      </div>

      {/* 模板预览弹窗 — 用 wrapper 避免 hooks 顺序问题 */}
      {previewTemplate && (
        <TemplatePreviewModalInner
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          showToast={showToast}
        />
      )}

      {/* ======== 右键菜单 ======== */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[180px] rounded-md border border-[var(--border)] bg-[var(--surface-1)] py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
              onClick={() => { setSidePanel('properties'); setContextMenu(null); }}
            >
              <Edit3 className="h-3.5 w-3.5" />编辑属性
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
              onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); }}
            >
              <Copy className="h-3.5 w-3.5" />复制节点
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
              onClick={() => { disableNode(contextMenu.nodeId); setContextMenu(null); }}
            >
              <Pause className="h-3.5 w-3.5" />禁用 / 启用
            </button>
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)]"
              onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); }}
            >
              <Trash2 className="h-3.5 w-3.5" />删除节点
            </button>
          </div>
        </>
      )}

      {/* ======== Toast ======== */}
      <ConfirmDialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={confirmClearCanvas}
        title="清空画布"
        description="将删除当前画布中的全部节点和连线。该操作只修改本地草稿，可通过撤销恢复。"
        confirmText="确认清空"
        tone="danger"
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in">
          <div className={cn(
            'rounded-md border px-4 py-2.5 shadow-lg text-sm flex items-center gap-2',
            toast.tone === 'success' ? 'border-[var(--success)]/30 bg-[var(--success-bg)] text-[var(--success)]' :
            toast.tone === 'error' ? 'border-[var(--danger)]/30 bg-[var(--danger-bg)] text-[var(--danger)]' :
            'border-[var(--info)]/30 bg-[var(--info-bg)] text-[var(--info)]',
          )}>
            {toast.tone === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {toast.tone === 'error' && <AlertTriangle className="h-4 w-4" />}
            {toast.tone === 'info' && <Activity className="h-4 w-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

/* =============================================================
 *  CanvasView —— 画布主区域
 * ============================================================= */
function CanvasView(props: {
  wrapperRef: React.RefObject<HTMLDivElement>;
  rfNodes: Node[];
  rfEdges: Edge[];
  onNodeClick: NodeMouseHandler;
  onNodeContextMenu: NodeMouseHandler;
  onNodesChange: (changes: NodeChange[]) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  sidePanel: SidePanelKey;
  setSidePanel: (k: SidePanelKey) => void;
  librarySearchQ: string;
  setLibrarySearchQ: (v: string) => void;
  canvasSearchQ: string;
  setCanvasSearchQ: (v: string) => void;
  searchMatch: Node | null;
  focusNode: (id: string) => void;
  filteredLibrary: WorkflowNodeKind[];
  draggedKind: WorkflowNodeKind | null;
  setDraggedKind: (k: WorkflowNodeKind | null) => void;
  selectedNode: Node | null;
  selectedNodeId: string | null;
  nodes: Node[];
  webhookEnabled: boolean;
  setWebhookEnabled: (b: boolean) => void;
  saveCanvas: () => void;
  runWorkflow: () => void;
  resetCanvas: () => void;
  clearCanvas: () => void;
  addNode: (kind: WorkflowNodeKind, pos?: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  disableNode: (id: string) => void;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeDescription: (id: string, desc: string) => void;
  updateNodeNote: (id: string, note: string) => void;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConnect: (c: Connection) => void;
  deleteEdge: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportWorkflow: () => void;
  reactFlowRef: React.MutableRefObject<any>;
  canWrite: boolean;
  canExecute: boolean;
}) {
  const {
    wrapperRef, rfNodes, rfEdges, onNodeClick, onNodeContextMenu, onNodesChange,
    handleDragOver, handleDrop, sidePanel, setSidePanel,
    librarySearchQ, setLibrarySearchQ, canvasSearchQ, setCanvasSearchQ, searchMatch, focusNode,
    filteredLibrary, setDraggedKind,
    selectedNode, selectedNodeId, nodes, webhookEnabled, setWebhookEnabled,
    saveCanvas, runWorkflow, resetCanvas, clearCanvas,
    addNode, deleteNode, duplicateNode, disableNode, updateNodeLabel, updateNodeDescription, updateNodeNote, showToast,
    onConnect, deleteEdge, undo, redo, canUndo, canRedo, exportWorkflow, reactFlowRef, canWrite, canExecute,
  } = props;

  const [mobilePanelOpen, setMobilePanelOpen] = useState<SidePanelKey | null>(null);
  const [nodePaletteOpen, setNodePaletteOpen] = useState(true);
  const [nodeInspectorTab, setNodeInspectorTab] = useState<'overview' | 'config' | 'debug'>('config');
  const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
    onNodeClick(event, node);
    setNodeInspectorTab('config');
    setMobilePanelOpen('properties');
  }, [onNodeClick]);

  return (
    <div className="flex h-full min-h-0 min-w-0">
      {/* —— 左侧：节点库 —— */}
      <div className="hidden">
        <div className="border-b border-[var(--border)] p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
            <Box className="h-3.5 w-3.5" />
            节点库
            <span className="ml-auto text-[10px] text-[var(--text-muted)] font-mono">{filteredLibrary.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
            <input
              value={librarySearchQ}
              onChange={(e) => setLibrarySearchQ(e.target.value)}
              placeholder="搜索节点"
              className="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] pl-7 pr-2 text-[11px] outline-none focus:border-[var(--brand)]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredLibrary.map((kind) => {
            const Icon = NODE_ICONS[kind];
            const color = NODE_COLORS[kind];
            return (
              <div
                key={kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/wf-node', kind);
                  setDraggedKind(kind);
                }}
                onDragEnd={() => setDraggedKind(null)}
                onClick={() => addNode(kind)}
                className="group flex cursor-grab items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 transition-all hover:border-[var(--brand)] hover:shadow-sm active:cursor-grabbing"
              >
                <div
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold leading-tight">{NODE_LABELS[kind]}</div>
                  <div className="mt-0.5 text-[9px] text-[var(--text-muted)] truncate">{NODE_DESCS[kind]}</div>
                </div>
                <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 text-[var(--brand)]" />
              </div>
            );
          })}
        </div>
        <div className="border-t border-[var(--border)] p-2 text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
          <GripVertical className="h-3 w-3" />拖拽到画布添加 / 单击添加
        </div>
      </div>

      {/* —— 中间：DAG 画布 + Webhook + 操作按钮 —— */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-2)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2">
          <Button size="sm" variant="outline" onClick={() => setNodePaletteOpen((open) => !open)}>
            <Box className="h-3.5 w-3.5" />{nodePaletteOpen ? '收起节点库' : '节点库'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            setNodeInspectorTab(selectedNode ? 'config' : 'overview');
            setMobilePanelOpen(selectedNode ? 'properties' : 'library');
          }}>
            <Settings className="h-3.5 w-3.5" />{selectedNode ? '节点详情' : '节点库'}
          </Button>
        </div>

        <Drawer
          open={mobilePanelOpen !== null}
          onClose={() => setMobilePanelOpen(null)}
          title={mobilePanelOpen === 'library' ? '节点库' : selectedNode ? `${selectedNode.data?.label || NODE_LABELS[selectedNode.data?.kind as WorkflowNodeKind]} · 节点详情` : '节点详情'}
          description={mobilePanelOpen === 'library' ? '拖拽或点击添加到画布' : selectedNode ? `${selectedNode.id} · ${NODE_DESCS[selectedNode.data?.kind as WorkflowNodeKind]}` : '选择画布中的节点查看信息与配置'}
          width={460}
        >
          {mobilePanelOpen === 'library' && (
            <div className="space-y-2">
              <input
                value={librarySearchQ}
                onChange={(e) => setLibrarySearchQ(e.target.value)}
                placeholder="搜索节点"
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus:border-[var(--brand)]"
              />
              {filteredLibrary.map((kind) => {
                const Icon = NODE_ICONS[kind];
                return <button key={kind} type="button" className="flex w-full items-center gap-2 rounded-md border border-[var(--border)] p-2 text-left text-xs" onClick={() => addNode(kind)}><Icon className="h-4 w-4" style={{ color: NODE_COLORS[kind] }} />{NODE_LABELS[kind]}</button>;
              })}
            </div>
          )}
          {mobilePanelOpen !== 'library' && selectedNode && (
            <div className="space-y-4">
              <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
                {[
                  { key: 'overview' as const, label: '概览', icon: FileText },
                  { key: 'config' as const, label: '配置', icon: Settings },
                  { key: 'debug' as const, label: '调试', icon: Bug },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setNodeInspectorTab(item.key)}
                    className={cn('flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors', nodeInspectorTab === item.key ? 'bg-[var(--bg)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]')}
                  >
                    <item.icon className="h-3.5 w-3.5" />{item.label}
                  </button>
                ))}
              </div>
              {nodeInspectorTab === 'overview' && <NodeOverview selectedNode={selectedNode} />}
              {nodeInspectorTab === 'config' && <PropertiesPanel selectedNode={selectedNode} updateNodeLabel={updateNodeLabel} updateNodeDescription={updateNodeDescription} updateNodeNote={updateNodeNote} showToast={showToast} />}
              {nodeInspectorTab === 'debug' && <DebugPanel selectedNode={selectedNode} selectedNodeId={selectedNodeId} deleteNode={deleteNode} duplicateNode={duplicateNode} disableNode={disableNode} showToast={showToast} />}
            </div>
          )}
        </Drawer>

        {/* Webhook + 操作 */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Webhook className="h-3.5 w-3.5 text-[var(--info)] shrink-0" />
            <span className="font-mono text-[11px] truncate">POST /webhook/redis-oom</span>
            <button
              onClick={() => setWebhookEnabled(!webhookEnabled)}
              className={cn(
                'relative h-4 w-7 rounded-full transition-colors shrink-0',
                webhookEnabled ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]',
              )}
            >
              <span className={cn(
                'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
                webhookEnabled ? 'left-3.5' : 'left-0.5',
              )} />
            </button>
            <span className="text-[10px] text-[var(--text-muted)] shrink-0">{webhookEnabled ? '已启用' : '已禁用'}</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {/* 画布节点搜索定位 */}
            <div className="relative mr-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
              <input
                value={canvasSearchQ}
                onChange={(e) => setCanvasSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && searchMatch) focusNode(searchMatch.id); }}
                placeholder="定位节点 (id / label)"
                className="h-7 w-44 rounded-md border border-[var(--border)] bg-[var(--bg)] pl-7 pr-2 text-[11px] outline-none focus:border-[var(--brand)]"
              />
              {canvasSearchQ && searchMatch && (
                <button
                  onClick={() => focusNode(searchMatch.id)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-[var(--brand)] px-1.5 py-0.5 text-[9px] text-white"
                >
                  跳转
                </button>
              )}
              {canvasSearchQ && !searchMatch && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--danger)]">无匹配</span>
              )}
            </div>
            <button
              onClick={undo}
              disabled={!canUndo}
              title="撤销 (Cmd+Z)"
              className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--brand)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="重做 (Cmd+Shift+Z)"
              className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--brand)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <div className="mx-1 h-5 w-px bg-[var(--border)]" />
              <Button size="sm" variant="outline" onClick={runWorkflow} disabled={!canExecute} title={!canExecute ? '需要 workflow.execute 权限' : undefined}>
                <Play className="h-3.5 w-3.5" />运行
              </Button>
              <Button size="sm" variant="outline" onClick={saveCanvas} disabled={!canWrite} title={!canWrite ? '需要 workflow.write 权限' : undefined}>
                <Save className="h-3.5 w-3.5" />保存
              </Button>
            <Button size="sm" variant="outline" onClick={exportWorkflow}>
              <FileJson className="h-3.5 w-3.5" />导出
            </Button>
              <Button size="sm" variant="outline" onClick={resetCanvas} disabled={!canWrite} title={!canWrite ? '需要 workflow.write 权限' : undefined}>
                <RefreshCw className="h-3.5 w-3.5" />重置
              </Button>
              <Button size="sm" variant="danger" onClick={clearCanvas} disabled={!canWrite} title={!canWrite ? '需要 workflow.write 权限' : undefined}>
                <Trash2 className="h-3.5 w-3.5" />清空
              </Button>
          </div>
        </div>

        {/* 画布 */}
        <div
          ref={wrapperRef}
          className="relative min-h-[560px] flex-1 w-full"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <ReactFlowProvider>
            <ReactFlow
              ref={reactFlowRef}
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              proOptions={{ hideAttribution: true }}
              onNodeClick={handleNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              onNodesChange={onNodesChange}
              onConnect={onConnect}
              onEdgeDoubleClick={(_, edge) => deleteEdge(edge.id)}
              defaultEdgeOptions={{ type: 'smoothstep' }}
              minZoom={0.4}
              maxZoom={1.8}
            >
              <Background gap={20} size={1} color="var(--border-strong)" />
              <Controls position="bottom-right" showInteractive={false} />
              <MiniMap
                position="top-right"
                nodeColor={(n) => NODE_COLORS[(n.data as any)?.kind as WorkflowNodeKind] ?? '#3b82f6'}
                maskColor="rgba(15,21,37,0.6)"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
              />
            </ReactFlow>
          </ReactFlowProvider>

          {/* 画布内节点库：可直接拖放到任意画布位置 */}
          {nodePaletteOpen && (
            <div className="absolute left-3 top-3 z-20 w-[232px] rounded-lg border border-[var(--border)] bg-[var(--bg)]/95 p-2 shadow-lg backdrop-blur">
              <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold">
                <Box className="h-3.5 w-3.5 text-[var(--brand)]" />节点库
                <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">拖拽添加</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {filteredLibrary.map((kind) => {
                  const Icon = NODE_ICONS[kind];
                  const color = NODE_COLORS[kind];
                  return (
                    <button
                      key={kind}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/wf-node', kind);
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggedKind(kind);
                      }}
                      onDragEnd={() => setDraggedKind(null)}
                      onClick={() => addNode(kind)}
                      className="flex cursor-grab items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-left text-[10px] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-light)] active:cursor-grabbing"
                      title={`${NODE_DESCS[kind]} · 拖拽到画布添加`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                      <span className="truncate">{NODE_LABELS[kind]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 拖拽提示 */}
          {props.draggedKind && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--brand)]/5 border-2 border-dashed border-[var(--brand)]/40 z-10">
              <div className="rounded-md bg-[var(--surface-1)] border border-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand)] shadow-lg">
                释放鼠标添加到画布 · {NODE_LABELS[props.draggedKind]}
              </div>
            </div>
          )}

          {/* 画布右下角状态 */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)]/95 px-2 py-1 text-[10px] text-[var(--text-muted)] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse" />
            执行中 · <span className="font-mono font-semibold">n4 双签审批</span>
          </div>

          {/* 快捷键提示 */}
          <div className="absolute bottom-3 right-3 hidden max-w-[min(520px,calc(100%-24px))] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)]/95 px-2 py-1 text-[9px] text-[var(--text-muted)] backdrop-blur font-mono sm:flex">
            <span className="whitespace-normal">拖动节点 handle 连线 · 双击连线删除 · Del 删除节点 · ⌘S 保存 · ⌘Z 撤销</span>
          </div>
        </div>
      </div>

      {/* —— 右侧：Tab（节点库信息 / 调试 / 属性） —— */}
      <div className="hidden">
        <div className="flex items-center border-b border-[var(--border)]">
          {([
            { k: 'library' as SidePanelKey, label: '信息', icon: FileText },
            { k: 'debug' as SidePanelKey, label: '调试', icon: Bug },
            { k: 'properties' as SidePanelKey, label: '属性', icon: Settings },
          ]).map((v) => (
            <button
              key={v.k}
              onClick={() => setSidePanel(v.k)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-[11px] transition-colors',
                sidePanel === v.k
                  ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              <v.icon className="h-3.5 w-3.5" />{v.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2.5">
          {sidePanel === 'library' && <InfoPanel nodes={nodes} />}
          {sidePanel === 'debug' && (
            <DebugPanel
              selectedNode={selectedNode}
              selectedNodeId={selectedNodeId}
              deleteNode={deleteNode}
              duplicateNode={duplicateNode}
              disableNode={disableNode}
              showToast={showToast}
            />
          )}
          {sidePanel === 'properties' && (
            <PropertiesPanel
              selectedNode={selectedNode}
              updateNodeLabel={updateNodeLabel}
              updateNodeDescription={updateNodeDescription}
              updateNodeNote={updateNodeNote}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* =============================================================
 *  信息面板（节点列表 + 当前 DAG 状态）
 * ============================================================= */
function InfoPanel({ nodes }: { nodes: Node[] }) {
  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">画布概览</div>
          <Badge tone="success" className="text-[9px]">运行中</Badge>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
          <div className="px-2 py-2 text-center">
            <div className="font-mono text-lg font-bold text-[var(--brand)]">{nodes.length}</div>
            <div className="text-[9px] text-[var(--text-muted)]">节点</div>
          </div>
          <div className="px-2 py-2 text-center">
            <div className="font-mono text-lg font-bold text-[var(--text)]">10</div>
            <div className="text-[9px] text-[var(--text-muted)]">连线</div>
          </div>
          <div className="px-2 py-2 text-center">
            <div className="font-mono text-lg font-bold text-[var(--success)]">100%</div>
            <div className="text-[9px] text-[var(--text-muted)]">成功率</div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">节点列表</div>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">{nodes.length} 个</span>
        </div>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {nodes.map((n, i) => {
            const kind = n.data?.kind as WorkflowNodeKind;
            const Icon = NODE_ICONS[kind];
            const color = NODE_COLORS[kind];
            const isExecuting = n.id === EXECUTING_NODE_ID;
            return (
              <div
                key={n.id}
                className={cn(
                  'flex h-11 items-center gap-2 px-2.5 text-[11px] transition-colors',
                  isExecuting && 'bg-[var(--brand-light)]',
                )}
              >
                <span className="w-4 shrink-0 text-right font-mono text-[10px] text-[var(--text-muted)]">{i + 1}</span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded" style={{ backgroundColor: `${color}1a` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{n.data?.label || NODE_LABELS[kind]}</span>
                {isExecuting && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)] animate-pulse" />}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">运行统计</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: '触发', value: '124', icon: Zap, color: 'text-[var(--brand)]' },
            { label: '成功率', value: '100%', icon: ShieldCheck, color: 'text-[var(--success)]' },
            { label: '平均完成', value: '38s', icon: Play, color: 'text-[var(--brand)]' },
            { label: 'MTTR 降低', value: '-65%', icon: Sparkles, color: 'text-[var(--purple)]' },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2">
              <div>
                <div className="text-[9px] text-[var(--text-muted)]">{s.label}</div>
                <div className={cn('mt-0.5 font-mono text-sm font-bold', s.color)}>{s.value}</div>
              </div>
              <s.icon className={cn('h-3.5 w-3.5', s.color)} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* =============================================================
 *  节点检查器概览
 * ============================================================= */
function NodeOverview({ selectedNode }: { selectedNode: Node }) {
  const kind = selectedNode.data?.kind as WorkflowNodeKind;
  const Icon = NODE_ICONS[kind];
  const color = NODE_COLORS[kind];
  const debugInfo = NODE_DEBUG[selectedNode.id];
  const isExecuting = selectedNode.id === EXECUTING_NODE_ID;

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ backgroundColor: `${color}1a`, color }}>{kind}</span>
              {isExecuting && <Badge tone="brand" className="text-[9px]"><span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />运行中</Badge>}
              {selectedNode.data?.disabled && <Badge tone="neutral" className="text-[9px]">已禁用</Badge>}
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--text)]">{selectedNode.data?.label || NODE_LABELS[kind]}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{selectedNode.data?.desc || NODE_DESCS[kind]}</p>
          </div>
        </div>
      </section>
      <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[11px]">
        <div className="border-b border-r border-[var(--border)] p-2.5"><div className="text-[10px] text-[var(--text-muted)]">节点 ID</div><div className="mt-0.5 font-mono text-[var(--text-secondary)]">{selectedNode.id}</div></div>
        <div className="border-b border-[var(--border)] p-2.5"><div className="text-[10px] text-[var(--text-muted)]">运行状态</div><div className={cn('mt-0.5 font-medium', selectedNode.data?.disabled ? 'text-[var(--text-muted)]' : isExecuting ? 'text-[var(--brand)]' : 'text-[var(--success)]')}>{selectedNode.data?.disabled ? '已跳过' : isExecuting ? '执行中' : '已就绪'}</div></div>
        <div className="border-r border-[var(--border)] p-2.5"><div className="text-[10px] text-[var(--text-muted)]">画布坐标</div><div className="mt-0.5 font-mono text-[var(--text-secondary)]">{Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}</div></div>
        <div className="p-2.5"><div className="text-[10px] text-[var(--text-muted)]">最近运行</div><div className="mt-0.5 font-mono text-[var(--text-secondary)]">{debugInfo ? debugInfo.log.at(-1)?.slice(1, 9) ?? '—' : '暂无记录'}</div></div>
      </section>
      {selectedNode.data?.note && <section className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-2.5 text-[11px]"><div className="mb-1 flex items-center gap-1 font-semibold text-[var(--warning)]"><MessageSquare className="h-3.5 w-3.5" />运行批注</div><p className="leading-relaxed text-[var(--text-secondary)]">{selectedNode.data.note}</p></section>}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">配置提示</div>
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{kind === 'approval' ? '请设置审批组、签名人数和审批超时；任何写操作均应保留回滚分支。' : kind === 'execute' ? '请确认执行工具、目标资源、参数及重试策略；高风险操作建议串联双签节点。' : kind === 'branch' ? '请配置分支表达式和各出口的目标节点，确保默认路径可追踪。' : '在“配置”页更新节点名称、描述与运行批注；变更后需点击应用修改。'}</p>
      </section>
    </div>
  );
}

/* =============================================================
 *  调试面板
 * ============================================================= */
function DebugPanel({
  selectedNode, selectedNodeId, deleteNode, duplicateNode, disableNode, showToast,
}: {
  selectedNode: Node | null;
  selectedNodeId: string | null;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  disableNode: (id: string) => void;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  if (!selectedNode) {
    return (
      <div className="grid h-full place-items-center text-center text-xs text-[var(--text-muted)] px-4">
        <div>
          <Bug className="mx-auto mb-2 h-8 w-8 opacity-30" />
          点击画布上的任意节点<br />查看输入 / 输出 / 日志
        </div>
      </div>
    );
  }

  const debugInfo = NODE_DEBUG[selectedNode.id];
  const kind = selectedNode.data?.kind as WorkflowNodeKind;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">{selectedNode.id}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: `${NODE_COLORS[kind]}1a`, color: NODE_COLORS[kind] }}>{kind}</span>
          {selectedNode.id === EXECUTING_NODE_ID && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--brand-light)] text-[var(--brand)] flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />运行中
            </span>
          )}
        </div>
        <div className="mt-1 text-sm font-semibold">{selectedNode.data?.label || NODE_LABELS[kind]}</div>
        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{NODE_DESCS[kind]}</div>
      </div>

      {debugInfo ? (
        <>
          <Section title="输入">
            <pre className="text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all text-[var(--text-secondary)]">{debugInfo.input}</pre>
          </Section>
          <Section title="输出">
            <pre className="text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all text-[var(--success)]">{debugInfo.output}</pre>
          </Section>
          <Section title="执行日志">
            <div className="space-y-0.5 font-mono text-[10px]">
              {debugInfo.log.map((line, i) => (
                <div key={i} className="text-[var(--text-secondary)]">{line}</div>
              ))}
            </div>
          </Section>

          {/* 失败回放 / 重跑 */}
          <Section title="回放控制">
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => showToast(`已重新执行节点 ${selectedNodeId}，输出已记录`, 'success')}>
                <RotateCcw className="h-3 w-3" />重跑
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => showToast(`已从节点 ${selectedNodeId} 继续执行`, 'info')}>
                <Eye className="h-3 w-3" />续跑
              </Button>
            </div>
          </Section>
        </>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center text-[11px] text-[var(--text-muted)]">
          该节点无调试数据
        </div>
      )}

      {/* 节点操作 */}
      <Section title="节点操作">
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => duplicateNode(selectedNode.id)}>
            <Copy className="h-3 w-3" />复制
          </Button>
          <Button size="sm" variant="secondary" onClick={() => disableNode(selectedNode.id)}>
            <Pause className="h-3 w-3" />{selectedNode.data?.disabled ? '启用' : '禁用'}
          </Button>
          <Button size="sm" variant="danger" className="col-span-2" onClick={() => deleteNode(selectedNode.id)}>
            <Trash2 className="h-3 w-3" />删除节点
          </Button>
        </div>
      </Section>
    </div>
  );
}

/* =============================================================
 *  属性面板（编辑节点 label / 描述 / 配置）
 * ============================================================= */
function PropertiesPanel({
  selectedNode, updateNodeLabel, updateNodeDescription, updateNodeNote, showToast,
}: {
  selectedNode: Node | null;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeDescription: (id: string, desc: string) => void;
  updateNodeNote: (id: string, note: string) => void;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [label, setLabel] = useState(selectedNode?.data?.label ?? '');
  const [desc, setDesc] = useState(selectedNode?.data?.desc ?? '');
  const [note, setNote] = useState(selectedNode?.data?.note ?? '');

  useEffect(() => {
    setLabel(selectedNode?.data?.label ?? '');
    setDesc(selectedNode?.data?.desc ?? '');
    setNote(selectedNode?.data?.note ?? '');
  }, [selectedNode?.id]);

  if (!selectedNode) {
    return (
      <div className="grid h-full place-items-center text-center text-xs text-[var(--text-muted)] px-4">
        <div>
          <Settings className="mx-auto mb-2 h-8 w-8 opacity-30" />
          点击画布上的任意节点<br />编辑其属性
        </div>
      </div>
    );
  }

  const kind = selectedNode.data?.kind as WorkflowNodeKind;
  const Icon = NODE_ICONS[kind];
  const color = NODE_COLORS[kind];

  const apply = () => {
    updateNodeLabel(selectedNode.id, label);
    updateNodeDescription(selectedNode.id, desc);
    updateNodeNote(selectedNode.id, note);
    showToast(`节点 ${selectedNode.id} 属性已更新`, 'success');
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-md"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-mono">{kind}</div>
            <div className="text-sm font-semibold">{NODE_LABELS[kind]}</div>
          </div>
        </div>
      </div>

      <Field label="节点 ID">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-muted)]">
          {selectedNode.id}
        </div>
      </Field>

      <Field label="显示名称">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 text-[12px] outline-none focus:border-[var(--brand)]"
        />
      </Field>

      <Field label="描述">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--brand)] resize-none"
        />
      </Field>

      <Field label="批注 (note)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="如：高峰期需手确认、双签必须 5 分钟内…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--brand)] resize-none"
        />
        <div className="mt-1 text-[9px] text-[var(--text-muted)] flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          节点卡片下方会显示此批注
        </div>
      </Field>

      <Field label="位置">
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 font-mono">
            x: {Math.round(selectedNode.position.x)}
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 font-mono">
            y: {Math.round(selectedNode.position.y)}
          </div>
        </div>
      </Field>

      <Field label="运行时行为">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-[11px]">
          {selectedNode.data?.disabled
            ? <span className="text-[var(--danger)]">⏸ 已禁用（运行时跳过）</span>
            : <span className="text-[var(--success)]">▶ 正常执行</span>}
        </div>
      </Field>

      <Button className="w-full" onClick={apply}>
        <Save className="h-3.5 w-3.5" />应用修改
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">{label}</div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1">
        <ArrowRight className="h-3 w-3" />{title}
      </div>
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-2">{children}</div>
    </div>
  );
}

/* =============================================================
 *  模板市场
 * ============================================================= */
function TemplatesView({
  filterGroup, setFilterGroup, filteredTemplates, showToast, onPreview, onUseTemplate,
}: {
  filterGroup: 'all' | 'business' | 'system' | 'security' | 'ai';
  setFilterGroup: (k: 'all' | 'business' | 'system' | 'security' | 'ai') => void;
  filteredTemplates: typeof TEMPLATES;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onPreview: (t: typeof TEMPLATES[number]) => void;
  onUseTemplate: (t: typeof TEMPLATES[number]) => void;
}) {
  return (
    <div className="overflow-y-auto p-6 bg-[var(--bg-elevated)] h-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--brand)]" />工作流模板市场
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{TEMPLATES.length} 套内置模板 · 按业务 / 系统 / 安全 / AI 分组</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-1">分组</span>
          {([
            { k: 'all' as const, label: '全部' },
            { k: 'business' as const, label: '业务' },
            { k: 'system' as const, label: '系统' },
            { k: 'security' as const, label: '安全' },
            { k: 'ai' as const, label: 'AI' },
          ]).map((g) => (
            <button
              key={g.k}
              onClick={() => setFilterGroup(g.k)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] transition-colors',
                filterGroup === g.k
                  ? 'bg-[var(--brand)] text-white'
                  : 'bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--brand)]',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredTemplates.map((t) => (
          <div
            key={t.id}
            className="tile-brandable rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={cn(
                'grid h-10 w-10 place-items-center rounded-md shrink-0',
                t.category === 'business' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                t.category === 'system' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                t.category === 'security' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' :
                'bg-[var(--purple-bg)] text-[var(--purple)]',
              )}>
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)] line-clamp-2">{t.description}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border)] text-[10px]">
              <Mini label="节点" value={t.nodes} />
              <Mini label="安装" value={t.installs} />
              <Mini label="评分" value={`★ ${t.rating}`} tone="warn" />
            </div>
            <div className="mt-3 flex gap-1.5">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => onPreview(t)}>
                <Eye className="h-3 w-3" />预览
              </Button>
              <Button size="sm" className="flex-1" onClick={() => onUseTemplate(t)}>
                <Download className="h-3 w-3" />使用
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =============================================================
 *  模板预览弹窗
 * ============================================================= */
function TemplatePreviewModal({
  template, onClose, showToast,
}: {
  template: typeof TEMPLATES[number] | null;
  onClose: () => void;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  if (!template) return null;
  return <TemplatePreviewModalInner template={template} onClose={onClose} showToast={showToast} />;
}

function TemplatePreviewModalInner({
  template, onClose, showToast,
}: {
  template: typeof TEMPLATES[number];
  onClose: () => void;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [zoom, setZoom] = useState(0.7);

  // 根据模板节点数生成预览 DAG（必须放在组件顶层，且早期不 return）
  const previewSeq: WorkflowNodeKind[] = useMemo(() => {
    if (template.id === 't1') {
      return ['trigger', 'retrieve', 'decision', 'approval', 'branch', 'execute', 'audit', 'notify', 'execute', 'audit'];
    }
    if (template.id === 't2') return ['trigger', 'retrieve', 'branch', 'execute', 'execute', 'audit', 'notify'];
    if (template.id === 't3') return ['trigger', 'retrieve', 'decision', 'execute', 'approval', 'execute', 'execute', 'audit', 'notify', 'audit', 'notify', 'execute'];
    if (template.id === 't4') return ['trigger', 'retrieve', 'decision', 'branch', 'execute', 'audit', 'notify'];
    if (template.id === 't5') return ['trigger', 'retrieve', 'decision', 'execute', 'audit', 'notify'];
    if (template.id === 't6') return ['trigger', 'retrieve', 'decision', 'branch', 'execute', 'execute', 'audit', 'notify', 'execute'];
    const seq: WorkflowNodeKind[] = ['trigger'];
    const pool: WorkflowNodeKind[] = ['retrieve', 'decision', 'execute', 'audit', 'notify'];
    while (seq.length < template.nodes) seq.push(pool[seq.length % pool.length]);
    return seq;
  }, [template.id, template.nodes]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onClick={onClose}>
      <div
        className="w-[min(960px,calc(100%-32px))] h-[min(640px,calc(100%-32px))] rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'grid h-9 w-9 place-items-center rounded-md',
              template.category === 'business' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
              template.category === 'system' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
              template.category === 'security' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' :
              'bg-[var(--purple-bg)] text-[var(--purple)]',
            )}>
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                {template.name}
                <Badge tone="brand" className="text-[9px]">预览</Badge>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{template.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>−</Button>
            <span className="font-mono text-[11px] text-[var(--text-muted)] w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}>+</Button>
            <div className="mx-1 h-5 w-px bg-[var(--border)]" />
            <Button size="sm" onClick={() => { showToast(`已基于「${template.name}」创建工作流（草稿）`, 'success'); onClose(); }}>
              <Download className="h-3 w-3" />使用此模板
            </Button>
            <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* DAG 预览区 */}
        <div className="relative flex-1 overflow-auto bg-[var(--surface-2)] p-6">
          <div className="flex items-center gap-3 flex-wrap" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            {previewSeq.map((kind, i) => {
              const Icon = NODE_ICONS[kind];
              const color = NODE_COLORS[kind];
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="rounded-md border-2 bg-[var(--bg)] px-3 py-2 min-w-[120px] text-center" style={{ borderColor: color }}>
                    <Icon className="h-3.5 w-3.5 mx-auto" style={{ color }} />
                    <div className="text-[10px] uppercase tracking-wide opacity-70 mt-0.5">{kind}</div>
                    <div className="text-xs font-semibold">{NODE_LABELS[kind]}</div>
                  </div>
                  {i < previewSeq.length - 1 && <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-2.5 bg-[var(--bg)] text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-4">
            <span>📦 <strong className="text-[var(--text)] font-mono">{template.nodes}</strong> 节点</span>
            <span>📥 <strong className="text-[var(--text)] font-mono">{template.installs}</strong> 次安装</span>
            <span>⭐ <strong className="text-[var(--text)] font-mono">{template.rating}</strong></span>
            <span className="capitalize">分类: <strong className="text-[var(--text)]">{template.category === 'business' ? '业务' : template.category === 'system' ? '系统' : template.category === 'security' ? '安全' : 'AI'}</strong></span>
          </div>
          <span className="font-mono text-[10px]">template_id = {template.id}</span>
        </div>
      </div>
    </div>
  );
}

/* =============================================================
 *  执行历史（含时序图 + 单步回放控制）
 * ============================================================= */
function HistoryView({ showToast }: { showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void }) {
  const [selectedRunId, setSelectedRunId] = useState<string>('r1');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mobileReplayOpen, setMobileReplayOpen] = useState(false);

  const selectedRun = RUNS.find((r) => r.id === selectedRunId) ?? RUNS[0];
  const totalSteps = selectedRun.steps;

  // 自动播放
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= totalSteps) { setPlaying(false); return s; }
        return s + 1;
      });
    }, 800);
    return () => clearInterval(timer);
  }, [playing, totalSteps]);

  // 切换 run 时重置
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [selectedRunId]);

  return (
    <div className="grid h-full grid-cols-1 gap-0 overflow-hidden bg-[var(--bg-elevated)] lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* 左侧：历史列表 */}
      <div className="overflow-y-auto p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--text-muted)]" />执行历史
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">最近 {RUNS.length} 次执行 · 点击查看单步回放</p>
        </div>
        <div className="space-y-2">
          {RUNS.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedRunId(r.id)}
              className={cn(
                'cursor-pointer rounded-lg border bg-[var(--bg)] p-4 transition-colors',
                selectedRunId === r.id ? 'border-[var(--brand)] ring-2 ring-[var(--brand-light)]' : 'border-[var(--border)] hover:border-[var(--brand)]',
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{r.time}</span>
                  <span className="font-semibold text-sm">{r.trigger}</span>
                  <Badge tone={r.status === 'success' ? 'success' : 'error'} className="text-[10px]">
                    {r.duration}s · {r.steps}/10 步
                  </Badge>
                  {r.status === 'failed' && (
                    <Badge tone="error" className="text-[10px]">失败</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[var(--text-muted)]">{r.who}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="lg:hidden"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRunId(r.id);
                      setMobileReplayOpen(true);
                    }}
                  >
                    <Eye className="h-3 w-3" />回放
                  </Button>
                  {r.status === 'failed' && (
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); showToast('已从失败步骤重新执行', 'success'); }}>
                      <RotateCcw className="h-3 w-3" />重跑
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-0.5 h-2.5 rounded overflow-hidden bg-[var(--bg-hover)]">
                {Array.from({ length: 10 }).map((_, i) => {
                  const isCompleted = i < r.steps;
                  const isFailed = r.status === 'failed' && i === r.steps - 1;
                  return (
                    <div
                      key={i}
                      title={`步骤 ${i + 1}`}
                      className={cn(
                        'flex-1 transition-all',
                        isFailed ? 'bg-[var(--danger)]' : isCompleted ? 'bg-[var(--success)]' : 'bg-[var(--bg-hover)]',
                      )}
                    />
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between text-[9px] text-[var(--text-muted)] font-mono">
                <span>触发</span>
                <span>决策</span>
                <span>执行</span>
                <span>审计</span>
                <span>通知</span>
              </div>
              {r.error && (
                <div className="mt-3 flex items-start gap-2 rounded-md bg-[var(--danger-bg)] border border-[var(--danger)]/30 px-2 py-1.5 text-[11px] text-[var(--danger)]">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{r.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：单步回放控制台 */}
      <div className="hidden border-l border-[var(--border)] bg-[var(--bg)] lg:flex lg:flex-col">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">单步回放</div>
          <div className="text-sm font-semibold">{selectedRun.trigger}</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {selectedRun.time} · {selectedRun.who}
          </div>
        </div>

        {/* 进度条 + 步骤高亮 */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex gap-0.5 h-3 rounded overflow-hidden bg-[var(--bg-hover)] mb-2">
            {Array.from({ length: 10 }).map((_, i) => {
              const isCompleted = i < step;
              const isCurrent = i === step;
              const isFailed = selectedRun.status === 'failed' && i === selectedRun.steps - 1;
              return (
                <div
                  key={i}
                  className={cn(
                    'flex-1 transition-all',
                    isFailed ? 'bg-[var(--danger)]' :
                    isCurrent ? 'bg-[var(--brand)] animate-pulse' :
                    isCompleted ? 'bg-[var(--success)]' : 'bg-[var(--bg-hover)]',
                  )}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-[var(--text-muted)] font-mono">
            <span>触发</span>
            <span>决策</span>
            <span>执行</span>
            <span>审计</span>
            <span>通知</span>
          </div>
          <div className="mt-2 text-center text-[11px]">
            当前步骤: <span className="font-mono font-semibold text-[var(--brand)]">{step} / {totalSteps}</span>
          </div>
        </div>

        {/* 步骤详情 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {Array.from({ length: 10 }).map((_, i) => {
            const isDone = i < step;
            const isCurrent = i === step;
            const stepName = ['Webhook 触发', 'Milvus 检索', 'Agent 决策', '等保 3 双签', '分支判定', 'Skill 执行', '回滚兜底', '审计日志', '通知发送', '审计结束'][i] ?? `步骤 ${i + 1}`;
            const isFailedStep = selectedRun.status === 'failed' && i === selectedRun.steps - 1;
            return (
              <div
                key={i}
                className={cn(
                  'rounded-md border p-2 transition-all',
                  isCurrent && 'border-[var(--brand)] bg-[var(--brand-light)] ring-2 ring-[var(--brand)]/20',
                  isDone && !isFailedStep && 'border-[var(--success)]/30 bg-[var(--success-bg)]',
                  isFailedStep && 'border-[var(--danger)]/30 bg-[var(--danger-bg)]',
                  !isDone && !isCurrent && 'border-[var(--border)] opacity-50',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold',
                      isDone && !isFailedStep && 'bg-[var(--success)] text-white',
                      isFailedStep && 'bg-[var(--danger)] text-white',
                      isCurrent && 'bg-[var(--brand)] text-white',
                      !isDone && !isCurrent && 'bg-[var(--bg-hover)] text-[var(--text-muted)]',
                    )}>
                      {isDone ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="text-[11px] font-semibold">{stepName}</span>
                  </div>
                  {isFailedStep && <Badge tone="error" className="text-[9px]">失败</Badge>}
                </div>
                {isCurrent && (
                  <div className="mt-1.5 text-[10px] text-[var(--text-muted)] pl-7">
                    {i === 3 ? '正在等待第 2 人签发…' : '执行中'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 控制按钮 */}
        <div className="border-t border-[var(--border)] p-3">
          <div className="grid grid-cols-5 gap-1">
            <button
              onClick={() => { setStep(0); setPlaying(false); }}
              className="grid h-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]"
              title="回到开始"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="grid h-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)] disabled:opacity-30 disabled:cursor-not-allowed"
              title="上一步"
            >
              <StepBack className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPlaying(!playing)}
              disabled={step >= totalSteps}
              className="grid h-9 place-items-center rounded-md bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
              title={playing ? '暂停' : '播放'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
              disabled={step >= totalSteps}
              className="grid h-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)] disabled:opacity-30 disabled:cursor-not-allowed"
              title="下一步"
            >
              <StepForward className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setStep(totalSteps); setPlaying(false); }}
              className="grid h-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]"
              title="跳到结束"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 text-center text-[10px] text-[var(--text-muted)] font-mono">
            ← → 单步播放 / 自动播放 800ms/步
          </div>
        </div>
      </div>

      <Drawer
        open={mobileReplayOpen}
        onClose={() => setMobileReplayOpen(false)}
        title="单步回放"
        description={`${selectedRun.trigger} · ${selectedRun.time} · ${selectedRun.who}`}
        width={360}
      >
        <div className="space-y-3 p-4">
          <div className="flex gap-0.5 h-3 rounded overflow-hidden bg-[var(--bg-hover)]">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'flex-1 transition-all',
                  selectedRun.status === 'failed' && i === selectedRun.steps - 1
                    ? 'bg-[var(--danger)]'
                    : i === step
                      ? 'bg-[var(--brand)] animate-pulse'
                      : i < step
                        ? 'bg-[var(--success)]'
                        : 'bg-[var(--bg-hover)]',
                )}
              />
            ))}
          </div>
          <div className="text-center text-xs">
            当前步骤: <span className="font-mono font-semibold text-[var(--brand)]">{step} / {totalSteps}</span>
          </div>
          <div className="space-y-2">
            {['Webhook 触发', 'Milvus 检索', 'Agent 决策', '等保 3 双签', '分支判定', 'Skill 执行', '回滚兜底', '审计日志', '通知发送', '审计结束'].map((name, i) => (
              <div
                key={name}
                className={cn(
                  'rounded-md border p-2 text-xs',
                  i === step && 'border-[var(--brand)] bg-[var(--brand-light)]',
                  i < step && 'border-[var(--success)]/30 bg-[var(--success-bg)]',
                  i > step && 'border-[var(--border)] opacity-50',
                )}
              >
                <span className="mr-2 font-mono text-[var(--text-muted)]">{i + 1}.</span>{name}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1 border-t border-[var(--border)] pt-3">
            <button onClick={() => { setStep(0); setPlaying(false); }} className="grid h-9 place-items-center rounded-md border border-[var(--border)]" title="回到开始"><SkipBack className="h-3.5 w-3.5" /></button>
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="grid h-9 place-items-center rounded-md border border-[var(--border)] disabled:opacity-30" title="上一步"><StepBack className="h-3.5 w-3.5" /></button>
            <button onClick={() => setPlaying(!playing)} disabled={step >= totalSteps} className="grid h-9 place-items-center rounded-md bg-[var(--brand)] text-white disabled:opacity-30" title={playing ? '暂停' : '播放'}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
            <button onClick={() => setStep((s) => Math.min(totalSteps, s + 1))} disabled={step >= totalSteps} className="grid h-9 place-items-center rounded-md border border-[var(--border)] disabled:opacity-30" title="下一步"><StepForward className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setStep(totalSteps); setPlaying(false); }} className="grid h-9 place-items-center rounded-md border border-[var(--border)]" title="跳到结束"><SkipForward className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

/* ============================================================= */
function Stat({ label, value, sub, tone, icon }: { label: string; value: any; sub?: string; tone?: 'primary' | 'success' | 'purple'; icon?: React.ReactNode }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'primary' ? 'text-[var(--brand)]' : tone === 'purple' ? 'text-[var(--purple)]' : 'text-[var(--text)]';
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <div>
        <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">{label}</div>
        <div className={cn('mt-0.5 text-lg font-bold font-mono', color)}>
          {value}<span className="ml-0.5 text-[10px] text-[var(--text-muted)] font-normal">{sub}</span>
        </div>
      </div>
      {icon}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: any; tone?: 'warn' }) {
  return (
    <div>
      <div className="text-[9px] text-[var(--text-muted)] uppercase">{label}</div>
      <div className={cn('text-[11px] font-mono font-semibold', tone === 'warn' ? 'text-amber-500' : 'text-[var(--text)]')}>{value}</div>
    </div>
  );
}
