import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CanvasPresenceBar } from '@/features/canvas/CanvasCommentPin';
import type { CanvasPresence } from '@/features/canvas/canvas-types';
import { putWorkflow } from './workflow-canvas-api';
import type {
  WorkflowEdge,
  WorkflowEdgeCondition,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeKind,
} from './workflow-types';
import {
  countNodeKinds,
  findCycleEdges,
  nextNodePosition,
  validateDagHasNoCycles,
} from './workflow-types';

/* ------------------------------------------------------------------ */
/*  Custom node renderers (one per WorkflowNodeKind)                  */
/* ------------------------------------------------------------------ */

type RFNodeData = {
  label: string;
  kind: WorkflowNodeKind;
};

function BaseFlowNode({ data, sourcePosition = Position.Bottom, targetPosition = Position.Top }: NodeProps<RFNodeData> & { tone: string; shape: 'circle' | 'rect' | 'diamond' | 'pill' }): JSX.Element {
  const shapeStyle: React.CSSProperties = (() => {
    switch (data.kind) {
      case 'start':
        return { borderRadius: 9999 };
      case 'end':
        return { borderRadius: 9999 };
      case 'decision':
        return { transform: 'rotate(45deg)', padding: 24 };
      default:
        return { borderRadius: 8 };
    }
  })();

  const innerStyle: React.CSSProperties = data.kind === 'decision' ? { transform: 'rotate(-45deg)' } : {};

  return (
    <div
      data-testid={`workflow-node-${data.kind}`}
      data-node-kind={data.kind}
      className={`min-w-[120px] border ${data.kind === 'decision' ? 'border-amber-400 bg-amber-50' : data.kind === 'start' ? 'border-emerald-400 bg-emerald-50' : data.kind === 'end' ? 'border-slate-400 bg-slate-50' : 'border-sky-400 bg-sky-50'} px-3 py-2 text-center text-xs font-medium text-slate-800 shadow-sm`}
      style={shapeStyle}
    >
      <Handle type="target" position={targetPosition} className="!bg-slate-400" />
      <div style={innerStyle} className="text-slate-800">
        {data.label}
      </div>
      <Handle type="source" position={sourcePosition} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = {
  start: (props: NodeProps) => <BaseFlowNode {...props} tone="emerald" shape="circle" />,
  task: (props: NodeProps) => <BaseFlowNode {...props} tone="sky" shape="rect" />,
  decision: (props: NodeProps) => <BaseFlowNode {...props} tone="amber" shape="diamond" />,
  end: (props: NodeProps) => <BaseFlowNode {...props} tone="slate" shape="pill" />,
};

/* ------------------------------------------------------------------ */
/*  Conversion helpers (WorkflowGraph <-> ReactFlow types)            */
/* ------------------------------------------------------------------ */

function toRFNodes(graph: WorkflowGraph): Node<RFNodeData>[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: n.x, y: n.y },
    data: { label: n.label, kind: n.kind },
  }));
}

function toRFEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.condition ? e.condition : e.label,
    animated: false,
  }));
}

function fromRFNodes(nodes: Node<RFNodeData>[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    kind: (n.data?.kind ?? 'task') as WorkflowNodeKind,
    label: n.data?.label ?? '',
    x: n.position.x,
    y: n.position.y,
  }));
}

function fromRFEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : '',
    condition: typeof e.label === 'string' && (e.label === 'true' || e.label === 'false') ? (e.label as WorkflowEdgeCondition) : '',
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export type WorkflowBoardProps = {
  boardId: string;
  initialGraph: WorkflowGraph;
  presence?: CanvasPresence[];
  canMutate?: boolean;
  /** Override the persistence call (mainly for tests). */
  saveImpl?: (graph: WorkflowGraph) => Promise<void>;
  /** Override default "blur" trigger so tests can flush deterministically. */
  autoSave?: boolean;
  className?: string;
};

export function WorkflowBoardInner({
  boardId,
  initialGraph,
  presence = [],
  canMutate = true,
  saveImpl,
  autoSave = true,
  className,
}: WorkflowBoardProps): JSX.Element {
  const [nodes, setNodes] = useState<Node<RFNodeData>[]>(() => toRFNodes(initialGraph));
  const [edges, setEdges] = useState<Edge[]>(() => toRFEdges(initialGraph));
  const [cycleIds, setCycleIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const instanceRef = useRef<ReactFlowInstance | null>(null);

  // Reset internal state when the upstream graph changes identity.
  const initialKey = useMemo(
    () => `${initialGraph.nodes.length}:${initialGraph.edges.length}`,
    [initialGraph],
  );

  useEffect(() => {
    setNodes(toRFNodes(initialGraph));
    setEdges(toRFEdges(initialGraph));
  }, [initialKey, initialGraph]);

  /* ----- save on blur ----- */
  const persist = useCallback(
    async (next: { nodes: Node<RFNodeData>[]; edges: Edge[] }) => {
      const graph: WorkflowGraph = { nodes: fromRFNodes(next.nodes), edges: fromRFEdges(next.edges) };
      const cycle = validateDagHasNoCycles(graph);
      setCycleIds(new Set(cycle.cycle.map((e) => e.id)));
      setSaving(true);
      setError(null);
      try {
        if (saveImpl) {
          await saveImpl(graph);
        } else {
          const res = await putWorkflow(boardId, graph);
          if (!res.ok) setError(res.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [boardId, saveImpl],
  );

  /* ----- react-flow handlers ----- */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          },
          eds,
        ),
      );
    },
    [],
  );

  const onBlur = useCallback(() => {
    if (!canMutate || !autoSave) return;
    void persist({ nodes, edges });
  }, [canMutate, autoSave, persist, nodes, edges]);

  /* ----- add-node helpers (tests call via "add" button) ----- */
  const addNode = useCallback(
    (kind: WorkflowNodeKind) => {
      if (!canMutate) return;
      const graph: WorkflowGraph = { nodes: fromRFNodes(nodes), edges: fromRFEdges(edges) };
      const { x, y } = nextNodePosition(graph);
      const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setNodes((nds) => [
        ...nds,
        { id, type: kind, position: { x, y }, data: { label: defaultLabel(kind), kind } },
      ]);
    },
    [canMutate, nodes, edges],
  );

  const removeSelected = useCallback(() => {
    if (!canMutate) return;
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, [canMutate]);

  const counts = countNodeKinds({ nodes: fromRFNodes(nodes), edges: fromRFEdges(edges) });
  const cycleCount = cycleIds.size;

  return (
    <div
      data-testid="workflow-board"
      data-board-id={boardId}
      onBlur={onBlur}
      className={className ?? 'flex h-full flex-col gap-3'}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="workflow-counts" className="font-medium text-slate-800">
            节点 {counts.start + counts.task + counts.decision + counts.end}
            <span className="ml-2 text-xs text-slate-500">
              start={counts.start} task={counts.task} decision={counts.decision} end={counts.end}
            </span>
          </span>
          <span data-testid="workflow-edges-count" className="text-xs text-slate-500">
            边 {edges.length}
          </span>
          {cycleCount > 0 && (
            <span data-testid="workflow-cycle-warning" className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
              检测到 {cycleCount} 条成环边
            </span>
          )}
          {saving && <span className="text-xs text-slate-400">保存中…</span>}
          {error && <span data-testid="workflow-error" className="text-xs text-rose-700">{error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <CanvasPresenceBar presence={presence} />
        </div>
      </header>

      {canMutate && (
        <div data-testid="workflow-toolbar" className="flex flex-wrap items-center gap-2 text-xs">
          {(['start', 'task', 'decision', 'end'] as WorkflowNodeKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              data-testid={`workflow-add-${kind}`}
              onClick={() => addNode(kind)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              + {kind}
            </button>
          ))}
          <button
            type="button"
            data-testid="workflow-remove-selected"
            onClick={removeSelected}
            className="rounded border border-rose-200 bg-white px-2 py-1 text-rose-700 hover:border-rose-300 hover:bg-rose-50"
          >
            删除选中
          </button>
          <button
            type="button"
            data-testid="workflow-save"
            onClick={() => void persist({ nodes, edges })}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            立即保存
          </button>
        </div>
      )}

      <div
        data-testid="workflow-canvas"
        className="min-h-[480px] flex-1 overflow-hidden rounded-md border border-slate-200 bg-white"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => {
            instanceRef.current = inst;
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={canMutate}
          nodesConnectable={canMutate}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

export function WorkflowBoard(props: WorkflowBoardProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <WorkflowBoardInner {...props} />
    </ReactFlowProvider>
  );
}

function defaultLabel(kind: WorkflowNodeKind): string {
  switch (kind) {
    case 'start':
      return '开始';
    case 'task':
      return '任务';
    case 'decision':
      return '判断';
    case 'end':
      return '结束';
  }
}

/** Re-exported for tests that want to compute the warning set themselves. */
export { findCycleEdges };