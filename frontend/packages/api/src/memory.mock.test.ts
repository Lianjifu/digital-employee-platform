import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const w1 = { 'x-workspace-id': 'w1', 'x-mock-permissions': 'workspace.read,workspace.write', 'x-mock-actor': '王昊' };

describe('memory control plane', () => {
  it('keeps memory records within the active workspace', async () => {
    const w1Records = await mockHandler('/api/memory/records', { method: 'GET', headers: w1 }) as Array<{ workspaceId: string }>;
    const w2Records = await mockHandler('/api/memory/records', { method: 'GET', headers: { ...w1, 'x-workspace-id': 'w2' } }) as Array<{ workspaceId: string }>;
    expect(w1Records.every((record) => record.workspaceId === 'w1')).toBe(true);
    expect(w2Records.every((record) => record.workspaceId === 'w2')).toBe(true);
  });

  it('requires long-term memory before creating a knowledge candidate', async () => {
    await expect(mockHandler('/api/memory/records/mem-short-1/candidate', { method: 'POST', headers: w1 }))
      .rejects.toThrow('E_MEMORY_LAYER_INVALID');

    const candidate = await mockHandler('/api/memory/records/mem-long-1/candidate', { method: 'POST', headers: w1 }) as any;
    expect(candidate).toMatchObject({ workspaceId: 'w1', memoryId: 'mem-long-1', status: 'pending_review' });

    const approved = await mockHandler(`/api/memory/candidates/${candidate.id}/approve`, { method: 'POST', headers: w1 }) as any;
    expect(approved).toMatchObject({ status: 'approved', knowledgePackageId: expect.any(String) });
    const packages = await mockHandler('/api/knowledge/packages', { method: 'GET', headers: w1 }) as Array<{ id: string }>;
    expect(packages.some((item) => item.id === approved.knowledgePackageId)).toBe(true);
  });

  it('audits memory policy changes', async () => {
    const policy = await mockHandler('/api/memory/policy', { method: 'PATCH', headers: w1, body: { shortTermTtlHours: 12 } }) as any;
    const audit = await mockHandler('/api/memory/audit', { method: 'GET', headers: w1 }) as Array<{ action: string }>;
    expect(policy.shortTermTtlHours).toBe(12);
    expect(audit[0]).toMatchObject({ action: '更新记忆策略' });
  });

  it('runs the daily progressive refinement without bypassing knowledge review', async () => {
    await mockHandler('/api/memory/policy', { method: 'PATCH', headers: w1, body: { minimumConfidence: 0.8, shortToWorkingEnabled: true, workingToLongEnabled: true, longToKnowledgeEnabled: true } });
    const result = await mockHandler('/api/memory/refinement/run', { method: 'POST', headers: w1, body: {} }) as any;
    const candidates = await mockHandler('/api/memory/candidates', { method: 'GET', headers: w1 }) as Array<{ status: string }>;
    expect(result).toMatchObject({ scheduledFor: expect.any(String), workingCreated: expect.any(Number), longCreated: expect.any(Number), candidatesCreated: expect.any(Number) });
    expect(candidates.some((item) => item.status === 'pending_review')).toBe(true);
  });
});
