import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const admin = { Authorization: 'Bearer mock-admin-token', 'x-workspace-id': 'w1' };
const auditor = { Authorization: 'Bearer mock-auditor-token', 'x-workspace-id': 'w1' };

describe('access governance mock', () => {
  it('issues one of the three platform roles at login', async () => {
    const user = await mockHandler('/api/auth/login', { method: 'POST', body: { email: 'user@acme.com', password: 'demo' } }) as any;
    const auditorLogin = await mockHandler('/api/auth/login', { method: 'POST', body: { email: 'audit@acme.com', password: 'demo' } }) as any;
    expect(user.user.role).toBe('user');
    expect(auditorLogin.user.role).toBe('auditor');
    expect(auditorLogin.user.permissions).toContain('audit.read');
  });

  it('enforces auditor read-only access and workspace-scoped evidence', async () => {
    const events = await mockHandler('/api/audit-center', { headers: auditor }) as any[];
    expect(Array.isArray(events)).toBe(true);
    await expect(mockHandler('/api/access/grants', { method: 'POST', headers: auditor, body: { subjectName: '测试', role: 'user', workspaceIds: ['w1'], environmentScopes: ['sandbox'] } })).rejects.toThrow('E_AUDITOR_READ_ONLY');
  });

  it('records an administrator access grant and prevents self approval', async () => {
    const grant = await mockHandler('/api/access/grants', { method: 'POST', headers: admin, body: { subjectName: '临时构建者', role: 'user', workspaceIds: ['w2'], environmentScopes: ['sandbox'] } }) as any;
    expect(grant.workspaceIds).toEqual(['w2']);
    await expect(mockHandler('/api/release-approvals/approval-agent-21/approve', { method: 'POST', headers: { 'x-mock-role': 'admin', 'x-mock-user-id': 'u2', 'x-mock-actor': '业务构建者', 'x-workspace-id': 'w1' } })).rejects.toThrow('E_SOD_SELF_APPROVAL');
  });

  it('requires a user to submit a production release request instead of publishing directly', async () => {
    const user = { Authorization: 'Bearer mock-user-token', 'x-workspace-id': 'w1' };
    await expect(mockHandler('/api/workflows/wf1/publish', { method: 'POST', headers: user })).rejects.toThrow('E_RELEASE_REQUEST_REQUIRED');
    const request = await mockHandler('/api/release-approvals', { method: 'POST', headers: user, body: { resourceType: 'workflow', resourceName: '客户工单分流 v1.4' } }) as any;
    expect(request.status).toBe('pending');
    expect(request.submittedById).toBe('u2');
  });

  it('keeps workspace governance actions out of the normal user role', async () => {
    const user = { Authorization: 'Bearer mock-user-token', 'x-workspace-id': 'w1' };
    await expect(mockHandler('/api/memory/policy', { method: 'PATCH', headers: user, body: { retentionDays: 1 } })).rejects.toThrow('E_GOVERNANCE_ADMIN_REQUIRED');
    await expect(mockHandler('/api/memory/refinement/run', { method: 'POST', headers: user, body: {} })).rejects.toThrow('E_GOVERNANCE_ADMIN_REQUIRED');
    await expect(mockHandler('/api/tasks/t1/approve', { method: 'POST', headers: user, body: { approved: true } })).rejects.toThrow('E_TASK_SCOPE');
    await expect(mockHandler('/api/mcp-connections', { method: 'POST', headers: user, body: { name: 'outside', endpoint: 'https://example.com', authMode: 'OAuth' } })).rejects.toThrow('E_GOVERNANCE_ADMIN_REQUIRED');
  });
});
