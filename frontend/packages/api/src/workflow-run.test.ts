import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('workflow run history', () => {
  it('creates a new attempt on retry instead of mutating the failed run', async () => {
    const runs = await mockHandler('/api/workflow-runs', {}) as any[];
    const failed = runs.find((run) => run.status === 'failed');
    expect(failed).toBeTruthy();
    const beforeCount = runs.length;

    const retry = await mockHandler(`/api/workflows/wf1/runs/${failed.id}/retry`, { method: 'POST' }) as any;
    expect(retry.id).not.toBe(failed.id);
    expect(retry.status).toBe('running');
    expect(retry.parentRunId).toBe(failed.id);
    expect(retry.attempt).toBe((failed.attempt ?? 1) + 1);
    expect(retry.evidenceMode).toBe(failed.nodeSteps?.length ? 'recorded' : 'synthetic');

    const refreshed = await mockHandler('/api/workflow-runs', {}) as any[];
    expect(refreshed.length).toBe(beforeCount + 1);
    expect(refreshed.find((run) => run.id === failed.id)?.status).toBe('failed');
    expect(refreshed.find((run) => run.id === retry.id)?.parentRunId).toBe(failed.id);
  });

  it('rejects retry for non-failed runs', async () => {
    const runs = await mockHandler('/api/workflow-runs', {}) as any[];
    const success = runs.find((run) => run.status === 'success');
    expect(success).toBeTruthy();
    await expect(mockHandler(`/api/workflows/${success.workflowId}/runs/${success.id}/retry`, { method: 'POST' }))
      .rejects.toThrow('E_WORKFLOW_RUN_NOT_RETRYABLE');
  });

  it('records sandbox trial runs with node snapshot evidence', async () => {
    const nodes = [
      { id: 'n1', kind: 'trigger', label: 'Webhook 触发' },
      { id: 'n2', kind: 'approval', label: '双重审批' },
      { id: 'n3', kind: 'execute', label: '执行受控恢复' },
      { id: 'n4', kind: 'execute', label: '回滚 + 告警' },
      { id: 'n5', kind: 'audit', label: '审计留痕' },
    ];
    const run = await mockHandler('/api/workflows/wf1/run', {
      method: 'POST',
      body: { mode: 'sandbox', trigger: '画布沙箱试运行', nodes, edges: [] },
    }) as any;

    expect(run.status).toBe('running');
    expect(run.environment).toBe('sandbox');
    expect(run.evidenceMode).toBe('recorded');
    expect(run.nodeSteps?.length).toBe(5);
    expect(run.trigger).toBe('画布沙箱试运行');

    const refreshed = await mockHandler('/api/workflow-runs', {}) as any[];
    expect(refreshed[0].id).toBe(run.id);
  });

  it('treats review checks as non-blocking for validate passed', async () => {
    const validation = await mockHandler('/api/workflows/wf1/validate', {
      method: 'POST',
      body: {
        nodes: [
          { id: 'n1', kind: 'trigger', label: 'Webhook' },
          { id: 'n2', kind: 'approval', label: '审批' },
          { id: 'n3', kind: 'execute', label: '执行' },
          { id: 'n4', kind: 'execute', label: '回滚路径' },
          { id: 'n5', kind: 'audit', label: '审计' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n2', target: 'n3' },
          { id: 'e3', source: 'n3', target: 'n4' },
          { id: 'e4', source: 'n4', target: 'n5' },
        ],
      },
    }) as any;

    expect(validation.passed).toBe(true);
    expect(validation.checks.dependencies).toBe('review');
    expect(validation.checks.approval).toBe('passed');
  });
});
