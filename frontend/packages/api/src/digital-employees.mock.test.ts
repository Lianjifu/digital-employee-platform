import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

const admin = { Authorization: 'Bearer mock-admin-token', 'x-workspace-id': 'w1' };
const builder = { Authorization: 'Bearer mock-user-token', 'x-workspace-id': 'w1' };
const auditor = { Authorization: 'Bearer mock-auditor-token', 'x-workspace-id': 'w1' };
const secondaryWorkspaceAdmin = { Authorization: 'Bearer mock-admin-token', 'x-workspace-id': 'w2' };

function sandboxConfiguration(overrides: Record<string, unknown> = {}) {
  return {
    profile: {
      name: '测试采购专员',
      role: '采购询价',
      department: '采购中心',
      description: '校验上岗门禁。',
      owner: '王昊',
      escalationOwner: '采购负责人',
      serviceObject: '采购申请',
      risk: 'low',
      environment: 'sandbox',
      ...((overrides.profile as object) ?? {}),
    },
    boundary: {
      responsibilities: ['询价对比', '供应商初筛'],
      prohibitedActions: ['不得绕过采购审批'],
      handoffPolicy: { triggers: ['需要人工判断'], approvalRequiredFor: [] },
      boundaryPolicy: {
        responsibilities: [{ id: 'resp-1', title: '询价对比', objective: '形成比价结论', trigger: '收到采购申请', deliverables: ['比价表'], evidenceRequired: true }],
        capabilityModes: [{ capabilityType: 'skill', capabilityName: '工单分诊', mode: 'recommend' }],
        dataClassification: 'internal',
        allowedEnvironments: ['sandbox'],
        handoff: { triggers: ['需要人工判断'], approvers: ['采购负责人'], notificationChannels: ['Web'], slaMinutes: 30 },
      },
      ...((overrides.boundary as object) ?? {}),
    },
    capabilities: {
      model: '企业通用路由 v2',
      knowledge: [],
      skills: ['工单分诊'],
      tools: ['Jira'],
      workflows: [],
      channels: ['Web'],
      ...((overrides.capabilities as object) ?? {}),
    },
    memoryPolicy: { shortTermHours: 24, workingDays: 7, longTermCadence: 'daily', knowledgePromotion: 'approval_required' },
    ...overrides,
  };
}

describe('digital employee control plane', () => {
  it('keeps employee records scoped to the active workspace', async () => {
    const employees = await mockHandler('/api/digital-employees', { method: 'GET', headers: admin }) as Array<{ workspaceId: string }>;
    expect(employees.length).toBeGreaterThan(0);
    expect(employees.every((employee) => employee.workspaceId === 'w1')).toBe(true);
  });

  it('returns only published, enabled capability assets for employee assembly', async () => {
    const catalog = await mockHandler('/api/digital-employee-capability-catalog', { method: 'GET', headers: admin }) as any;
    expect(catalog.models.length).toBeGreaterThan(0);
    expect(catalog.workflows.every((item: { name: string }) => item.name)).toBe(true);
    expect(catalog.channels.every((item: { name: string }) => item.name)).toBe(true);
    expect(catalog.workflows.some((item: { meta: string }) => item.meta.startsWith('流程技能'))).toBe(true);

    const secondaryCatalog = await mockHandler('/api/digital-employee-capability-catalog', { method: 'GET', headers: secondaryWorkspaceAdmin }) as any;
    expect(secondaryCatalog.models.some((item: { name: string }) => item.name === 'Claude Sonnet-4')).toBe(false);
  });

  it('requires profile, published capabilities and evaluation before release', async () => {
    const employee = await mockHandler('/api/digital-employees', { method: 'POST', headers: admin, body: { name: '测试采购专员', role: '采购询价', department: '采购中心' } }) as { id: string };
    await expect(mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: admin })).rejects.toThrow(/E_DIGITAL_EMPLOYEE_/);

    await mockHandler(`/api/digital-employees/${employee.id}/configuration`, { method: 'POST', headers: admin, body: sandboxConfiguration() });
    await expect(mockHandler(`/api/digital-employees/${employee.id}/capabilities`, { method: 'PATCH', headers: admin, body: { skills: ['x'] } })).rejects.toThrow('E_DIGITAL_EMPLOYEE_USE_CONFIGURATION');

    await expect(mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: admin })).rejects.toThrow('E_DIGITAL_EMPLOYEE_EVALUATION_REQUIRED');

    const evaluated = await mockHandler(`/api/digital-employees/${employee.id}/evaluate`, { method: 'POST', headers: admin }) as any;
    expect(evaluated.evaluation.status).toBe('passed');

    const submitted = await mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: builder }) as any;
    expect(submitted).toMatchObject({ lifecycle: 'pending_approval', release: { status: 'pending_approval', requestedBy: '业务构建者' } });

    await expect(mockHandler(`/api/digital-employees/${employee.id}/lifecycle`, { method: 'POST', headers: builder, body: { lifecycle: 'active' } })).rejects.toThrow();

    const approved = await mockHandler(`/api/digital-employees/${employee.id}/lifecycle`, { method: 'POST', headers: admin, body: { lifecycle: 'active' } }) as any;
    expect(approved).toMatchObject({ lifecycle: 'active', release: { status: 'released', approver: '平台管理员' } });
  });

  it('blocks self-approval on release and rejects lifecycle bypass', async () => {
    const employee = await mockHandler('/api/digital-employees', { method: 'POST', headers: admin, body: { name: '自批校验专员', role: '门禁校验', department: '信息技术部' } }) as { id: string };
    await mockHandler(`/api/digital-employees/${employee.id}/configuration`, {
      method: 'POST',
      headers: admin,
      body: sandboxConfiguration({ profile: { name: '自批校验专员', role: '门禁校验', department: '信息技术部', description: 'SoD', owner: '王昊', escalationOwner: '值班经理', serviceObject: '门禁', risk: 'low', environment: 'sandbox' } }),
    });
    await mockHandler(`/api/digital-employees/${employee.id}/evaluate`, { method: 'POST', headers: admin });
    await mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: admin });
    await expect(mockHandler(`/api/digital-employees/${employee.id}/lifecycle`, { method: 'POST', headers: admin, body: { lifecycle: 'active' } })).rejects.toThrow('E_SOD_SELF_APPROVAL');

    const draft = await mockHandler('/api/digital-employees', { method: 'POST', headers: admin, body: { name: '旁路校验', role: '旁路', department: '信息技术部' } }) as { id: string };
    await expect(mockHandler(`/api/digital-employees/${draft.id}/lifecycle`, { method: 'POST', headers: admin, body: { lifecycle: 'active' } })).rejects.toThrow('E_DIGITAL_EMPLOYEE_RELEASE_REQUIRED');
  });

  it('keeps auditors read-only while allowing evidence lookup', async () => {
    const evidence = await mockHandler('/api/digital-employees/de-sre/evidence', { method: 'GET', headers: auditor }) as Array<{ action: string }>;
    expect(evidence.length).toBeGreaterThan(0);
    await expect(mockHandler('/api/digital-employees/de-sre/lifecycle', { method: 'POST', headers: auditor, body: { lifecycle: 'paused' } })).rejects.toThrow('E_AUDITOR_READ_ONLY');
  });

  it('adopts a governed template as an independent draft and synchronizes its lifecycle evidence', async () => {
    const employee = await mockHandler('/api/digital-employee-templates/det-service-desk/adopt', { method: 'POST', headers: admin }) as any;
    expect(employee).toMatchObject({ lifecycle: 'draft', templateId: 'det-service-desk', templateVersion: '2.1.0' });

    const records = await mockHandler('/api/digital-employee-template-adoptions', { method: 'GET', headers: admin }) as any[];
    expect(records.some((record) => record.employeeId === employee.id && record.status === 'draft')).toBe(true);

    await mockHandler(`/api/digital-employees/${employee.id}`, { method: 'PATCH', headers: admin, body: { escalationOwner: 'IT 服务负责人' } });
    await mockHandler(`/api/digital-employees/${employee.id}/configuration`, {
      method: 'POST',
      headers: admin,
      body: sandboxConfiguration({
        profile: { name: employee.name, role: employee.role, department: employee.department, description: employee.description, owner: employee.owner, escalationOwner: 'IT 服务负责人', serviceObject: employee.serviceObject, risk: 'low', environment: 'sandbox' },
        capabilities: { model: employee.capabilities.model, knowledge: employee.capabilities.knowledge, skills: employee.capabilities.skills.length ? employee.capabilities.skills : ['工单分诊'], tools: employee.capabilities.tools.length ? employee.capabilities.tools : ['Jira'], workflows: employee.capabilities.workflows, channels: employee.capabilities.channels },
        boundary: {
          responsibilities: employee.responsibilities,
          prohibitedActions: employee.prohibitedActions,
          handoffPolicy: { triggers: ['需要人工判断'], approvalRequiredFor: [] },
          boundaryPolicy: {
            responsibilities: [{ id: 'resp-adopt', title: employee.responsibilities[0] ?? '服务', objective: '完成岗位任务', trigger: '收到请求', deliverables: ['处置结论'], evidenceRequired: true }],
            capabilityModes: [{ capabilityType: 'skill', capabilityName: (employee.capabilities.skills[0] ?? '工单分诊'), mode: 'recommend' }],
            dataClassification: 'internal',
            allowedEnvironments: ['sandbox'],
            handoff: { triggers: ['需要人工判断'], approvers: ['IT 服务负责人'], notificationChannels: ['Web'], slaMinutes: 30 },
          },
        },
      }),
    });
    await mockHandler(`/api/digital-employees/${employee.id}/evaluate`, { method: 'POST', headers: admin });
    const evaluatedRecords = await mockHandler('/api/digital-employee-template-adoptions', { method: 'GET', headers: admin }) as any[];
    expect(evaluatedRecords.find((record) => record.employeeId === employee.id)?.status).toBe('testing');

    await mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: builder });
    const submittedRecords = await mockHandler('/api/digital-employee-template-adoptions', { method: 'GET', headers: admin }) as any[];
    expect(submittedRecords.find((record) => record.employeeId === employee.id)?.status).toBe('pending_approval');

    await mockHandler(`/api/digital-employees/${employee.id}/lifecycle`, { method: 'POST', headers: admin, body: { lifecycle: 'active' } });
    const updatedRecords = await mockHandler('/api/digital-employee-template-adoptions', { method: 'GET', headers: admin }) as any[];
    expect(updatedRecords.find((record) => record.employeeId === employee.id)?.status).toBe('active');
  });

  it('limits department templates to their workspace and requires an administrator to publish or certify them', async () => {
    const secondaryTemplates = await mockHandler('/api/digital-employee-templates', { method: 'GET', headers: secondaryWorkspaceAdmin }) as Array<{ id: string }>;
    expect(secondaryTemplates.some((template) => template.id === 'det-alert-ops')).toBe(false);

    const template = await mockHandler('/api/digital-employee-templates', { method: 'POST', headers: admin, body: { name: '变更风险分析专员', role: '变更影响评估', department: '信息技术部', tags: ['变更', '风险评估'] } }) as any;
    expect(template).toMatchObject({ source: 'department', scope: 'workspace', workspaceId: 'w1', status: 'review' });

    const certified = await mockHandler(`/api/digital-employee-templates/${template.id}`, { method: 'PATCH', headers: admin, body: { status: 'certified' } }) as any;
    expect(certified.status).toBe('certified');
    await expect(mockHandler(`/api/digital-employee-templates/${template.id}`, { method: 'PATCH', headers: auditor, body: { status: 'deprecated' } })).rejects.toThrow('E_AUDITOR_READ_ONLY');
  });

  it('creates a versioned, approval-gated configuration change for an active employee', async () => {
    const employee = await mockHandler('/api/digital-employees', { method: 'POST', headers: admin, body: { name: '配置验证专员', role: '配置验证', department: '信息技术部' } }) as any;
    await mockHandler(`/api/digital-employees/${employee.id}/configuration`, {
      method: 'POST',
      headers: admin,
      body: sandboxConfiguration({
        profile: { name: '配置验证专员', role: '配置验证', department: '信息技术部', description: '验证受控配置流程。', owner: '王昊', escalationOwner: '技术平台主管', serviceObject: '平台配置', risk: 'low', environment: 'sandbox' },
      }),
    });
    await mockHandler(`/api/digital-employees/${employee.id}/evaluate`, { method: 'POST', headers: admin });
    await mockHandler(`/api/digital-employees/${employee.id}/release`, { method: 'POST', headers: builder });
    await mockHandler(`/api/digital-employees/${employee.id}/lifecycle`, { method: 'POST', headers: admin, body: { lifecycle: 'active' } });

    const configuration = {
      profile: { name: '配置验证专员', role: '配置验证', department: '信息技术部', description: '验证受控配置流程。', owner: '王昊', escalationOwner: '技术平台主管', serviceObject: '平台配置', risk: 'medium', environment: 'production' },
      boundary: {
        responsibilities: ['验证配置'], prohibitedActions: ['不得绕过审批'], handoffPolicy: { triggers: ['需要人工判断'], approvalRequiredFor: ['配置协同流'] },
        boundaryPolicy: {
          responsibilities: [{ id: 'resp-configuration', title: '验证配置', objective: '验证受控配置流程。', trigger: '收到配置变更请求', deliverables: ['验证结论与审计证据'], evidenceRequired: true }],
          capabilityModes: [{ capabilityType: 'workflow', capabilityName: '配置协同流', mode: 'approval_required' }],
          dataClassification: 'confidential', allowedEnvironments: ['production'],
          handoff: { triggers: ['需要人工判断'], approvers: ['技术平台主管'], notificationChannels: ['Web'], slaMinutes: 30 },
        },
      },
      capabilities: { model: '企业通用路由 v2', knowledge: ['运行手册库'], skills: ['配置核验'], tools: ['CMDB'], workflows: ['配置协同流'], channels: ['Web'] },
      memoryPolicy: { shortTermHours: 24, workingDays: 7, longTermCadence: 'daily', knowledgePromotion: 'approval_required' },
    };
    const submitted = await mockHandler(`/api/digital-employees/${employee.id}/configuration`, { method: 'POST', headers: builder, body: configuration }) as any;
    expect(submitted).toMatchObject({ status: 'pending_approval', requiresApproval: true });

    const versions = await mockHandler(`/api/digital-employees/${employee.id}/configuration-versions`, { method: 'GET', headers: admin }) as any[];
    expect(versions.some((version) => version.id === submitted.id && version.status === 'pending_approval')).toBe(true);
    await expect(mockHandler(`/api/digital-employees/${employee.id}/configuration-versions/${submitted.id}/approve`, { method: 'POST', headers: builder })).rejects.toThrow();
    const approved = await mockHandler(`/api/digital-employees/${employee.id}/configuration-versions/${submitted.id}/approve`, { method: 'POST', headers: admin }) as any;
    expect(approved.status).toBe('current');

    const saved = await mockHandler(`/api/digital-employees/${employee.id}`, { method: 'GET', headers: admin }) as any;
    expect(saved.handoffPolicy).toMatchObject({ triggers: ['需要人工判断'], approvalRequiredFor: ['配置协同流'] });
    expect(saved.boundaryPolicy).toMatchObject({ dataClassification: 'confidential', allowedEnvironments: ['production'], capabilityModes: [{ capabilityName: '配置协同流', mode: 'approval_required' }] });
    await expect(mockHandler(`/api/digital-employees/${employee.id}/configuration`, { method: 'POST', headers: auditor, body: configuration })).rejects.toThrow('E_AUDITOR_READ_ONLY');
  });

  it('rejects a boundary policy that grants execution to an unbound capability', async () => {
    const employee = await mockHandler('/api/digital-employees', { method: 'POST', headers: admin, body: { name: '边界校验专员', role: '策略校验', department: '信息技术部' } }) as any;
    const configuration = {
      profile: { name: employee.name, role: employee.role, department: employee.department, description: '校验能力引用。', owner: '王昊', escalationOwner: '值班经理', serviceObject: '策略验证', risk: 'low', environment: 'sandbox' },
      boundary: {
        responsibilities: ['校验岗位授权'], prohibitedActions: [], handoffPolicy: { triggers: ['需要人工判断'], approvalRequiredFor: [] },
        boundaryPolicy: {
          responsibilities: [{ id: 'resp-boundary', title: '校验岗位授权', objective: '确保授权仅作用于已装配能力。', trigger: '提交策略', deliverables: ['校验结论'], evidenceRequired: true }],
          capabilityModes: [{ capabilityType: 'tool', capabilityName: '未绑定工具', mode: 'execute' }],
          dataClassification: 'internal', allowedEnvironments: ['sandbox'],
          handoff: { triggers: ['需要人工判断'], approvers: ['值班经理'], notificationChannels: ['Web'], slaMinutes: 30 },
        },
      },
      capabilities: { model: '企业通用路由 v2', knowledge: [], skills: [], tools: [], workflows: [], channels: ['Web'] },
      memoryPolicy: { shortTermHours: 24, workingDays: 7, longTermCadence: 'daily', knowledgePromotion: 'approval_required' },
    };
    await expect(mockHandler(`/api/digital-employees/${employee.id}/configuration`, { method: 'POST', headers: admin, body: configuration })).rejects.toThrow('E_DIGITAL_EMPLOYEE_BOUNDARY_CAPABILITY_INVALID');
  });
});
