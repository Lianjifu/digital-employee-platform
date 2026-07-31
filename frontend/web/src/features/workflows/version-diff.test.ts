import { describe, expect, it } from 'vitest';
import { computeVersionDiff } from './version-diff';
import type { Edge, Node } from 'reactflow';

function node(id: string, label: string, kind = 'task'): Node {
  return { id, type: 'custom', position: { x: 0, y: 0 }, data: { kind, label } };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

describe('computeVersionDiff', () => {
  it('reports added, removed and changed nodes plus edge deltas', () => {
    const base = {
      nodes: [node('n1', '触发', 'trigger'), node('n2', '审批', 'approval')],
      edges: [edge('e1', 'n1', 'n2')],
    };
    const target = {
      nodes: [node('n1', 'Webhook 触发', 'trigger'), node('n3', '通知', 'notify')],
      edges: [edge('e2', 'n1', 'n3')],
    };
    const diff = computeVersionDiff(base, target);
    expect(diff.addedNodes).toEqual([{ id: 'n3', label: '通知' }]);
    expect(diff.removedNodes).toEqual([{ id: 'n2', label: '审批' }]);
    expect(diff.changedNodes).toEqual([{ id: 'n1', from: 'trigger:触发', to: 'trigger:Webhook 触发' }]);
    expect(diff.addedEdges).toBe(1);
    expect(diff.removedEdges).toBe(1);
  });

  it('returns empty deltas when graphs match', () => {
    const graph = {
      nodes: [node('n1', '触发', 'trigger')],
      edges: [] as Edge[],
    };
    expect(computeVersionDiff(graph, graph)).toEqual({
      addedNodes: [],
      removedNodes: [],
      changedNodes: [],
      addedEdges: 0,
      removedEdges: 0,
    });
  });
});
