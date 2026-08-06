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
  /** 运行时执行器未接入，UI 应禁用勾选为默认执行 */
  unavailable?: boolean;
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

function isAllowlistedRuntime(kind: CopilotToolDef['kind'], name: string): boolean {
  const n = name.toLowerCase();
  if (kind === 'skill') {
    return /docx|xlsx|pptx|excel|word|ppt/.test(n);
  }
  if (kind === 'tool') {
    return n === 'knowledge.retrieve' || n === 'memory.recall' || n.includes('cmdb') || n.includes('检索');
  }
  return false;
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
    const requiresApproval = mode === 'approval_required';
    const unavailable = kind === 'workflow' || (kind === 'tool' && !isAllowlistedRuntime(kind, name) && !requiresApproval);
    out.push({
      key,
      name,
      kind,
      desc: unavailable ? `${describe(kind, name)}（未接入）` : describe(kind, name),
      requiresApproval,
      unavailable,
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

/** 办公文档类技能（即使边界未标 approval_required，受控执行回合也应纳入）。 */
export function isOfficeDocumentTool(tool: CopilotToolDef): boolean {
  return /docx|xlsx|pptx|excel|word|ppt/i.test(tool.name) || /docx|xlsx|pptx|excel|word|ppt/i.test(tool.key);
}

/** 受控执行下应纳入本回合的工具键（只读基线 + 审批/写技能）。 */
export function toolsForExecuteMode(base: string[], available: CopilotToolDef[]): string[] {
  const extras = available
    .filter((t) => !t.unavailable && (t.requiresApproval || isOfficeDocumentTool(t)))
    .map((t) => t.key);
  return Array.from(new Set([...base, ...extras]));
}

/** 用户意图是否要求写操作 / 文档产出（研判下应升到受控执行）。 */
export function isWriteExecutionIntent(text: string): boolean {
  return /\/(exec|kubectl|write|apply|config)|CONFIG SET|kubectl\s+(apply|delete|exec)/i.test(text)
    || /(生成|制作|导出|写一份|做一份).{0,12}(PPT|pptx|幻灯片|演示文稿|文档|报告|docx|xlsx|表格)/i.test(text)
    || /\b(pptx?|docx?|xlsx?)\b/i.test(text);
}

export function approvalToolKeys(available: CopilotToolDef[]): string[] {
  return available
    .filter((t) => !t.unavailable && (t.requiresApproval || isOfficeDocumentTool(t)))
    .map((t) => t.key);
}
