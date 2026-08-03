import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const writer = {
  authorization: 'Bearer mock-admin-token',
  'x-workspace-id': 'w1',
};

describe('knowledge docs delete', () => {
  it('deletes a single document and rejects missing ids', async () => {
    const created = await mockHandler('/api/knowledge/docs', {
      method: 'POST',
      headers: writer,
      body: { title: '待删文档', source: 'Runbook', content: '# 正文\n删除校验' },
    }) as { id: string; title: string };

    const result = await mockHandler(`/api/knowledge/doc/${created.id}`, {
      method: 'DELETE',
      headers: writer,
    }) as { deleted: number; ids: string[] };
    expect(result.deleted).toBe(1);
    expect(result.ids).toEqual([created.id]);

    await expect(mockHandler(`/api/knowledge/doc/${created.id}`, {
      method: 'GET',
      headers: writer,
    })).rejects.toThrow();

    await expect(mockHandler('/api/knowledge/docs/delete', {
      method: 'POST',
      headers: writer,
      body: { ids: [] },
    })).rejects.toThrow('请至少选择一项知识资产');
  });

  it('bulk deletes selected documents in the current workspace', async () => {
    const a = await mockHandler('/api/knowledge/docs', {
      method: 'POST',
      headers: writer,
      body: { title: '批量删除 A', source: 'Runbook', content: 'A' },
    }) as { id: string };
    const b = await mockHandler('/api/knowledge/docs', {
      method: 'POST',
      headers: writer,
      body: { title: '批量删除 B', source: 'Runbook', content: 'B' },
    }) as { id: string };

    const result = await mockHandler('/api/knowledge/docs/delete', {
      method: 'POST',
      headers: writer,
      body: { ids: [a.id, b.id] },
    }) as { deleted: number; ids: string[] };

    expect(result.deleted).toBe(2);
    expect(result.ids.sort()).toEqual([a.id, b.id].sort());

    const docs = await mockHandler('/api/knowledge/docs', {
      method: 'GET',
      headers: writer,
    }) as Array<{ id: string }>;
    expect(docs.some((doc) => doc.id === a.id || doc.id === b.id)).toBe(false);
  });
});
