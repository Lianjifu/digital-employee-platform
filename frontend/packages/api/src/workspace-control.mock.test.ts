import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const writer = { 'x-workspace-id': 'w1', 'x-mock-permissions': 'workspace.read,workspace.write', 'x-mock-actor': '王昊' };

describe('workspace control plane', () => {
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
