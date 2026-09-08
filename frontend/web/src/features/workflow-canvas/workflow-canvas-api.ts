import type { WorkflowGraph } from './workflow-types';
import { isValidGraph } from './workflow-types';

export type WorkflowFetchOptions = {
  workspaceId?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export type WorkflowEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function unwrap<T>(raw: unknown): WorkflowEnvelope<T> {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return { ok: true, data: (raw as { data: T }).data };
  }
  return { ok: true, data: raw as T };
}

async function send<T>(
  path: string,
  init: RequestInit,
  opts: WorkflowFetchOptions = {},
): Promise<WorkflowEnvelope<T>> {
  const fetchImpl =
    opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : (() => undefined) as unknown as typeof fetch);
  const base = opts.baseUrl ?? '';
  const res = await fetchImpl(base + path, {
    credentials: 'same-origin',
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      error: text
        ? `${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`
        : `${init.method ?? 'GET'} ${path} -> ${res.status}`,
    };
  }
  const json = await res.json().catch(() => ({}));
  return unwrap<T>(json);
}

export async function getWorkflow(
  boardId: string,
  opts: WorkflowFetchOptions = {},
): Promise<WorkflowEnvelope<WorkflowGraph>> {
  return send(
    `/api/canvas/boards/${encodeURIComponent(boardId)}/workflow`,
    { method: 'GET' },
    opts,
  );
}

export async function putWorkflow(
  boardId: string,
  graph: WorkflowGraph,
  opts: WorkflowFetchOptions = {},
): Promise<WorkflowEnvelope<WorkflowGraph>> {
  if (!isValidGraph(graph)) {
    return { ok: false, error: 'workflow graph failed client-side validation' };
  }
  return send(
    `/api/canvas/boards/${encodeURIComponent(boardId)}/workflow`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: graph.nodes, edges: graph.edges }),
    },
    opts,
  );
}