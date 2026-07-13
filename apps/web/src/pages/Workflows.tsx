/**
 * P6 工作流 · DAG 画布
 * 1:1 对齐 docs/01-product/mockups/p6-workflow.html
 */
import { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, type Node, type Edge } from 'reactflow';
import { useApiQuery } from '@/services/query';
import { Badge, Button } from '@de/web-ui';
import {
  Play, Save, Download, Zap, ShieldCheck, Cpu, GitBranch, Bell, FileText,
  Wrench, Database, PlayCircle, ChevronRight, Activity, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import type { Workflow, WorkflowNodeKind } from '@de/web-types';

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
const NODE_TONES: Record<WorkflowNodeKind, '' | '--success' | '--warning' | '--danger' | '--purple'> = {
  trigger: '', retrieve: '--success', decision: '--purple', approval: '--warning',
  branch: '', execute: '--danger', audit: '', notify: '',
};

function CustomNode({ data }: { data: any }) {
  const Icon = NODE_ICONS[data.kind as WorkflowNodeKind];
  const color = NODE_COLORS[data.kind as WorkflowNodeKind];
  const tone = NODE_TONES[data.kind as WorkflowNodeKind];
  return (
    <div className={cn('flow-node-pill', tone)} style={{ minWidth: 130, borderTop: `3px solid ${color}` }}>
      <Icon className="h-3.5 w-3.5" />
      <div className="flex flex-col items-start">
        <div className="text-[10px] uppercase tracking-wide opacity-70">{data.kind}</div>
        <div className="font-semibold text-[11px]">{NODE_LABELS[data.kind as WorkflowNodeKind]}</div>
        {data.durationMs !== undefined && (
          <div className="text-[9px] font-mono opacity-70">{data.durationMs}ms</div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

// 顶部横向流程图（PSSP 8 节点 + 箭头）
const FLOW_STEPS: { kind: WorkflowNodeKind; ms: number; tone: 'success' | 'warning' | 'danger' | 'neutral' }[] = [
  { kind: 'trigger', ms: 12, tone: 'success' },
  { kind: 'retrieve', ms: 320, tone: 'success' },
  { kind: 'decision', ms: 880, tone: 'success' },
  { kind: 'approval', ms: 4500, tone: 'warning' },
  { kind: 'branch', ms: 4, tone: 'success' },
  { kind: 'execute', ms: 21000, tone: 'success' },
  { kind: 'audit', ms: 60, tone: 'success' },
  { kind: 'notify', ms: 180, tone: 'success' },
];

const NODE_LIB: { kind: WorkflowNodeKind; desc: string }[] = [
  { kind: 'trigger', desc: '事件 / 定时 / Webhook' },
  { kind: 'retrieve', desc: 'RAG 检索（Milvus）' },
  { kind: 'decision', desc: 'LangGraph 决策' },
  { kind: 'approval', desc: '双人复核（等保 3）' },
  { kind: 'branch', desc: '条件 / 并行 / 合并' },
  { kind: 'execute', desc: 'Skill / MCP / Tool' },
  { kind: 'audit', desc: 'SignedLog 写入' },
  { kind: 'notify', desc: '飞书 / 企微 / SMS' },
];

// 执行历史（时间线）
const RUN_HISTORY = [
  { id: 'r1', time: '14:28', trigger: 'cache-oom', status: 'success' as const, duration: 38, who: '王昊' },
  { id: 'r2', time: '13:42', trigger: 'cache-oom', status: 'success' as const, duration: 36, who: '李婷' },
  { id: 'r3', time: '11:18', trigger: 'cache-oom', status: 'warning' as const, duration: 52, who: '王昊' },
  { id: 'r4', time: '09:54', trigger: 'cache-oom', status: 'success' as const, duration: 34, who: '孙博' },
];

export default function Workflows() {
  const { data } = useApiQuery<Workflow[]>(['workflows'], '/api/workflows');
  const wf = data?.[0];

  const { nodes, edges } = useMemo(() => {
    if (!wf) return { nodes: [], edges: [] };
    const spacing = 180;
    const startX = 80;
    const ns: Node[] = wf.nodes.map((n, i) => ({
      id: n.id,
      type: 'custom',
      position: { x: startX + i * spacing, y: 180 },
      data: { ...n },
    }));
    const es: Edge[] = wf.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
    }));
    return { nodes: ns, edges: es };
  }, [wf]);

  return (
    <div className="grid h-full grid-rows-[auto_auto_1fr_180px] overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">{wf?.name ?? '加载中...'}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />运行中</Badge>
            <span>{wf?.nodes.length} 节点</span>
            <span>· 平均 {wf?.avgDurationSec}s</span>
            <span>· 成功率 {(wf?.successRate! * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary"><Save className="h-3.5 w-3.5" />保存</Button>
          <Button size="sm" variant="secondary"><Download className="h-3.5 w-3.5" />导出</Button>
          <Button size="sm"><Play className="h-3.5 w-3.5" />测试运行</Button>
        </div>
      </div>

      {/* 顶部 8 节点流程图（PSSP flow）============ */}
      <div className="border-b border-[var(--border)] px-6 py-4 bg-[var(--bg)]">
        <div className="text-xs font-semibold mb-3 text-[var(--text-muted)]">8 步典型流程 · cache-oom 处置</div>
        <div className="flow-row">
          {FLOW_STEPS.map((s, i) => {
            const Icon = NODE_ICONS[s.kind];
            const tone = NODE_TONES[s.kind];
            return (
              <div key={s.kind} className="flex items-center gap-1.5">
                <div className={cn('flow-node-pill', tone)}>
                  <Icon className="h-3.5 w-3.5" />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-semibold text-[11px]">{NODE_LABELS[s.kind]}</span>
                    <span className="text-[9px] font-mono opacity-70">{s.ms}ms</span>
                  </div>
                </div>
                {i < FLOW_STEPS.length - 1 && <ChevronRight className="flow-arrow h-3.5 w-3.5" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* DAG 画布 */}
      <div className="relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#2a3654" />
          <Controls position="bottom-right" />
          <MiniMap
            position="top-right"
            nodeColor={(n) => NODE_COLORS[(n.data as any)?.kind as WorkflowNodeKind] ?? '#3b82f6'}
            maskColor="rgba(10,14,26,0.6)"
            style={{ background: '#131a2d', border: '1px solid #2a3654' }}
          />
        </ReactFlow>
      </div>

      {/* 底部：节点库 + 统计 + 历史 */}
      <div className="grid grid-cols-[1.4fr_1fr_1fr] divide-x divide-[var(--border)] border-t border-[var(--border)] bg-[var(--bg)]">
        {/* 节点库 */}
        <div className="overflow-y-auto p-3">
          <div className="mb-2 text-xs font-semibold flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-[var(--text-muted)]" />节点库（拖拽到画布）
          </div>
          <div className="grid grid-cols-4 gap-2">
            {NODE_LIB.map((n) => {
              const Icon = NODE_ICONS[n.kind];
              const color = NODE_COLORS[n.kind];
              return (
                <div
                  key={n.kind}
                  className="cursor-grab rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 hover:border-[var(--brand)] transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                    <span className="text-[11px] font-semibold truncate">{NODE_LABELS[n.kind]}</span>
                  </div>
                  <div className="mt-0.5 text-[9px] text-[var(--text-muted)] truncate">{n.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 执行统计 */}
        <div className="p-3 space-y-2">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />执行统计
          </div>
          {[
            { label: '触发', value: '124', icon: Zap, color: 'text-[var(--brand)]' },
            { label: '成功率', value: '100%', icon: ShieldCheck, color: 'text-[var(--success)]' },
            { label: '平均完成', value: '38s', icon: Play, color: 'text-[var(--brand)]' },
            { label: 'MTTR 降低', value: '-65%', icon: Activity, color: 'text-[var(--success)]' },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase">{s.label}</div>
                <div className={cn('text-base font-mono font-bold', s.color)}>{s.value}</div>
              </div>
              <s.icon className={cn('h-4 w-4', s.color)} />
            </div>
          ))}
        </div>

        {/* 执行历史 */}
        <div className="overflow-y-auto p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />最近执行
          </div>
          <div className="space-y-1.5">
            {RUN_HISTORY.map((r) => (
              <div key={r.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[var(--text-muted)]">{r.time}</span>
                  <Badge tone={r.status === 'success' ? 'success' : 'warn'} className="text-[9px]">
                    {r.status === 'success' ? <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" /> : <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
                    {r.duration}s
                  </Badge>
                </div>
                <div className="mt-0.5 font-semibold">{r.trigger}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{r.who}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...args: any[]) {
  return args.filter(Boolean).join(' ');
}