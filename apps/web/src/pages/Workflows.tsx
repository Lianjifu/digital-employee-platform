/**
 * P6 工作流（企业级优化版）
 * Todo 1-10:
 *  1. DAG 节点实时高亮（执行中）
 *  2. 节点右键菜单（编辑/复制/删除/禁用）
 *  3. 顶部 4 KPI（执行中/总数/成功率/MTTR）
 *  4. 工作流模板市场（6 套）
 *  5. 版本对比 + git diff 视图
 *  6. 节点调试面板（输入/输出/日志）
 *  7. 失败回放（步骤跳跃）
 *  8. Webhook 触发器配置
 *  9. 执行历史时序图
 * 10. 工作流分组（业务/系统/AI）
 */
import { useState, useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, type Node, type Edge } from 'reactflow';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs } from '@de/web-ui';
import {
  Play, Save, Download, Zap, ShieldCheck, Cpu, GitBranch, Bell, FileText,
  Wrench, Database, PlayCircle, ChevronRight, Activity, CheckCircle2, Clock,
  AlertTriangle, Plus, Filter, Sparkles, GitCompare, Settings, Pause, RotateCcw,
  Eye, Bug, Webhook, Star, Layers,
} from 'lucide-react';
import type { Workflow, WorkflowNodeKind } from '@de/web-types';
import { cn } from '@de/web-utils';

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

// 当前正在执行的节点（mock）
const EXECUTING_NODE_ID = 'n4'; // 双签审批节点

function CustomNode({ data }: { data: any }) {
  const Icon = NODE_ICONS[data.kind as WorkflowNodeKind];
  const color = NODE_COLORS[data.kind as WorkflowNodeKind];
  const isExecuting = data.id === EXECUTING_NODE_ID;
  return (
    <div
      className={cn(
        'rounded-md border-2 bg-[var(--surface-1)] px-3 py-2 min-w-[130px] text-center shadow-md transition-all',
        isExecuting && 'animate-pulse ring-2 ring-[var(--brand)]/50',
      )}
      style={{ borderColor: color, boxShadow: isExecuting ? `0 0 0 4px ${color}30` : undefined }}
    >
      <Icon className="h-3.5 w-3.5 mx-auto" style={{ color }} />
      <div className="text-[10px] uppercase tracking-wide opacity-70 mt-0.5">{data.kind}</div>
      <div className="text-xs font-semibold">{NODE_LABELS[data.kind as WorkflowNodeKind]}</div>
      {data.durationMs !== undefined && (
        <div className="text-[9px] font-mono opacity-70">{data.durationMs}ms</div>
      )}
      {isExecuting && (
        <div className="mt-1 flex items-center justify-center gap-0.5">
          <span className="h-1 w-1 rounded-full bg-[var(--brand)] animate-pulse" />
          <span className="h-1 w-1 rounded-full bg-[var(--brand)] animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="h-1 w-1 rounded-full bg-[var(--brand)] animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      )}
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

const FLOW_STEPS: { kind: WorkflowNodeKind; ms: number; status: 'success' | 'warning' | 'running' }[] = [
  { kind: 'trigger', ms: 12, status: 'success' },
  { kind: 'retrieve', ms: 320, status: 'success' },
  { kind: 'decision', ms: 880, status: 'success' },
  { kind: 'approval', ms: 4500, status: 'running' },
  { kind: 'branch', ms: 4, status: 'success' },
  { kind: 'execute', ms: 21000, status: 'success' },
  { kind: 'audit', ms: 60, status: 'success' },
  { kind: 'notify', ms: 180, status: 'success' },
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

// 节点调试面板：mock 输入/输出/日志
const NODE_DEBUG: Record<string, { input: string; output: string; log: string[] }> = {
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
};

export default function Workflows() {
  const [tab, setTab] = useState<'canvas' | 'templates' | 'history'>('canvas');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [filterGroup, setFilterGroup] = useState<'all' | 'business' | 'system' | 'ai'>('all');

  const { data } = useApiQuery<Workflow[]>(['workflows'], '/api/workflows');
  const { data: kpi } = useApiQuery<any>(['workflow-kpi'], '/api/workflow-kpi');
  const { data: templates = [] } = useApiQuery<any[]>(['wf-templates'], '/api/workflow-templates');
  const { data: runs = [] } = useApiQuery<any[]>(['wf-runs'], '/api/workflow-runs');
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
      selected: n.id === selectedNodeId,
    }));
    const es: Edge[] = wf.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.target === EXECUTING_NODE_ID,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
    }));
    return { nodes: ns, edges: es };
  }, [wf, selectedNodeId]);

  const filteredTemplates = templates.filter((t) => filterGroup === 'all' || t.category === filterGroup);

  const debugInfo = selectedNodeId ? NODE_DEBUG[selectedNodeId] : null;

  return (
    <div className="grid h-full grid-rows-[auto_auto_1fr] overflow-hidden">
      {/* Todo 3: 顶部 4 KPI */}
      <div className="grid grid-cols-5 gap-3 border-b border-[var(--border)] px-6 py-3">
        <Stat icon={<Play className="h-4 w-4 text-[var(--brand)]" />} label="执行中" value={kpi?.running ?? 3} sub="个" tone="primary" />
        <Stat icon={<Activity className="h-4 w-4" />} label="今日总数" value={kpi?.totalToday ?? 47} sub="次" />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-[var(--success)]" />} label="成功率" value={kpi?.successRate ?? 97.8} sub="%" tone="success" />
        <Stat icon={<Clock className="h-4 w-4" />} label="平均完成" value={`${kpi?.avgDuration ?? 42}s`} sub="" />
        <Stat icon={<Sparkles className="h-4 w-4 text-[var(--purple)]" />} label="MTTR 降低" value={`${kpi?.mttrImprovement ?? -65}%`} sub="" tone="purple" />
      </div>

      {/* 工具栏 + Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold">{wf?.name ?? '加载中...'}</h1>
          <Badge tone="success">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse mr-1" />运行中 · 节点 {EXECUTING_NODE_ID}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'canvas', label: <>画布 <Badge tone="brand" className="ml-1">8</Badge></> },
              { key: 'templates', label: <>模板市场 <Badge tone="neutral" className="ml-1">6</Badge></> },
              { key: 'history', label: <>执行历史 <Badge tone="neutral" className="ml-1">{runs.length}</Badge></> },
            ]}
          />
        </div>
      </div>

      {/* 内容区 */}
      {tab === 'canvas' && (
        <div className="grid grid-rows-[auto_1fr_auto] overflow-hidden">
          {/* 顶部流程图 + Todo 1: 实时高亮 + Todo 8: Webhook 触发器 */}
          <div className="border-b border-[var(--border)] px-6 py-3 bg-[var(--bg)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />DAG 流程图（{FLOW_STEPS.length} 节点 · 当前执行: 双签审批）
              </div>
              <div className="flex items-center gap-2">
                {/* Todo 8: Webhook 触发器 */}
                <span className="nav-pill text-[10px]">
                  <Webhook className="h-3 w-3" />
                  <span className="font-mono">POST /webhook/redis-oom</span>
                </span>
                <Button size="sm" variant="outline"><Settings className="h-3.5 w-3.5" />触发器</Button>
              </div>
            </div>
            <div className="flow-row">
              {FLOW_STEPS.map((s, i) => {
                const Icon = NODE_ICONS[s.kind];
                const color = NODE_COLORS[s.kind];
                return (
                  <div key={s.kind} className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setSelectedNodeId(`n${i + 1}`); setShowDebug(true); }}
                      className={cn(
                        'rounded-md border-2 px-3 py-1.5 text-left transition-all bg-[var(--surface-1)] min-w-[110px]',
                        selectedNodeId === `n${i + 1}` && 'ring-2 ring-[var(--brand)]',
                        s.status === 'running' && 'animate-pulse ring-2 ring-[var(--brand)]/50',
                      )}
                      style={{ borderColor: color }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3 w-3 shrink-0" style={{ color }} />
                        <div>
                          <div className="text-[10px] font-semibold leading-tight">{NODE_LABELS[s.kind]}</div>
                          <div className="text-[9px] font-mono opacity-70">{s.ms}ms</div>
                        </div>
                      </div>
                    </button>
                    {i < FLOW_STEPS.length - 1 && <ChevronRight className="flow-arrow h-3 w-3" />}
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
              onNodeClick={(_, node) => { setSelectedNodeId(node.id); setShowDebug(true); }}
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

          {/* 底部 3 栏：节点库 + 执行统计 + 历史 */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] divide-x divide-[var(--border)] border-t border-[var(--border)] bg-[var(--bg)]">
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
                      onClick={() => { setSelectedNodeId(`n${NODE_LIB.indexOf(n) + 1}`); setShowDebug(true); }}
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

            <div className="p-3 space-y-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />执行统计
              </div>
              {[
                { label: '触发', value: '124', icon: Zap, color: 'text-[var(--brand)]' },
                { label: '成功率', value: '100%', icon: ShieldCheck, color: 'text-[var(--success)]' },
                { label: '平均完成', value: '38s', icon: Play, color: 'text-[var(--brand)]' },
                { label: 'MTTR 降低', value: '-65%', icon: Sparkles, color: 'text-[var(--purple)]' },
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

            <div className="overflow-y-auto p-3">
              <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />最近执行
              </div>
              <div className="space-y-1.5">
                {runs.slice(0, 5).map((r) => (
                  <div key={r.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px] hover:border-[var(--brand)] cursor-pointer transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[var(--text-muted)]">{r.time}</span>
                      <Badge tone={r.status === 'success' ? 'success' : 'error'} className="text-[9px]">
                        {r.status === 'success' ? <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" /> : <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
                        {r.duration}s
                      </Badge>
                    </div>
                    <div className="mt-0.5 font-semibold truncate">{r.trigger}</div>
                    <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between">
                      <span>{r.who}</span>
                      <span>{r.steps}/8 步</span>
                    </div>
                    {r.error && <div className="text-[10px] text-[var(--danger)] mt-0.5">{r.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Todo 6: 节点调试 Drawer */}
          {showDebug && debugInfo && (
            <div className="fixed inset-0 z-40" onClick={() => setShowDebug(false)}>
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="absolute right-0 top-0 h-full w-[520px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bug className="h-5 w-5 text-[var(--brand)]" />
                    <span className="text-base font-semibold">节点调试 · {selectedNodeId}</span>
                  </div>
                  <button onClick={() => setShowDebug(false)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]">
                    <Plus className="h-4 w-4 rotate-45" />
                  </button>
                </div>
                <div className="space-y-4 text-xs">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">输入</div>
                    <pre className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-3 text-[11px] font-mono overflow-x-auto text-[var(--text)]">{debugInfo.input}</pre>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">输出</div>
                    <pre className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-3 text-[11px] font-mono overflow-x-auto text-[var(--success)]">{debugInfo.output}</pre>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">日志</div>
                    <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-3 font-mono text-[11px] space-y-0.5">
                      {debugInfo.log.map((line, i) => (
                        <div key={i} className="text-[var(--text-secondary)]">{line}</div>
                      ))}
                    </div>
                  </div>
                  {/* Todo 2: 右键菜单（用按钮展示） */}
                  <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                    <Button size="sm" variant="secondary" className="flex-1">
                      <Settings className="h-3.5 w-3.5" />编辑
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1">
                      <FileText className="h-3.5 w-3.5" />复制
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1">
                      <Pause className="h-3.5 w-3.5" />禁用
                    </Button>
                    <Button size="sm" variant="danger" className="flex-1">删除</Button>
                  </div>
                  {/* Todo 7: 失败回放 */}
                  <div className="pt-2 border-t border-[var(--border)]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">执行回放</div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary">
                        <RotateCcw className="h-3.5 w-3.5" />重跑
                      </Button>
                      <Button size="sm" variant="secondary">
                        <Eye className="h-3.5 w-3.5" />从此节点继续
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Todo 4: 模板市场（6 套） */}
      {tab === 'templates' && (
        <div className="overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--brand)]" />工作流模板市场
              </h2>
              <p className="text-xs text-[var(--text-muted)]">6 套内置模板 · 按业务/系统/AI 分组</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">分组</span>
              {(['all', 'business', 'system', 'ai'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setFilterGroup(g)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-mono',
                    filterGroup === g ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border)]',
                  )}
                >
                  {g === 'all' ? '全部' : g === 'business' ? '业务' : g === 'system' ? '系统' : 'AI'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {filteredTemplates.map((t) => (
              <div key={t.id} className="tile-brandable relative rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 overflow-hidden cursor-pointer">
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn(
                    'grid h-10 w-10 place-items-center rounded-md shrink-0',
                    t.category === 'business' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                    t.category === 'system' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
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
                  <Mini label="评分" value={t.rating} tone="warn" />
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Button size="sm" variant="secondary" className="flex-1">
                    <Eye className="h-3 w-3" />预览
                  </Button>
                  <Button size="sm" className="flex-1">
                    <Download className="h-3 w-3" />使用
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Todo 9: 执行历史时序 */}
      {tab === 'history' && (
        <div className="overflow-y-auto p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--text-muted)]" />执行历史
            </h2>
            <p className="text-xs text-[var(--text-muted)]">最近 5 次执行 · 时序图</p>
          </div>
          <div className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{r.time}</span>
                    <span className="font-semibold text-sm">{r.trigger}</span>
                    <Badge tone={r.status === 'success' ? 'success' : 'error'} className="text-[10px]">
                      {r.duration}s · {r.steps}/8 步
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[var(--text-muted)]">{r.who}</span>
                    <Button size="sm" variant="secondary">查看详情</Button>
                  </div>
                </div>
                {/* 时序进度条 */}
                <div className="flex gap-0.5 h-2 rounded overflow-hidden bg-[var(--bg-hover)]">
                  {Array.from({ length: 8 }).map((_, i) => {
                    const isCompleted = i < r.steps;
                    const isFailed = r.status === 'failed' && i === r.steps - 1;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex-1 transition-all',
                          isFailed ? 'bg-[var(--danger)]' : isCompleted ? 'bg-[var(--success)]' : 'bg-[var(--bg-hover)]',
                        )}
                      />
                    );
                  })}
                </div>
                {r.error && (
                  <div className="mt-2 rounded-md bg-[var(--danger-bg)] border border-[var(--danger)]/30 px-2 py-1.5 text-[11px] text-[var(--danger)]">
                    ⚠ {r.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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