import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const admin = { Authorization: 'Bearer mock-admin-token', 'x-workspace-id': 'w1' };
const user = { Authorization: 'Bearer mock-user-token', 'x-workspace-id': 'w1' };

describe('conversation dual-sign approval mock', () => {
  it('binds the pending approval seat to its authenticated identity and records a server-issued signature', async () => {
    const actionId = `approval-identity-${Date.now()}`;
    await expect(mockHandler(`/api/actions/${actionId}/approve`, {
      method: 'POST', headers: user, body: { signerIndex: 1, conversationId: 's1' },
    })).rejects.toThrow('E_APPROVAL_ASSIGNEE');

    const result = await mockHandler(`/api/actions/${actionId}/approve`, {
      method: 'POST', headers: admin, body: { signerIndex: 1, conversationId: 's1' },
    }) as { completed: boolean; signedAt: string; signatureHash: string };

    expect(result.completed).toBe(true);
    expect(result.signedAt).toMatch(/T/);
    expect(result.signatureHash).toContain('_u1_');
  });

  it('rejects forged session scope and duplicate signing', async () => {
    const actionId = `approval-scope-${Date.now()}`;
    await expect(mockHandler(`/api/actions/${actionId}/approve`, {
      method: 'POST', headers: admin, body: { signerIndex: 1, conversationId: 's2' },
    })).rejects.toThrow('E_APPROVAL_SCOPE');

    await mockHandler(`/api/actions/${actionId}/approve`, {
      method: 'POST', headers: admin, body: { signerIndex: 1, conversationId: 's1' },
    });
    await expect(mockHandler(`/api/actions/${actionId}/approve`, {
      method: 'POST', headers: admin, body: { signerIndex: 1, conversationId: 's1' },
    })).rejects.toThrow('E_APPROVAL_DUPLICATE');
  });
});
