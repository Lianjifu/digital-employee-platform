import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('workflow run history', () => {
  it('returns the same run record after a retry action', async () => {
    const runs = await mockHandler('/api/workflow-runs', {}) as any[];
    const failed = runs.find((run) => run.status === 'failed');
    expect(failed).toBeTruthy();

    await mockHandler(`/api/workflows/wf1/runs/${failed.id}/retry`, { method: 'POST' });
    const refreshed = await mockHandler('/api/workflow-runs', {}) as any[];
    expect(refreshed.find((run) => run.id === failed.id)?.status).toBe('running');
  });
});
