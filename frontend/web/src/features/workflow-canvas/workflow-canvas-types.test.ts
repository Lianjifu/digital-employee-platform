import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_NODE_KINDS,
  countNodeKinds,
  findCycleEdges,
  isValidEdge,
  isValidGraph,
  isValidNode,
  isWorkflowNodeKind,
  nextNodePosition,
  topologicalSort,
  validateDagHasNoCycles,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from './workflow-types';

const start: WorkflowNode = { id: 'n1', kind: 'start', label: 'Start', x: 0, y: 0 };
const task: WorkflowNode = { id: 'n2', kind: 'task', label: 'Do work', x: 120, y: 0 };
const decision: WorkflowNode = {
  id: 'n3',
  kind: 'decision',
  label: 'OK?',
  x: 240,
  y: 0,
};
const end: WorkflowNode = { id: 'n4', kind: 'end', label: 'Done', x: 360, y: 0 };
const edge = (overrides: Partial<WorkflowEdge>): WorkflowEdge => ({
  id: 'e?',
  source: 'n1',
  target: 'n2',
  ...overrides,
});

describe('workflow-types: isWorkflowNodeKind / isValidNode', () => {
  it('recognises the four canonical kinds', () => {
    expect(WORKFLOW_NODE_KINDS).toEqual(['start', 'task', 'decision', 'end']);
    expect(isWorkflowNodeKind('start')).toBe(true);
    expect(isWorkflowNodeKind('decision')).toBe(true);
    expect(isWorkflowNodeKind('random')).toBe(false);
  });

  it('accepts a well-formed node and rejects malformed ones', () => {
    expect(isValidNode(start)).toBe(true);
    expect(isValidNode({ ...task, meta: { retries: 2 } })).toBe(true);
    expect(isValidNode({ ...task, x: 'oops' })).toBe(false);
    expect(isValidNode({ ...task, y: NaN })).toBe(false);
    expect(isValidNode({ ...task, kind: 'unknown' })).toBe(false);
    expect(isValidNode({ id: '' })).toBe(false);
    expect(isValidNode({ meta: 'not-an-object' })).toBe(false);
  });
});

describe('workflow-types: isValidEdge', () => {
  it('accepts valid edges and rejects self-loops / missing endpoints', () => {
    expect(isValidEdge(edge({}))).toBe(true);
    expect(isValidEdge(edge({ condition: 'true' }))).toBe(true);
    expect(isValidEdge(edge({ source: 'n2', target: 'n1' }))).toBe(true);
    expect(isValidEdge(edge({ source: 'n1', target: 'n1' }))).toBe(false);
    expect(isValidEdge(edge({ source: '', target: 'n2' }))).toBe(false);
    expect(isValidEdge(edge({ label: 1 as unknown as string }))).toBe(false);
    expect(isValidEdge(edge({ id: '' }))).toBe(false);
  });
});

describe('workflow-types: isValidGraph', () => {
  it('accepts a graph whose edges reference real nodes', () => {
    const g: WorkflowGraph = {
      nodes: [start, task, decision, end],
      edges: [
        edge({ id: 'e1', source: 'n1', target: 'n2' }),
        edge({ id: 'e2', source: 'n2', target: 'n3' }),
        edge({ id: 'e3', source: 'n3', target: 'n4' }),
      ],
    };
    expect(isValidGraph(g)).toBe(true);
  });

  it('rejects when an edge points to a non-existent node', () => {
    const bad: WorkflowGraph = {
      nodes: [start, task],
      edges: [edge({ id: 'e1', source: 'n1', target: 'n2' }), edge({ id: 'e2', source: 'n2', target: 'ghost' })],
    };
    expect(isValidGraph(bad)).toBe(false);
  });

  it('accepts an empty graph', () => {
    expect(isValidGraph({ nodes: [], edges: [] })).toBe(true);
  });
});

describe('workflow-types: cycle detection + topological sort', () => {
  it('flags a 2-node cycle', () => {
    const g: WorkflowGraph = {
      nodes: [start, task],
      edges: [
        edge({ id: 'e1', source: 'n1', target: 'n2' }),
        edge({ id: 'e2', source: 'n2', target: 'n1' }),
      ],
    };
    const { ok, cycle } = validateDagHasNoCycles(g);
    expect(ok).toBe(false);
    expect(cycle.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('returns empty cycle set for a DAG', () => {
    const g: WorkflowGraph = {
      nodes: [start, task, decision, end],
      edges: [
        edge({ id: 'e1', source: 'n1', target: 'n2' }),
        edge({ id: 'e2', source: 'n2', target: 'n3' }),
        edge({ id: 'e3', source: 'n3', target: 'n4' }),
      ],
    };
    expect(validateDagHasNoCycles(g)).toEqual({ ok: true, cycle: [] });
    expect(topologicalSort(g)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('returns null from topologicalSort when graph has a cycle', () => {
    const g: WorkflowGraph = {
      nodes: [start, task],
      edges: [
        edge({ id: 'e1', source: 'n1', target: 'n2' }),
        edge({ id: 'e2', source: 'n2', target: 'n1' }),
      ],
    };
    expect(topologicalSort(g)).toBeNull();
  });

  it('handles a single-node graph', () => {
    const g: WorkflowGraph = { nodes: [start], edges: [] };
    expect(findCycleEdges(g)).toEqual([]);
    expect(topologicalSort(g)).toEqual(['n1']);
  });
});

describe('workflow-types: helpers', () => {
  it('countNodeKinds tallies each kind', () => {
    const g: WorkflowGraph = {
      nodes: [start, task, { ...task, id: 'n5' }, decision, end],
      edges: [],
    };
    expect(countNodeKinds(g)).toEqual({ start: 1, task: 2, decision: 1, end: 1 });
  });

  it('nextNodePosition offsets diagonally from the existing max corner', () => {
    expect(nextNodePosition({ nodes: [], edges: [] })).toEqual({ x: 80, y: 80 });
    const g: WorkflowGraph = {
      nodes: [
        { ...start, x: 200, y: 50 },
        { ...task, x: 100, y: 200 },
      ],
      edges: [],
    };
    expect(nextNodePosition(g)).toEqual({ x: 360, y: 200 });
  });
});