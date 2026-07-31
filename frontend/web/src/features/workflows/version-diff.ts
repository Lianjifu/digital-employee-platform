import type { Edge, Node } from 'reactflow';

export type VersionGraphSnapshot = { nodes: Node[]; edges: Edge[] };

export type VersionDiffResult = {
  addedNodes: Array<{ id: string; label: string }>;
  removedNodes: Array<{ id: string; label: string }>;
  changedNodes: Array<{ id: string; from: string; to: string }>;
  addedEdges: number;
  removedEdges: number;
};

export function computeVersionDiff(base: VersionGraphSnapshot, target: VersionGraphSnapshot): VersionDiffResult {
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  const targetNodes = new Map(target.nodes.map((node) => [node.id, node]));
  const addedNodes: VersionDiffResult['addedNodes'] = [];
  const removedNodes: VersionDiffResult['removedNodes'] = [];
  const changedNodes: VersionDiffResult['changedNodes'] = [];
  targetNodes.forEach((node, id) => {
    const prev = baseNodes.get(id);
    if (!prev) {
      addedNodes.push({ id, label: String(node.data?.label ?? id) });
      return;
    }
    const fromLabel = String(prev.data?.label ?? '');
    const toLabel = String(node.data?.label ?? '');
    const fromKind = String(prev.data?.kind ?? '');
    const toKind = String(node.data?.kind ?? '');
    if (fromLabel !== toLabel || fromKind !== toKind) {
      changedNodes.push({ id, from: `${fromKind || 'node'}:${fromLabel || id}`, to: `${toKind || 'node'}:${toLabel || id}` });
    }
  });
  baseNodes.forEach((node, id) => {
    if (!targetNodes.has(id)) removedNodes.push({ id, label: String(node.data?.label ?? id) });
  });
  const baseEdges = new Set(base.edges.map((edge) => `${edge.source}->${edge.target}`));
  const targetEdges = new Set(target.edges.map((edge) => `${edge.source}->${edge.target}`));
  let addedEdges = 0;
  let removedEdges = 0;
  targetEdges.forEach((key) => { if (!baseEdges.has(key)) addedEdges += 1; });
  baseEdges.forEach((key) => { if (!targetEdges.has(key)) removedEdges += 1; });
  return { addedNodes, removedNodes, changedNodes, addedEdges, removedEdges };
}
