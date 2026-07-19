import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('workflow generation domain', () => {
  it('creates a revision-backed schedule workflow from the requested business goal', async () => {
    const generation = await mockHandler('/api/workflows/generate', {
      method: 'POST',
      body: {
        prompt: '每天 09:00 巡检 Kubernetes 集群，发现异常后创建工单并通知值班负责人',
        workspaceId: 'prod-ops',
        model: '企业默认模型',
        constraints: { riskLevel: 'L1', requireApproval: true, requireAudit: true, requireRollback: true },
      },
    }) as any;

    expect(generation.workflow.nodes.some((node: any) => node.kind === 'schedule')).toBe(true);
    expect(generation.workflow.nodes.some((node: any) => node.kind === 'task')).toBe(true);
    expect(generation.status).toBe('review_required');

    const applied = await mockHandler(`/api/workflows/generations/${generation.id}/apply`, { method: 'POST' }) as any;
    expect(applied.revisionId).toBeTruthy();
    expect(applied.status).toBe('applied');

    const validation = await mockHandler('/api/workflows/wf1/validate', { method: 'POST', body: { revisionId: applied.revisionId } }) as any;
    expect(validation.revisionId).toBe(applied.revisionId);
  });

  it('rejects models outside the tenant allowlist', async () => {
    await expect(mockHandler('/api/workflows/generate', {
      method: 'POST',
      body: { prompt: '创建一个低风险通知流程', workspaceId: 'prod-ops', model: 'Claude Sonnet', constraints: {} },
    })).rejects.toThrow('当前工作区不允许使用该生成模型');
  });

  it('blocks a generated external-write workflow until server-side authorization is resolved', async () => {
    const generation = await mockHandler('/api/workflows/generate', {
      method: 'POST',
      body: { prompt: '收到 Redis 告警后执行恢复变更并通知负责人', workspaceId: 'prod-ops', model: '企业默认模型', constraints: { riskLevel: 'L3' } },
    }) as any;
    const applied = await mockHandler(`/api/workflows/generations/${generation.id}/apply`, { method: 'POST' }) as any;

    await expect(mockHandler('/api/workflows/wf1/run', { method: 'POST', body: { version: applied.revisionId } }))
      .rejects.toThrow('外部执行节点的依赖与权限尚未完成服务端授权');
  });
});
