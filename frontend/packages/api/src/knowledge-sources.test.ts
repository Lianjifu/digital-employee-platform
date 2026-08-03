import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const writer = {
  authorization: 'Bearer mock-admin-token',
  'x-workspace-id': 'w1',
};

describe('knowledge sources', () => {
  it('requires endpoint for pull sources and syncs assets', async () => {
    await expect(mockHandler('/api/knowledge/sources', {
      method: 'POST',
      headers: writer,
      body: { name: '空地址源', kind: 'REST API', schedule: '每 1 小时' },
    })).rejects.toThrow('连接地址不能为空');

    const created = await mockHandler('/api/knowledge/sources', {
      method: 'POST',
      headers: writer,
      body: {
        name: '变更记录库',
        kind: 'REST API',
        schedule: '每 1 小时',
        endpoint: 'https://api.example.com/changes',
        credentialHint: 'Bearer demo',
      },
    }) as { id: string; status: string; endpoint?: string; documents: number };

    expect(created.status).toBe('attention');
    expect(created.endpoint).toBe('https://api.example.com/changes');
    expect(created.documents).toBe(0);

    const synced = await mockHandler(`/api/knowledge/sources/${created.id}/sync`, {
      method: 'POST',
      headers: writer,
      body: {},
    }) as { status: string; documents: number; lastSync: string };

    expect(synced.status).toBe('healthy');
    expect(synced.documents).toBeGreaterThanOrEqual(1);
    expect(synced.lastSync).toBe('刚刚');
  });

  it('issues webhook callback endpoint without requiring address', async () => {
    const created = await mockHandler('/api/knowledge/sources', {
      method: 'POST',
      headers: writer,
      body: { name: 'SIEM 推送', kind: 'Webhook' },
    }) as { endpoint?: string; schedule: string; status: string };

    expect(created.endpoint).toMatch(/^\/hooks\/knowledge\//);
    expect(created.schedule).toBe('事件推送');
    expect(created.status).toBe('attention');
  });
});
