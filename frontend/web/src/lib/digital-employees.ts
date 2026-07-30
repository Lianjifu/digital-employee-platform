/** Shared department order and catalog sorting for digital employees. */

export const DIGITAL_EMPLOYEE_DEPARTMENT_ORDER: string[] = [
  '研发部',
  '销售部',
  '市场部',
  '运营部',
  '人事部',
  '财务部',
  '信息技术部',
];

type SortableEmployee = {
  id: string;
  name: string;
  role?: string;
  department: string;
};

/** 主标题：岗位名称（无岗位时回退花名）。 */
export function employeePrimaryLabel(employee: Pick<SortableEmployee, 'name' | 'role'>) {
  return employee.role?.trim() || employee.name;
}

/** 副行：部门 · 花名。 */
export function employeeSecondaryLabel(employee: Pick<SortableEmployee, 'name' | 'department'>) {
  return `${employee.department} · ${employee.name}`;
}

/** 岗位配置完整性判定所需字段。 */
export type RoleSetupEmployee = {
  owner?: string;
  escalationOwner?: string;
  serviceObject?: string;
  responsibilities: string[];
  handoffPolicy?: { triggers: string[]; approvalRequiredFor: string[] };
  boundaryPolicy?: {
    responsibilities: Array<{ title: string; objective: string; trigger: string }>;
    handoff: { triggers: string[]; approvers: string[] };
    allowedEnvironments: string[];
  };
  memoryPolicy?: {
    shortTermHours: number;
    workingDays: number;
    longTermCadence: string;
    knowledgePromotion: string;
  };
};

export type RoleSetupCompleteness = {
  profileOk: boolean;
  boundaryOk: boolean;
  memoryOk: boolean;
  ready: boolean;
  missing: string[];
  label: '待补档案' | '边界待完善' | '契约完整';
};

/** 岗位授权契约是否可进入能力装配 / 上岗评测。 */
export function roleSetupCompleteness(employee: RoleSetupEmployee): RoleSetupCompleteness {
  const missing: string[] = [];
  const profileOk = Boolean(
    employee.owner?.trim()
    && employee.escalationOwner?.trim()
    && employee.escalationOwner !== '待指定'
    && employee.serviceObject?.trim(),
  );
  if (!employee.owner?.trim()) missing.push('岗位负责人');
  if (!employee.escalationOwner?.trim() || employee.escalationOwner === '待指定') missing.push('人工接管负责人');
  if (!employee.serviceObject?.trim()) missing.push('服务对象');

  const structured = employee.boundaryPolicy?.responsibilities ?? [];
  const legacyOk = employee.responsibilities.length > 0 && !employee.responsibilities.includes('待配置岗位职责');
  const structuredOk = structured.length > 0
    && structured.every((item) => item.title.trim() && item.objective.trim() && item.trigger.trim())
    && !structured.some((item) => item.title === '待配置岗位职责' || item.title === '未命名岗位职责');
  const handoff = employee.boundaryPolicy?.handoff;
  const handoffOk = Boolean(
    (handoff?.triggers?.some((item) => item.trim()) ?? employee.handoffPolicy?.triggers?.some((item) => item.trim()))
    && (handoff?.approvers?.some((item) => item.trim()) ?? Boolean(employee.escalationOwner?.trim() && employee.escalationOwner !== '待指定')),
  );

  let boundaryOk: boolean;
  if (employee.boundaryPolicy) {
    boundaryOk = structuredOk
      && handoffOk
      && (employee.boundaryPolicy.allowedEnvironments?.length ?? 0) > 0;
    if (!structuredOk) missing.push('完整岗位职责');
    if (!handoffOk) missing.push('接管触发与接管人');
    if (!(employee.boundaryPolicy.allowedEnvironments.length > 0)) missing.push('允许运行环境');
  } else {
    boundaryOk = legacyOk && handoffOk;
    if (!legacyOk) missing.push('岗位职责');
    if (!handoffOk) missing.push('接管触发与接管人');
  }

  const memory = employee.memoryPolicy;
  const memoryOk = Boolean(
    memory
    && Number.isFinite(memory.shortTermHours)
    && memory.shortTermHours > 0
    && Number.isFinite(memory.workingDays)
    && memory.workingDays > 0
    && memory.longTermCadence
    && memory.knowledgePromotion,
  );
  if (!memoryOk) missing.push('记忆策略');

  const ready = profileOk && boundaryOk && memoryOk;
  const label: RoleSetupCompleteness['label'] = !profileOk
    ? '待补档案'
    : !boundaryOk
      ? '边界待完善'
      : '契约完整';

  return { profileOk, boundaryOk, memoryOk, ready, missing: [...new Set(missing)], label };
}

/** Incomplete role contracts first, then department/head order. */
export function compareRoleSetupEmployees<T extends SortableEmployee & RoleSetupEmployee>(left: T, right: T) {
  const leftReady = Number(roleSetupCompleteness(left).ready);
  const rightReady = Number(roleSetupCompleteness(right).ready);
  if (leftReady !== rightReady) return leftReady - rightReady;
  const leftProfile = Number(roleSetupCompleteness(left).profileOk);
  const rightProfile = Number(roleSetupCompleteness(right).profileOk);
  if (leftProfile !== rightProfile) return leftProfile - rightProfile;
  return compareDigitalEmployees(left, right);
}

/** 能力装配完整性判定所需字段。 */
export type CapabilityAssemblyEmployee = {
  capabilities: {
    model?: string;
    skills: string[];
    tools: string[];
    workflows: string[];
    knowledge?: string[];
  };
  boundaryPolicy?: {
    capabilityModes: Array<{ capabilityType: 'tool' | 'workflow' | 'skill'; capabilityName: string; mode: string }>;
  };
};

export type CapabilityAssemblyCompleteness = {
  modelOk: boolean;
  assetsOk: boolean;
  modesOk: boolean;
  ready: boolean;
  missing: string[];
  label: '未绑模型' | '缺执行能力' | '待设授权模式' | '装配完整';
  boundCount: number;
};

/** 受控能力引用是否达到可评测上岗的装配门槛。 */
export function capabilityAssemblyCompleteness(employee: CapabilityAssemblyEmployee): CapabilityAssemblyCompleteness {
  const missing: string[] = [];
  const modelOk = Boolean(employee.capabilities.model?.trim());
  if (!modelOk) missing.push('模型路由');

  const bound = [
    ...employee.capabilities.skills.map((name) => ({ capabilityType: 'skill' as const, capabilityName: name })),
    ...employee.capabilities.tools.map((name) => ({ capabilityType: 'tool' as const, capabilityName: name })),
    ...employee.capabilities.workflows.map((name) => ({ capabilityType: 'workflow' as const, capabilityName: name })),
  ];
  const assetsOk = bound.length > 0;
  if (!assetsOk) missing.push('技能/工具/流程技能');

  const modes = employee.boundaryPolicy?.capabilityModes ?? [];
  const modesOk = assetsOk && bound.every((item) => modes.some((mode) => mode.capabilityType === item.capabilityType && mode.capabilityName === item.capabilityName));
  if (assetsOk && !modesOk) missing.push('执行授权模式');

  const ready = modelOk && assetsOk && modesOk;
  const label: CapabilityAssemblyCompleteness['label'] = !modelOk
    ? '未绑模型'
    : !assetsOk
      ? '缺执行能力'
      : !modesOk
        ? '待设授权模式'
        : '装配完整';

  return { modelOk, assetsOk, modesOk, ready, missing: [...new Set(missing)], label, boundCount: bound.length + (employee.capabilities.knowledge?.length ?? 0) };
}

/** Incomplete capability assemblies first, then department/head order. */
export function compareCapabilityAssemblyEmployees<T extends SortableEmployee & CapabilityAssemblyEmployee>(left: T, right: T) {
  const leftReady = Number(capabilityAssemblyCompleteness(left).ready);
  const rightReady = Number(capabilityAssemblyCompleteness(right).ready);
  if (leftReady !== rightReady) return leftReady - rightReady;
  const leftModel = Number(capabilityAssemblyCompleteness(left).modelOk);
  const rightModel = Number(capabilityAssemblyCompleteness(right).modelOk);
  if (leftModel !== rightModel) return leftModel - rightModel;
  return compareDigitalEmployees(left, right);
}

/** 上岗发布门禁判定所需字段。 */
export type ReleaseOnboardingEmployee = RoleSetupEmployee & CapabilityAssemblyEmployee & {
  evaluation: { status: string; score?: number };
  release: { status: string; requestedBy?: string; approver?: string };
  lifecycle: string;
};

export type ReleaseOnboardingStage = 'pending_eval' | 'eval_failed' | 'ready_to_request' | 'pending_approval' | 'released';

export type ReleaseOnboardingCompleteness = {
  contractOk: boolean;
  capabilityOk: boolean;
  evaluationOk: boolean;
  approvalOk: boolean;
  configReady: boolean;
  stage: ReleaseOnboardingStage;
  label: '待评测' | '评测未通过' | '可申请上岗' | '待双重审批' | '已上岗';
  missing: string[];
  gates: Array<{
    key: 'contract' | 'capability' | 'evaluation' | 'approval';
    label: string;
    passed: boolean;
    detail: string;
    fixTab?: 'roleSetup' | 'capabilities';
  }>;
};

const RELEASE_STAGE_RANK: Record<ReleaseOnboardingStage, number> = {
  pending_eval: 0,
  eval_failed: 1,
  ready_to_request: 2,
  pending_approval: 3,
  released: 4,
};

/** 上岗门禁：与 release API 硬校验对齐（档案/职责/模型与执行能力/评测/双重审批）。 */
export function releaseOnboardingCompleteness(employee: ReleaseOnboardingEmployee): ReleaseOnboardingCompleteness {
  const role = roleSetupCompleteness(employee);
  const capability = capabilityAssemblyCompleteness(employee);
  const legacyDutyOk = employee.responsibilities.length > 0 && !employee.responsibilities.includes('待配置岗位职责');
  const contractOk = role.profileOk && (role.boundaryOk || legacyDutyOk);
  const capabilityOk = capability.modelOk && capability.assetsOk;
  const evaluationOk = employee.evaluation.status === 'passed';
  const approvalOk = employee.release.status === 'released';
  const configReady = contractOk && capabilityOk;

  const missing: string[] = [];
  if (!role.profileOk) missing.push(...role.missing.filter((item) => ['岗位负责人', '人工接管负责人', '服务对象'].includes(item)));
  if (!legacyDutyOk && !role.boundaryOk) missing.push('岗位职责');
  if (!capability.modelOk) missing.push('模型路由');
  if (!capability.assetsOk) missing.push('技能/工具/流程技能');
  if (configReady && employee.evaluation.status === 'failed') missing.push('评测未通过');
  if (configReady && employee.evaluation.status === 'not_started') missing.push('尚未评测');
  if (employee.release.status === 'pending_approval') missing.push('待另一名管理员批准');

  let stage: ReleaseOnboardingStage;
  if (approvalOk) stage = 'released';
  else if (employee.release.status === 'pending_approval') stage = 'pending_approval';
  else if (evaluationOk) stage = 'ready_to_request';
  else if (employee.evaluation.status === 'failed') stage = 'eval_failed';
  else stage = 'pending_eval';

  const label: ReleaseOnboardingCompleteness['label'] = stage === 'released'
    ? '已上岗'
    : stage === 'pending_approval'
      ? '待双重审批'
      : stage === 'ready_to_request'
        ? '可申请上岗'
        : stage === 'eval_failed'
          ? '评测未通过'
          : '待评测';

  const gates: ReleaseOnboardingCompleteness['gates'] = [
    {
      key: 'contract',
      label: '岗位契约',
      passed: contractOk,
      detail: contractOk ? `负责人 ${employee.owner}` : missing.filter((item) => ['岗位负责人', '人工接管负责人', '服务对象', '岗位职责'].includes(item)).slice(0, 2).join('、') || '待完善档案与职责',
      fixTab: 'roleSetup',
    },
    {
      key: 'capability',
      label: '能力装配',
      passed: capabilityOk,
      detail: capabilityOk ? `已装配 ${capability.boundCount} 项引用` : missing.filter((item) => ['模型路由', '技能/工具/流程技能'].includes(item)).join('、') || '待装配模型与执行能力',
      fixTab: 'capabilities',
    },
    {
      key: 'evaluation',
      label: '质量评测',
      passed: evaluationOk,
      detail: employee.evaluation.status === 'failed'
        ? `未通过 ${employee.evaluation.score ?? ''}`.trim()
        : employee.evaluation.score
          ? `${employee.evaluation.score} 分`
          : '尚未通过',
    },
    {
      key: 'approval',
      label: '双重审批上岗',
      passed: approvalOk,
      detail: approvalOk
        ? `申请人 ${employee.release.requestedBy ?? '—'} · 批准人 ${employee.release.approver ?? '—'}`
        : employee.release.status === 'pending_approval'
          ? `待批准 · 申请人 ${employee.release.requestedBy ?? '—'}`
          : '尚未申请',
    },
  ];

  return {
    contractOk,
    capabilityOk,
    evaluationOk,
    approvalOk,
    configReady,
    stage,
    label,
    missing: [...new Set(missing)],
    gates,
  };
}

/** Earlier release stages first, then department/head order. */
export function compareReleaseOnboardingEmployees<T extends SortableEmployee & ReleaseOnboardingEmployee>(left: T, right: T) {
  const leftStage = RELEASE_STAGE_RANK[releaseOnboardingCompleteness(left).stage];
  const rightStage = RELEASE_STAGE_RANK[releaseOnboardingCompleteness(right).stage];
  if (leftStage !== rightStage) return leftStage - rightStage;
  return compareDigitalEmployees(left, right);
}

/** Department head / lead digital employee (one per department). */
export function isDepartmentHead(employee: SortableEmployee) {
  if (/-(manager|head)$/.test(employee.id)) return true;
  // 花名不含职称；仅以岗位名称判断负责人
  if (employee.role && /部负责人$|部经理$|负责人$|经理$|总监$|主管$/.test(employee.role)) return true;
  return false;
}

function departmentRank(department: string) {
  const index = DIGITAL_EMPLOYEE_DEPARTMENT_ORDER.indexOf(department);
  return index === -1 ? DIGITAL_EMPLOYEE_DEPARTMENT_ORDER.length : index;
}

/** Heads first globally, then department order, then name. */
export function compareDigitalEmployees(left: SortableEmployee, right: SortableEmployee) {
  const headCompare = Number(isDepartmentHead(right)) - Number(isDepartmentHead(left));
  if (headCompare !== 0) return headCompare;
  const departmentCompare = departmentRank(left.department) - departmentRank(right.department);
  if (departmentCompare !== 0) return departmentCompare;
  if (left.department !== right.department) return left.department.localeCompare(right.department, 'zh-CN');
  return left.name.localeCompare(right.name, 'zh-CN');
}

export function sortDigitalEmployees<T extends SortableEmployee>(employees: T[]) {
  return [...employees].sort(compareDigitalEmployees);
}
