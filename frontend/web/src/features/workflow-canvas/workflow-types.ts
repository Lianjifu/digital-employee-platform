// Workflow canvas types & pure helpers for the FE-8 react-flow editor.
// The shapes mirror backend/internal/canvas/canvas.go (WorkflowNode /
// WorkflowEdge / WorkflowGraph) and are the only thing the
// `<WorkflowBoard>` component reads/writes.

export type WorkflowNodeKind = 'start' | 'task' | 'decision' | 'end';

export type WorkflowNode = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  /** Absolute, not normalised — workflow DAGs live in an unbounded plane. */
  x: number;
  y: number;
  meta?: Record<string, unknown>;
};

export type WorkflowEdgeCondition = 'true' | 'false';

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** Reserved for decision branches; ignored on start/task/end nodes. */
  condition?: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export const WORKFLOW_NODE_KINDS: readonly WorkflowNodeKind[] = [
  'start',
  'task',
  'decision',
  'end',
] as const;

export function isWorkflowNodeKind(value: unknown): value is WorkflowNodeKind {
  return (
    typeof value === 'string' &&
    (WORKFLOW_NODE_KINDS as readonly string[]).includes(value)
  );
}

export function isValidNode(value: unknown): value is WorkflowNode {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkflowNode>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (!isWorkflowNodeKind(v.kind)) return false;
  if (typeof v.label !== 'string') return false;
  if (typeof v.x !== 'number' || Number.isNaN(v.x)) return false;
  if (typeof v.y !== 'number' || Number.isNaN(v.y)) return false;
  if (v.meta !== undefined && (v.meta === null || typeof v.meta !== 'object')) {
    return false;
  }
  return true;
}

export function isValidEdge(value: unknown): value is WorkflowEdge {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkflowEdge>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.source !== 'string' || v.source.length === 0) return false;
  if (typeof v.target !== 'string' || v.target.length === 0) return false;
  if (v.source === v.target) return false;
  if (v.label !== undefined && typeof v.label !== 'string') return false;
  if (v.condition !== undefined && typeof v.condition !== 'string') {
    return false;
  }
  return true;
}

export function isValidGraph(value: unknown): value is WorkflowGraph {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkflowGraph>;
  if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) return false;
  if (!v.nodes.every(isValidNode)) return false;
  if (!v.edges.every(isValidEdge)) return false;
  // Edges must reference nodes that exist.
  const ids = new Set(v.nodes.map((n) => n.id));
  return v.edges.every((e) => ids.has(e.source) && ids.has(e.target));
}

/** Returns the ids of edges that form a cycle, or [] if acyclic. */
export function findCycleEdges(graph: WorkflowGraph): WorkflowEdge[] {
  const adjacency = new Map<string, WorkflowEdge[]>();
  for (const e of graph.edges) {
    const arr = adjacency.get(e.source) ?? [];
    arr.push(e);
    adjacency.set(e.source, arr);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of graph.nodes) color.set(n.id, WHITE);
  const inCycle = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string) {
    color.set(node, GRAY);
    stack.push(node);
    for (const e of adjacency.get(node) ?? []) {
      const c = color.get(e.target);
      if (c === GRAY) {
        // Cycle: collect every edge from e.target..node in the current stack.
        const idx = stack.indexOf(e.target);
        if (idx >= 0) {
          for (let i = idx; i < stack.length; i++) {
            const cur = stack[i];
            const nxt = stack[i + 1] ?? e.target;
            const edge = graph.edges.find(
              (x) => x.source === cur && x.target === nxt,
            );
            if (edge) inCycle.add(edge.id);
          }
          inCycle.add(e.id);
        }
        return;
      }
      if (c === WHITE) dfs(e.target);
    }
    color.set(node, BLACK);
    stack.pop();
  }

  for (const n of graph.nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id);
  }
  return graph.edges.filter((e) => inCycle.has(e.id));
}

export function validateDagHasNoCycles(graph: WorkflowGraph): {
  ok: boolean;
  cycle: WorkflowEdge[];
} {
  const cycle = findCycleEdges(graph);
  return { ok: cycle.length === 0, cycle };
}

/**
 * Topological sort over a workflow DAG. Returns null when the graph
 * contains a cycle (use validateDagHasNoCycles for diagnostics).
 */
export function topologicalSort(graph: WorkflowGraph): string[] | null {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of graph.nodes) {
    indegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const e of graph.edges) {
    adjacency.get(e.source)?.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }
  const out: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (out.length !== graph.nodes.length) return null;
  return out;
}

/** Count occurrences of every node kind for header chips. */
export function countNodeKinds(
  graph: WorkflowGraph,
): Record<WorkflowNodeKind, number> {
  const counts: Record<WorkflowNodeKind, number> = {
    start: 0,
    task: 0,
    decision: 0,
    end: 0,
  };
  for (const n of graph.nodes) counts[n.kind]++;
  return counts;
}

/**
 * Default starting node position for "add node" actions. Offsets in
 * a diagonal so newly added nodes don't stack on top of each other.
 */
export function nextNodePosition(
  graph: WorkflowGraph,
  step = 160,
): { x: number; y: number } {
  if (graph.nodes.length === 0) return { x: 80, y: 80 };
  let maxX = 0;
  let maxY = 0;
  for (const n of graph.nodes) {
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { x: maxX + step, y: maxY };
}