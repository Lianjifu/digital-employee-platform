import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const admin = { Authorization: 'Bearer mock-admin-token', 'x-workspace-id': 'w1' };
const user = { Authorization: 'Bearer mock-user-token', 'x-workspace-id': 'w1' };

describe('conversation dual approval mock', () => {
  it('ships Redis OOM demo message with a complete dual-approval request', async () => {
    const conversation = await mockHandler('/api/conversations/s1', {
      method: 'GET',
      headers: admin,
    }) as {
      messages: Array<{
        id: string;
        role: string;
        approvalRequest?: {
          action: string;
          decision: string;
          signed: number;
          required: number;
          signers: Array<{ userId: string; role: string; signed: boolean }>;
        };
      }>;
    };
    const pending = conversation.messages.find((message) => message.id === 'm3');
    expect(pending?.role).toBe('assistant');
    expect(pending?.approvalRequest).toMatchObject({
      action: 'CONFIG SET maxmemory 8GB',
      decision: 'pending',
      signed: 1,
      required: 2,
    });
    expect(pending?.approvalRequest?.signers).toEqual([
      expect.objectContaining({ userId: 'u2', role: 'operator', signed: true }),
      expect.objectContaining({ userId: 'u1', role: 'approver', signed: false }),
    ]);
  });

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
