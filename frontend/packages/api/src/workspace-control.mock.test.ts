import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const writer = { 'x-workspace-id': 'w1', 'x-mock-permissions': 'workspace.read,workspace.write', 'x-mock-actor': '王昊' };

describe('workspace control plane', () => {
  it('scopes shared operational records to the active workspace', async () => {
    await mockHandler('/api/mock/reset', { method: 'POST' });
    const w1Tasks = await mockHandler('/api/tasks', { method: 'GET', headers: writer }) as Array<{ workspaceId: string }>;
    const w3Tasks = await mockHandler('/api/tasks', { method: 'GET', headers: { ...writer, 'x-workspace-id': 'w3' } }) as Array<{ workspaceId: string }>;
    expect(w1Tasks.length).toBeGreaterThan(0);
    expect(w3Tasks.length).toBeGreaterThan(0);
    expect(w1Tasks.every((task) => task.workspaceId === 'w1')).toBe(true);
    expect(w3Tasks.every((task) => task.workspaceId === 'w3')).toBe(true);
  });

  it('scopes conversation records and propagates their correlation ID to tasks', async () => {
    const w2Sessions = await mockHandler('/api/sessions', { method: 'GET', headers: { ...writer, 'x-workspace-id': 'w2' } }) as Array<{ workspaceId: string }>;
    expect(w2Sessions.length).toBeGreaterThan(0);
    expect(w2Sessions.every((session) => session.workspaceId === 'w2')).toBe(true);

    const task = await mockHandler('/api/conversations/cv1/tasks', { method: 'POST', headers: writer, body: { title: '会话处置项', correlationId: 'corr_conversation_test' } }) as any;
    expect(task).toMatchObject({ workspaceId: 'w1', correlationId: 'corr_conversation_test', links: { conversationId: 'cv1' } });
  });

  it('keeps knowledge documents and skill health inside the active workspace', async () => {
    const w1Docs = await mockHandler('/api/knowledge/docs', { method: 'GET', headers: writer }) as Array<{ workspaceId: string }>;
    const w2Docs = await mockHandler('/api/knowledge/docs', { method: 'GET', headers: { ...writer, 'x-workspace-id': 'w2' } }) as Array<{ workspaceId: string }>;
    const w2Health = await mockHandler('/api/skills/governance/health', { method: 'GET', headers: { ...writer, 'x-workspace-id': 'w2' } }) as Array<{ skillId: string }>;
    expect(w1Docs.every((document) => document.workspaceId === 'w1')).toBe(true);
    expect(w2Docs.every((document) => document.workspaceId === 'w2')).toBe(true);
    expect(w2Health.every((item) => ['s3', 's7'].includes(item.skillId))).toBe(true);
  });

  it('isolates workflow control state, retrieval evidence, and cross-workspace skill batches', async () => {
    await mockHandler('/api/workflows/wf1/draft', { method: 'PUT', headers: writer, body: { name: 'w1 独立草稿' } });
    const w1Draft = await mockHandler('/api/workflows/wf1', { method: 'GET', headers: writer }) as any;
    const w2Draft = await mockHandler('/api/workflows/wf1', { method: 'GET', headers: { ...writer, 'x-workspace-id': 'w2' } }) as any;
    const w2Chunks = await mockHandler('/api/knowledge/chunks/top', { method: 'GET', headers: { ...writer, 'x-workspace-id': 'w2' } }) as Array<{ workspaceId: string }>;
    expect(w1Draft.name).not.toBe(w2Draft.name);
    expect(w2Chunks.every((chunk) => chunk.workspaceId === 'w2')).toBe(true);
    await expect(mockHandler('/api/skills/governance/batch', { method: 'POST', headers: writer, body: { skillIds: ['s7'], action: 'pause' } })).rejects.toThrow('E_WORKSPACE_SCOPE');
  });

  it('returns a workspace-scoped operations aggregate and agent publish preflight', async () => {
    const operations = await mockHandler('/api/operations/overview', { method: 'GET', headers: writer }) as any;
    const preflight = await mockHandler('/api/agents/a1/publish-preflight', { method: 'GET', headers: writer }) as any;
    expect(operations.workspaceId).toBe('w1');
    expect(operations.health).toMatchObject({ activeAgents: expect.any(Number) });
    expect(preflight).toMatchObject({ agentId: 'a1', ready: expect.any(Boolean) });
    expect(preflight.checks).toHaveLength(4);
  });

  it('rejects cross-workspace reads and writes an audit trail for a controlled lifecycle action', async () => {
    await expect(mockHandler('/api/workspaces/w2/members', { method: 'GET', headers: writer })).rejects.toThrow('E_WORKSPACE_SCOPE');
    const report = await mockHandler('/api/workspaces/w1/report', { method: 'GET', headers: writer }) as any;
    expect(report.workspace.id).toBe('w1');
    const runtime = await mockHandler('/api/workspaces/w1/runtime', { method: 'POST', headers: writer, body: { type: 'handoff', detail: '人工接管' } }) as any;
    expect(runtime.type).toBe('handoff');
    const audit = await mockHandler('/api/workspaces/w1/audit', { method: 'GET', headers: writer }) as any[];
    expect(audit.some((event) => event.action.includes('运行治理'))).toBe(true);
  });

  it('blocks read-only mutations and restricted-data egress', async () => {
    await expect(mockHandler('/api/workspaces/w1/runtime', { method: 'POST', headers: { 'x-workspace-id': 'w1', 'x-mock-permissions': 'workspace.read' }, body: {} })).rejects.toThrow('E_WORKSPACE_WRITE_FORBIDDEN');
    await expect(mockHandler('/api/workspaces/w1/policy', { method: 'PATCH', headers: writer, body: { dataClassification: 'restricted', egressAllowed: true } })).rejects.toThrow('E_WORKSPACE_EGRESS_BLOCKED');
  });
});
