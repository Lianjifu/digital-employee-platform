import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const admin = { Authorization: 'Bearer mock-admin-token', 'x-workspace-id': 'w1' };
const auditor = { Authorization: 'Bearer mock-auditor-token', 'x-workspace-id': 'w1' };

describe('zero trust control plane mock', () => {
  it('denies restricted data egress and records a policy decision', async () => {
    const result = await mockHandler('/api/zero-trust/evaluate', { method: 'POST', headers: admin, body: { resource: 'model', action: 'run', classification: 'restricted', external: true } }) as any;
    expect(result).toMatchObject({ decision: 'deny', policyId: 'zt-restricted-egress' });
    const events = await mockHandler('/api/zero-trust/events', { headers: admin }) as any[];
    expect(events.some((event) => event.correlationId === result.correlationId)).toBe(true);
  });

  it('allows administrators to issue temporary authorization while auditors remain read-only', async () => {
    const authorization = await mockHandler('/api/zero-trust/authorizations', { method: 'POST', headers: admin, body: { subjectName: '临时验证用户', workspaceId: 'w2', environment: 'staging', resource: 'workflow', action: 'run', reason: '回归验证', expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() } }) as any;
    expect(authorization.status).toBe('active');
    await expect(mockHandler('/api/zero-trust/policies', { method: 'POST', headers: auditor, body: { name: '非法修改', resource: 'memory', action: 'write', decision: 'deny' } })).rejects.toThrow('E_AUDITOR_READ_ONLY');
  });

  it('locks tenant security baselines and constrains temporary authorization lifetime', async () => {
    await expect(mockHandler('/api/zero-trust/policies/zt-restricted-egress', { method: 'PATCH', headers: admin, body: { enabled: false } })).rejects.toThrow('E_ZERO_TRUST_BASELINE_LOCKED');
    await expect(mockHandler('/api/zero-trust/authorizations', { method: 'POST', headers: admin, body: { subjectName: '超时访问', workspaceId: 'w2', environment: 'staging', resource: 'workflow', action: 'run', reason: '验证', expiresAt: new Date(Date.now() + 25 * 3600_000).toISOString() } })).rejects.toThrow('E_TEMPORARY_AUTH_TTL_INVALID');
  });
});
