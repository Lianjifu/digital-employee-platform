import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const admin = { Authorization: 'Bearer mock-admin-token', 'x-workspace-id': 'w1' };
const auditor = { Authorization: 'Bearer mock-auditor-token', 'x-workspace-id': 'w1' };

describe('digital employee control plane', () => {
  it('keeps employee records scoped to the active workspace', async () => {
    const employees = await mockHandler('/api/digital-employees', { method: 'GET', headers: admin }) as Array<{ workspaceId: string }>;
    expect(employees.length).toBeGreaterThan(0);
    expect(employees.every((employee) => employee.workspaceId === 'w1')).toBe(true);
  });

  it('requires a completed evaluation before an employee can request release', async () => {
    const employee = await mockHandler('/api/digital-employees', { method: 'POST', headers: admin, body: { name: '测试采购专员', role: '采购询价', department: '采购中心' } }) as { id: string };
    await expect(mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: admin })).rejects.toThrow('E_DIGITAL_EMPLOYEE_EVALUATION_REQUIRED');

    const evaluated = await mockHandler(`/api/digital-employees/${employee.id}/evaluate`, { method: 'POST', headers: admin }) as any;
    expect(evaluated.evaluation.status).toBe('passed');

    const submitted = await mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: admin }) as any;
    expect(submitted).toMatchObject({ lifecycle: 'pending_approval', release: { status: 'pending_approval' } });
  });

  it('keeps auditors read-only while allowing evidence lookup', async () => {
    const evidence = await mockHandler('/api/digital-employees/de-sre/evidence', { method: 'GET', headers: auditor }) as Array<{ action: string }>;
    expect(evidence.length).toBeGreaterThan(0);
    await expect(mockHandler('/api/digital-employees/de-sre/lifecycle', { method: 'POST', headers: auditor, body: { lifecycle: 'paused' } })).rejects.toThrow('E_AUDITOR_READ_ONLY');
  });
});
