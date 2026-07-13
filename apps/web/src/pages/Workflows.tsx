import { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, type Node, type Edge } from 'reactflow';
import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Tabs } from '@de/web-ui';
import { Play, Save, Download, Plus, Zap, ShieldCheck, Cpu, GitBranch, Bell, FileText, Wrench, Filter, Database, PlayCircle } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Workflow, WorkflowNodeKind } from '@de/web-types';

const NODE_ICONS: Record<WorkflowNodeKind, any> = {
  trigger: PlayCircle,
  retrieve: Database,
  decision: Cpu,
  approval: ShieldCheck,
  branch: GitBranch,
  execute: Wrench,
  audit: FileText,
  notify: Bell,
};
const NODE_LABELS: Record<WorkflowNodeKind, string> = {
  trigger: '触发器',
  retrieve: '知识检索',
  decision: 'Agent 决策',
  approval: '双签审批',
  branch: '条件分支',
  execute: '执行恢复',
  audit: '审计日志',
  notify: '通知收尾',
};
const NODE_COLORS: Record<WorkflowNodeKind, string> = {
  trigger: '#3b82f6',
  retrieve: '#10b981',
  decision: '#a78bfa',
  approval: '#f59e0b',
  branch: '#06b6d4',
  execute: '#ef4444',
  audit: '#64748b',
  notify: '#38bdf8',
};

function CustomNode({ data }: { data: any }) {
  const Icon = NODE_ICONS[data.kind as WorkflowNodeKind];
  const color = NODE_COLORS[data.kind as WorkflowNodeKind];
  return (
    <div className={cn('wf-node', data.status)} style={{ borderTop: `3px solid ${color}`, minWidth: 130 }}>
      <div className="mb-1 flex items-center justify-center gap-1.5" style={{ color }}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-wide">{data.kind}</span>
      </div>
      <div className="text-xs font-semibold">{NODE_LABELS[data.kind as WorkflowNodeKind]}</div>
      {data.durationMs !== undefined && (
        <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{data.durationMs}ms</div>
      )}
      {data.status && (
        <div className={cn('mt-1 text-[10px]', data.status === 'success' ? 'text-emerald-500' : 'text-amber-500')}>
          ● {data.status}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

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
      position: { x: startX + i * spacing, y: 200 },
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

  const [stats] = useState({ avgMs: 38000, trigger: 124, success: 100, mttr: -65 });

  return (
    <div className="grid h-full grid-rows-[auto_1fr_180px]">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
        <div>
          <h1 className="text-sm font-semibold">{wf?.name ?? '加载中...'}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <Badge tone="success">运行中</Badge>
            <span>{wf?.nodes.length} 节点</span>
            <span>· 平均 {wf?.avgDurationSec}s</span>
            <span>· 成功率 {(wf?.successRate! * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline"><Save className="h-3.5 w-3.5" />保存</Button>
          <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5" />导出</Button>
          <Button size="sm"><Play className="h-3.5 w-3.5" />测试运行</Button>
        </div>
      </div>

      {/* 画布 */}
      <div className="relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#1a2540" />
          <Controls position="bottom-right" />
          <MiniMap
            position="top-right"
            nodeColor={(n) => NODE_COLORS[(n.data as any)?.kind as WorkflowNodeKind] ?? '#3b82f6'}
            maskColor="rgba(11,18,32,0.6)"
            style={{ background: '#111a2e', border: '1px solid #2a3a64' }}
          />
        </ReactFlow>
      </div>

      {/* 底部节点库 + 统计 */}
      <div className="grid grid-cols-[1fr_320px] divide-x divide-[var(--color-border)] border-t border-[var(--color-border)]">
        <div className="overflow-y-auto p-3">
          <div className="mb-2 text-xs font-semibold">节点库（拖拽到画布）</div>
          <div className="grid grid-cols-8 gap-2">
            {(Object.keys(NODE_LABELS) as WorkflowNodeKind[]).map((k) => {
              const Icon = NODE_ICONS[k];
              return (
                <div key={k} className="flex cursor-grab items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 hover:border-[var(--color-primary)]">
                  <Icon className="h-3.5 w-3.5" style={{ color: NODE_COLORS[k] }} />
                  <span className="text-[11px]">{NODE_LABELS[k]}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {[
            { label: '触发', value: stats.trigger, icon: Zap, color: 'text-[var(--color-primary)]' },
            { label: '成功率', value: `${stats.success}%`, icon: ShieldCheck, color: 'text-emerald-500' },
            { label: '平均完成', value: `${stats.avgMs / 1000}s`, icon: Play, color: 'text-[var(--color-primary)]' },
            { label: 'MTTR 降低', value: `${stats.mttr}%`, icon: Filter, color: 'text-emerald-500' },
          ].map((s) => (
            <Card key={s.label}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">{s.label}</div>
                  <div className={cn('mt-0.5 text-lg font-semibold', s.color)}>{s.value}</div>
                </div>
                <s.icon className={cn('h-4 w-4', s.color)} />
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}