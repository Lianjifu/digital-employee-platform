/**
 * Copilot「运行配置 · 工具链」：仅展示当前数字员工已装配的工具/技能，
 * 不按岗位臆造未装配项。
 */
export type CopilotToolDef = {
  key: string;
  name: string;
  desc: string;
  kind: 'tool' | 'skill' | 'workflow';
  requiresApproval?: boolean;
};

export type ExpertToolSource = {
  capabilities?: {
    tools?: string[];
    skills?: string[];
    workflows?: string[];
  };
  boundaryPolicy?: {
    capabilityModes?: Array<{
      capabilityType: string;
      capabilityName: string;
      mode: string;
    }>;
  };
};

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function modeOf(employee: ExpertToolSource | null | undefined, type: string, name: string): string | undefined {
  return employee?.boundaryPolicy?.capabilityModes?.find(
    (item) => item.capabilityType === type && item.capabilityName === name,
  )?.mode;
}

function describe(kind: CopilotToolDef['kind'], name: string): string {
  switch (kind) {
    case 'skill':
      return `已装配技能 · ${name}`;
    case 'workflow':
      return `已装配流程 · ${name}`;
    default:
      return `已装配工具 · ${name}`;
  }
}

function pushUnique(
  out: CopilotToolDef[],
  seen: Set<string>,
  employee: ExpertToolSource | null | undefined,
  kind: CopilotToolDef['kind'],
  names: string[] | undefined,
) {
  for (const raw of names ?? []) {
    const name = raw.trim();
    if (!name) continue;
    const key = `${kind}:${slug(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mode = modeOf(employee, kind, name);
    if (mode === 'prohibited') continue;
    out.push({
      key,
      name,
      kind,
      desc: describe(kind, name),
      requiresApproval: mode === 'approval_required',
    });
  }
}

/**
 * 从数字员工能力装配构建本会话工具链。
 * 未绑定专家或未装配任何工具/技能时仍返回平台内置检索工具。
 */
export function buildExpertTools(employee?: ExpertToolSource | null): CopilotToolDef[] {
  const out: CopilotToolDef[] = [
    {
      key: 'builtin:knowledge.retrieve',
      name: 'knowledge.retrieve',
      kind: 'tool',
      desc: '平台内置 · 检索已发布知识库',
    },
    {
      key: 'builtin:memory.recall',
      name: 'memory.recall',
      kind: 'tool',
      desc: '平台内置 · 检索跨会话记忆',
    },
  ];
  const seen = new Set(out.map((t) => t.key));
  if (!employee?.capabilities) return out;
  // 工具优先，再技能；流程一般偏编排，放最后且默认不塞满列表时可被会话选用
  pushUnique(out, seen, employee, 'tool', employee.capabilities.tools);
  pushUnique(out, seen, employee, 'skill', employee.capabilities.skills);
  pushUnique(out, seen, employee, 'workflow', employee.capabilities.workflows);
  return out;
}

export function defaultEnabledToolKeys(tools: CopilotToolDef[]): string[] {
  // 默认启用只读/推荐类；需审批的默认关闭
  return tools.filter((t) => !t.requiresApproval).map((t) => t.key);
}
