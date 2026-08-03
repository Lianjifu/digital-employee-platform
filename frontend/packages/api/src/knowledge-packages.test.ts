import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const writer = {
  authorization: 'Bearer mock-admin-token',
  'x-workspace-id': 'w1',
};

describe('knowledge packages', () => {
  it('attaches docs, processes, and publishes with version bump', async () => {
    const created = await mockHandler('/api/knowledge/packages', {
      method: 'POST',
      headers: writer,
      body: { name: '联调交付包', description: 'attach/publish', domain: 'SRE', classification: 'internal' },
    }) as { id: string; documentCount: number; status: string };

    expect(created.status).toBe('draft');
    expect(created.documentCount).toBe(0);

    await expect(mockHandler(`/api/knowledge/packages/${created.id}/publish`, {
      method: 'POST',
      headers: writer,
      body: {},
    })).rejects.toThrow('无可发布文档');

    const doc = await mockHandler('/api/knowledge/docs', {
      method: 'POST',
      headers: writer,
      body: { title: '交付手册', source: 'Runbook', content: '# 手册\n步骤一', packageId: created.id },
    }) as { id: string; packageId?: string };
    expect(doc.packageId).toBe(created.id);

    // Mark ready immediately for publish gate in this test.
    const docs = await mockHandler('/api/knowledge/docs', { method: 'GET', headers: writer }) as Array<{ id: string; status: string }>;
    const uploaded = docs.find((item) => item.id === doc.id);
    if (uploaded) uploaded.status = 'ready';

    const attached = await mockHandler(`/api/knowledge/packages/${created.id}/attach`, {
      method: 'POST',
      headers: writer,
      body: { docIds: [doc.id] },
    }) as { documentCount: number; documentIds?: string[] };
    expect(attached.documentCount).toBeGreaterThanOrEqual(1);
    expect(attached.documentIds?.includes(doc.id)).toBe(true);

    const job = await mockHandler(`/api/knowledge/packages/${created.id}/process`, {
      method: 'POST',
      headers: writer,
      body: { strategy: 'semantic' },
    }) as { packageId: string; documentCount: number; status: string };
    expect(job.packageId).toBe(created.id);
    expect(job.documentCount).toBeGreaterThanOrEqual(1);

    const published = await mockHandler(`/api/knowledge/packages/${created.id}/publish`, {
      method: 'POST',
      headers: writer,
      body: {},
    }) as { status: string; currentVersion: { version: string; status: string }; versions: Array<{ version: string }> };
    expect(published.status).toBe('published');
    expect(published.currentVersion.status).toBe('published');
    expect(published.versions.length).toBeGreaterThanOrEqual(2);
  });

  it('deletes a package without runtime consumers and clears doc ownership', async () => {
    const created = await mockHandler('/api/knowledge/packages', {
      method: 'POST',
      headers: writer,
      body: { name: '待删包', description: 'delete', domain: 'SRE', classification: 'internal' },
    }) as { id: string };

    const doc = await mockHandler('/api/knowledge/docs', {
      method: 'POST',
      headers: writer,
      body: { title: '仍保留文档', source: 'Runbook', content: '正文保留', packageId: created.id },
    }) as { id: string; packageId?: string };
    expect(doc.packageId).toBe(created.id);

    const result = await mockHandler(`/api/knowledge/packages/${created.id}/delete`, {
      method: 'POST',
      headers: writer,
      body: {},
    }) as { id: string; deleted: boolean };
    expect(result.deleted).toBe(true);

    const packages = await mockHandler('/api/knowledge/packages', { method: 'GET', headers: writer }) as Array<{ id: string }>;
    expect(packages.some((item) => item.id === created.id)).toBe(false);

    const docs = await mockHandler('/api/knowledge/docs', { method: 'GET', headers: writer }) as Array<{ id: string; packageId?: string; title: string }>;
    const kept = docs.find((item) => item.id === doc.id);
    expect(kept?.title).toBe('仍保留文档');
    expect(kept?.packageId).toBeUndefined();
  });
});
