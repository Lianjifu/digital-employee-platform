import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('workflow version management', () => {
  it('returns distinct recorded snapshots for historical versions', async () => {
    const versions = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    expect(versions.length).toBeGreaterThanOrEqual(4);
    expect(versions.every((version) => version.evidenceMode === 'recorded')).toBe(true);
    expect(versions[0].nodeCount).toBeGreaterThan(versions[versions.length - 1].nodeCount);
    expect(versions.find((version) => version.id === 'v1')?.nodes.some((node: any) => node.id === 'n7')).toBe(false);
    expect(versions.find((version) => version.id === 'v4')?.nodes.some((node: any) => node.id === 'n8')).toBe(true);
  });

  it('creates a new draft version from canvas snapshot', async () => {
    const before = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    const beforeCount = before.length;
    const created = await mockHandler('/api/workflows/wf1/versions', {
      method: 'POST',
      body: {
        label: '演练草稿',
        desc: '测试另存',
        parentVersionId: 'v4',
        nodes: [
          { id: 'n1', kind: 'trigger', label: 'Webhook' },
          { id: 'n2', kind: 'notify', label: '通知' },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      },
    }) as any;

    expect(created.status).toBe('draft');
    expect(created.evidenceMode).toBe('recorded');
    expect(created.nodeCount).toBe(2);
    expect(created.parentVersionId).toBe('v4');

    const after = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    expect(after.length).toBe(beforeCount + 1);
    expect(after[0].id).toBe(created.id);
  });

  it('publishes an immutable version from the current draft', async () => {
    const published = await mockHandler('/api/workflows/wf1/publish', {
      method: 'POST',
      body: { version: 'v4' },
    }) as any;
    expect(published.publishedVersion?.status).toBe('published');
    expect(published.publishedVersion?.nodes?.length).toBeGreaterThan(0);

    const versions = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    expect(versions[0].id).toBe(published.publishedVersion.id);
    expect(versions[0].status).toBe('published');
  });

  it('rolls back to a recorded version and creates a new draft', async () => {
    const versions = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    const target = versions.find((version) => version.id === 'v2');
    expect(target).toBeTruthy();

    const result = await mockHandler('/api/workflows/wf1/rollback', {
      method: 'POST',
      body: { versionId: target.id },
    }) as any;

    expect(result.restoredFrom).toBe('v2');
    expect(result.version.status).toBe('draft');
    expect(result.version.parentVersionId).toBe('v2');
    expect(result.draft.nodes.length).toBe(target.nodeCount);
    expect(result.version.nodes.some((node: any) => node.id === 'n8')).toBe(false);
  });

  it('rejects overwrite of published versions on draft save', async () => {
    await expect(mockHandler('/api/workflows/wf1/draft', {
      method: 'PUT',
      body: {
        version: 'v1',
        nodes: [{ id: 'n1', kind: 'trigger', label: 'x' }],
        edges: [],
      },
    })).rejects.toThrow('E_WORKFLOW_VERSION_IMMUTABLE');
  });

  it('rejects rollback without a target versionId', async () => {
    await expect(mockHandler('/api/workflows/wf1/rollback', {
      method: 'POST',
      body: {},
    })).rejects.toThrow('E_WORKFLOW_VERSION_NOT_FOUND');
  });

  it('returns cloned snapshots so callers cannot mutate stored versions', async () => {
    const versions = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    const target = versions.find((version) => version.id === 'v2');
    expect(target?.nodes?.length).toBeGreaterThan(0);
    target.nodes.push({ id: 'mutated', kind: 'notify', label: '污染' });
    const again = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    expect(again.find((version) => version.id === 'v2')?.nodes.some((node: any) => node.id === 'mutated')).toBe(false);
  });

  it('publish appends a new immutable record without mutating the source draft id', async () => {
    const before = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    const source = before.find((version) => version.status === 'draft') ?? before[0];
    const published = await mockHandler('/api/workflows/wf1/publish', {
      method: 'POST',
      body: { version: source.id, label: '生产发布演练' },
    }) as any;
    expect(published.publishedVersion.id).not.toBe(source.id);
    expect(published.publishedVersion.status).toBe('published');
    expect(published.publishedVersion.parentVersionId).toBe(source.id);
    const after = await mockHandler('/api/workflows/wf1/versions', {}) as any[];
    expect(after[0].id).toBe(published.publishedVersion.id);
    expect(after.find((version) => version.id === source.id)?.status).toBe(source.status);
  });
});
