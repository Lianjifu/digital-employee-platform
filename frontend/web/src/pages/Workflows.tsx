/**
 * P6 工作流（企业级优化版）
 *
 * 页面结构：页面头部、一级功能导航、单一主画布与按需抽屉。
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
  Eye, Bug, Webhook, Layers, Search, History, X, Trash2, GitCompare, MoreHorizontal, ChevronLeft,
  Edit3, Copy, Box, ArrowRight, GripVertical, RefreshCw,
  Undo2, Redo2, FileJson, MessageSquare, StepForward, StepBack, SkipForward, SkipBack, History as HistoryIcon,
} from 'lucide-react';
import type { KnowledgePackage, KnowledgeRetrievalProfile, Workflow, WorkflowNodeKind, WorkflowSkill } from '@de/web-types';
import { cn } from '@de/web-utils';
import { Drawer, ConfirmDialog } from '@/components/shared';
import { useApiMutation, useApiQuery } from '@/services/query';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useT } from '@/i18n';

type SidePanelKey = 'library' | 'debug' | 'properties';
type TabKey = 'canvas' | 'templates' | 'publishSkill' | 'history' | 'versions';

type GenerationResult = {
  id: string;
  prompt: string;
  status: 'generated' | 'review_required' | 'applied' | 'discarded' | 'expired';
  model: string;
  revisionId?: string;
  promptDigest?: string;
  policyVersion?: string;
  expiresAt?: string;
  createdAt: string;
  workflow: { nodes: Array<{ id: string; kind: WorkflowNodeKind; label: string; position: { x: number; y: number }; description?: string }>; edges: Array<{ id: string; source: string; target: string }> };
  checks: { structure: 'passed' | 'review'; dependencies: 'passed' | 'review'; risk: 'passed' | 'review' };
  dependencies: Array<{ type: 'tool' | 'mcp' | 'agent'; name: string; status: 'available' | 'missing'; reason?: string }>;
  risks: Array<{ level: 'L1' | 'L2' | 'L3'; node: string; text: string; requiresApproval: boolean }>;
  warnings: string[];
  qualityScore: number;
  requiresReview: boolean;
};

type GenerationVars = {
  prompt: string;
  constraints: { riskLevel: 'L1' | 'L2' | 'L3'; requireApproval: boolean; requireAudit: boolean; requireRollback: boolean };
  workspaceId: string;
  model: string;
};

type WorkflowValidation = {
  passed: boolean;
  checks: Record<string, 'passed' | 'review' | 'failed'>;
  warnings: string[];
};
type WorkflowRun = { id: string; time: string; trigger: string; status: string; duration: number; steps: number; who: string; error?: string };

/* ============ 节点元数据 ============ */
const NODE_ICONS: Record<WorkflowNodeKind, any> = {
  trigger: PlayCircle, schedule: Clock, event: Bell,
  retrieve: Database, transform: Wrench,
  decision: Cpu, condition: GitBranch, approval: ShieldCheck, policy: ShieldCheck,
  branch: GitBranch, parallel: GitBranch,
  execute: Wrench, http: Webhook, mcp: Cpu, task: FileText,
  retry: RefreshCw, compensate: RotateCcw, audit: FileText, notify: Bell,
};
const NODE_LABELS: Record<WorkflowNodeKind, string> = {
  trigger: 'Webhook 触发', schedule: '定时调度', event: '告警事件',
  retrieve: '知识检索', transform: '数据转换',
  decision: 'Agent 决策', condition: '条件判断', approval: '人工审批', policy: '风险策略',
  branch: '条件分支', parallel: '并行编排',
  execute: 'Skill 执行', http: 'HTTP / API', mcp: 'MCP 工具', task: '创建任务',
  retry: '重试策略', compensate: '补偿回滚', audit: '审计留痕', notify: '结果通知',
};
const NODE_COLORS: Record<WorkflowNodeKind, string> = {
  trigger: '#3b82f6', schedule: '#3b82f6', event: '#3b82f6',
  retrieve: '#10b981', transform: '#10b981',
  decision: '#8b5cf6', condition: '#8b5cf6', approval: '#f59e0b', policy: '#f59e0b',
  branch: '#06b6d4', parallel: '#06b6d4',
  execute: '#ef4444', http: '#ef4444', mcp: '#ef4444', task: '#ef4444',
  retry: '#f59e0b', compensate: '#f59e0b', audit: '#64748b', notify: '#38bdf8',
};
const NODE_DESCS: Record<WorkflowNodeKind, string> = {
  trigger: '接收外部系统 Webhook 请求', schedule: '按 Cron 或日历规则发起流程', event: '订阅监控告警或消息事件',
  retrieve: '查询知识库、运行手册与历史证据', transform: '映射、清洗并标准化上下文数据',
  decision: '由数字员工分析上下文并生成处置决策', condition: '基于表达式判断后续路径', approval: '按审批人、超时与签名规则复核', policy: '校验风险等级、权限和变更策略',
  branch: '按条件选择唯一处置路径', parallel: '并发执行多个独立步骤并汇聚',
  execute: '调用已纳管 Skill 完成处置动作', http: '调用企业内部或第三方 API', mcp: '调用受控 MCP 工具', task: '创建人工处置任务并回传结果',
  retry: '按退避策略自动重试可恢复失败', compensate: '执行补偿动作或回滚变更', audit: '写入可追溯的审计证据', notify: '通过飞书、企微、短信等通知结果',
};

type NodeLibraryCategory = 'trigger' | 'context' | 'decision' | 'action' | 'governance' | 'reliability';
type NodeRisk = 'standard' | 'review' | 'sensitive';

const NODE_LIBRARY_GROUPS: Array<{ id: NodeLibraryCategory; label: string; desc: string; kinds: WorkflowNodeKind[] }> = [
  { id: 'trigger', label: '触发与输入', desc: '定义数字员工何时开始工作', kinds: ['trigger', 'schedule', 'event'] },
  { id: 'context', label: '上下文与数据', desc: '补齐处置所需的证据与变量', kinds: ['retrieve', 'transform'] },
  { id: 'decision', label: '智能决策', desc: '由规则或 Agent 决定处置路径', kinds: ['decision', 'condition', 'branch', 'parallel'] },
  { id: 'action', label: '执行与协同', desc: '调用受控能力或派发人工工作', kinds: ['execute', 'http', 'mcp', 'task'] },
  { id: 'governance', label: '人工与治理', desc: '在关键动作前实施权限和审批控制', kinds: ['policy', 'approval', 'audit'] },
  { id: 'reliability', label: '可靠性与收尾', desc: '处理失败、补偿并通知相关人员', kinds: ['retry', 'compensate', 'notify'] },
];

const NODE_LIBRARY_META: Record<WorkflowNodeKind, { category: NodeLibraryCategory; risk: NodeRisk; badge?: string }> = {
  trigger: { category: 'trigger', risk: 'standard' }, schedule: { category: 'trigger', risk: 'standard' }, event: { category: 'trigger', risk: 'standard' },
  retrieve: { category: 'context', risk: 'standard' }, transform: { category: 'context', risk: 'standard' },
  decision: { category: 'decision', risk: 'review', badge: 'AI' }, condition: { category: 'decision', risk: 'standard' }, branch: { category: 'decision', risk: 'standard' }, parallel: { category: 'decision', risk: 'standard' },
  execute: { category: 'action', risk: 'sensitive', badge: '外部写入' }, http: { category: 'action', risk: 'sensitive', badge: '外部调用' }, mcp: { category: 'action', risk: 'sensitive', badge: '受控工具' }, task: { category: 'action', risk: 'review', badge: '人工协同' },
  policy: { category: 'governance', risk: 'review', badge: '策略' }, approval: { category: 'governance', risk: 'review', badge: '需审批' }, audit: { category: 'governance', risk: 'standard' },
  retry: { category: 'reliability', risk: 'review', badge: '失败处理' }, compensate: { category: 'reliability', risk: 'sensitive', badge: '回滚' }, notify: { category: 'reliability', risk: 'standard' },
};

const NODE_LIB = NODE_LIBRARY_GROUPS.flatMap((group) => group.kinds);

function recommendedNodeKinds(sourceKind?: WorkflowNodeKind): WorkflowNodeKind[] {
  if (!sourceKind) return ['trigger', 'event', 'schedule', 'retrieve', 'decision'];
  const category = NODE_LIBRARY_META[sourceKind].category;
  if (category === 'trigger') return ['retrieve', 'transform', 'decision', 'condition'];
  if (category === 'context') return ['decision', 'condition', 'branch', 'policy'];
  if (category === 'decision') return ['policy', 'approval', 'execute', 'http', 'mcp', 'task'];
  if (category === 'action') return ['audit', 'retry', 'compensate', 'notify'];
  if (category === 'governance') return ['execute', 'http', 'mcp', 'audit', 'notify'];
  return ['audit', 'notify', 'task', 'compensate'];
}

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
        'workflow-node relative rounded-md border-2 bg-[var(--surface-1)] px-3 py-2 min-w-[140px] text-center shadow-sm transition-all',
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
      <div className="workflow-node__kind text-[10px] uppercase tracking-wide opacity-70 mt-0.5">{data.kind}</div>
      <div className="workflow-node__label text-xs font-semibold text-[var(--text)]">{data.label || NODE_LABELS[data.kind as WorkflowNodeKind]}</div>
      {data.note && (
        <div className="mt-1 flex items-center justify-center gap-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/50 px-1 py-0.5">
          <MessageSquare className="h-2.5 w-2.5 text-amber-600 shrink-0" />
          <span className="workflow-node__note text-[9px] text-amber-700 dark:text-amber-300 truncate max-w-[110px]">{data.note}</span>
        </div>
      )}
      {isExecuting && (
        <span className="absolute -top-1.5 -right-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--brand)] text-[9px] font-bold text-white">●</span>
      )}
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

/* ============ Mock 模板 ============ */
const TEMPLATES = [
  { id: 't1', name: '故障自愈', version: 'v2.4', category: 'system', description: 'Redis/K8s 故障自动定位、受控处置、补偿回滚与证据留存', nodes: 10, installs: 1284, rating: 4.9, owner: 'SRE 平台组', verifiedAt: '2026-07-16', risk: 'L3', dependencies: ['redis-cli', 'kubernetes-mcp'], health: '需授权', successRate: '98.6%', sequence: ['event', 'retrieve', 'decision', 'policy', 'approval', 'execute', 'compensate', 'audit', 'notify'] as WorkflowNodeKind[] },
  { id: 't2', name: '灰度发布', version: 'v1.8', category: 'system', description: '金丝雀发布、指标验证、审批门禁与异常自动补偿', nodes: 8, installs: 962, rating: 4.8, owner: '交付工程组', verifiedAt: '2026-07-14', risk: 'L3', dependencies: ['release-skill', 'prometheus-mcp'], health: '健康', successRate: '97.9%', sequence: ['event', 'policy', 'approval', 'parallel', 'condition', 'execute', 'compensate', 'audit', 'notify'] as WorkflowNodeKind[] },
  { id: 't3', name: 'CVE 漏洞修复', version: 'v3.1', category: 'security', description: 'CVE 情报、影响面评估、人工复核、灰度修复与审计', nodes: 12, installs: 743, rating: 4.7, owner: '安全运营组', verifiedAt: '2026-07-12', risk: 'L3', dependencies: ['cve-kb', 'patch-skill'], health: '健康', successRate: '96.8%', sequence: ['event', 'retrieve', 'decision', 'policy', 'approval', 'task', 'execute', 'compensate', 'audit', 'notify'] as WorkflowNodeKind[] },
  { id: 't4', name: '容量预测', version: 'v1.6', category: 'ai', description: '历史趋势研判、扩容建议、人工确认与结果通知', nodes: 7, installs: 612, rating: 4.6, owner: '容量运营组', verifiedAt: '2026-07-10', risk: 'L2', dependencies: ['capacity-agent'], health: '健康', successRate: '95.4%', sequence: ['schedule', 'retrieve', 'decision', 'policy', 'task', 'audit', 'notify'] as WorkflowNodeKind[] },
  { id: 't5', name: '报告生成', version: 'v2.2', category: 'business', description: '数据汇总、LLM 摘要、人工校对与多渠道分发', nodes: 6, installs: 1502, rating: 4.9, owner: '运营效能组', verifiedAt: '2026-07-17', risk: 'L1', dependencies: ['report-agent'], health: '健康', successRate: '99.2%', sequence: ['schedule', 'retrieve', 'decision', 'transform', 'audit', 'notify'] as WorkflowNodeKind[] },
  { id: 't6', name: '工单分诊', version: 'v2.0', category: 'business', description: '工单分类、SLA 路由、人工接管与关闭通知', nodes: 9, installs: 884, rating: 4.7, owner: '服务运营组', verifiedAt: '2026-07-15', risk: 'L2', dependencies: ['ticket-mcp'], health: '健康', successRate: '98.1%', sequence: ['event', 'transform', 'decision', 'condition', 'task', 'retry', 'audit', 'notify'] as WorkflowNodeKind[] },
];

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

type Snapshot = { nodes: Node[]; edges: Edge[] };
type VersionSnapshot = Snapshot & { id: string; label: string; time: string; desc: string };

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
  };
}

function templateSnapshot(template: typeof TEMPLATES[number]): Snapshot {
  const sequence = template.sequence;
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
  const { t } = useT();
  const canWrite = useAuthStore((state) => state.hasPermission('workflow.write'));
  const canExecute = useAuthStore((state) => state.hasPermission('workflow.execute'));
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId ?? 'w1');
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
  const [versionDiffOpen, setVersionDiffOpen] = useState(false);
  const [versions, setVersions] = useState<VersionSnapshot[]>(() => VERSIONS.map((version) => ({
    ...version,
    nodes: cloneSnapshot({ nodes: INITIAL_NODES, edges: INITIAL_EDGES }).nodes,
    edges: cloneSnapshot({ nodes: INITIAL_NODES, edges: INITIAL_EDGES }).edges,
  })));

  // 模板预览
  const [previewTemplate, setPreviewTemplate] = useState<typeof TEMPLATES[number] | null>(null);

  // AI 工作流生成：结果始终先进入预览，不覆盖当前画布
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [generationStep, setGenerationStep] = useState<'input' | 'preview'>('input');
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [generationPrompt, setGenerationPrompt] = useState('当 Redis 触发 OOM 告警时自动处理，并通知负责人');
  const [generationConstraints, setGenerationConstraints] = useState<GenerationVars['constraints']>({ riskLevel: 'L2', requireApproval: true, requireAudit: true, requireRollback: true });
  const [generationModel, setGenerationModel] = useState('企业默认模型');
  const { data: generationHistory = [] } = useApiQuery<GenerationResult[]>(['workflow-generations'], '/api/workflows/generations');
  const { data: templateAssets = [] } = useApiQuery<typeof TEMPLATES>(['workflow-templates'], '/api/workflow-templates');
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightResult, setPreflightResult] = useState<WorkflowValidation | null>(null);
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const showToast = useCallback((msg: string, tone: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2200);
  }, []);

  const generateWorkflowApi = useApiMutation<GenerationResult, GenerationVars>('/api/workflows/generate', {
    onSuccess: (result) => {
      setGenerationResult(result);
      setGenerationStep('preview');
      showToast('已生成工作流草稿，请完成校验后应用', 'success');
    },
    onError: () => showToast('生成失败，请调整描述后重试', 'error'),
  });
  const discardGenerationApi = useApiMutation<GenerationResult, { id: string }>((vars) => `/api/workflows/generations/${vars.id}/discard`, {
    onSuccess: () => showToast('已放弃本次生成结果', 'info'),
  });
  const applyGenerationApi = useApiMutation<GenerationResult, { id: string }>(({ id }) => `/api/workflows/generations/${id}/apply`, {
    onError: () => showToast('生成草稿与审计未提交，当前画布未变更', 'error'),
  });
  const validateWorkflowApi = useApiMutation<WorkflowValidation, { revisionId?: string; nodes: unknown[]; edges: unknown[] }>('/api/workflows/wf1/validate', {
    onSuccess: (result) => { setPreflightResult(result); setPreflightOpen(true); },
    onError: () => showToast('运行前校验失败，请稍后重试', 'error'),
  });
  const runWorkflowApi = useApiMutation<WorkflowRun, Record<string, unknown>>('/api/workflows/wf1/run', {
    onSuccess: (run) => { setPreflightOpen(false); showToast(`已创建执行记录 ${run.id}`, 'success'); },
    onError: () => showToast('工作流执行请求失败', 'error'),
  });
  const saveWorkflowApi = useApiMutation<Workflow, { nodes: unknown[]; edges: unknown[]; version: string }>('/api/workflows/wf1/draft', {
    onError: () => showToast('服务端保存失败，本地草稿仍已保留', 'error'),
  });
  const publishWorkflowApi = useApiMutation<Workflow, { version: string }>('/api/workflows/wf1/publish', {
    onSuccess: () => { setVersionMenuOpen(false); showToast('已提交发布，等待发布治理流程', 'success'); },
    onError: () => showToast('发布提交失败，请先完成运行前校验', 'error'),
  });
  const releaseRequestApi = useApiMutation<unknown, { resourceType: 'workflow'; resourceName: string; risk: 'low' | 'medium' | 'high' }>('/api/release-approvals', {
    onSuccess: () => { setVersionMenuOpen(false); showToast('已提交生产发布申请，等待管理员审批', 'success'); },
    onError: () => showToast('发布申请提交失败，请稍后重试', 'error'),
  });
  const { data: workflowSkills = [], refetch: refetchWorkflowSkills } = useApiQuery<WorkflowSkill[]>(['workflow-skills'], '/api/workflow-skills');
  const publishAsSkillApi = useApiMutation<WorkflowSkill, { version: string; name: string; description: string }>('/api/workflows/wf1/publish-as-skill', {
    onSuccess: (skill) => { showToast(`已发布流程技能「${skill.name}」`, 'success'); refetchWorkflowSkills(); },
    onError: () => showToast('发布技能失败，请确认流程版本已校验', 'error'),
  });
  const [skillName, setSkillName] = useState('生产故障处置流程技能');
  const [skillDesc, setSkillDesc] = useState('由工作流程发布的标准作业能力，可供数字员工在能力装配中引用。');
  const requestProductionRelease = () => {
    if (isAdmin) publishWorkflowApi.mutate({ version: activeVersion });
    else releaseRequestApi.mutate({ resourceType: 'workflow', resourceName: `工作流 ${activeVersion}`, risk: 'medium' });
  };

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

  const availableTemplates = templateAssets.length > 0 ? templateAssets : TEMPLATES;
  const filteredTemplates = availableTemplates.filter((t) => filterGroup === 'all' || t.category === filterGroup);
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
    saveWorkflowApi.mutate({
      nodes: nodes.map((node) => ({ id: node.id, kind: node.data?.kind, label: node.data?.label, data: node.data, position: node.position })),
      edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      version: id,
    });
    showToast(`已保存 ${version?.label ?? id}（本地演示草稿）`, 'success');
  }, [activeVersion, canWrite, edges, nodes, saveWorkflowApi, showToast, versions]);

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
    if (!nodes.some((node) => ['trigger', 'schedule', 'event'].includes(node.data?.kind))) { showToast('工作流缺少触发节点，无法运行', 'error'); return; }
    const disconnected = nodes.filter((node) => nodes.length > 1 && !edges.some((edge) => edge.source === node.id || edge.target === node.id));
    if (disconnected.length) { showToast(`存在 ${disconnected.length} 个未连线节点，请先完成流程连接`, 'error'); return; }
    validateWorkflowApi.mutate({ revisionId: activeVersion.startsWith('rev_') ? activeVersion : undefined, nodes: nodes.map((node) => ({ id: node.id, kind: node.data?.kind, label: node.data?.label, data: node.data })), edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })) });
  }, [canExecute, edges, nodes, showToast, validateWorkflowApi]);

  const openAIGenerator = useCallback(() => {
    setGenerationStep('input');
    setGenerationResult(null);
    setAiGenerateOpen(true);
  }, []);
  const submitGeneration = useCallback(() => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    if (generationPrompt.trim().length < 8) { showToast('请至少描述 8 个字符的业务目标', 'error'); return; }
    generateWorkflowApi.mutate({ prompt: generationPrompt.trim(), constraints: generationConstraints, workspaceId: currentWorkspaceId, model: generationModel });
  }, [canWrite, currentWorkspaceId, generateWorkflowApi, generationConstraints, generationModel, generationPrompt, showToast]);
  const applyGeneration = useCallback(async () => {
    if (!canWrite || !generationResult) return;
    const activeSnapshot = versions.find((version) => version.id === activeVersion);
    const hasUnsavedChanges = !activeSnapshot || JSON.stringify({ nodes, edges }) !== JSON.stringify({ nodes: activeSnapshot.nodes, edges: activeSnapshot.edges });
    if (hasUnsavedChanges && !window.confirm('当前画布存在未保存修改。AI 流程将另存为新的草稿版本，是否继续？')) return;
    const applied = await applyGenerationApi.mutateAsync({ id: generationResult.id });
    if (!applied.revisionId) { showToast('服务端未返回草稿版本，未应用生成结果', 'error'); return; }
    const snapshot: Snapshot = {
      nodes: applied.workflow.nodes.map((node) => ({ id: node.id, type: 'custom', position: node.position, data: { kind: node.kind, label: node.label, desc: node.description } } as Node)),
      edges: applied.workflow.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    };
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setVersions((previous) => previous.some((version) => version.id === applied.revisionId) ? previous : [{ id: applied.revisionId!, label: `${applied.revisionId} · AI 草稿`, time: '刚刚', desc: `AI 生成 · ${applied.promptDigest ?? applied.id}`, nodes: cloneSnapshot(snapshot).nodes, edges: cloneSnapshot(snapshot).edges }, ...previous]);
    setActiveVersion(applied.revisionId);
    pushHistory(snapshot);
    setSelectedNodeId(snapshot.nodes[0]?.id ?? null);
    setTab('canvas');
    setSidePanel('properties');
    setAiGenerateOpen(false);
    showToast(`已创建隔离草稿 ${applied.revisionId}，请完成配置与校验后试运行`, 'success');
  }, [activeVersion, applyGenerationApi, canWrite, edges, generationResult, nodes, pushHistory, showToast, versions]);
  const discardGeneration = useCallback(() => {
    if (generationResult) discardGenerationApi.mutate({ id: generationResult.id });
    setAiGenerateOpen(false);
    setGenerationResult(null);
    setGenerationStep('input');
  }, [discardGenerationApi, generationResult]);
  const createTemplateDraft = useCallback((template: typeof TEMPLATES[number]) => {
    if (!canWrite) { showToast('当前账号没有工作流编辑权限', 'error'); return; }
    const snapshot = templateSnapshot(template);
    const currentSnapshot = versions.find((version) => version.id === activeVersion);
    const hasUnsavedChanges = !currentSnapshot || JSON.stringify({ nodes, edges }) !== JSON.stringify({ nodes: currentSnapshot.nodes, edges: currentSnapshot.edges });
    if (hasUnsavedChanges && !window.confirm('当前画布存在未保存修改。模板将创建为新的隔离草稿，是否继续？')) return;
    const revisionId = `tpl_${template.id}_${Date.now().toString(36)}`;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setVersions((previous) => [{ id: revisionId, label: `${template.version} · 模板草稿`, time: '刚刚', desc: `基于「${template.name}」· ${template.owner}`, nodes: cloneSnapshot(snapshot).nodes, edges: cloneSnapshot(snapshot).edges }, ...previous]);
    setActiveVersion(revisionId);
    pushHistory(snapshot);
    setSelectedNodeId(snapshot.nodes[0]?.id ?? null);
    setTab('canvas');
    setSidePanel('properties');
    showToast(`已基于「${template.name}」创建隔离草稿`, 'success');
  }, [activeVersion, canWrite, edges, nodes, pushHistory, showToast, versions]);
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
  const activeSnapshot = versions.find((version) => version.id === activeVersion);
  const isDirty = useMemo(() => {
    if (!activeSnapshot) return true;
    return JSON.stringify({ nodes, edges }) !== JSON.stringify({ nodes: activeSnapshot.nodes, edges: activeSnapshot.edges });
  }, [activeSnapshot, edges, nodes]);

  return (
    <div className="workflow-page flex h-full min-w-0 flex-col gap-3 overflow-hidden bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      {/* ======== 一级功能导航 ======== */}
      <div className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <div className="flex shrink-0 items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand-light)] text-[var(--brand)]">
                <GitBranch className="h-3.5 w-3.5" />
              </span>
              <div className="leading-tight">
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text)]">工作流编排</h2>
                <p className="mt-1 text-xs font-normal text-[var(--text-muted)]">搭建、治理并运行企业级自动化流程</p>
              </div>
            </div>
            {tab === 'canvas' ? (
              <>
                <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)]">
                  <Box className="h-3 w-3 text-[var(--text-muted)]" />画布结构
                  <span className="text-[var(--text-muted)]">{nodes.length} 节点 · {edges.length} 连线</span>
                </span>
                {isDirty && <Badge tone="warn" className="shrink-0 text-[9px]">草稿未保存</Badge>}
              </>
            ) : (
              <span className="truncate text-[10px] text-[var(--text-muted)]">
                {tab === 'templates' ? `模板库 · ${TEMPLATES.length} 套` : `执行历史 · ${RUNS.length} 条`}
              </span>
            )}
          </div>
          <div className="hidden">
            <button
              onClick={() => setVersionMenuOpen(!versionMenuOpen)}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] hover:border-[var(--brand)]"
            >
              <HistoryIcon className="h-3 w-3 text-[var(--text-muted)]" />
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">工作流版本管理</span>
              <span className="font-mono font-semibold">{versions.find((v) => v.id === activeVersion)?.label ?? activeVersion}</span>
              <ChevronRight className="h-3 w-3 rotate-90 text-[var(--text-muted)]" />
            </button>
            {versionMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVersionMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 max-w-[calc(100vw-24px)] min-w-[260px] rounded-md border border-[var(--border)] bg-[var(--surface-1)] py-1 shadow-xl">
                  <div className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    工作流版本管理 · 共 {versions.length} 版
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
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setVersionDiffOpen(true)}>
                      <GitCompare className="h-3 w-3" />差异
                    </Button>
                    <Button size="sm" variant="primary" className="flex-1" onClick={requestProductionRelease} loading={publishWorkflowApi.isPending || releaseRequestApi.isPending} disabled={!canWrite || isDirty}>
                      {isAdmin ? '发布' : '提交发布申请'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <nav className="mt-3 -mx-3 -mb-2 flex min-w-0 items-end overflow-x-auto px-3 md:-mx-6 md:px-6" aria-label="工作流视图">
          <div className="flex min-w-max items-center gap-1">
            {([
              { k: 'templates' as TabKey, labelKey: 'module.workflows.tabs.templates', icon: Layers },
              { k: 'canvas' as TabKey, labelKey: 'module.workflows.tabs.canvas', icon: GitBranch },
              { k: 'publishSkill' as TabKey, labelKey: 'module.workflows.tabs.publishSkill', icon: Sparkles },
              { k: 'history' as TabKey, labelKey: 'module.workflows.tabs.history', icon: History },
              { k: 'versions' as TabKey, labelKey: 'module.workflows.tabs.versions', icon: GitCompare },
            ]).map((v) => (
              <button
                key={v.k}
                type="button"
                onClick={() => setTab(v.k)}
                aria-current={tab === v.k ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[13px] transition-colors',
                  tab === v.k
                    ? 'z-10 -mb-px border border-[var(--border)] border-b-[var(--surface-1)] bg-[var(--surface-1)] font-semibold text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
                {t(v.labelKey)}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* ======== 主内容区 ======== */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
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
            saving={saveWorkflowApi.isPending}
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
            openAIGenerator={openAIGenerator}
            nodeLibraryOpen={nodeLibraryOpen}
            setNodeLibraryOpen={setNodeLibraryOpen}
            validating={validateWorkflowApi.isPending}
            versionMenuOpen={versionMenuOpen}
            setVersionMenuOpen={setVersionMenuOpen}
            versions={versions}
            activeVersion={activeVersion}
            loadSnapshot={loadSnapshot}
            setVersions={setVersions}
            setActiveVersion={setActiveVersion}
            setVersionDiffOpen={setVersionDiffOpen}
            publishVersion={requestProductionRelease}
            publishLabel={isAdmin ? '发布' : '提交发布申请'}
            publishing={publishWorkflowApi.isPending || releaseRequestApi.isPending}
            isDirty={isDirty}
          />
        )}

        {tab === 'templates' && (
          <TemplatesView
            filterGroup={filterGroup}
            setFilterGroup={setFilterGroup}
            filteredTemplates={filteredTemplates}
            showToast={showToast}
            onPreview={(t) => setPreviewTemplate(t)}
            onUseTemplate={createTemplateDraft}
          />
        )}

        {tab === 'history' && (
          <HistoryView showToast={showToast} />
        )}

        {tab === 'publishSkill' && (
          <div className="h-full overflow-y-auto p-5 space-y-4">
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5">
              <h2 className="text-sm font-semibold">发布技能</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">将已校验的流程版本发布为「流程技能」，写入技能中心供数字员工装配。未发布流程不可在专家协作中直接调用。</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-medium">技能名称<input value={skillName} onChange={(e) => setSkillName(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 text-xs outline-none focus:border-[var(--brand)]" /></label>
                <label className="grid gap-1.5 text-xs font-medium">来源版本<select value={activeVersion} onChange={(e) => setActiveVersion(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 text-xs outline-none focus:border-[var(--brand)]">{versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
                <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">说明<textarea value={skillDesc} onChange={(e) => setSkillDesc(e.target.value)} rows={3} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs outline-none focus:border-[var(--brand)]" /></label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!canWrite || !skillName.trim() || isDirty} loading={publishAsSkillApi.isPending} onClick={() => publishAsSkillApi.mutate({ version: activeVersion, name: skillName.trim(), description: skillDesc.trim() })}><Sparkles className="h-3.5 w-3.5" />发布为流程技能</Button>
                {isDirty && <span className="text-[11px] text-[var(--warning)]">请先保存画布草稿后再发布技能</span>}
                <Button size="sm" variant="ghost" onClick={() => setTab('canvas')}>返回流程编排</Button>
              </div>
            </section>
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
              <div className="border-b border-[var(--border)] px-5 py-4"><h3 className="text-sm font-semibold">本工作区已发布的流程技能</h3><p className="mt-1 text-xs text-[var(--text-muted)]">可在技能中心「流程技能」查看，并在数字员工能力装配中引用。</p></div>
              <div className="divide-y divide-[var(--border)]">
                {workflowSkills.length ? workflowSkills.map((skill) => (
                  <div key={skill.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0"><div className="text-sm font-medium">{skill.name}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">来源流程 {skill.sourceWorkflowId} · 版本 {skill.sourceVersionId} · {skill.description}</div></div>
                    <div className="flex items-center gap-2"><Badge tone={skill.status === 'published' ? 'success' : 'neutral'}>{skill.status === 'published' ? '已发布' : skill.status}</Badge><Badge tone={skill.riskLevel === 'high' ? 'error' : skill.riskLevel === 'mid' ? 'warn' : 'success'}>{skill.riskLevel === 'high' ? '高风险' : skill.riskLevel === 'mid' ? '中风险' : '低风险'}</Badge></div>
                  </div>
                )) : <div className="px-5 py-10 text-center text-xs text-[var(--text-muted)]">尚未发布流程技能</div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'versions' && (
          <div className="h-full overflow-y-auto p-5 space-y-3">
            <div className="mb-2"><h2 className="text-sm font-semibold">版本管理</h2><p className="mt-1 text-xs text-[var(--text-muted)]">版本快照仅影响画布草稿；发布到生产与发布技能是独立动作。</p></div>
            {versions.map((version) => (
              <button key={version.id} type="button" onClick={() => { loadSnapshot(version, version.id); setTab('canvas'); showToast(`已加载 ${version.label}`, 'info'); }} className={cn('flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]', version.id === activeVersion ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--bg)]')}>
                <span className="font-mono text-sm font-semibold text-[var(--brand)]">{version.label}</span>
                <span className="min-w-0 flex-1"><span className="block text-[11px] text-[var(--text-muted)]">{version.time}</span><span className="block truncate text-xs text-[var(--text-secondary)]">{version.desc}</span></span>
                {version.id === activeVersion && <Badge tone="success">当前</Badge>}
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setVersionDiffOpen(true)}><GitCompare className="h-3.5 w-3.5" />查看差异</Button>
              <Button size="sm" onClick={requestProductionRelease} loading={publishWorkflowApi.isPending || releaseRequestApi.isPending} disabled={!canWrite || isDirty}>{isAdmin ? '发布版本' : '提交发布申请'}</Button>
            </div>
          </div>
        )}
      </div>

      {/* 模板预览弹窗 — 用 wrapper 避免 hooks 顺序问题 */}
      {previewTemplate && (
        <TemplatePreviewModalInner
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          showToast={showToast}
          onUseTemplate={createTemplateDraft}
        />
      )}

      <Drawer
        open={preflightOpen}
        onClose={() => setPreflightOpen(false)}
        width={520}
        title="运行前检查"
        description="确认结构、权限和风险后，才会创建执行记录。"
        footer={(
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">执行后仍可在执行历史中追踪</span>
            <div className="flex gap-2"><Button variant="ghost" onClick={() => setPreflightOpen(false)}>取消</Button><Button variant="primary" onClick={() => runWorkflowApi.mutate({ workflowId: 'wf1', version: activeVersion })} loading={runWorkflowApi.isPending} disabled={!preflightResult?.passed}>{runWorkflowApi.isPending ? '创建中…' : '确认运行'}</Button></div>
          </div>
        )}
      >
        {preflightResult && (
          <div className="space-y-4">
            <div className={cn('rounded-lg border p-3 text-sm font-semibold', preflightResult.passed ? 'border-[var(--success)]/30 bg-[var(--success-bg)] text-[var(--success)]' : 'border-[var(--danger)]/30 bg-[var(--danger-bg)] text-[var(--danger)]')}>
              {preflightResult.passed ? '检查完成，可以运行' : '检查未通过，请修正阻断项'}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(preflightResult.checks).map(([key, status]) => <div key={key} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5"><span className="text-xs text-[var(--text-secondary)]">{({ structure: '结构', connections: '连线', dependencies: '依赖', permissions: '权限', risk: '风险', approval: '审批', audit: '审计', rollback: '回滚' } as Record<string, string>)[key] ?? key}</span><Badge tone={status === 'passed' ? 'success' : status === 'failed' ? 'error' : 'warn'}>{status === 'passed' ? '通过' : status === 'failed' ? '阻断' : '需复核'}</Badge></div>)}
            </div>
            {preflightResult.warnings.length > 0 && <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-3 text-xs leading-5 text-[var(--text-secondary)]"><div className="mb-1 font-semibold text-[var(--warning)]">复核提示</div>{preflightResult.warnings.map((warning) => <div key={warning}>• {warning}</div>)}</div>}
          </div>
        )}
      </Drawer>

      <Drawer
        open={versionDiffOpen}
        onClose={() => setVersionDiffOpen(false)}
        width={480}
        title="版本差异"
        description={`${activeVersion} · 当前未保存修改将不会计入发布版本`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-[11px] text-[var(--text-muted)]">当前节点</div><div className="mt-1 text-xl font-semibold">{nodes.length}</div></div><div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-[11px] text-[var(--text-muted)]">当前连线</div><div className="mt-1 text-xl font-semibold">{edges.length}</div></div></div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="mb-2 text-xs font-semibold">当前草稿内容</div><div className="space-y-2 text-xs text-[var(--text-secondary)]">{nodes.map((node) => <div key={node.id} className="flex items-center justify-between"><span>{node.data?.label ?? node.id}</span><span className="font-mono text-[10px] text-[var(--text-muted)]">{node.data?.kind}</span></div>)}</div></div>
          <div className="rounded-lg bg-[var(--info-bg)] px-3 py-2 text-[11px] leading-5 text-[var(--info)]">发布前请确认依赖、权限、审批、审计和回滚检查均已通过。</div>
        </div>
      </Drawer>

      <WorkflowAIGeneratorDrawer
        open={aiGenerateOpen}
        step={generationStep}
        result={generationResult}
        history={generationHistory}
        prompt={generationPrompt}
        setPrompt={setGenerationPrompt}
        constraints={generationConstraints}
        setConstraints={setGenerationConstraints}
        model={generationModel}
        setModel={setGenerationModel}
        loading={generateWorkflowApi.isPending}
        onGenerate={submitGeneration}
        onApply={applyGeneration}
        onDiscard={discardGeneration}
        onRegenerate={() => { setGenerationStep('input'); setGenerationResult(null); }}
        onSelectHistory={(item) => { setGenerationResult(item); setGenerationStep('preview'); }}
        onClose={() => setAiGenerateOpen(false)}
      />

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

function WorkflowAIGeneratorDrawer({
  open, step, result, history, prompt, setPrompt, constraints, setConstraints, model, setModel,
  loading, onGenerate, onApply, onDiscard, onRegenerate, onSelectHistory, onClose,
}: {
  open: boolean;
  step: 'input' | 'preview';
  result: GenerationResult | null;
  history: GenerationResult[];
  prompt: string;
  setPrompt: (value: string) => void;
  constraints: GenerationVars['constraints'];
  setConstraints: (value: GenerationVars['constraints']) => void;
  model: string;
  setModel: (value: string) => void;
  loading: boolean;
  onGenerate: () => void;
  onApply: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
  onSelectHistory: (item: GenerationResult) => void;
  onClose: () => void;
}) {
  const toggle = (key: keyof GenerationVars['constraints']) => setConstraints({ ...constraints, [key]: !constraints[key] });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      title="AI 生成工作流"
      description="将自然语言需求转换为可编辑草稿，生成结果不会自动执行或发布。"
      footer={step === 'input' ? (
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">需人工确认结构、权限与风险</span>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button><Button variant="primary" onClick={onGenerate} loading={loading}>{loading ? '生成中…' : '生成草稿'}</Button></div>
        </div>
      ) : (
        <div className="flex w-full justify-end gap-2"><Button variant="ghost" onClick={onDiscard}>放弃</Button><Button variant="outline" onClick={onRegenerate}>重新生成</Button><Button variant="primary" onClick={onApply} disabled={!result || !['generated', 'review_required'].includes(result.status)}>创建隔离草稿</Button></div>
      )}
    >
      {step === 'input' ? (
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text)]">业务目标</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="例如：当生产 Redis 触发 OOM 告警时，检索 Runbook，经过双签后执行恢复，并写入审计和通知负责人" className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5 text-sm leading-6 text-[var(--text)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]" />
            <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]"><span>描述触发条件、处置动作、审批和通知</span><span>{prompt.length}/1000</span></div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-xs font-semibold text-[var(--text)]">生成约束</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--text-secondary)]">风险等级<select value={constraints.riskLevel} onChange={(e) => setConstraints({ ...constraints, riskLevel: e.target.value as GenerationVars['constraints']['riskLevel'] })} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"><option value="L1">L1 · 低风险</option><option value="L2">L2 · 受控操作</option><option value="L3">L3 · 高风险</option></select></label>
              <label className="text-xs text-[var(--text-secondary)]">生成模型<select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"><option>企业默认模型</option><option>Qwen-Enterprise</option></select></label>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {([['requireApproval', '优先需要审批'], ['requireRollback', '支持回滚']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => toggle(key)} className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors', constraints[key] ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]')}><span className={cn('grid h-4 w-4 place-items-center rounded border text-[10px]', constraints[key] ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--border)]')}>{constraints[key] ? '✓' : ''}</span>{label}</button>)}
              <div className="flex items-center gap-2 rounded-md border border-[var(--success)]/30 bg-[var(--success-bg)] px-3 py-2 text-xs text-[var(--success)]"><ShieldCheck className="h-4 w-4" />审计留痕（策略强制）</div>
            </div>
          </div>
          {history.length > 0 && <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-[var(--text)]">最近生成</span><span className="text-[10px] text-[var(--text-muted)]">仅保留本地演示记录</span></div><div className="space-y-1.5">{history.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => onSelectHistory(item)} className="flex w-full items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-left hover:bg-[var(--bg-hover)]"><span className="truncate pr-3 text-xs text-[var(--text-secondary)]">{item.prompt}</span><Badge tone={item.qualityScore >= 85 ? 'success' : 'warn'} className="shrink-0 text-[10px]">{item.qualityScore} 分</Badge></button>)}</div></div>}
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[var(--text)]">生成草稿预览</div><div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{result.prompt}</div></div><div className="text-right"><div className="text-2xl font-semibold text-[var(--brand)]">{result.qualityScore}</div><div className="text-[10px] text-[var(--text-muted)]">质量评分</div></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-md bg-[var(--bg-elevated)] px-2 py-2"><div className="text-base font-semibold">{result.workflow.nodes.length}</div><div className="text-[10px] text-[var(--text-muted)]">节点</div></div><div className="rounded-md bg-[var(--bg-elevated)] px-2 py-2"><div className="text-base font-semibold">{result.workflow.edges.length}</div><div className="text-[10px] text-[var(--text-muted)]">连线</div></div><div className="rounded-md bg-[var(--bg-elevated)] px-2 py-2"><div className="text-base font-semibold">{result.dependencies.length}</div><div className="text-[10px] text-[var(--text-muted)]">依赖</div></div></div></div>
          <div className="grid gap-2 sm:grid-cols-3">{([['structure', '结构校验'], ['dependencies', '依赖检查'], ['risk', '风险扫描']] as const).map(([key, label]) => <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-[11px] text-[var(--text-muted)]">{label}</div><div className={cn('mt-1 text-xs font-semibold', result.checks[key] === 'passed' ? 'text-[var(--success)]' : 'text-[var(--warning)]')}>{result.checks[key] === 'passed' ? '通过' : '需要复核'}</div></div>)}</div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="mb-3 text-xs font-semibold text-[var(--text)]">工具与 MCP 依赖</div><div className="space-y-2">{result.dependencies.map((dep) => <div key={`${dep.type}-${dep.name}`} className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-secondary)]">{dep.name}<span className="ml-2 text-[10px] text-[var(--text-muted)]">{dep.type.toUpperCase()}</span></span><Badge tone={dep.status === 'available' ? 'success' : 'warn'} className="text-[10px]">{dep.status === 'available' ? '可用' : '缺失权限'}</Badge></div>)}</div></div>
          {result.risks.length > 0 && <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--warning)]"><AlertTriangle className="h-3.5 w-3.5" />风险与权限提示</div>{result.risks.map((risk) => <div key={risk.node} className="text-xs leading-5 text-[var(--text-secondary)]">{risk.level} · {risk.text}</div>)}</div>}
          {result.warnings.length > 0 && <div><div className="mb-2 text-xs font-semibold text-[var(--text)]">生成建议</div><ul className="space-y-1 text-xs leading-5 text-[var(--text-muted)]">{result.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div>}
          <div className="flex items-center gap-2 rounded-md bg-[var(--info-bg)] px-3 py-2 text-[11px] text-[var(--info)]"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />应用后仍需人工配置节点、保存版本并通过发布审批。</div>
        </div>
      ) : null}
    </Drawer>
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
  saving: boolean;
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
  openAIGenerator: () => void;
  nodeLibraryOpen: boolean;
  setNodeLibraryOpen: (open: boolean) => void;
  validating: boolean;
  versionMenuOpen: boolean;
  setVersionMenuOpen: (open: boolean) => void;
  versions: VersionSnapshot[];
  activeVersion: string;
  loadSnapshot: (snapshot: Snapshot, versionId: string) => void;
  setVersions: React.Dispatch<React.SetStateAction<VersionSnapshot[]>>;
  setActiveVersion: (version: string) => void;
  setVersionDiffOpen: (open: boolean) => void;
  publishVersion: () => void;
  publishLabel: string;
  publishing: boolean;
  isDirty: boolean;
}) {
  const {
    wrapperRef, rfNodes, rfEdges, onNodeClick, onNodeContextMenu, onNodesChange,
    handleDragOver, handleDrop, sidePanel, setSidePanel,
    librarySearchQ, setLibrarySearchQ, canvasSearchQ, setCanvasSearchQ, searchMatch, focusNode,
    filteredLibrary, setDraggedKind,
    selectedNode, selectedNodeId, nodes, webhookEnabled, setWebhookEnabled,
    saveCanvas, saving, runWorkflow, resetCanvas, clearCanvas,
    addNode, deleteNode, duplicateNode, disableNode, updateNodeLabel, updateNodeDescription, updateNodeNote, showToast,
    onConnect, deleteEdge, undo, redo, canUndo, canRedo, exportWorkflow, reactFlowRef, canWrite, canExecute, openAIGenerator, nodeLibraryOpen, setNodeLibraryOpen, validating,
    versionMenuOpen, setVersionMenuOpen, versions, activeVersion, loadSnapshot, setVersions, setActiveVersion, setVersionDiffOpen, publishVersion, publishLabel, publishing, isDirty,
  } = props;

  const [mobilePanelOpen, setMobilePanelOpen] = useState<SidePanelKey | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [libraryView, setLibraryView] = useState<'recommended' | 'all'>('recommended');
  const [nodeInspectorTab, setNodeInspectorTab] = useState<'overview' | 'config' | 'debug'>('config');
  const selectedLibraryKind = selectedNode?.data?.kind as WorkflowNodeKind | undefined;
  const recommendedLibrary = useMemo(
    () => recommendedNodeKinds(selectedLibraryKind).filter((kind) => filteredLibrary.includes(kind)),
    [filteredLibrary, selectedLibraryKind],
  );
  const visibleLibrary = libraryView === 'recommended' ? recommendedLibrary : filteredLibrary;
  const visibleLibraryGroups = NODE_LIBRARY_GROUPS
    .map((group) => ({ ...group, kinds: group.kinds.filter((kind) => visibleLibrary.includes(kind)) }))
    .filter((group) => group.kinds.length > 0);
  const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
    onNodeClick(event, node);
    setNodeInspectorTab('config');
    setMobilePanelOpen('properties');
  }, [onNodeClick]);

  const actionToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5 md:px-5">
      {/* 画布专属操作：先确定版本，再选择构建方式。 */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <Button size="sm" variant="outline" className="rounded-lg border-transparent bg-[var(--brand-light)] px-2.5 text-[var(--brand)] shadow-none hover:border-transparent hover:bg-[var(--brand-light)]" onClick={() => setVersionMenuOpen(true)} aria-label="切换或管理当前画布版本">
          <HistoryIcon className="h-3.5 w-3.5" />
          <span className="font-mono">{versions.find((version) => version.id === activeVersion)?.label ?? activeVersion}</span>
          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
        </Button>
        <div className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden="true" />
        <Button size="sm" variant="ghost" className="rounded-lg px-2.5 text-[var(--text-secondary)]" onClick={() => setNodeLibraryOpen(!nodeLibraryOpen)} aria-expanded={nodeLibraryOpen}>
          <Box className="h-3.5 w-3.5" />{nodeLibraryOpen ? '收起节点库' : '节点库'}
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg px-2.5 text-[var(--brand)] hover:bg-[var(--brand-light)] hover:text-[var(--brand)]" onClick={openAIGenerator} disabled={!canWrite}>
          <Sparkles className="h-3.5 w-3.5" />AI 生成
        </Button>
      </div>

      {/* 提交与验证紧邻，明确“保存后再试运行”的操作路径。 */}
      <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
        <Button size="sm" variant={isDirty ? 'primary' : 'secondary'} className="rounded-lg px-3.5" onClick={saveCanvas} loading={saving} disabled={!canWrite || saving || !isDirty}>
          <Save className="h-3.5 w-3.5" />{isDirty ? '保存草稿' : '已保存'}
        </Button>
        <Button size="sm" variant="secondary" className="rounded-lg px-3.5" onClick={runWorkflow} disabled={!canExecute || validating || isDirty} loading={validating} title={isDirty ? '请先保存草稿后再运行试验' : undefined}>
          <Play className="h-3.5 w-3.5" />运行试验
        </Button>
        <div className="relative">
          <Button size="sm" variant="ghost" className="rounded-lg px-2.5 text-[var(--text-secondary)]" onClick={() => setMoreMenuOpen((open) => !open)} aria-expanded={moreMenuOpen}><MoreHorizontal className="h-3.5 w-3.5" />更多</Button>
          {moreMenuOpen && <><div className="fixed inset-0 z-30" onClick={() => setMoreMenuOpen(false)} /><div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1.5 shadow-lg"><button type="button" onClick={() => { exportWorkflow(); setMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"><FileJson className="h-3.5 w-3.5" />导出工作流</button><button type="button" onClick={() => { resetCanvas(); setMoreMenuOpen(false); }} disabled={!canWrite} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" />重置画布</button><div className="my-1 border-t border-[var(--border)]" /><button type="button" onClick={() => { clearCanvas(); setMoreMenuOpen(false); }} disabled={!canWrite} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)] disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />清空画布</button></div></>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {actionToolbar}
      <Drawer open={versionMenuOpen} onClose={() => setVersionMenuOpen(false)} width={520} title="工作流版本管理" description={`当前版本 ${activeVersion} · 版本切换仅影响画布草稿`} footer={<div className="flex w-full gap-2"><Button size="sm" variant="outline" className="flex-1" onClick={() => setVersionDiffOpen(true)}>查看差异</Button><Button size="sm" variant="primary" className="flex-1" onClick={publishVersion} loading={publishing} disabled={!canWrite || isDirty}>{publishLabel}</Button></div>}>
        <div className="space-y-2">{versions.map((version) => <button key={version.id} type="button" onClick={() => { loadSnapshot(version, version.id); setVersionMenuOpen(false); showToast(`已加载 ${version.label}（本地快照）`, 'info'); }} className={cn('flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]', version.id === activeVersion ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--surface-1)]')}><span className="font-mono text-sm font-semibold text-[var(--brand)]">{version.label}</span><span className="min-w-0 flex-1"><span className="block text-[11px] text-[var(--text-muted)]">{version.time}</span><span className="block truncate text-xs text-[var(--text-secondary)]">{version.desc}</span></span>{version.id === activeVersion && <Badge tone="success">当前</Badge>}</button>)}</div>
        <div className="mt-4 grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => { const current = versions.find((version) => version.id === activeVersion); if (current) loadSnapshot(current, current.id); setVersionMenuOpen(false); showToast('已回滚到当前版本', 'info'); }} disabled={!canWrite}><RotateCcw className="h-3 w-3" />回滚当前</Button><Button size="sm" variant="secondary" onClick={() => { const nextId = `v${versions.length + 1}`; setVersions((prev) => [...prev, { id: nextId, label: `${nextId} · 草稿`, time: '刚刚', desc: '从当前画布另存的本地快照', nodes: cloneSnapshot({ nodes: props.nodes as Node[], edges: props.rfEdges }).nodes, edges: cloneSnapshot({ nodes: props.nodes as Node[], edges: props.rfEdges }).edges }]); setActiveVersion(nextId); setVersionMenuOpen(false); showToast(`已另存为 ${nextId}`, 'success'); }} disabled={!canWrite}><Save className="h-3 w-3" />另存版本</Button></div>
      </Drawer>
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

        {/* 画布上下文 + 快捷工具 */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 flex-wrap">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--info-bg)] px-2 py-1 text-[10px] font-medium text-[var(--info)]"><Webhook className="h-3.5 w-3.5 shrink-0" /><span className="font-mono">POST</span></span>
            <span className="max-w-[220px] truncate font-mono text-[11px] font-medium text-[var(--text-secondary)]">/webhook/redis-oom</span>
            <button
              type="button"
              onClick={() => setWebhookEnabled(!webhookEnabled)}
              aria-pressed={webhookEnabled}
              aria-label={webhookEnabled ? '停用 Webhook 触发器' : '启用 Webhook 触发器'}
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
            <span className={cn('text-[10px] font-medium shrink-0', webhookEnabled ? 'text-[var(--success)]' : 'text-[var(--text-muted)]')}>{webhookEnabled ? '触发已启用' : '触发已停用'}</span>
            <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />
            <span className="hidden text-[10px] text-[var(--text-muted)] sm:inline">{rfNodes.length} 节点 · {rfEdges.length} 连线</span>
            {isDirty && <Badge tone="warn" className="text-[9px]">草稿待保存</Badge>}
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
          {nodeLibraryOpen && (
            <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-24px)] w-[318px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]/95 shadow-xl backdrop-blur">
              <div className="border-b border-[var(--border)] p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--brand-light)] text-[var(--brand)]"><Box className="h-3.5 w-3.5" /></span>
                  节点库
                  <span className="ml-auto text-[10px] font-normal text-[var(--text-muted)]">点击或拖拽添加</span>
                </div>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input value={librarySearchQ} onChange={(event) => setLibrarySearchQ(event.target.value)} placeholder="搜索节点、能力或系统" className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] pl-8 pr-2 text-[11px] outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]" />
                </div>
                <div className="mt-2 flex items-center gap-1 rounded-lg bg-[var(--bg-elevated)] p-1">
                  {(['recommended', 'all'] as const).map((view) => <button key={view} type="button" onClick={() => setLibraryView(view)} className={cn('flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors', libraryView === view ? 'bg-[var(--surface-1)] text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>{view === 'recommended' ? '推荐下一步' : '全部节点'}</button>)}
                </div>
                {libraryView === 'recommended' && <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">{selectedLibraryKind ? `基于「${NODE_LABELS[selectedLibraryKind]}」推荐可接入节点` : '从触发器或常用能力开始搭建流程'}</p>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {visibleLibraryGroups.length > 0 ? <div className="space-y-3">{visibleLibraryGroups.map((group) => <section key={group.id}><div className="mb-1.5 flex items-center gap-2 px-0.5"><span className="text-[10px] font-semibold text-[var(--text-secondary)]">{group.label}</span><span className="truncate text-[9px] text-[var(--text-muted)]">{group.desc}</span></div><div className="grid grid-cols-2 gap-1.5">{group.kinds.map((kind) => {
                  const Icon = NODE_ICONS[kind];
                  const color = NODE_COLORS[kind];
                  const meta = NODE_LIBRARY_META[kind];
                  return <button key={kind} draggable onDragStart={(event) => { event.dataTransfer.setData('application/wf-node', kind); event.dataTransfer.effectAllowed = 'move'; setDraggedKind(kind); }} onDragEnd={() => setDraggedKind(null)} onClick={() => addNode(kind)} className="group flex min-w-0 cursor-grab flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2 text-left transition-all hover:-translate-y-px hover:border-[var(--brand)] hover:shadow-sm active:cursor-grabbing" title={`${NODE_DESCS[kind]} · 拖拽到画布添加`}><span className="flex items-center gap-1.5"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ backgroundColor: `${color}1a`, color }}><Icon className="h-3.5 w-3.5" /></span><span className="truncate text-[10px] font-semibold text-[var(--text)]">{NODE_LABELS[kind]}</span></span><span className="line-clamp-2 min-h-[26px] text-[9px] leading-[13px] text-[var(--text-muted)]">{NODE_DESCS[kind]}</span>{meta.badge && <span className={cn('w-fit rounded px-1.5 py-0.5 text-[8px] font-medium', meta.risk === 'sensitive' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : meta.risk === 'review' ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]')}>{meta.badge}</span>}</button>;
                })}</div></section>)}</div> : <div className="grid min-h-28 place-items-center px-5 text-center text-[11px] text-[var(--text-muted)]">未找到匹配节点，请调整搜索条件。</div>}
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

          {/* 画布运行观察 */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]/95 px-2.5 py-1.5 text-[10px] text-[var(--text-muted)] shadow-[0_2px_8px_rgba(15,23,42,0.06)] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse" />
            <span>运行观察</span><span className="h-3 w-px bg-[var(--border)]" /><span className="font-mono font-semibold text-[var(--text-secondary)]">n4 双签审批</span><span className="text-[var(--success)]">执行中</span>
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
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{kind === 'approval' ? '请设置审批组、签名人数和审批超时；任何写操作均应保留回滚分支。' : ['execute', 'http', 'mcp'].includes(kind) ? '请确认调用目标、凭据权限、参数与重试策略；高风险动作建议先串联风险策略或双签审批。' : kind === 'policy' ? '请配置风险等级、允许动作与越权处理方式；策略命中结果会写入运行审计。' : ['retry', 'compensate'].includes(kind) ? '请明确可重试错误、退避次数或补偿动作，避免失败后重复写入或产生不可逆变更。' : ['branch', 'condition', 'parallel'].includes(kind) ? '请配置判断表达式、出口与汇聚规则，确保默认路径和异常路径都可以追溯。' : '在“配置”页更新节点名称、描述与运行批注；变更后需点击应用修改。'}</p>
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
  const [knowledgePackageId, setKnowledgePackageId] = useState('');
  const [noResultPolicy, setNoResultPolicy] = useState<'clarify' | 'handoff' | 'block'>('block');
  const { data: knowledgePackages = [] } = useApiQuery<KnowledgePackage[]>(['workflow-properties', 'knowledge-packages'], '/api/knowledge/packages');
  const { data: retrievalProfiles = [] } = useApiQuery<KnowledgeRetrievalProfile[]>(['workflow-properties', 'retrieval-profiles'], '/api/knowledge/retrieval-profiles');
  const bindKnowledgeMutation = useApiMutation<any, { packageId: string; consumerType: 'workflow'; consumerId: string; consumerName: string; environment: 'production'; profileId: string; noResultPolicy: 'clarify' | 'handoff' | 'block' }>('/api/knowledge/bindings', { onSuccess: (binding) => showToast(`已绑定 ${binding.packageName} ${binding.packageVersion}`, 'success') });

  useEffect(() => {
    setLabel(selectedNode?.data?.label ?? '');
    setDesc(selectedNode?.data?.desc ?? '');
    setNote(selectedNode?.data?.note ?? '');
    setKnowledgePackageId('');
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
  const nodeMeta = NODE_LIBRARY_META[kind];
  const requiresReview = nodeMeta.risk === 'review' || nodeMeta.risk === 'sensitive';

  const apply = () => {
    updateNodeLabel(selectedNode.id, label);
    updateNodeDescription(selectedNode.id, desc);
    updateNodeNote(selectedNode.id, note);
    showToast(`节点 ${selectedNode.id} 属性已更新`, 'success');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-2">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium" style={{ backgroundColor: `${color}1a`, color }}>{kind}</span>{nodeMeta.badge && <span className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">{nodeMeta.badge}</span>}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--text)]">{selectedNode.data?.label || NODE_LABELS[kind]}</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-muted)]">{selectedNode.data?.desc || NODE_DESCS[kind]}</p>
      </section>

      {requiresReview && <section className={cn('rounded-xl border p-3 text-[11px]', nodeMeta.risk === 'sensitive' ? 'border-[var(--warning)]/30 bg-[var(--warning-bg)]' : 'border-[var(--info)]/25 bg-[var(--info-bg)]')}><div className={cn('flex items-center gap-1.5 font-semibold', nodeMeta.risk === 'sensitive' ? 'text-[var(--warning)]' : 'text-[var(--info)]')}><ShieldCheck className="h-3.5 w-3.5" />{nodeMeta.risk === 'sensitive' ? '受控执行节点' : '需要治理复核'}</div><p className="mt-1.5 leading-5 text-[var(--text-secondary)]">{nodeMeta.risk === 'sensitive' ? '请确认目标系统、调用权限与补偿策略；运行前应串联审批或风险策略。' : '请确认策略、审批人或失败路径配置，变更将写入工作流审计。'}</p></section>}

      {kind === 'retrieve' && <section className="space-y-3 rounded-xl border border-[var(--brand)]/25 bg-[var(--brand-light)]/35 p-4"><div><div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]"><Database className="h-3.5 w-3.5 text-[var(--brand)]" />知识包引用</div><p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">仅可引用知识库中心已发布的版本；运行记录将保留证据与版本。</p></div><Field label="已发布知识包"><select value={knowledgePackageId} onChange={(event) => setKnowledgePackageId(event.target.value)} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 text-[12px]"><option value="">请选择知识包</option>{knowledgePackages.filter((item) => item.status === 'published' && item.currentVersion.status === 'published').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currentVersion.version}</option>)}</select></Field><Field label="无结果策略"><select value={noResultPolicy} onChange={(event) => setNoResultPolicy(event.target.value as typeof noResultPolicy)} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 text-[12px]"><option value="block">阻断后续执行</option><option value="handoff">转人工接管</option><option value="clarify">请求补充信息</option></select></Field><Button size="sm" className="w-full" disabled={!knowledgePackageId || bindKnowledgeMutation.isPending} onClick={() => { const profile = retrievalProfiles.find((item) => item.packageId === knowledgePackageId); if (!profile) { showToast('该知识包尚未配置检索策略', 'error'); return; } bindKnowledgeMutation.mutate({ packageId: knowledgePackageId, consumerType: 'workflow', consumerId: 'wf1', consumerName: `工作流节点 ${selectedNode.id}`, environment: 'production', profileId: profile.id, noResultPolicy }); }}><ShieldCheck className="h-3.5 w-3.5" />{bindKnowledgeMutation.isPending ? '绑定中…' : '绑定并锁定当前版本'}</Button></section>}

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="text-xs font-semibold text-[var(--text)]">基础配置</div>
      <Field label="节点标识">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
          {selectedNode.id}
        </div>
      </Field>

      <Field label="显示名称">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 text-[12px] outline-none transition-[border-color,box-shadow] focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"
        />
      </Field>

      <Field label="描述">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[12px] outline-none transition-[border-color,box-shadow] focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"
        />
      </Field>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="text-xs font-semibold text-[var(--text)]">运行说明</div>
      <Field label="运维批注">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="如：高峰期需手确认、双签必须 5 分钟内…"
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[12px] outline-none transition-[border-color,box-shadow] focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"
        />
        <div className="mt-1 text-[9px] text-[var(--text-muted)] flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          执行人与审计人员可在节点上下文中查看此批注
        </div>
      </Field>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-xs font-semibold text-[var(--text)]">画布上下文</div>
      <Field label="画布位置">
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[var(--text-secondary)]">
            x: {Math.round(selectedNode.position.x)}
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[var(--text-secondary)]">
            y: {Math.round(selectedNode.position.y)}
          </div>
        </div>
      </Field>

      <Field label="运行状态">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px]">
          {selectedNode.data?.disabled
            ? <span className="text-[var(--danger)]">已禁用 · 运行时将跳过此节点</span>
            : <span className="text-[var(--success)]">已启用 · 将按编排路径执行</span>}
        </div>
      </Field>
      </section>

      <div className="sticky bottom-0 -mx-1 border-t border-[var(--border)] bg-[var(--surface-1)] px-1 pt-3">
      <Button className="w-full rounded-lg" onClick={apply}>
        <Save className="h-3.5 w-3.5" />应用修改
      </Button>
      </div>
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
 *  工作流模版库
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
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'healthy' | 'review'>('all');
  const [page, setPage] = useState(1);
  const visibleTemplates = filteredTemplates.filter((template) => {
    const matchesQuery = !query.trim() || `${template.name} ${template.description} ${template.owner} ${template.dependencies.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesScope = scope === 'all' || (scope === 'healthy' ? template.health === '健康' : template.risk !== 'L1' || template.health !== '健康');
    return matchesQuery && matchesScope;
  });
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(visibleTemplates.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedTemplates = visibleTemplates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, scope, filteredTemplates]);

  return (
    <div className="workflow-template-page h-full overflow-y-auto bg-[var(--bg-elevated)] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--brand)]" />工作流模版库
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{filteredTemplates.length} 套受治理模板 · 按业务 / 系统 / 安全 / AI 分组</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold leading-5 text-[var(--text-muted)]">分组</span>
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
                'rounded-md px-2.5 py-1 text-xs leading-5 transition-colors',
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

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板、维护团队或依赖" className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-8 pr-3 text-xs outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]" /></div>
        <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-elevated)] p-1" role="group" aria-label="模板健康度">
          {([['all', '全部资产'], ['healthy', '可直接复用'], ['review', '需复核']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setScope(key)} className={cn('rounded-md px-2.5 py-1 text-xs leading-5 font-medium transition-colors', scope === key ? 'bg-[var(--surface-1)] text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>{label}</button>)}
        </div>
        <span className="text-xs leading-5 text-[var(--text-muted)]">{visibleTemplates.length} 个可发现模板</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {pagedTemplates.map((t) => {
          const categoryStyle = t.category === 'business'
            ? 'bg-[var(--info-bg)] text-[var(--info)]'
            : t.category === 'system'
              ? 'bg-[var(--success-bg)] text-[var(--success)]'
              : t.category === 'security'
                ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
                : 'bg-[var(--purple-bg)] text-[var(--purple)]';
          const categoryName = t.category === 'business' ? '业务自动化' : t.category === 'system' ? '系统运维' : t.category === 'security' ? '安全响应' : '智能分析';

          return (
            <article
              key={t.id}
              className="workflow-template-card group flex min-h-[292px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[0_14px_30px_rgba(15,23,42,0.10)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/[0.03]', categoryStyle)}>
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text)]">{t.name}</h3>
                      <span className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--text-muted)]">{t.version}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">{categoryName} · {t.owner}</div>
                  </div>
                </div>
                <Badge tone={t.health === '健康' ? 'success' : 'warn'} className="shrink-0 text-[10px]">{t.health}</Badge>
              </div>

              <p className="mt-4 min-h-[34px] text-[12px] leading-[18px] text-[var(--text-secondary)] line-clamp-2">{t.description}</p>

              <div className="mt-4 rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]"><span>流程能力</span><span>{t.nodes} 个节点</span></div>
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {t.sequence.slice(0, 4).map((kind, index) => {
                    const StageIcon = NODE_ICONS[kind];
                    return (
                      <div key={`${kind}-${index}`} className="flex min-w-0 items-center gap-1.5">
                        {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[var(--border-strong)]" />}
                        <span title={NODE_LABELS[kind]} className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--surface-1)] text-[var(--text-secondary)] shadow-[0_1px_1px_rgba(15,23,42,0.04)]"><StageIcon className="h-3 w-3" /></span>
                      </div>
                    );
                  })}
                  {t.sequence.length > 4 && <span className="ml-0.5 shrink-0 text-[11px] font-medium text-[var(--text-muted)]">+{t.sequence.length - 4}</span>}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 border-t border-[var(--border)] pt-3">
                <div className="min-w-0 flex-1"><div className="text-[11px] text-[var(--text-muted)]">验证成功率</div><div className="mt-0.5 font-mono text-sm font-semibold text-[var(--text)]">{t.successRate}</div></div>
                <div className="h-7 w-px bg-[var(--border)]" />
                <div className="min-w-0 flex-1"><div className="text-[11px] text-[var(--text-muted)]">治理等级</div><div className="mt-0.5 flex items-center gap-1.5"><Badge tone={t.risk === 'L3' ? 'warn' : t.risk === 'L2' ? 'info' : 'success'} className="text-[10px]">{t.risk} 风险</Badge><span className="truncate text-[11px] text-[var(--text-muted)]">{t.dependencies.length} 依赖</span></div></div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30" onClick={() => onPreview(t)}>
                  <Eye className="h-3.5 w-3.5" />查看架构
                </button>
                <Button size="sm" className="rounded-lg px-3" onClick={() => onUseTemplate(t)}>
                  创建草稿<ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {visibleTemplates.length > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]"><span>显示第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleTemplates.length)} 套，共 {visibleTemplates.length} 套模板</span><nav className="flex items-center gap-1" aria-label="模板库分页"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="上一页"><ChevronLeft className="h-3.5 w-3.5" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => <button key={item} type="button" onClick={() => setPage(item)} aria-current={item === currentPage ? 'page' : undefined} className={cn('grid h-8 min-w-8 place-items-center rounded-md px-2 font-medium transition-colors', item === currentPage ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>{item}</button>)}<button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="下一页"><ChevronRight className="h-3.5 w-3.5" /></button></nav></div>}
      {visibleTemplates.length === 0 && <div className="mt-10 text-center text-sm text-[var(--text-muted)]">没有符合当前条件的模板，请调整搜索或健康度筛选。</div>}
    </div>
  );
}

/* =============================================================
 *  模板预览弹窗
 * ============================================================= */
function TemplatePreviewModal({
  template, onClose, showToast, onUseTemplate,
}: {
  template: typeof TEMPLATES[number] | null;
  onClose: () => void;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onUseTemplate: (template: typeof TEMPLATES[number]) => void;
}) {
  if (!template) return null;
  return <TemplatePreviewModalInner template={template} onClose={onClose} showToast={showToast} onUseTemplate={onUseTemplate} />;
}

function TemplatePreviewModalInner({
  template, onClose, showToast, onUseTemplate,
}: {
  template: typeof TEMPLATES[number];
  onClose: () => void;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onUseTemplate: (template: typeof TEMPLATES[number]) => void;
}) {
  const [zoom, setZoom] = useState(0.7);

  const previewSeq = template.sequence;
  const categoryStyle = template.category === 'business'
    ? 'bg-[var(--info-bg)] text-[var(--info)]'
    : template.category === 'system'
      ? 'bg-[var(--success-bg)] text-[var(--success)]'
      : template.category === 'security'
        ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
        : 'bg-[var(--purple-bg)] text-[var(--purple)]';
  const categoryName = template.category === 'business' ? '业务自动化' : template.category === 'system' ? '系统运维' : template.category === 'security' ? '安全响应' : '智能分析';
  const governanceChecks = template.risk === 'L3' ? 4 : template.risk === 'L2' ? 3 : 2;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
        className="flex h-[min(800px,calc(100%-32px))] w-[min(1240px,calc(100%-32px))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface-1)] px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/[0.03]', categoryStyle)}><Sparkles className="h-4 w-4" /></div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 id="template-preview-title" className="truncate text-base font-semibold tracking-[-0.01em] text-[var(--text)]">{template.name}</h2><span className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--text-muted)]">{template.version}</span><Badge tone={template.health === '健康' ? 'success' : 'warn'} className="text-[9px]">{template.health}</Badge></div><p className="mt-1 text-xs text-[var(--text-muted)]">{categoryName} · {template.description}</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭模板预览" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-elevated)]">
          <div className="mx-auto w-full max-w-[1180px] space-y-5 p-6">
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div><div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">模板概览</div><div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]"><span>{template.nodes} 个编排节点</span><span className="hidden h-3 w-px bg-[var(--border)] sm:block" /><span>{governanceChecks} 项治理检查</span><span className="hidden h-3 w-px bg-[var(--border)] sm:block" /><span>维护团队：{template.owner}</span></div></div>
              <div className="flex items-center gap-2"><Badge tone={template.risk === 'L3' ? 'warn' : template.risk === 'L2' ? 'info' : 'success'} className="text-[9px]">{template.risk} 风险</Badge><span className="text-[11px] text-[var(--text-muted)]">最近验证 {template.verifiedAt}</span></div>
            </section>

            <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5"><div><h3 className="text-sm font-semibold text-[var(--text)]">流程结构</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">只读预览，展示从触发、决策到执行与治理的完整路径</p></div><div className="flex items-center gap-1"><button type="button" className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} aria-label="缩小流程预览">−</button><span className="w-10 text-center font-mono text-[10px] text-[var(--text-muted)]">{Math.round(zoom * 100)}%</span><button type="button" className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" onClick={() => setZoom((z) => Math.min(1.2, z + 0.1))} aria-label="放大流程预览">+</button></div></div>
              <div className="overflow-x-auto bg-[var(--bg-elevated)] p-5"><div className="flex min-h-[220px] min-w-max items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-6 py-5"><div className="flex items-center gap-3" style={{ transform: `scale(${zoom})`, transformOrigin: 'left center' }}>{previewSeq.map((kind, index) => { const Icon = NODE_ICONS[kind]; const color = NODE_COLORS[kind]; const isGovernance = ['policy', 'approval', 'audit', 'compensate'].includes(kind); return <div key={`${kind}-${index}`} className="flex items-center gap-3"><div className="w-[132px] rounded-xl border bg-[var(--surface-1)] px-3 py-3 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ borderColor: color }}><div className="mb-2 flex items-center justify-between"><span className="font-mono text-[9px] text-[var(--text-muted)]">{String(index + 1).padStart(2, '0')}</span>{isGovernance && <ShieldCheck className="h-3.5 w-3.5" style={{ color }} />}</div><Icon className="mx-auto h-4 w-4" style={{ color }} /><div className="mt-1.5 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{kind}</div><div className="mt-0.5 text-xs font-semibold text-[var(--text)]">{NODE_LABELS[kind]}</div></div>{index < previewSeq.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--border-strong)]" />}</div>; })}</div></div></div>
            </section>

            <section className="grid gap-3 lg:grid-cols-3"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]"><CheckCircle2 className="h-4 w-4 text-[var(--success)]" />验证与维护</div><div className="mt-3 text-sm font-semibold text-[var(--text)]">{template.successRate}</div><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">最近验证成功率 · {template.verifiedAt}</p><p className="mt-3 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-secondary)]">由 {template.owner} 维护</p></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]"><Box className="h-4 w-4 text-[var(--info)]" />依赖就绪度</div><Badge tone={template.health === '健康' ? 'success' : 'warn'} className="text-[9px]">{template.health}</Badge></div><div className="mt-3 space-y-2">{template.dependencies.map((dependency) => <div key={dependency} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]"><CheckCircle2 className={cn('h-3.5 w-3.5', template.health === '健康' ? 'text-[var(--success)]' : 'text-[var(--warning)]')} />{dependency}</div>)}</div></div><div className={cn('rounded-xl border p-4', template.risk === 'L3' ? 'border-[var(--warning)]/30 bg-[var(--warning-bg)]' : 'border-[var(--info)]/25 bg-[var(--info-bg)]')}><div className={cn('flex items-center gap-2 text-xs font-semibold', template.risk === 'L3' ? 'text-[var(--warning)]' : 'text-[var(--info)]')}><ShieldCheck className="h-4 w-4" />{template.risk} 治理门禁</div><p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">创建后将生成隔离草稿；外部执行前需完成依赖授权、审批、审计与补偿校验。</p></div></section>
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-1)] px-6 py-3.5"><div className="text-[11px] text-[var(--text-muted)]">创建后将另存为草稿，不影响当前工作流</div><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={onClose}>取消</Button><Button size="sm" onClick={() => { onUseTemplate(template); onClose(); }}><Download className="h-3.5 w-3.5" />创建隔离草稿</Button></div></footer>
      </section>
    </div>
  );
}

/* =============================================================
 *  执行历史（含时序图 + 单步回放控制）
 * ============================================================= */
function HistoryView({ showToast }: { showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void }) {
  const { data: runsFromApi = [], refetch } = useApiQuery<typeof RUNS>(['workflow-runs'], '/api/workflow-runs');
  const runs = runsFromApi.length > 0 ? runsFromApi : RUNS;
  const [selectedRunId, setSelectedRunId] = useState<string>('r1');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mobileReplayOpen, setMobileReplayOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed' | 'running'>('all');
  const [page, setPage] = useState(1);
  const retryRunApi = useApiMutation<any, { id: string }>((vars) => `/api/workflows/wf1/runs/${vars.id}/retry`, {
    onSuccess: () => { showToast('已创建重试尝试，运行状态已刷新', 'success'); refetch(); },
    onError: () => showToast('重试请求失败，请检查权限或运行状态', 'error'),
  });

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? runs[0];
  const totalSteps = selectedRun.steps;
  const stepNames = ['事件触发', '上下文检索', 'Agent 决策', '人工审批', '条件分支', '受控执行', '补偿回滚', '审计留痕', '结果通知', '结束'];
  const visibleRuns = runs.filter((run) => (statusFilter === 'all' || run.status === statusFilter) && (!query.trim() || `${run.id} ${run.trigger} ${run.who}`.toLowerCase().includes(query.trim().toLowerCase())));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleRuns.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRuns = visibleRuns.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstItem = visibleRuns.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, visibleRuns.length);

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

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  return (
    <div className="h-full overflow-hidden bg-[var(--bg-elevated)]">
      {/* 左侧：历史列表 */}
      <div className="overflow-y-auto p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--text-muted)]" />执行历史
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{runs.length} 次运行记录 · 点击查看执行证据与单步回放</p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索运行 ID、触发源或执行人" className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-8 pr-3 text-xs leading-5 outline-none focus:border-[var(--brand)]" /></div><div className="flex rounded-lg bg-[var(--bg-elevated)] p-1" role="group" aria-label="运行状态">{([['all', '全部'], ['success', '成功'], ['failed', '失败'], ['running', '运行中']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setStatusFilter(key)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium leading-5 transition-colors', statusFilter === key ? 'bg-[var(--surface-1)] text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>{label}</button>)}</div><span className="text-xs leading-5 text-[var(--text-muted)]">{visibleRuns.length} 条结果</span></div>
        {visibleRuns.length > 0 ? (
          <>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              {pagedRuns.map((r, rowIndex) => {
                const reachedStages = r.status === 'success' ? 5 : Math.max(1, Math.min(4, Math.ceil((r.steps / stepNames.length) * 5)));
                return (
                  <article
                    key={r.id}
                    onClick={() => { setSelectedRunId(r.id); setMobileReplayOpen(true); }}
                    className={cn(
                      'group cursor-pointer px-4 py-4 transition-colors',
                      rowIndex > 0 && 'border-t border-[var(--border)]',
                      selectedRunId === r.id ? 'bg-[var(--brand-light)]/55' : 'hover:bg-[var(--bg-elevated)]',
                    )}
                  >
                    <div className="grid items-center gap-4 xl:grid-cols-[minmax(260px,1.4fr)_minmax(170px,0.8fr)_minmax(150px,0.65fr)_auto]">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', r.status === 'success' ? 'bg-[var(--success)]' : r.status === 'failed' ? 'bg-[var(--danger)]' : 'animate-pulse bg-[var(--info)]')} />
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-[var(--text)]">{r.trigger}</span><Badge tone={r.status === 'success' ? 'success' : r.status === 'failed' ? 'error' : 'info'} className="text-[9px]">{r.status === 'success' ? '已完成' : r.status === 'failed' ? '执行失败' : '运行中'}</Badge></div><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]"><span className="font-mono">{r.id}</span><span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" /><span>{r.time}</span><span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" /><span>{r.who}</span></div></div>
                      </div>
                      <div className="hidden xl:block"><div className="mb-1.5 flex items-center justify-between text-[9px] font-medium text-[var(--text-muted)]"><span>执行阶段</span><span>{r.steps} 步</span></div><div className="flex gap-1" aria-label={`执行阶段：${reachedStages} / 5`}>
                        {Array.from({ length: 5 }).map((_, index) => { const failedStage = r.status === 'failed' && index === reachedStages - 1; const completed = r.status === 'success' || index < reachedStages - (r.status === 'failed' ? 1 : 0); return <span key={index} className={cn('h-1.5 flex-1 rounded-full', failedStage ? 'bg-[var(--danger)]' : completed ? 'bg-[var(--success)]' : 'bg-[var(--border)]')} />; })}
                      </div></div>
                      <div className="flex items-center gap-5 text-[10px] text-[var(--text-muted)]"><div><div>耗时</div><div className="mt-0.5 font-mono text-xs font-semibold text-[var(--text)]">{r.status === 'running' ? '处理中' : `${r.duration}s`}</div></div><div><div>步骤</div><div className="mt-0.5 font-mono text-xs font-semibold text-[var(--text)]">{r.steps}</div></div></div>
                      <div className="flex shrink-0 items-center gap-1.5"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedRunId(r.id); setMobileReplayOpen(true); }}><Eye className="h-3 w-3" />查看</Button>{r.status === 'failed' && <Button size="sm" variant="secondary" className="rounded-lg" onClick={(e) => { e.stopPropagation(); retryRunApi.mutate({ id: r.id }); }} loading={retryRunApi.isPending}><RotateCcw className="h-3 w-3" />重跑</Button>}</div>
                    </div>
                    {r.error && <div className="ml-5 mt-3 flex items-start gap-2 rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-[11px] text-[var(--danger)] xl:ml-0"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><span className="font-semibold">异常：</span>{r.error}</span></div>}
                  </article>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]"><span>显示第 {firstItem}–{lastItem} 条，共 {visibleRuns.length} 条运行记录</span><nav className="flex items-center gap-1" aria-label="执行历史分页"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="上一页"><ChevronLeft className="h-3.5 w-3.5" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => <button key={item} type="button" onClick={() => setPage(item)} aria-current={item === currentPage ? 'page' : undefined} className={cn('grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-[11px] font-medium transition-colors', item === currentPage ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>{item}</button>)}<button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="下一页"><ChevronRight className="h-3.5 w-3.5" /></button></nav></div>
          </>
        ) : <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] text-sm text-[var(--text-muted)]">没有符合当前筛选条件的运行记录。</div>}
      </div>

      {/* 右侧：单步回放控制台 */}
      <div className="hidden">
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
            {Array.from({ length: totalSteps }).map((_, i) => {
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
          {Array.from({ length: totalSteps }).map((_, i) => {
            const isDone = i < step;
            const isCurrent = i === step;
            const stepName = stepNames[i] ?? `步骤 ${i + 1}`;
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
        width={520}
      >
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"><div className="text-[10px] text-[var(--text-muted)]">运行结果</div><div className="mt-1"><Badge tone={selectedRun.status === 'success' ? 'success' : selectedRun.status === 'failed' ? 'error' : 'info'}>{selectedRun.status === 'success' ? '成功' : selectedRun.status === 'failed' ? '失败' : '运行中'}</Badge></div></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"><div className="text-[10px] text-[var(--text-muted)]">执行证据</div><div className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">run:{selectedRun.id}</div></div></div>
          {selectedRun.error && <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]"><div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />失败原因</div><div className="mt-1">{selectedRun.error}</div></div>}
          <div className="flex gap-0.5 h-3 rounded overflow-hidden bg-[var(--bg-hover)]">
            {Array.from({ length: totalSteps }).map((_, i) => (
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
            {stepNames.slice(0, totalSteps).map((name, i) => (
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

function Mini({ label, value, tone }: { label: string; value: any; tone?: 'warn' }) {
  return (
    <div>
      <div className="text-[9px] text-[var(--text-muted)] uppercase">{label}</div>
      <div className={cn('text-[11px] font-mono font-semibold', tone === 'warn' ? 'text-amber-500' : 'text-[var(--text)]')}>{value}</div>
    </div>
  );
}
