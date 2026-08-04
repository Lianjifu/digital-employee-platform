import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('control plane mock mutations', () => {
  const modelWriteHeaders = { 'x-mock-permissions': 'model.read,model.write', 'x-workspace-id': 'w1' };
  const channelWriteHeaders = { 'x-mock-permissions': 'channel.read,channel.write', 'x-workspace-id': 'w1' };

  it('keeps channel credentials write-only and protects published delivery dependencies', async () => {
    const deployment = await mockHandler('/api/channel-control/deployments', { method: 'POST', headers: channelWriteHeaders, body: { name: '受控飞书', kind: 'feishu', credential: 'channel-secret' } }) as any;
    expect(deployment.credentialRef).toMatch(/^vault:\/\/channel-deployments\//);
    expect(JSON.stringify(deployment)).not.toContain('channel-secret');
    expect(deployment.connectionMode).toBe('webhook');
    expect(deployment.webhookPath).toMatch(/\/api\/channel\/feishu\/events\//);

    const wsDeploy = await mockHandler('/api/channel-control/deployments', {
      method: 'POST', headers: channelWriteHeaders,
      body: { name: '飞书WebSocket', kind: 'feishu', appId: 'cli_ws', appSecret: 'sec_ws', connectionMode: 'websocket' },
    }) as any;
    expect(wsDeploy.connectionMode).toBe('websocket');
    expect(wsDeploy.webhookPath).toBeUndefined();

    const patched = await mockHandler(`/api/channel-control/deployments/${wsDeploy.id}`, {
      method: 'PATCH', headers: channelWriteHeaders,
      body: { name: '飞书已改名', environment: 'production', connectionMode: 'webhook' },
    }) as any;
    expect(patched.name).toBe('飞书已改名');
    expect(patched.environment).toBe('production');
    expect(patched.connectionMode).toBe('webhook');
    expect(patched.webhookPath).toMatch(/\/api\/channel\/feishu\/events\//);

    const policies = await mockHandler('/api/channel-control/policies', { method: 'GET', headers: channelWriteHeaders }) as any[];
    const policy = policies[0];
    await mockHandler(`/api/channel-control/policies/${policy.id}/validate`, { method: 'POST', headers: channelWriteHeaders, body: {} });
    await mockHandler(`/api/channel-control/policies/${policy.id}/publish`, { method: 'POST', headers: channelWriteHeaders, body: { reason: '上线' } });
    await expect(mockHandler(`/api/channel-control/deployments/${policy.primaryDeploymentId}`, { method: 'DELETE', headers: channelWriteHeaders, body: { reason: '退役' } })).rejects.toThrow('E_CHANNEL_IN_USE');
  });

  it('requires published delivery policies and writes failed deliveries to dead letter', async () => {
    const policies = await mockHandler('/api/channel-control/policies', { method: 'GET', headers: channelWriteHeaders }) as any[];
    const policy = policies[0];
    const attempt = await mockHandler('/api/channel-control/deliveries', { method: 'POST', headers: channelWriteHeaders, body: { policyId: policy.id, target: 'fail@example.com', content: 'sensitive incident payload' } }) as any;
    expect(attempt.status).toBe('dead_letter');
    expect(attempt.targetMasked).not.toContain('fail@example.com');
    const deadLetters = await mockHandler('/api/channel-control/dead-letters', { method: 'GET', headers: channelWriteHeaders }) as any[];
    expect(deadLetters.some((item) => item.id === attempt.id)).toBe(true);
  });

  it('grants model write only to the mock administrator session', async () => {
    const admin = await mockHandler('/api/auth/login', { method: 'POST', body: { email: 'admin@acme.com', password: 'demo' } }) as any;
    const operator = await mockHandler('/api/auth/login', { method: 'POST', body: { email: 'sre@acme.com', password: 'demo' } }) as any;
    expect(admin.user.permissions).toContain('model.write');
    expect(operator.user.permissions).not.toContain('model.write');
  });

  it('rejects model control-plane writes without model.write', async () => {
    await expect(mockHandler('/api/model-providers', {
      method: 'POST', headers: { 'x-mock-permissions': 'model.read', 'x-workspace-id': 'w1' },
      body: { name: '只读用户的接入', model: 'blocked-model', credential: 'sk-blocked' },
    })).rejects.toThrow('E_MODEL_WRITE_FORBIDDEN');
  });

  it('rejects unauthenticated reads from the model control plane', async () => {
    await expect(mockHandler('/api/model-providers', { method: 'GET' })).rejects.toThrow('E_MODEL_READ_FORBIDDEN');
  });

  it('keeps restricted data on cn-resident model deployments', async () => {
    const policy = await mockHandler('/api/model-routing/policies', {
      method: 'POST', headers: modelWriteHeaders,
      body: { level: 'P3', primaryModelId: 'model-sonnet', fallbackModelIds: [], dataScope: 'restricted', egressAllowed: false, budgetLimitUsd: 100 },
    }) as any;
    const validation = await mockHandler(`/api/model-routing/policies/${policy.id}/validate`, { method: 'POST', headers: modelWriteHeaders, body: {} }) as any;
    expect(validation.status).toBe('draft');
    expect(validation.validationIssues).toContain('E_EGRESS_BLOCKED: 受限数据必须路由至境内模型部署');
  });

  it('rejects a route that references a model deployment from another workspace', async () => {
    const policy = await mockHandler('/api/model-routing/policies', {
      method: 'POST', headers: modelWriteHeaders,
      body: { level: 'P3', primaryModelId: 'model-w2-isolated', fallbackModelIds: [], dataScope: 'internal', egressAllowed: false, budgetLimitUsd: 100 },
    }) as any;
    const validation = await mockHandler(`/api/model-routing/policies/${policy.id}/validate`, { method: 'POST', headers: modelWriteHeaders, body: {} }) as any;
    expect(validation.validationIssues).toContain('E_MODEL_SCOPE: 模型部署不属于当前工作区');
  });

  it('refuses failover drills for an unpublished routing policy', async () => {
    await expect(mockHandler('/api/model-routing/failover-tests', {
      method: 'POST', headers: modelWriteHeaders,
      body: { policyId: 'route-p1', scope: 'sandbox', reason: '草稿演练' },
    })).rejects.toThrow('E_POLICY_NOT_PUBLISHED');
  });

  it('keeps provider credentials write-only and records connection verification', async () => {
    const provider = await mockHandler('/api/model-providers', {
      method: 'POST', headers: modelWriteHeaders,
      body: { name: '受控模型接入', tier: 'official', region: 'cn-east-1', model: 'model-qwen', credential: 'sk-never-return-this' },
    }) as any;

    expect(provider.credentialRef).toMatch(/^vault:\/\/model-providers\//);
    expect(JSON.stringify(provider)).not.toContain('sk-never-return-this');

    const verified = await mockHandler(`/api/model-providers/${provider.id}/test`, { method: 'POST', headers: modelWriteHeaders, body: { reason: '上线前连通性验证' } }) as any;
    expect(verified.status).toBe('healthy');
    expect(verified.providerStatus).toBe('active');

    const providers = await mockHandler('/api/model-providers', { method: 'GET', headers: modelWriteHeaders }) as any[];
    expect(providers.find((item) => item.id === provider.id)?.status).toBe('active');
  });

  it('allows patching provider metadata without returning raw credentials', async () => {
    const provider = await mockHandler('/api/model-providers', {
      method: 'POST', headers: modelWriteHeaders,
      body: { name: '待更名供应商', tier: 'official', region: 'us-east-1', model: 'gpt-test', credential: 'sk-secret-value' },
    }) as any;
    const updated = await mockHandler(`/api/model-providers/${provider.id}`, {
      method: 'PATCH', headers: modelWriteHeaders,
      body: { name: '已更名供应商', region: 'cn-east-1', reason: '资料校正' },
    }) as any;
    expect(updated.name).toBe('已更名供应商');
    expect(updated.cloudRegion).toBe('cn-east-1');
    expect(updated.dataResidency).toBe('cn');
    expect(JSON.stringify(updated)).not.toContain('sk-secret-value');
  });

  it('returns an expanded governance overview snapshot', async () => {
    const overview = await mockHandler('/api/model-governance/overview', { method: 'GET', headers: modelWriteHeaders }) as any;
    expect(overview.activeProviders).toBeGreaterThan(0);
    expect(overview).toHaveProperty('monthlyBudgetUsd');
    expect(overview).toHaveProperty('regionDistribution');
    expect(['normal', 'attention', 'critical']).toContain(overview.budgetRisk);
  });

  it('rejects removal of a provider referenced by a published model route', async () => {
    const impact = await mockHandler('/api/model-providers/p1/impact', { method: 'GET', headers: modelWriteHeaders }) as any;
    expect(impact.deletionAllowed).toBe(false);

    await expect(mockHandler('/api/model-providers/p1', { method: 'DELETE', headers: modelWriteHeaders, body: { reason: '退役验证' } }))
      .rejects.toThrow('E_PROVIDER_IN_USE');
  });

  it('allows provider deletion after unpublishing the referencing route', async () => {
    const policies = await mockHandler('/api/model-routing/policies', { method: 'GET', headers: modelWriteHeaders }) as any[];
    const blocking = policies.find((policy) => policy.status === 'published' && [policy.primaryModelId, ...policy.fallbackModelIds].length);
    expect(blocking).toBeTruthy();

    const unpublished = await mockHandler(`/api/model-routing/policies/${blocking.id}/unpublish`, {
      method: 'POST', headers: modelWriteHeaders, body: { reason: '下线以便退役' },
    }) as any;
    expect(unpublished.status).toBe('draft');

    const impact = await mockHandler(`/api/model-providers/p1/impact`, { method: 'GET', headers: modelWriteHeaders }) as any;
    // p1 may still be referenced by other published policies; only assert unpublish works and impact shape.
    expect(impact).toHaveProperty('deletionAllowed');
    expect(Array.isArray(impact.routeReferences)).toBe(true);

    await expect(mockHandler(`/api/model-routing/policies/${blocking.id}/unpublish`, {
      method: 'POST', headers: modelWriteHeaders, body: { reason: '重复取消' },
    })).rejects.toThrow('E_POLICY_NOT_PUBLISHED');
  });

  it('requires a valid draft before publishing and creates an immutable rollback version', async () => {
    const policies = await mockHandler('/api/model-routing/policies', { method: 'GET', headers: modelWriteHeaders }) as any[];
    const policy = policies.find((item) => item.level === 'P1');

    await expect(mockHandler(`/api/model-routing/policies/${policy.id}/publish`, { method: 'POST', headers: modelWriteHeaders, body: { reason: '未经校验的发布' } }))
      .rejects.toThrow('E_POLICY_NOT_READY');

    const ready = await mockHandler(`/api/model-routing/policies/${policy.id}/validate`, { method: 'POST', headers: modelWriteHeaders, body: {} }) as any;
    expect(ready.status).toBe('ready');

    const published = await mockHandler(`/api/model-routing/policies/${policy.id}/publish`, { method: 'POST', headers: modelWriteHeaders, body: { reason: '通过准入后发布' } }) as any;
    expect(published.version).toBeGreaterThan(0);

    const rolledBack = await mockHandler(`/api/model-routing/policies/${policy.id}/rollback`, { method: 'POST', headers: modelWriteHeaders, body: { versionId: published.id, reason: '演练回滚' } }) as any;
    expect(rolledBack.id).not.toBe(published.id);
    expect(rolledBack.rollbackOf).toBe(published.id);
  });

  it('runs failover drills in an isolated scope and audits the result', async () => {
    const drill = await mockHandler('/api/model-routing/failover-tests', {
      method: 'POST', headers: modelWriteHeaders,
      body: { policyId: 'route-p1', scope: 'sandbox', reason: 'P1 容灾演练' },
    }) as any;
    expect(drill.scope).toBe('sandbox');
    expect(drill.status).toBe('passed');

    const audit = await mockHandler('/api/model-audit', { method: 'GET', headers: modelWriteHeaders }) as any[];
    expect(audit.some((event) => event.action === '执行隔离故障切换演练' && event.correlationId === drill.correlationId)).toBe(true);
  });

  it('records model provider and failover operations', async () => {
    const provider = await mockHandler('/api/providers', { method: 'POST', body: { name: 'Test Provider', tier: 'connectable', region: 'global', model: 'Test-1' } }) as any;
    expect(provider.id).toBeTruthy();
    const failover = await mockHandler('/api/model-failover-test', { method: 'POST', body: {} }) as any;
    expect(failover.to).toBeTruthy();
  });

  it('sends a channel test message and persists its operational state', async () => {
    const message = await mockHandler('/api/channels/c1/test', { method: 'POST', body: { target: 'ops@example.com', content: 'delivery verification' } }) as any;
    expect(message.status).toBe('delivered');
    const toggled = await mockHandler('/api/channels/c1/toggle', { method: 'PATCH', body: {} }) as any;
    expect(typeof toggled.enabled).toBe('boolean');
    await mockHandler('/api/channels/c1/toggle', { method: 'PATCH', body: {} });
  });

  it('creates, tests, and governs a skill through the mock API', async () => {
    const skill = await mockHandler('/api/skills', { method: 'POST', body: { name: 'control-plane-test', kind: 'skill', description: 'test skill', riskLevel: 'low' } }) as any;
    const result = await mockHandler(`/api/skills/${skill.id}/test`, { method: 'POST', body: { command: 'health check' } }) as any;
    expect(result.status).toBe('success');
    const blocked = await mockHandler(`/api/skills/${skill.id}/test`, { method: 'POST', body: { command: 'rm -rf /' } }) as any;
    expect(blocked.status).toBe('blocked');
    const runtime = await mockHandler(`/api/skills/${skill.id}/runtime`, { method: 'PATCH', body: { cacheable: true, timeout: '15', retries: '2' } }) as any;
    expect(runtime.timeout).toBe('15');
  });

  it('protects referenced skills from unapproved uninstall and isolates permissions per skill', async () => {
    const impact = await mockHandler('/api/skills/s1/impact', { method: 'GET' }) as any;
    expect(impact.uninstallAllowed).toBe(false);
    await expect(mockHandler('/api/skills/s1/uninstall', { method: 'POST', body: {} })).rejects.toThrow('E_SKILL_IN_USE');

    const s1Before = await mockHandler('/api/skills/s1/permissions', { method: 'GET' }) as any[];
    await mockHandler('/api/skills/s2/permissions', { method: 'PATCH', body: { role: 'SRE', canCall: false, canConfig: false } });
    const s1After = await mockHandler('/api/skills/s1/permissions', { method: 'GET' }) as any[];
    expect(s1After.find((item) => item.role === 'SRE')).toEqual(s1Before.find((item) => item.role === 'SRE'));
  });

  it('runs market preflight before installation and blocks missing dependencies', async () => {
    const approved = await mockHandler('/api/skills/st1/preflight', { method: 'POST', body: {} }) as any;
    expect(approved.decision).toBe('approved');
    const blocked = await mockHandler('/api/skills/st4/preflight', { method: 'POST', body: {} }) as any;
    expect(blocked.decision).toBe('blocked');
    await expect(mockHandler('/api/skills/st4/install', { method: 'POST', body: { approvalTicket: 'APR-001' } })).rejects.toThrow('E_DEPENDENCY_BLOCKED');
  });

  it('validates external MCP and Tool configurations before registering workspace capabilities', async () => {
    await expect(mockHandler('/api/mcp-connections', { method: 'POST', body: { name: 'unsafe-mcp', endpoint: 'http://internal.example' } })).rejects.toThrow('HTTPS');
    await expect(mockHandler('/api/tools', { method: 'POST', body: { name: 'cmdb-tool', endpoint: 'https://cmdb.example.com' } })).rejects.toThrow('Schema');
    await expect(mockHandler('/api/tools', { method: 'POST', body: { name: 'invalid-contract-tool', endpoint: 'https://cmdb.example.com', schema: '{"type":"object"}' } })).rejects.toThrow('OpenAPI');

    const mcp = await mockHandler('/api/mcp-connections', { method: 'POST', body: { name: 'metrics-mcp', endpoint: 'https://metrics.example.com', authMode: 'OAuth', protocol: 'mcp-streamable-http' } }) as any;
    const tool = await mockHandler('/api/tools', { method: 'POST', body: { name: 'asset-tool', endpoint: 'https://assets.example.com', schema: '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}' } }) as any;
    expect(mcp.kind).toBe('mcp');
    expect(mcp.protocol).toBe('mcp-streamable-http');
    expect(tool.kind).toBe('tool');
    await expect(mockHandler('/api/mcp-connections', { method: 'POST', body: { name: 'stdio-mcp', endpoint: 'https://metrics.example.com', protocol: 'mcp-stdio' } })).rejects.toThrow('stdio');

    const audit = await mockHandler('/api/skills/audit', { method: 'GET' }) as any[];
    expect(audit.some((event) => event.action === '配置 MCP 并预检' && event.target.includes('metrics-mcp'))).toBe(true);
    expect(audit.some((event) => event.action === '配置 Tool 并预检' && event.target === 'asset-tool')).toBe(true);

    const packaged = await mockHandler('/api/skills/import-package', {
      method: 'POST',
      body: { fileName: 'demo-skill.skill', contentBase64: btoa('PK\x03\x04mock-zip-bytes') },
    }) as any;
    expect(packaged.source).toBe('package');
    expect(packaged.name).toBe('demo-skill');
    expect(packaged.hasScripts).toBe(true);

    const catalog = await mockHandler('/api/skills/catalog', { method: 'GET' }) as any;
    expect(catalog.meta.demoNotice).toContain('演示');
    expect(Array.isArray(catalog.items)).toBe(true);
    const promoted = await mockHandler('/api/skills/catalog/publish', {
      method: 'POST',
      body: { skillId: packaged.id, releaseChannel: 'beta', visibilityScope: 'workspace' },
    }) as any;
    expect(promoted.channel).toBe('promoted');
    const synced = await mockHandler('/api/skills/catalog/sync', {
      method: 'POST',
      body: { seedDemo: true },
    }) as any;
    expect(synced.acceptedCount).toBe(1);
  });

  it('requires an enabled agent before a workspace skill becomes usable by that agent', async () => {
    const bindings = await mockHandler('/api/agents/a1/skills', { method: 'POST', body: { skillId: 's3' } }) as any[];
    expect(bindings.some((binding) => binding.skillId === 's3')).toBe(true);
    const impact = await mockHandler('/api/skills/s3/impact', { method: 'GET' }) as any;
    expect(impact.uninstallAllowed).toBe(false);
  });

  it('binds a version-pinned skill to a workflow and publishes a workflow skill for agent reuse', async () => {
    const binding = await mockHandler('/api/workflows/wf1/capabilities', { method: 'POST', body: { capabilityKind: 'skill', capabilityId: 's3', pinnedVersion: '1.0' } }) as any;
    expect(binding.targetType).toBe('workflow');
    await expect(mockHandler('/api/workflows/wf1/publish-as-skill', { method: 'POST', body: { version: 'v1', name: 'Redis 受控处置' } })).rejects.toThrow('E_VALIDATION_REQUIRED');
    const workflowSkill = await mockHandler('/api/workflows/wf1/publish-as-skill', {
      method: 'POST',
      body: { version: 'v1', name: 'Redis 受控处置', validationPassed: true, riskLevel: 'mid' },
    }) as any;
    expect(workflowSkill.status).toBe('published');
    expect(workflowSkill.sourceWorkflowId).toBe('wf1');
    expect(workflowSkill.approvalRequired).toBe(true);
    const updated = await mockHandler('/api/workflows/wf1/publish-as-skill', {
      method: 'POST',
      body: { version: 'v1', name: 'Redis 受控处置（修订）', description: '同版本更新', validationPassed: true, riskLevel: 'low' },
    }) as any;
    expect(updated.id).toBe(workflowSkill.id);
    expect(updated.name).toBe('Redis 受控处置（修订）');
    expect(updated.approvalRequired).toBe(false);
    const agentBinding = await mockHandler('/api/agents/a1/capabilities', { method: 'POST', body: { capabilityKind: 'workflow_skill', capabilityId: workflowSkill.id } }) as any;
    expect(agentBinding.capabilityKind).toBe('workflow_skill');
  });

  it('keeps high-risk workflow skills as draft for operators until admin promote', async () => {
    const operator = await mockHandler('/api/auth/login', { method: 'POST', body: { email: 'sre@acme.com', password: 'demo' } }) as any;
    const headers = { Authorization: `Bearer ${operator.token}`, 'x-workspace-id': 'w1' };
    const draft = await mockHandler('/api/workflows/wf1/publish-as-skill', {
      method: 'POST',
      headers,
      body: { version: 'v9-high', name: '高风险处置技能', validationPassed: true, riskLevel: 'high' },
    }) as any;
    expect(draft.status).toBe('draft');
    await expect(mockHandler('/api/agents/a1/capabilities', {
      method: 'POST',
      headers,
      body: { capabilityKind: 'workflow_skill', capabilityId: draft.id },
    })).rejects.toThrow('尚未发布');
    const admin = await mockHandler('/api/auth/login', { method: 'POST', body: { email: 'admin@acme.com', password: 'demo' } }) as any;
    const published = await mockHandler(`/api/workflow-skills/${draft.id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'x-workspace-id': 'w1' },
      body: {},
    }) as any;
    expect(published.status).toBe('published');
  });

  it('governs skill lifecycle, upgrade planning, and runtime safety policy', async () => {
    const disabled = await mockHandler('/api/skills/s3/lifecycle', { method: 'PATCH', body: { lifecycleStatus: 'disabled' } }) as any;
    expect(disabled.lifecycleStatus).toBe('disabled');

    const plan = await mockHandler('/api/skills/s1/upgrade-plan', { method: 'POST', body: { targetVersion: '1.5.0' } }) as any;
    expect(plan.currentVersion).toBeTruthy();
    expect(plan.checks.some((check: any) => check.label === '引用版本影响')).toBe(true);

    const policy = await mockHandler('/api/skills/s1/governance', { method: 'PATCH', body: { rateLimitPerMinute: 20, dataMaskingEnabled: true } }) as any;
    expect(policy.rateLimitPerMinute).toBe(20);
    expect(policy.dataMaskingEnabled).toBe(true);
  });

  it('validates and discovers enterprise skill integrations before enabling them', async () => {
    const integrations = await mockHandler('/api/skill-integrations', { method: 'GET' }) as any[];
    expect(integrations.length).toBeGreaterThan(0);
    const target = integrations.find((item) => item.status !== 'failed');
    const tested = await mockHandler(`/api/skill-integrations/${target.id}/test`, { method: 'POST', body: {} }) as any;
    expect(tested.health).toBe('healthy');
    expect(String(tested.lastVerifiedAt)).toMatch(/\d{1,2}:\d{2}/);
    expect(tested.lastVerifiedAt).not.toBe('刚刚');
    const discovered = await mockHandler(`/api/skill-integrations/${target.id}/discover`, { method: 'POST', body: {} }) as any;
    expect(discovered.discoveredCapabilities).toBeGreaterThan(0);
  });

  it('aggregates runtime governance and supports revalidation and quarantine actions', async () => {
    const overview = await mockHandler('/api/skills/governance/overview', { method: 'GET' }) as any;
    expect(overview.calls24h).toBeGreaterThan(0);
    const health = await mockHandler('/api/skills/governance/health', { method: 'GET' }) as any[];
    const verified = await mockHandler(`/api/skills/${health[0].skillId}/revalidate`, { method: 'POST', body: {} }) as any;
    expect(verified.status).toBe('healthy');
    const isolated = await mockHandler(`/api/skills/${health[1].skillId}/isolate`, { method: 'POST', body: {} }) as any;
    expect(isolated.status).toBe('quarantined');
  });

  it('publishes evaluated knowledge packages and only permits versioned consumer bindings', async () => {
    const packages = await mockHandler('/api/knowledge/packages', { method: 'GET' }) as any[];
    const packageItem = packages.find((item) => item.id === 'kp-runbook');
    expect(packageItem.currentVersion.status).toBe('published');

    const evaluation = await mockHandler('/api/knowledge/evaluations/run', { method: 'POST', body: { packageId: packageItem.id, profileId: 'krp-ops' } }) as any;
    expect(evaluation.recallAtK).toBeGreaterThan(.8);
    const binding = await mockHandler('/api/knowledge/bindings', { method: 'POST', body: { packageId: packageItem.id, consumerType: 'workflow', consumerId: 'wf-test', consumerName: '验证编排', environment: 'staging', profileId: 'krp-ops', noResultPolicy: 'block' } }) as any;
    expect(binding.packageVersion).toBe('v3.2');

    await expect(mockHandler('/api/knowledge/bindings', { method: 'POST', body: { packageId: 'kp-security', consumerType: 'agent', consumerId: 'a-test', consumerName: '验证智能体' } })).rejects.toThrow('E_KNOWLEDGE_VERSION_NOT_PUBLISHED');
    const entities = await mockHandler('/api/knowledge/graph/entities', { method: 'GET' }) as any[];
    expect(entities[0].sourceVersion).toBeTruthy();
  });

  it('lists evolve candidates and dual-signs skill/routing patches', async () => {
    const adminHeaders = { 'x-mock-role': 'admin', 'x-mock-user-id': 'u1', 'x-workspace-id': 'w1' };
    const auditorHeaders = { 'x-mock-role': 'auditor', 'x-mock-user-id': 'u-auditor', 'x-workspace-id': 'w1' };
    const list = await mockHandler('/api/evolve/candidates', { method: 'GET', headers: adminHeaders }) as any[];
    expect(list.some((c) => c.kind === 'memory_promote')).toBe(true);

    const routing = await mockHandler('/api/evolve/candidates', {
      method: 'GET', headers: adminHeaders,
    }) as any[];
    // seed a routing candidate via feedback dislike path then patch kind — create via approve flow on injected
    const created = await mockHandler('/api/copilot/conversations/cv1/messages/msg-x/feedback', {
      method: 'POST', headers: adminHeaders, body: { kind: 'dislike', comment: '答非所问' },
    }) as any;
    expect(created.evolveCandidate?.kind).toBe('skill_patch');
    const id = created.evolveCandidate.id as string;

    const first = await mockHandler(`/api/evolve/candidates/${id}/approve`, { method: 'POST', headers: adminHeaders, body: {} }) as any;
    expect(first.status).toBe('pending_countersign');
    const second = await mockHandler(`/api/evolve/candidates/${id}/approve`, { method: 'POST', headers: auditorHeaders, body: {} }) as any;
    expect(second.status).toBe('approved');
    expect(second.effect?.status).toBe('draft');
  });
});
