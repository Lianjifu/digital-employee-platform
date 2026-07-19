/**
 * Mock 适配器 — 前端可独立运行
 * 后续切真实后端：删除 mockHandler 注入，baseURL 指向 Connect-RPC 网关即可。
 */
import type {
  Agent,
  CapabilityBinding,
  AuditItem,
  Channel,
  ChannelAuditEvent,
  ChannelDeployment,
  DeliveryAttempt,
  DeliveryPolicyDraft,
  DeliveryPolicyVersion,
  ControlledTask,
  Conversation,
  KnowledgeAuditEvent,
  KnowledgeConsumerBinding,
  KnowledgeGovernancePolicy,
  KnowledgeDoc,
  KnowledgeEvaluation,
  KnowledgeGraphEntity,
  KnowledgeGraphRelation,
  KnowledgePackage,
  KnowledgeProcessingJob,
  KnowledgeRetrievalProfile,
  KnowledgeRetrievalResult,
  KnowledgeSourceConnection,
  KpiCard,
  ModelAuditEvent,
  ModelProfile,
  ModelProvider,
  ModelRoute,
  Provider,
  ProviderImpact,
  RoutingPolicyDraft,
  RoutingPolicyVersion,
  Skill,
  SkillAuditEvent,
  SkillImpactReport,
  SkillInstallPreflight,
  SkillPermission,
  SkillGovernancePolicy,
  SkillIntegration,
  SkillRuntimeHealth,
  SkillGovernanceIncident,
  SkillGovernanceEvent,
  SkillRuntimeConfig,
  Task,
  Workflow,
  WorkflowSkill,
  Workspace,
} from '@de/web-types';
import { sleep } from '@de/web-utils';

// ============ 静态 Mock 数据（来自功能模块文档） ============

// ============ P4 工作区扩展数据 ============

export const mockWorkspaceAgents = {
  w1: ['故障自愈', 'K8s 操作', '告警降噪', '容量预测', '合规审计', '客户支持'], // 6 Agent
  w2: ['K8s 操作', '故障自愈', '容量预测'], // 3
  w3: ['威胁狩猎', '漏洞修复', '合规审计', '告警降噪'], // 4
  w4: ['客户支持'], // 1
};

export const mockWorkspaceTools = {
  w1: { enabled: 18, total: 24, list: ['redis-cli', 'kubectl', 'loki-query', 'prometheus-mcp', 'cmdb-tool', 'jira-tool', '...'] },
  w2: { enabled: 12, total: 24, list: ['kubectl', 'redis-cli', '...'] },
  w3: { enabled: 14, total: 24, list: ['siem-mcp', 'cve-tool', '...'] },
  w4: { enabled: 3, total: 24, list: ['email-tool'] },
};

export const mockWorkspaceMembers = {
  w1: [
    { id: 'u1', name: '王昊', role: 'Admin', email: 'wanghao@acme.com', mfa: true, lastActive: '刚刚' },
    { id: 'u2', name: '李婷', role: 'SRE', email: 'liting@acme.com', mfa: true, lastActive: '5min 前' },
    { id: 'u3', name: '张睿', role: 'Sec', email: 'zhangrui@acme.com', mfa: true, lastActive: '12min 前' },
    { id: 'u4', name: '孙博', role: 'Admin', email: 'sunbo@acme.com', mfa: true, lastActive: '32min 前' },
    { id: 'u5', name: '周慧', role: 'View', email: 'zhouhui@acme.com', mfa: false, lastActive: '1h 前' },
  ],
  w2: [
    { id: 'u6', name: '赵明', role: 'SRE', email: 'zhaoming@acme.com', mfa: true, lastActive: '8min 前' },
    { id: 'u7', name: '陈雪', role: 'SRE', email: 'chenxue@acme.com', mfa: true, lastActive: '15min 前' },
  ],
  w3: [
    { id: 'u8', name: '李雷', role: 'Sec', email: 'lilei@acme.com', mfa: true, lastActive: '2min 前' },
    { id: 'u9', name: '韩梅梅', role: 'Sec', email: 'hanmeimei@acme.com', mfa: true, lastActive: '20min 前' },
    { id: 'u10', name: 'Lucy', role: 'View', email: 'lucy@acme.com', mfa: true, lastActive: '45min 前' },
  ],
  w4: [
    { id: 'u11', name: '外协 A', role: 'View', email: 'partner-a@external.com', mfa: true, lastActive: '1d 前' },
    { id: 'u12', name: '外协 B', role: 'View', email: 'partner-b@external.com', mfa: true, lastActive: '3d 前' },
  ],
};

export const mockWorkspaceSwitchHistory = [
  { id: 's1', time: '14:32', user: '王昊', from: 'ACME 预发', to: 'ACME 生产', reason: '故障处理' },
  { id: 's2', time: '12:15', user: '张睿', from: 'ACME 安全', to: 'ACME 生产', reason: '审计报告' },
  { id: 's3', time: '09:30', user: '李婷', from: 'ACME 生产', to: 'ACME 预发', reason: '测试部署' },
  { id: 's4', time: '昨天 17:20', user: '孙博', from: '外协沙箱', to: 'ACME 生产', reason: '代码合并' },
];

export const mockWorkspaces: Workspace[] = [
  { id: 'w1', name: 'ACME 生产', region: 'cn-east-1', plan: 'enterprise_plus', memberCount: 18, complianceScore: 98, createdAt: '2024-03-12T00:00:00Z' },
  { id: 'w2', name: 'ACME 预发', region: 'cn-east-1', plan: 'enterprise', memberCount: 6, complianceScore: 92, createdAt: '2024-05-08T00:00:00Z' },
  { id: 'w3', name: 'ACME 安全', region: 'cn-east-1', plan: 'enterprise_plus', memberCount: 4, complianceScore: 100, createdAt: '2024-06-01T00:00:00Z' },
  { id: 'w4', name: '外协沙箱', region: 'cn-south-1', plan: 'standard', memberCount: 2, complianceScore: 85, createdAt: '2025-01-15T00:00:00Z' },
];

// ============ 首页扩展数据 ============
export interface HomeExtra {
  healthTrend24h: number[];
  teamMembers: { id: string; name: string; role: string; online: boolean }[];
  recentActivities: { id: string; type: string; tone: 'success' | 'warning' | 'info' | 'danger'; text: string; actor: string; resource: string; time: string }[];
  agentCallSummary: { total: number; healthy: number; warning: number; offline: number };
  // 新增字段
  notifications: { id: string; tone: 'info' | 'warn' | 'success' | 'error'; icon: string; text: string; detail?: string; time: string; unread: boolean }[];
  agent7dTrend: Record<string, number[]>; // 7 天每日调用
  taskCompletion: { done: number; doing: number; review: number; todo: number };
  slaAlerts: { id: string; level: 'P0' | 'P1' | 'P2' | 'P3'; text: string; time: string; assignee: string; taskCode: string }[];
  costMonth: { used: number; budget: number; daily: number[] }; // 7 天
  roleDistribution: { role: string; count: number }[];
  suggestion: { id: string; tone: 'success' | 'warn' | 'info'; text: string; action: string; to: string }[];
  quickLinks: { label: string; to: string; icon: string; desc?: string }[];
  kpiDetails: {
    tasks: { p0: number; p1: number; p2: number; p3: number; prevText: string; avgTime: string };
    health: { servicesUp: number; servicesTotal: number; incidents: number; mttr: string };
    aiCalls: { success: number; failed: number; cacheHit: number; peakHour: string };
    token: { input: string; output: string; model: string };
    p95: { api: number; agent: number; rag: number; target: string };
    sla: { p0: number; p1: number; avgResponse: number; prevText: string };
  };
}

export const mockHomeExtra: HomeExtra = {
  healthTrend24h: [92, 94, 95, 93, 96, 98, 97, 96, 98, 99, 98, 97, 99, 100, 99, 98, 97, 96, 98, 99, 98, 99, 100, 99],
  notifications: [
    { id: 'n1', tone: 'warn', icon: 'AlertTriangle', text: 'P0 告警：Redis cache-oom 临近超时', detail: 'TSK-20260713-001 · 王昊 · -8min', time: '8 min 前', unread: true },
    { id: 'n2', tone: 'info', icon: 'CheckCircle2', text: 'CVE 周报已生成（12 个新漏洞）', detail: '其中高危 3 个需立即修复', time: '12 min 前', unread: true },
    { id: 'n3', tone: 'success', icon: 'Sparkles', text: '月度合规自评通过（94/94）', detail: '下次审计：2026-09-12', time: '1h 前', unread: false },
    { id: 'n4', tone: 'info', icon: 'Activity', text: '告警降噪合并 23 条重复告警', detail: 'SIEM · 自动规则 #R-019', time: '2h 前', unread: false },
  ],
  agent7dTrend: {
    '故障自愈': [120, 180, 220, 190, 240, 280, 310],
    '告警降噪': [780, 820, 810, 850, 880, 860, 900],
    'K8s 操作': [80, 95, 110, 90, 120, 130, 140],
    '变更辅助': [40, 60, 80, 70, 90, 100, 110],
    '容量预测': [1, 0, 2, 1, 0, 1, 1],
    '威胁狩猎': [380, 420, 410, 450, 480, 460, 500],
    '漏洞修复': [0, 2, 1, 3, 1, 2, 3],
    '合规审计': [5, 6, 7, 8, 6, 7, 7],
  },
  taskCompletion: { done: 18, doing: 14, review: 5, todo: 9 },
  slaAlerts: [
    { id: 'sl1', level: 'P0', text: 'Redis cache-oom 临近超时（-8min）', time: '8 min 前', assignee: '王昊', taskCode: 'TSK-20260713-001' },
    { id: 'sl2', level: 'P1', text: 'K8s 节点扩容审批超时（原计划 15:00 完成）', time: '15 min 前', assignee: '李婷', taskCode: 'TSK-20260713-002' },
    { id: 'sl3', level: 'P1', text: 'CVE-2026-3321 修复已 32 天待处理', time: '32 min 前', assignee: '张睿', taskCode: 'TSK-20260712-019' },
    { id: 'sl4', level: 'P2', text: 'K8s 节点扩容申请待审（影响 5 个服务）', time: '1h 前', assignee: '王昊', taskCode: 'TSK-20260713-004' },
    { id: 'sl5', level: 'P2', text: 'API 网关证书将在 3 天后到期，待完成轮换', time: '2h 前', assignee: '孙博', taskCode: 'TSK-20260712-018' },
    { id: 'sl6', level: 'P1', text: '生产数据库备份延迟超过 30 分钟', time: '4h 前', assignee: '陈雪', taskCode: 'TSK-20260711-011' },
    { id: 'sl7', level: 'P2', text: 'Prometheus 监控规则同步失败，影响 6 个服务', time: '昨天 18:40', assignee: '赵明', taskCode: 'TSK-20260711-007' },
    { id: 'sl8', level: 'P3', text: '外协沙箱访问策略将在本周五复核', time: '2 天前', assignee: '周慧', taskCode: 'TSK-20260710-003' },
  ],
  costMonth: { used: 1240, budget: 5000, daily: [22, 28, 31, 35, 30, 27, 25] },
  roleDistribution: [
    { role: 'Admin', count: 2 },
    { role: 'SRE', count: 4 },
    { role: 'Sec', count: 3 },
    { role: 'View', count: 9 },
  ],
  suggestion: [
    { id: 'sg1', tone: 'warn', text: '漏洞修复 Agent 过去 7 天 0 次调用，CVE-2026-3321 已 32 天待修', action: '查看 Agent 集成', to: '/agents' },
    { id: 'sg2', tone: 'info', text: '容量预测已 14 天未运行，预计 Q3 增长 24%，建议启用每周自动任务', action: '配置工作流', to: '/workflows' },
    { id: 'sg3', tone: 'success', text: '本月 Token 用量 25%（$1.24k / $5.0k），Sonnet-4 占 70% 性能稳定', action: '查看用量', to: '/models' },
  ],
  quickLinks: [
    { label: '新建任务', to: '/tasks', icon: 'Plus', desc: '创建并分配给 Agent' },
    { label: '工作流市场', to: '/workflows', icon: 'Workflow', desc: '6 套内置模板' },
    { label: '知识检索', to: '/knowledge', icon: 'Search', desc: '4 KB / 247 文档' },
    { label: '模型路由', to: '/models', icon: 'Cpu', desc: '8 Provider / 5 等级' },
    { label: 'Agent 商店', to: '/agents', icon: 'Bot', desc: '24 商用 + 5 社区' },
    { label: '设置', to: '/settings', icon: 'Settings', desc: '94 项合规 + 计费' },
  ],
  kpiDetails: {
    tasks: { p0: 2, p1: 5, p2: 8, p3: 23, prevText: '昨日 26 次', avgTime: '38 min' },
    health: { servicesUp: 18, servicesTotal: 19, incidents: 1, mttr: '38 min' },
    aiCalls: { success: 8180, failed: 240, cacheHit: 32, peakHour: '14:00' },
    token: { input: '8.4M (68%)', output: '2.8M (32%)', model: 'Sonnet-4 70% / Qwen 30%' },
    p95: { api: 680, agent: 1100, rag: 320, target: '< 1500ms' },
    sla: { p0: 1, p1: 2, avgResponse: 8, prevText: '昨日 2 件' },
  },
  teamMembers: [
    { id: 'u4', name: '陈雪', role: 'SRE', online: false },
    { id: 'u5', name: '赵明', role: 'Sec', online: true },
    { id: 'u6', name: '孙博', role: 'Admin', online: false },
    { id: 'u7', name: '周慧', role: 'View', online: true },
  ],
  recentActivities: [
    { id: 'a1', type: 'task.completed', tone: 'success', text: '故障自愈 · INC-019 处理完成', actor: '王昊', resource: 'prod-redis-01', time: '14:32' },
    { id: 'a2', type: 'cve.report', tone: 'info', text: 'CVE 周报生成完成（12 个新漏洞）', actor: '张睿', resource: 'CVE-2026-W30', time: '14:18' },
    { id: 'a3', type: 'capacity.report', tone: 'warning', text: '容量预测报告已生成（Q3 增长 24%）', actor: '周慧', resource: '容量预测', time: '13:55' },
    { id: 'a4', type: 'change.deploy', tone: 'success', text: '变更辅助 · 网关灰度配置变更完成', actor: '孙博', resource: 'gateway-prod', time: '13:40' },
    { id: 'a5', type: 'alert.merge', tone: 'info', text: '告警降噪 · 合并 23 条重复告警', actor: '李婷', resource: 'SIEM', time: '12:55' },
  ],
  agentCallSummary: { total: 8420, healthy: 6, warning: 1, offline: 1 },
};

export const mockKpis: KpiCard[] = [
  { id: 'k1', label: '今日任务', value: 38, delta: { value: 12, trend: 'up' }, status: 'ok' },
  { id: 'k2', label: '系统健康度', value: '98.4', unit: '%', delta: { value: 0.3, trend: 'up' }, status: 'ok' },
  { id: 'k3', label: 'AI 调用量', value: '8.2k', delta: { value: 18, trend: 'up' }, status: 'ok' },
  { id: 'k4', label: '合规评分', value: 98, unit: '/100', delta: { value: 1, trend: 'flat' }, status: 'ok' },
  { id: 'k5', label: 'P95 响应', value: '680', unit: 'ms', delta: { value: -8, trend: 'down' }, status: 'ok' },
  { id: 'k6', label: 'SLA 告警', value: 3, status: 'warn' },
  { id: 'k7', label: '缓存命中', value: 32, unit: '%', delta: { value: 4, trend: 'up' }, status: 'ok' },
  { id: 'k8', label: 'Token 月用量', value: '12.4M', delta: { value: 6, trend: 'up' }, status: 'ok' },
];

export const mockTasks: Task[] = [
  { id: 't1', code: 'TSK-20260713-001', title: 'Redis 集群 OOM 自愈', priority: 'P0', status: 'in_progress', assignee: '王昊', agentId: 'a1', progress: { done: 4, total: 6 }, slaRemainingMin: -8, tags: ['redis', '生产', 'OOM'], createdAt: '2026-07-13T08:12:00Z', updatedAt: '2026-07-13T08:24:00Z' },
  { id: 't2', code: 'TSK-20260713-002', title: 'K8s 节点扩容审批', priority: 'P1', status: 'review', assignee: '李婷', agentId: 'a2', progress: { done: 3, total: 4 }, slaRemainingMin: 32, tags: ['k8s', '扩容'], relatedTaskCode: 'INC-019', createdAt: '2026-07-13T07:55:00Z', updatedAt: '2026-07-13T08:20:00Z' },
  { id: 't3', code: 'TSK-20260713-003', title: '威胁狩猎 - 横向移动检测', priority: 'P1', status: 'in_progress', assignee: '张睿', agentId: 'a5', progress: { done: 2, total: 5 }, slaRemainingMin: 120, tags: ['siem', 'edr'], createdAt: '2026-07-13T07:30:00Z', updatedAt: '2026-07-13T08:00:00Z' },
  { id: 't4', code: 'TSK-20260713-004', title: '告警降噪 - 重复规则合并', priority: 'P2', status: 'in_progress', assignee: '陈雪', agentId: 'a6', progress: { done: 1, total: 3 }, slaRemainingMin: 240, tags: ['siem'], createdAt: '2026-07-13T06:40:00Z', updatedAt: '2026-07-13T07:50:00Z' },
  { id: 't5', code: 'TSK-20260712-019', title: '漏洞修复 CVE-2026-3321', priority: 'P1', status: 'review', assignee: '赵明', agentId: 'a7', progress: { done: 5, total: 5 }, tags: ['cve', '安全'], createdAt: '2026-07-12T16:20:00Z', updatedAt: '2026-07-13T02:00:00Z' },
  { id: 't6', code: 'TSK-20260712-018', title: '容量预测 - Q3 评估', priority: 'P3', status: 'completed', assignee: '周慧', agentId: 'a4', progress: { done: 4, total: 4 }, tags: ['容量'], createdAt: '2026-07-12T10:00:00Z', updatedAt: '2026-07-12T18:00:00Z' },
  { id: 't7', code: 'TSK-20260712-017', title: '变更辅助 - 网关灰度', priority: 'P2', status: 'completed', assignee: '孙博', agentId: 'a3', progress: { done: 6, total: 6 }, tags: ['灰度'], createdAt: '2026-07-12T09:15:00Z', updatedAt: '2026-07-12T11:30:00Z' },
];

type TaskActor = { actor?: string; reason?: string };
type TaskSeed = Task | ControlledTask;

const cloneTask = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function controlledTask(seed: TaskSeed): ControlledTask {
  if ('lifecycleStage' in seed) return cloneTask(seed);

  const task = cloneTask(seed);
  const lifecycleStage = task.status === 'completed' ? 'completed'
    : task.status === 'review' ? 'human_action'
      : task.status === 'in_progress' ? 'running' : 'pending';
  const approvalPending = task.id === 't2';
  return {
    ...task,
    lifecycleStage,
    source: 'manual',
    sla: {
      remainingMin: task.slaRemainingMin,
      risk: task.slaRemainingMin !== undefined && task.slaRemainingMin < 0 ? 'overdue' : 'none',
      escalated: false,
    },
    execution: { retryCount: 0, paused: false },
    governance: {
      approvalRequired: approvalPending,
      approvalStatus: approvalPending ? 'pending' : 'not_required',
    },
    links: {},
    auditEvents: [],
    version: 1,
  };
}

function statusFor(stage: ControlledTask['lifecycleStage']): Task['status'] {
  if (stage === 'running' || stage === 'risk') return 'in_progress';
  if (stage === 'human_action') return 'review';
  if (stage === 'completed') return 'completed';
  if (stage === 'archived') return 'archived';
  return 'pending';
}

function stageFor(value: Task['status'] | ControlledTask['lifecycleStage']): ControlledTask['lifecycleStage'] {
  if (value === 'in_progress') return 'running';
  if (value === 'review') return 'human_action';
  return value as ControlledTask['lifecycleStage'];
}

/** In-memory controlled-task aggregate used by both task and conversation routes. */
export function createTaskDomain(seed: TaskSeed[] = mockTasks) {
  const initial = seed.map(controlledTask);
  let tasks = initial.map(cloneTask);

  const find = (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new Error('任务不存在');
    return task;
  };
  const write = (task: ControlledTask, action: string, meta: TaskActor = {}, tone: ControlledTask['auditEvents'][number]['tone'] = 'info') => {
    const at = new Date().toISOString();
    task.version += 1;
    task.updatedAt = at;
    task.auditEvents.push({ id: mockId('task_audit'), at, actor: meta.actor ?? '数字员工', action, detail: meta.reason, tone });
    return task;
  };

  return {
    list: () => tasks.map(cloneTask),
    get: (id: string) => {
      const task = tasks.find((item) => item.id === id);
      return task ? cloneTask(task) : undefined;
    },
    create: (input: Partial<ControlledTask> & Pick<Task, 'title'>, meta: TaskActor = {}) => {
      const now = new Date().toISOString();
      const task = controlledTask({
        id: input.id ?? mockId('task'),
        code: input.code ?? `TSK-${now.slice(0, 10).replaceAll('-', '')}-${String(tasks.length + 1).padStart(3, '0')}`,
        title: input.title,
        description: input.description,
        priority: input.priority ?? 'P1',
        status: input.status ?? 'pending',
        assignee: input.assignee,
        agentId: input.agentId,
        progress: input.progress ?? { done: 0, total: 1 },
        slaRemainingMin: input.slaRemainingMin,
        tags: input.tags ?? [],
        relatedTaskCode: input.relatedTaskCode,
        createdAt: now,
        updatedAt: now,
      });
      Object.assign(task, input, { auditEvents: [], version: 0, createdAt: now, updatedAt: now });
      tasks.unshift(task);
      return cloneTask(write(task, '创建任务', meta, 'success'));
    },
    transition: (id: string, target: Task['status'] | ControlledTask['lifecycleStage'], meta: TaskActor = {}) => {
      const task = find(id);
      const stage = stageFor(target);
      if (task.governance.approvalRequired && (stage === 'running' || stage === 'completed')) {
        if (task.governance.approvalStatus === 'rejected') throw new Error('任务审批已拒绝');
        if (task.governance.approvalStatus !== 'approved') throw new Error('任务等待人工审批');
      }
      if (task.lifecycleStage === 'risk' || task.sla.risk !== 'none') throw new Error('风险或失败任务仅允许重试或人工接管');
      task.lifecycleStage = stage;
      task.status = statusFor(stage);
      return cloneTask(write(task, '状态流转', meta, stage === 'completed' ? 'success' : 'info'));
    },
    approve: (id: string, input: TaskActor & { approved?: boolean } = {}) => {
      const task = find(id);
      task.governance.approvalStatus = input.approved === false ? 'rejected' : 'approved';
      return cloneTask(write(task, input.approved === false ? '审批拒绝' : '审批通过', input, input.approved === false ? 'error' : 'success'));
    },
    takeover: (id: string, meta: TaskActor = {}) => {
      const task = find(id);
      task.governance.takeoverBy = meta.actor ?? '人工操作员';
      task.governance.takeoverReason = meta.reason;
      task.lifecycleStage = 'human_action';
      task.status = 'review';
      task.execution.paused = true;
      return cloneTask(write(task, '人工接管', meta, 'warn'));
    },
    retry: (id: string, meta: TaskActor = {}) => {
      const task = find(id);
      if (task.lifecycleStage !== 'risk' && task.sla.risk === 'none') throw new Error('仅失败或风险任务可以重试');
      task.execution.retryCount += 1;
      task.execution.error = undefined;
      task.execution.paused = false;
      task.lifecycleStage = 'running';
      task.status = 'in_progress';
      task.sla.risk = 'none';
      return cloneTask(write(task, '重试任务', meta, 'info'));
    },
    audit: (id: string) => cloneTask(find(id).auditEvents),
    reset: () => {
      tasks = initial.map(cloneTask);
      return { ok: true };
    },
  };
}
// Agent 扩展数据：版本历史 + 7 天调用趋势 + Top 排行
export interface AgentVersion {
  version: string;
  date: string;
  changelog: string[];
  type: 'major' | 'minor' | 'patch';
}

export const mockAgentVersions: Record<string, AgentVersion[]> = {
  a1: [
    { version: '1.4.2', date: '2026-07-08', type: 'minor', changelog: ['+ 新增 Redis 7.x 兼容', '+ 优化 volatile-lru 策略切换', '- 修复内存计算偏差'] },
    { version: '1.4.1', date: '2026-06-20', type: 'patch', changelog: ['+ 支持 cluster bus', '- 修复大 Key 扫描卡顿'] },
    { version: '1.4.0', date: '2026-06-01', type: 'major', changelog: ['+ 全新 LangGraph 0.2 内核', '+ 支持多实例并行恢复', '+ 缓存命中率 +12%'] },
    { version: '1.3.5', date: '2026-05-15', type: 'minor', changelog: ['+ 双签流程整合'] },
    { version: '1.3.0', date: '2026-04-01', type: 'major', changelog: ['+ RAG 检索集成'] },
  ],
};

export const mockCallTrends: Record<string, number[]> = {
  a1: [120, 180, 220, 190, 240, 280, 310], // 7 天调用趋势
  a2: [80, 95, 110, 90, 120, 130, 140],
  a3: [40, 60, 80, 70, 90, 100, 110],
  a4: [1, 0, 2, 1, 0, 1, 1],
  a5: [380, 420, 410, 450, 480, 460, 500],
  a6: [780, 820, 810, 850, 880, 860, 900],
  a7: [0, 2, 1, 3, 1, 2, 3],
  a8: [5, 6, 7, 8, 6, 7, 7],
};

export const mockAgentRank = [
  { rank: 1, id: 'a6', name: '告警降噪', calls: 5900, change: 8.2 },
  { rank: 2, id: 'a1', name: '故障自愈', calls: 1540, change: 12.5 },
  { rank: 3, id: 'a5', name: '威胁狩猎', calls: 3100, change: 4.1 },
  { rank: 4, id: 'a2', name: 'K8s 操作', calls: 765, change: 15.3 },
  { rank: 5, id: 'a3', name: '变更辅助', calls: 550, change: 22.1 },
  { rank: 6, id: 'a7', name: '漏洞修复', calls: 12, change: -5.0 },
  { rank: 7, id: 'a8', name: '合规审计', calls: 46, change: 0 },
  { rank: 8, id: 'a4', name: '容量预测', calls: 6, change: 0 },
];

export const mockAgents: Agent[] = [
  { id: 'a1', name: 'Redis 故障自愈', category: 'AIOps', description: 'redis-cli · MONITOR · CONFIG 自动恢复', version: '1.4.2', status: 'installed', rating: 4.8, installCount: 1240, cacheHitRate: 0.32, p95Ms: 580, tools: ['redis-cli', 'MONITOR'], isStarred: true },
  { id: 'a2', name: 'K8s 操作助手', category: 'AIOps', description: 'kubectl apply / scale / rollout', version: '2.1.0', status: 'installed', rating: 4.7, installCount: 980, cacheHitRate: 0.28, p95Ms: 720, tools: ['kubectl'] },
  { id: 'a3', name: '变更辅助', category: 'AIOps', description: '灰度发布 + 风险评估 + 回滚', version: '1.2.5', status: 'installed', rating: 4.6, installCount: 760, cacheHitRate: 0.22, p95Ms: 1100, tools: ['kubectl', 'argo'] },
  { id: 'a4', name: '容量预测', category: 'AIOps', description: '历史数据 + 趋势分析 + 建议', version: '1.0.8', status: 'installed', rating: 4.5, installCount: 540, cacheHitRate: 0.18, p95Ms: 2300, tools: ['prometheus'] },
  { id: 'a5', name: '威胁狩猎', category: 'SecOps', description: 'ATT&CK 框架 + EDR + SIEM', version: '1.6.0', status: 'installed', rating: 4.9, installCount: 460, p95Ms: 880, tools: ['siem', 'edr'] },
  { id: 'a6', name: '告警降噪', category: 'SecOps', description: '误报识别 + 规则合并', version: '1.3.2', status: 'installed', rating: 4.7, installCount: 380, p95Ms: 420, tools: ['siem'] },
  { id: 'a7', name: '漏洞修复', category: 'SecOps', description: 'CVE → 资产 → 工单', version: '2.0.1', status: 'installed', rating: 4.8, installCount: 320, p95Ms: 1500, tools: ['cmdb', 'jira'] },
  { id: 'a8', name: '合规审计', category: 'SecOps', description: '等保 3 / SOX 自动核查', version: '1.1.0', status: 'installed', rating: 4.6, installCount: 210, p95Ms: 3200, tools: ['audit'] },
  { id: 'a9', name: 'PromQL 生成', category: 'AIOps', description: '自然语言转 PromQL', version: '1.0.0', status: 'available', rating: 4.4, installCount: 120, tools: ['prometheus'] },
  { id: 'a10', name: '日志查询', category: 'AIOps', description: 'Loki · ES · S3 统一查询', version: '2.3.0', status: 'available', rating: 4.7, installCount: 880, tools: ['loki', 'opensearch'] },
];

// 企业纳管字段：负责人、工作区和生命周期状态
mockAgents.forEach((agent, index) => Object.assign(agent, {
  owner: ['王昊', '李婷', '张睿'][index % 3],
  workspace: index % 2 === 0 ? '生产运维' : '安全运营',
  configStatus: agent.status === 'installed' ? 'configured' : 'pending',
  evaluationStatus: agent.status === 'installed' ? 'passed' : 'pending',
  publishStatus: agent.status === 'installed' ? 'published' : 'unpublished',
  hasUpdate: index === 1 || index === 5,
  lastRunAt: agent.status === 'installed' ? `${index + 2} 分钟前` : '—',
}));

// P5 智能体控制台：评测、实时调用和告警统一由 Mock API 提供。
export const mockAgentEvaluations = [
  { id: 'e01', name: '故障自愈-2026-W28-A', agentId: 'a1', agentName: 'Redis 故障自愈', version: '1.4.2', totalCases: 2400, accuracy: 92.4, recall: 90.1, p95Ms: 580, tokensPerCall: 820, rating: 4.7, calls: 12453, status: 'champion', passedAt: '2026-07-14T03:20:00Z', dataset: 'incident-v3', judgeModel: 'gpt-4o' },
  { id: 'e02', name: '变更辅助-2026-W27', agentId: 'a3', agentName: '变更辅助', version: '1.2.5', totalCases: 1200, accuracy: 94.1, recall: 92.0, p95Ms: 520, tokensPerCall: 640, rating: 4.6, calls: 8210, status: 'champion', passedAt: '2026-07-08T09:00:00Z', dataset: 'changeqa-v2', judgeModel: 'claude-sonnet' },
  { id: 'e03', name: '威胁狩猎-2026-W27', agentId: 'a5', agentName: '威胁狩猎', version: '1.6.0', totalCases: 800, accuracy: 87.3, recall: 91.2, p95Ms: 720, tokensPerCall: 980, rating: 4.4, calls: 5430, status: 'baseline', passedAt: '2026-07-07T08:30:00Z', dataset: 'threatbench-v1', judgeModel: 'gpt-4o' },
];

export const mockAgentLiveCalls = [
  { id: 'lc01', agentId: 'a1', agent: 'Redis 故障自愈', ts: '14:55', latencyMs: 620, tokens: 880, status: 'ok', channel: 'api' },
  { id: 'lc02', agentId: 'a3', agent: '变更辅助', ts: '14:54', latencyMs: 510, tokens: 640, status: 'ok', channel: 'cli' },
  { id: 'lc03', agentId: 'a5', agent: '威胁狩猎', ts: '14:53', latencyMs: 880, tokens: 1020, status: 'ok', channel: 'mcp' },
  { id: 'lc04', agentId: 'a1', agent: 'Redis 故障自愈', ts: '14:49', latencyMs: 1500, tokens: 880, status: 'timeout', channel: 'api' },
];

export const mockAgentAlerts = [
  { id: 'al1', agent: 'Redis 故障自愈', agentId: 'a1', severity: 'warn', type: 'latency', title: 'P95 超阈值（800ms > 600ms）', ts: '14:32', acknowledged: false },
  { id: 'al2', agent: '容量预测', agentId: 'a4', severity: 'warn', type: 'token', title: 'Token 用量超预算 80%', ts: '13:18', acknowledged: false },
  { id: 'al3', agent: '威胁狩猎', agentId: 'a5', severity: 'error', type: 'approval', title: '高风险操作待双签', ts: '11:05', acknowledged: false },
];

const mockAgentRuntime = {
  evaluations: [...mockAgentEvaluations] as any[],
  liveCalls: [...mockAgentLiveCalls] as any[],
  alerts: [...mockAgentAlerts] as any[],
};

// 智能体市场导入 / 审核 / 审计（前端开发阶段的可变 Mock 状态）
const mockAgentImports: any[] = [];

// ============ P6 工作流扩展数据 ============

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: number;
  installs: number;
  rating: number;
}

export const mockWorkflowTemplates: WorkflowTemplate[] = [
  { id: 'tpl1', name: 'cache-oom 故障自愈', description: 'Redis 缓存 OOM 自动扩容 + 切换 LRU 策略', category: 'system', nodes: 8, installs: 124, rating: 4.8 },
  { id: 'tpl2', name: 'CVE 自动修复', description: 'CVE 扫描 → 资产匹配 → 工单创建', category: 'security', nodes: 6, installs: 88, rating: 4.6 },
  { id: 'tpl3', name: '合规审计报告', description: '等保 3 94 项自动核查 + 报告生成', category: 'business', nodes: 7, installs: 56, rating: 4.7 },
  { id: 'tpl4', name: '变更灰度发布', description: '蓝绿发布 + 自动回滚', category: 'business', nodes: 5, installs: 142, rating: 4.9 },
  { id: 'tpl5', name: '告警降噪', description: 'SIEM 重复告警合并 + 静默', category: 'ai', nodes: 4, installs: 78, rating: 4.5 },
  { id: 'tpl6', name: '容量预测', description: '历史趋势分析 + 提前扩容建议', category: 'ai', nodes: 6, installs: 42, rating: 4.4 },
];

export const mockWorkflowRuns = [
  { id: 'r1', time: '14:28', trigger: 'cache-oom', status: 'success', duration: 38, steps: 6, who: '王昊' },
  { id: 'r2', time: '13:42', trigger: 'cache-oom', status: 'success', duration: 36, steps: 6, who: '李婷' },
  { id: 'r3', time: '11:18', trigger: 'cache-oom', status: 'failed', duration: 52, steps: 4, who: '王昊', error: '双签审批超时' },
  { id: 'r4', time: '09:54', trigger: 'change-deploy', status: 'success', duration: 124, steps: 8, who: '孙博' },
  { id: 'r5', time: '08:30', trigger: 'cve-scan', status: 'success', duration: 78, steps: 6, who: '张睿' },
];

export const mockWorkflowKpi = {
  running: 3,
  totalToday: 47,
  successRate: 97.8,
  avgDuration: 42,
  mttrImprovement: -65,
};

export const mockWorkflow: Workflow = {
  id: 'wf1',
  name: 'cache-oom 故障自愈',
  status: 'active',
  triggerCount: 124,
  successRate: 1.0,
  avgDurationSec: 38,
  nodes: [
    { id: 'n1', kind: 'trigger', label: '触发器', status: 'success', durationMs: 12 },
    { id: 'n2', kind: 'retrieve', label: '知识检索', status: 'success', durationMs: 320 },
    { id: 'n3', kind: 'decision', label: 'Agent 决策', status: 'success', durationMs: 880 },
    { id: 'n4', kind: 'approval', label: '双签审批', status: 'success', durationMs: 4500 },
    { id: 'n5', kind: 'branch', label: '条件分支', status: 'success', durationMs: 4 },
    { id: 'n6', kind: 'execute', label: '执行恢复', status: 'success', durationMs: 21000 },
    { id: 'n7', kind: 'audit', label: '审计日志', status: 'success', durationMs: 60 },
    { id: 'n8', kind: 'notify', label: '通知收尾', status: 'success', durationMs: 180 },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
    { id: 'e4', source: 'n4', target: 'n5' },
    { id: 'e5', source: 'n5', target: 'n6' },
    { id: 'e6', source: 'n6', target: 'n7' },
    { id: 'e7', source: 'n7', target: 'n8' },
  ],
};

// 工作流控制台运行态 Mock：保存草稿、校验、执行、版本和审计共享同一份状态。
const mockWorkflowControl = {
  draft: JSON.parse(JSON.stringify(mockWorkflow)) as any,
  versions: [{ id: 'v4', label: 'v4 · 当前草稿', time: '刚刚', desc: '当前工作流草稿' }] as any[],
  audits: [{ id: 'wa1', action: 'WORKFLOW_LOAD', actor: '系统', target: mockWorkflow.name, time: new Date().toISOString(), result: 'success' }] as any[],
  runs: [...mockWorkflowRuns] as any[],
};

function workflowAudit(action: string, target: string, result: 'success' | 'failed' = 'success') {
  const event = { id: mockId('wf_audit'), action, actor: '当前用户', target, time: new Date().toISOString(), result };
  mockWorkflowControl.audits.unshift(event);
  return event;
}

export type WorkflowGenerationRecord = {
  id: string;
  prompt: string;
  promptDigest: string;
  status: 'generated' | 'review_required' | 'applied' | 'discarded' | 'expired';
  model: string;
  workspaceId: string;
  tenantId: string;
  ownerId: string;
  policyVersion: string;
  expiresAt: string;
  revisionId?: string;
  createdAt: string;
  workflow: { nodes: Array<{ id: string; kind: string; label: string; position: { x: number; y: number }; description?: string }>; edges: Array<{ id: string; source: string; target: string }> };
  checks: { structure: 'passed' | 'review'; dependencies: 'passed' | 'review'; risk: 'passed' | 'review' };
  dependencies: Array<{ type: 'tool' | 'mcp' | 'agent'; name: string; status: 'available' | 'missing'; reason?: string }>;
  risks: Array<{ level: 'L1' | 'L2' | 'L3'; node: string; text: string; requiresApproval: boolean }>;
  warnings: string[];
  qualityScore: number;
  requiresReview: boolean;
};

const WORKFLOW_GENERATION_PRINCIPAL = { tenantId: 'tenant-prod-ops', workspaceId: 'prod-ops', userId: 'current-user' };
const ALLOWED_GENERATION_MODELS = new Set(['企业默认模型', 'Qwen-Enterprise']);
const workflowGenerationRevisions = new Map<string, { id: string; generationId: string; nodes: any[]; edges: any[]; createdAt: string }>();

function generationDigest(prompt: string) {
  return `sha256:${Array.from(prompt).reduce((value, char) => ((value * 31 + char.charCodeAt(0)) >>> 0), 7).toString(16)}`;
}

function rejectUnsafeGenerationPrompt(prompt: string) {
  if (/\b(api[_-]?key|password|secret|token)\b\s*[:=]/i.test(prompt)) throw new Error('生成请求包含疑似密钥或凭据，请先脱敏后再提交');
}

function buildGeneratedWorkflow(prompt: string) {
  const lower = prompt.toLowerCase();
  const isScheduled = /每天|每周|定时|巡检|cron|schedule/.test(lower);
  const createsTask = /工单|任务|人工处理|值班/.test(lower);
  const hasExternalWrite = /恢复|执行|变更|扩容|写入|kubectl|api/.test(lower);
  const nodes = [
    { id: 'g1', kind: isScheduled ? 'schedule' : 'event', label: isScheduled ? '定时巡检触发' : '告警事件触发', position: { x: 80, y: 120 }, description: isScheduled ? '按计划发起数字员工巡检' : '接收告警或业务事件' },
    { id: 'g2', kind: 'retrieve', label: '检索运行手册', position: { x: 300, y: 120 }, description: '查询知识库与历史处置证据' },
    { id: 'g3', kind: 'decision', label: 'Agent 研判', position: { x: 520, y: 120 }, description: '结合上下文判断处置路径' },
    { id: 'g4', kind: 'policy', label: '风险策略校验', position: { x: 740, y: 120 }, description: '校验权限、风险等级与变更策略' },
    ...(hasExternalWrite ? [{ id: 'g5', kind: 'approval', label: '人工审批', position: { x: 960, y: 120 }, description: '高风险动作需人工复核' }] : []),
    { id: 'g6', kind: createsTask ? 'task' : hasExternalWrite ? 'execute' : 'notify', label: createsTask ? '创建处置工单' : hasExternalWrite ? '执行受控动作' : '通知负责人', position: { x: hasExternalWrite ? 1180 : 960, y: 120 }, description: createsTask ? '派发人工处置任务并回传结果' : hasExternalWrite ? '调用已授权的 Skill 或 MCP 工具' : '发送处置结论通知' },
    ...(hasExternalWrite ? [{ id: 'g7', kind: 'compensate', label: '补偿回滚', position: { x: 1400, y: 120 }, description: '执行失败时回滚可逆变更' }] : []),
    { id: 'g8', kind: 'audit', label: '审计留痕', position: { x: hasExternalWrite ? 1620 : 1180, y: 120 }, description: '写入处置证据、策略与版本信息' },
    { id: 'g9', kind: 'notify', label: '结果通知', position: { x: hasExternalWrite ? 1840 : 1400, y: 120 }, description: '通知负责人和关联任务' },
  ];
  return { nodes, edges: nodes.slice(1).map((node, index) => ({ id: `ge${index + 1}`, source: nodes[index].id, target: node.id })) };
}

export const mockWorkflowGenerations: WorkflowGenerationRecord[] = [
  {
    id: 'gen_demo_001', prompt: '当 Redis 触发 OOM 告警时自动处理并通知负责人', promptDigest: 'sha256:demo', status: 'review_required', model: '企业默认模型', workspaceId: 'prod-ops', tenantId: 'tenant-prod-ops', ownerId: 'current-user', policyVersion: 'workflow-policy-v3', expiresAt: '2026-07-25T09:20:00Z', createdAt: '2026-07-18T09:20:00Z',
    workflow: { nodes: [
      { id: 'g1', kind: 'trigger', label: 'Redis OOM 告警', position: { x: 80, y: 120 }, description: '接收告警事件' },
      { id: 'g2', kind: 'retrieve', label: '检索故障 Runbook', position: { x: 300, y: 120 }, description: '查询处置规范' },
      { id: 'g3', kind: 'decision', label: 'Agent 研判', position: { x: 520, y: 120 }, description: '判断是否需要扩容' },
      { id: 'g4', kind: 'approval', label: '双签审批', position: { x: 740, y: 120 }, description: '生产写操作需审批' },
      { id: 'g5', kind: 'execute', label: '执行 Redis 恢复', position: { x: 960, y: 120 }, description: '调用 kubectl / redis-cli' },
      { id: 'g6', kind: 'audit', label: '写入审计记录', position: { x: 1180, y: 120 }, description: '记录完整证据链' },
      { id: 'g7', kind: 'notify', label: '通知负责人', position: { x: 1400, y: 120 }, description: '发送飞书通知' },
    ], edges: [
      { id: 'ge1', source: 'g1', target: 'g2' }, { id: 'ge2', source: 'g2', target: 'g3' }, { id: 'ge3', source: 'g3', target: 'g4' },
      { id: 'ge4', source: 'g4', target: 'g5' }, { id: 'ge5', source: 'g5', target: 'g6' }, { id: 'ge6', source: 'g6', target: 'g7' },
    ] },
    checks: { structure: 'passed', dependencies: 'review', risk: 'review' },
    dependencies: [
      { type: 'tool', name: 'redis-cli', status: 'available' }, { type: 'mcp', name: 'kubernetes-mcp', status: 'missing', reason: '当前工作区未授权 kubectl 写权限' },
      { type: 'agent', name: '故障自愈', status: 'available' },
    ],
    risks: [{ level: 'L2', node: '执行 Redis 恢复', text: '将对生产 Redis 执行写操作，需双签审批与回滚策略', requiresApproval: true }],
    warnings: ['执行恢复节点需要 kubernetes-mcp 写权限', '请在保存前补充回滚分支'], qualityScore: 86, requiresReview: true,
  },
];
  // ============ P7 知识扩展数据 ============

export const mockKbList = [
  { key: 'runbook', label: 'Runbook 知识库', count: 86, source: 'Runbook' },
  { key: 'cmdb', label: 'CMDB 资产', count: 1280, source: 'CMDB' },
  { key: 'cve', label: 'CVE 漏洞库', count: 620, source: 'CVE' },
  { key: 'siem', label: 'SIEM 检测用例', count: 380, source: 'SIEM' },
];

export const mockDocDetail = {
  id: 'k1',
  title: 'Redis 故障 Runbook v3.2',
  source: 'Runbook',
  author: '李婷',
  updatedAt: '2026-07-10',
  size: '124 KB',
  chunks: 86,
  version: 'v3.2',
  content: '# Redis 故障 Runbook\n\n## §3.1 OOM 处理\n\n当 Redis 触发 maxmemory 限制时，优先检查 maxmemory-policy 与最近写入速率；建议在维护窗口执行 volatile-lru 切换。\n\n### 步骤\n\n1. **检测**：监控指标 used_memory 与 maxmemory 比值\n2. **评估**：判断是否有大 Key 写入（>100MB）\n3. **方案**：临时扩容 OR 切换 LRU 策略\n4. **执行**：CONFIG SET maxmemory-policy volatile-lru\n5. **验证**：观察 5min 内 OOM 频率下降\n\n### 历史事件\n\n- 2026-05-22 INC-019：使用 volatile-lru，耗时 38min\n- 2026-04-08 INC-011：临时扩容到 16GB，耗时 22min',
};

export const mockSearchHistory = [
  { id: 'h1', time: '14:28', query: 'Redis OOM 处理', kb: 'Runbook', results: 8, topScore: 0.92 },
  { id: 'h2', time: '14:18', query: 'CVE-2026-3321 影响哪些资产', kb: 'CVE', results: 12, topScore: 0.88 },
  { id: 'h3', time: '13:55', query: '容量预测算法', kb: 'Runbook', results: 6, topScore: 0.79 },
  { id: 'h4', time: '13:42', query: 'K8s 节点扩容', kb: 'Runbook', results: 9, topScore: 0.85 },
];

export const mockCitationTrace = [
  { docId: 'k1', title: 'Redis 故障 Runbook v3.2', citeCount: 320, lastUsed: '2026-07-13', usedBy: ['故障自愈 v1.4.2', '变更辅助 v1.2.5', '42 次任务'] },
  { docId: 'k2', title: 'CMDB 全量资产清单', citeCount: 1280, lastUsed: '2026-07-13', usedBy: ['故障自愈 v1.4.2', '告警降噪 v1.3.2', '215 次任务'] },
];

export const mockEvalMetrics = {
  recall: 92,
  precision: 88,
  p95Latency: 320,
  hitRate: 32,
};

export const mockKnowledgeDocs: KnowledgeDoc[] = [
  { id: 'k1', title: 'Redis 故障 Runbook v3.2', source: 'Runbook', sizeKb: 128, chunks: 86, citeCount: 320, status: 'ready', updatedAt: '2026-07-10T00:00:00Z' },
  { id: 'k3', title: 'CVE-2026 漏洞库', source: 'CVE', sizeKb: 840, chunks: 620, citeCount: 88, status: 'ready', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'k4', title: 'K8s 节点运维手册', source: 'Runbook', sizeKb: 320, chunks: 210, citeCount: 156, status: 'ready', updatedAt: '2026-07-05T00:00:00Z' },
  { id: 'k5', title: '等保 3 合规白皮书', source: '合规', sizeKb: 1240, chunks: 580, citeCount: 240, status: 'ready', updatedAt: '2026-06-28T00:00:00Z' },
  { id: 'k6', title: 'Prometheus 告警规则', source: 'Runbook', sizeKb: 96, chunks: 72, citeCount: 110, status: 'indexing', updatedAt: '2026-07-13T01:00:00Z' },
  { id: 'k7', title: '网关灰度发布流程', source: 'Runbook', sizeKb: 64, chunks: 48, citeCount: 78, status: 'ready', updatedAt: '2026-07-02T00:00:00Z' },
  { id: 'k8', title: 'ATT&CK 检测用例', source: 'SIEM', sizeKb: 540, chunks: 380, citeCount: 95, status: 'ready', updatedAt: '2026-07-09T00:00:00Z' },
];

export const mockKnowledgeChunks: KnowledgeRetrievalResult[] = [
  { idx: 1, source: 'Redis Runbook v3.2 §3.1', page: 12, score: 0.92, docId: 'k1', text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率；建议在维护窗口执行 volatile-lru 切换。' },
  { idx: 2, source: 'CMDB PRD-CACHE-019', page: null, score: 0.78, docId: 'k2', text: 'prod-redis-01 资产编号 PRD-CACHE-019，归属 ACME 生产集群，cn-east-1 区，双实例主从。' },
  { idx: 3, source: 'INC-019 处理记录', page: 5, score: 0.71, docId: 'k3', text: '历史类似事件在 2026-05-22 处置耗时 38min，使用 CONFIG SET 临时扩容与后续策略调整。' },
  { idx: 4, source: 'Prometheus 告警规则', page: null, score: 0.65, docId: 'k6', text: 'rate(redis_oom_total[5m]) > 3 时触发 P0 告警，持续 10 分钟自动升级。' },
  { idx: 5, source: '网关灰度发布流程', page: 8, score: 0.58, docId: 'k7', text: 'Redis 升级必须在维护窗口执行，建议使用灰度发布与双实例验证。' },
];

export const mockKnowledgeSources: KnowledgeSourceConnection[] = [
  { id: 'source-runbook', name: 'Runbook 文档中心', kind: 'Git / Markdown', schedule: '每 6 小时', lastSync: '12 分钟前', documents: 86, status: 'healthy' },
  { id: 'source-cmdb', name: 'CMDB 资产目录', kind: 'REST API', schedule: '每 30 分钟', lastSync: '4 分钟前', documents: 1280, status: 'healthy' },
  { id: 'source-siem', name: 'SIEM 检测规则', kind: 'Webhook', schedule: '每 1 小时', lastSync: '同步失败 · 36 分钟前', documents: 380, status: 'attention' },
];

export const mockKnowledgeGovernance: KnowledgeGovernancePolicy = {
  sensitiveDataDetection: true,
  versionRetention: true,
  retentionDays: 365,
  highRiskChangeApproval: true,
};

// 知识工程中心的领域状态：知识包是唯一可被运行时消费者绑定的交付物。
export const mockKnowledgePackages: KnowledgePackage[] = [
  {
    id: 'kp-runbook', name: '生产故障处置知识包', description: 'Redis、K8s 与告警处置 Runbook 的受控知识集合。', domain: 'SRE', classification: 'restricted', owner: 'SRE 平台组', status: 'published', documentCount: 42, consumers: 5,
    currentVersion: { id: 'kpv-runbook-32', version: 'v3.2', status: 'published', indexVersion: 'idx-20260718-02', publishedAt: '2026-07-18T09:30:00Z', qualityScore: 94, changeSummary: '补齐 Redis OOM 处置与双签步骤' },
    versions: [
      { id: 'kpv-runbook-32', version: 'v3.2', status: 'published', indexVersion: 'idx-20260718-02', publishedAt: '2026-07-18T09:30:00Z', qualityScore: 94, changeSummary: '补齐 Redis OOM 处置与双签步骤' },
      { id: 'kpv-runbook-31', version: 'v3.1', status: 'deprecated', indexVersion: 'idx-20260702-01', publishedAt: '2026-07-02T09:30:00Z', qualityScore: 91, changeSummary: '上一个稳定版本' },
    ],
  },
  {
    id: 'kp-cmdb', name: '生产资产与依赖知识包', description: '受权限过滤的 CMDB 资产、服务依赖与负责人信息。', domain: 'IT 运营', classification: 'confidential', owner: '基础架构组', status: 'published', documentCount: 1280, consumers: 3,
    currentVersion: { id: 'kpv-cmdb-18', version: 'v1.8', status: 'published', indexVersion: 'idx-20260719-01', publishedAt: '2026-07-19T06:10:00Z', qualityScore: 92, changeSummary: '同步生产服务依赖关系' },
    versions: [{ id: 'kpv-cmdb-18', version: 'v1.8', status: 'published', indexVersion: 'idx-20260719-01', publishedAt: '2026-07-19T06:10:00Z', qualityScore: 92, changeSummary: '同步生产服务依赖关系' }],
  },
  {
    id: 'kp-security', name: '安全漏洞处置知识包', description: 'CVE、加固基线与漏洞修复流程。', domain: '安全', classification: 'restricted', owner: '安全运营组', status: 'review', documentCount: 26, consumers: 0,
    currentVersion: { id: 'kpv-security-14', version: 'v1.4', status: 'review', indexVersion: 'idx-20260719-03', qualityScore: 88, changeSummary: '新增 CVE-2026 风险与修复依据' },
    versions: [{ id: 'kpv-security-14', version: 'v1.4', status: 'review', indexVersion: 'idx-20260719-03', qualityScore: 88, changeSummary: '新增 CVE-2026 风险与修复依据' }],
  },
];

export const mockKnowledgeProcessingJobs: KnowledgeProcessingJob[] = [
  { id: 'kpj-01', packageId: 'kp-runbook', source: 'Runbook 文档中心', strategy: 'structured', status: 'succeeded', documentCount: 42, chunkCount: 1260, indexVersion: 'idx-20260718-02', startedAt: '2026-07-18T09:12:00Z' },
  { id: 'kpj-02', packageId: 'kp-cmdb', source: 'CMDB 资产目录', strategy: 'table', status: 'running', documentCount: 1280, chunkCount: 4820, indexVersion: 'idx-20260719-01', startedAt: '2026-07-19T06:00:00Z' },
  { id: 'kpj-03', packageId: 'kp-security', source: 'SIEM 检测规则', strategy: 'semantic', status: 'failed', documentCount: 26, chunkCount: 630, indexVersion: 'idx-20260719-03', startedAt: '2026-07-19T08:40:00Z', error: '3 个 PDF 未能完成 OCR 解析' },
];

export const mockKnowledgeProfiles: KnowledgeRetrievalProfile[] = [
  { id: 'krp-ops', name: '生产处置混合检索', packageId: 'kp-runbook', retrievalModes: ['keyword', 'vector', 'graph'], topK: 6, rerankEnabled: true, noResultPolicy: 'handoff' },
  { id: 'krp-cmdb', name: '资产精确检索', packageId: 'kp-cmdb', retrievalModes: ['keyword', 'graph'], topK: 5, rerankEnabled: false, noResultPolicy: 'clarify' },
];

export const mockKnowledgeEvaluations: KnowledgeEvaluation[] = [
  { id: 'keval-01', packageId: 'kp-runbook', profileId: 'krp-ops', baselineVersion: 'v3.1', evaluatedVersion: 'v3.2', recallAtK: 0.94, mrr: 0.89, ndcg: 0.91, citationAccuracy: 0.97, p95LatencyMs: 338, status: 'passed', evaluatedAt: '2026-07-18T09:20:00Z' },
  { id: 'keval-02', packageId: 'kp-security', profileId: 'krp-ops', baselineVersion: 'v1.3', evaluatedVersion: 'v1.4', recallAtK: 0.86, mrr: 0.78, ndcg: 0.80, citationAccuracy: 0.91, p95LatencyMs: 462, status: 'needs_review', evaluatedAt: '2026-07-19T08:55:00Z' },
];

export const mockKnowledgeGraphEntities: KnowledgeGraphEntity[] = [
  { id: 'kge-redis', name: 'redis-prod-01', type: 'asset', confidence: 0.99, sourceDocId: 'k1', sourceVersion: 'v3.2' },
  { id: 'kge-api', name: '订单 API', type: 'service', confidence: 0.96, sourceDocId: 'k2', sourceVersion: 'v1.8' },
  { id: 'kge-runbook', name: 'Redis OOM 处置 Runbook', type: 'runbook', confidence: 0.98, sourceDocId: 'k1', sourceVersion: 'v3.2' },
  { id: 'kge-owner', name: 'SRE 值班组', type: 'owner', confidence: 0.99, sourceDocId: 'k1', sourceVersion: 'v3.2' },
  { id: 'kge-cve', name: 'CVE-2026-1042', type: 'vulnerability', confidence: 0.93, sourceDocId: 'k3', sourceVersion: 'v1.4' },
];

export const mockKnowledgeGraphRelations: KnowledgeGraphRelation[] = [
  { id: 'kgr-01', fromId: 'kge-api', toId: 'kge-redis', type: 'depends_on', confidence: 0.96, sourceDocId: 'k2', sourceVersion: 'v1.8' },
  { id: 'kgr-02', fromId: 'kge-redis', toId: 'kge-runbook', type: 'handled_by', confidence: 0.98, sourceDocId: 'k1', sourceVersion: 'v3.2' },
  { id: 'kgr-03', fromId: 'kge-runbook', toId: 'kge-owner', type: 'owned_by', confidence: 0.99, sourceDocId: 'k1', sourceVersion: 'v3.2' },
  { id: 'kgr-04', fromId: 'kge-cve', toId: 'kge-redis', type: 'impacts', confidence: 0.89, sourceDocId: 'k3', sourceVersion: 'v1.4' },
];

export const mockKnowledgeBindings: KnowledgeConsumerBinding[] = [
  { id: 'kcb-01', packageId: 'kp-runbook', packageName: '生产故障处置知识包', packageVersion: 'v3.2', consumerType: 'agent', consumerId: 'a1', consumerName: '故障自愈', environment: 'production', profileId: 'krp-ops', noResultPolicy: 'handoff' },
  { id: 'kcb-02', packageId: 'kp-runbook', packageName: '生产故障处置知识包', packageVersion: 'v3.2', consumerType: 'workflow', consumerId: 'wf1', consumerName: 'Redis 故障处置编排', environment: 'production', profileId: 'krp-ops', noResultPolicy: 'block' },
  { id: 'kcb-03', packageId: 'kp-cmdb', packageName: '生产资产与依赖知识包', packageVersion: 'v1.8', consumerType: 'agent', consumerId: 'a2', consumerName: '变更辅助', environment: 'staging', profileId: 'krp-cmdb', noResultPolicy: 'clarify' },
];

export const mockKnowledgeAudit: KnowledgeAuditEvent[] = [
  { id: 'knowledge_audit_1', time: '14:32:10', actor: '李婷', action: '知识同步完成', target: 'Runbook 文档中心', result: 'success' },
  { id: 'knowledge_audit_2', time: '13:40:02', actor: '数字员工', action: '检索验证', target: 'Redis OOM 处理', result: 'success' },
];

function appendKnowledgeAudit(action: string, target: string, result: KnowledgeAuditEvent['result'] = 'success') {
  const event: KnowledgeAuditEvent = { id: mockId('knowledge_audit'), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), actor: '当前用户', action, target, result };
  mockKnowledgeAudit.unshift(event);
  return event;
}

function knowledgeDocDetail(doc: KnowledgeDoc) {
  return {
    id: doc.id,
    title: doc.title,
    source: doc.source,
    author: '李婷',
    updatedAt: doc.updatedAt.slice(0, 10),
    size: `${doc.sizeKb} KB`,
    chunks: doc.chunks,
    version: 'v3.2',
    status: doc.status,
    citeCount: doc.citeCount,
    tags: doc.source === 'Runbook' ? ['redis', 'oom', '生产环境'] : [doc.source, '企业知识'],
    classification: doc.source === 'CVE' ? '受限' : '内部',
    chunkStrategy: doc.source === 'CMDB' ? '表格切片' : '结构切片',
    quality: { completeness: 96, freshness: 92, citationAccuracy: 97 },
    versions: [{ version: 'v3.2', time: doc.updatedAt.slice(0, 10), note: '当前发布版本' }, { version: 'v3.1', time: '2026-06-18', note: '补充处置步骤与引用证据' }],
    content: doc.id === 'k1' ? mockDocDetail.content : `# ${doc.title}\n\n该知识资产由企业知识运营工作台管理，已纳入版本、权限和引用审计。`,
  };
}

// ============ P8 技能扩展数据 ============

export interface SkillTestCase {
  name: string;
  input: string;
  output: string;
  durationMs: number;
  status: 'success' | 'failed';
}

export const mockSkillExecTrace = {
  s1: {
    trace: [
      { ts: '14:28:01.023', level: 'info', text: 'redis-cli CONFIG SET maxmemory 16GB' },
      { ts: '14:28:01.045', level: 'debug', text: '连接 prod-redis-01:6379' },
      { ts: '14:28:01.123', level: 'info', text: '执行 SET 命令' },
      { ts: '14:28:01.168', level: 'info', text: '响应: +OK (45ms)' },
      { ts: '14:28:01.170', level: 'info', text: '输出已写入审计日志 SignedLog' },
    ],
    testCases: [
      { name: '正常调用', input: 'CONFIG SET maxmemory 16GB', output: '+OK', durationMs: 45, status: 'success' },
      { name: '无效参数', input: 'CONFIG SET invalid', output: '(error) ERR syntax error', durationMs: 12, status: 'failed' },
    ] as SkillTestCase[],
    perf: { calls24h: 2300, errorRate: 0.4, p95Ms: 80 },
  },
};

export const mockSkillVersions = {
  s1: [
    { version: '1.4.2', date: '2026-07-08', type: 'minor', notes: ['+ Redis 7.x 兼容', '+ 新增 CONFIG STATS 命令', '- 修复 cluster bus 报错'] },
    { version: '1.4.1', date: '2026-06-20', type: 'patch', notes: ['+ 超时自动重试 1 次'] },
    { version: '1.4.0', date: '2026-06-01', type: 'major', notes: ['+ 全新沙箱隔离', '+ 支持 TLS 加密'] },
    { version: '1.3.5', date: '2026-05-15', type: 'minor', notes: ['+ 审计日志自动写入'] },
  ],
};

export const mockSkillPerms = [
  { role: 'Admin', canCall: true, canConfig: true },
  { role: 'SRE', canCall: true, canConfig: true },
  { role: 'Sec', canCall: false, canConfig: false },
  { role: 'View', canCall: false, canConfig: false },
];

export const mockSkills: Skill[] = [
  { id: 's1', name: 'redis-cli', kind: 'skill', description: 'Redis 命令执行', version: '1.0', status: 'installed', rating: 4.9, installCount: 1200, riskLevel: 'mid', cacheable: true },
  { id: 's2', name: 'kubectl', kind: 'skill', description: 'K8s 操作', version: '1.0', status: 'installed', rating: 4.8, installCount: 1100, riskLevel: 'high', cacheable: true },
  { id: 's3', name: 'loki-query', kind: 'skill', description: 'Loki 日志查询', version: '1.0', status: 'installed', rating: 4.6, installCount: 880, riskLevel: 'low', cacheable: true },
  { id: 's4', name: 'es-query', kind: 'skill', description: 'OpenSearch 查询', version: '1.0', status: 'installed', rating: 4.6, installCount: 820, riskLevel: 'low', cacheable: true },
  { id: 's5', name: 'prometheus', kind: 'mcp', description: 'Prometheus MCP', version: '1.0', status: 'installed', rating: 4.7, installCount: 940, riskLevel: 'low', cacheable: false },
  { id: 's6', name: 'kafka-mcp', kind: 'mcp', description: 'Kafka 消息 MCP', version: '1.0', status: 'installed', rating: 4.5, installCount: 480, riskLevel: 'low', cacheable: false },
  { id: 's7', name: 'cmdb-tool', kind: 'tool', description: 'CMDB 资产查询', version: '1.0', status: 'installed', rating: 4.6, installCount: 760, riskLevel: 'mid', cacheable: true },
  { id: 's8', name: 'jira-tool', kind: 'tool', description: 'Jira 工单', version: '1.0', status: 'installed', rating: 4.5, installCount: 690, riskLevel: 'mid', cacheable: true },
  { id: 's9', name: 'itsm-change-tool', kind: 'tool', description: '创建、查询与更新 ITSM 变更单；生产变更需要审批门禁', version: '2.3.1', status: 'installed', rating: 4.7, installCount: 920, riskLevel: 'high', cacheable: false },
  { id: 's10', name: 'notification-tool', kind: 'tool', description: '向飞书、企业微信、邮件等受控渠道投递处置通知', version: '1.6.0', status: 'installed', rating: 4.8, installCount: 1680, riskLevel: 'low', cacheable: true },
  { id: 's11', name: 'release-control-tool', kind: 'tool', description: '执行灰度发布、回滚与发布窗口校验，所有写操作要求双人审批', version: '1.4.0', status: 'installed', rating: 4.6, installCount: 540, riskLevel: 'high', cacheable: false },
  { id: 's12', name: 'customer-ticket-tool', kind: 'tool', description: '同步客户工单、服务等级与处理进展，适用于服务运营数字员工', version: '1.1.2', status: 'installed', rating: 4.4, installCount: 430, riskLevel: 'mid', cacheable: true },
];

// ============ P9 模型扩展数据 ============

export const mockProviderHealth = {
  p1: { status: 'healthy', latency: 320, uptime: 99.98, lastCheck: '2 min 前' },
  p2: { status: 'healthy', latency: 280, uptime: 99.95, lastCheck: '2 min 前' },
  p3: { status: 'healthy', latency: 410, uptime: 99.92, lastCheck: '1 min 前' },
  p4: { status: 'standby', latency: 0, uptime: 100, lastCheck: '5 min 前' },
  p5: { status: 'healthy', latency: 120, uptime: 99.99, lastCheck: '30s 前' },
  p6: { status: 'healthy', latency: 180, uptime: 99.96, lastCheck: '1 min 前' },
};

export const mockPromptTemplates = [
  { id: 't1', name: '代码审查', category: 'engineering', preview: '你是一位资深 SRE，请审查以下代码...', uses: 1280, rating: 4.8 },
  { id: 't2', name: '故障定位', category: 'ops', preview: '检测到 Redis OOM，请按 Runbook 执行...', uses: 856, rating: 4.7 },
  { id: 't3', name: '威胁分析', category: 'security', preview: '基于 ATT&CK 框架分析此 SIEM 告警...', uses: 412, rating: 4.5 },
];

export const mockRouteFlow = [
  { level: 'P0', path: ['用户请求', 'P9 路由', 'Sonnet-4', 'GPT-4o (降级)', 'Opus-4 (兜底)'] },
  { level: 'P1', path: ['用户请求', 'P9 路由', 'Sonnet-4', 'Qwen2.5-72B (降级)'] },
  { level: 'P2', path: ['用户请求', 'P9 路由', 'Qwen2.5-72B'] },
  { level: 'P3', path: ['异步队列', 'Qwen2.5-72B (异步)'] },
  { level: 'Audit', path: ['审计通道', '独立集群'] },
];

export const mockExportRoutes = {
  cn: 94,   // 境内占比
  global: 6, // 出境占比
};

export const mockModelCompare = [
  { id: 'p1', name: 'Claude Sonnet-4', price: '$3 / $15', latency: 320, quality: 96, context: '200K' },
  { id: 'p5', name: 'Qwen2.5-72B', price: '$0.4 / $0.4', latency: 120, quality: 88, context: '32K' },
  { id: 'p6', name: 'DeepSeek-V3', price: '$0.3 / $0.5', latency: 180, quality: 90, context: '64K' },
];

export const mockAuditLog = [
  { id: 'l1', time: '14:32', user: '王昊', action: '查询', key: 'sk-prod-...', model: 'Sonnet-4', tokens: 1240 },
  { id: 'l2', time: '14:18', user: '李婷', action: '查询', key: 'sk-prod-...', model: 'Qwen2.5-72B', tokens: 856 },
  { id: 'l3', time: '13:55', user: '孙博', action: '轮转', key: 'sk-prod-...', model: 'GPT-4o', tokens: 0 },
  { id: 'l4', time: '13:42', user: '张睿', action: '查询', key: 'sk-prod-...', model: 'Sonnet-4', tokens: 2100 },
];

export const mockProviders: Provider[] = [
  { id: 'p1', name: 'Anthropic', tier: 'official', models: ['Claude Sonnet-4', 'Opus-4', 'Haiku-4'], region: 'global', status: 'active', monthlyTokens: 8_400_000, monthlyCostUsd: 980 },
  { id: 'p2', name: 'Azure OpenAI', tier: 'official', models: ['GPT-4o'], region: 'global', status: 'standby', monthlyTokens: 0, monthlyCostUsd: 0 },
  { id: 'p3', name: 'Google Vertex', tier: 'official', models: ['Gemini 2.0'], region: 'global', status: 'standby', monthlyTokens: 200_000, monthlyCostUsd: 24 },
  { id: 'p4', name: 'AWS Bedrock', tier: 'official', models: ['Claude 3.5', 'Titan'], region: 'global', status: 'standby', monthlyTokens: 0, monthlyCostUsd: 0 },
  { id: 'p5', name: 'Qwen2.5-72B', tier: 'self_hosted', models: ['Qwen2.5-72B'], region: 'cn', status: 'active', monthlyTokens: 3_200_000, monthlyCostUsd: 180 },
  { id: 'p6', name: 'DeepSeek-V3', tier: 'self_hosted', models: ['DeepSeek-V3'], region: 'cn', status: 'active', monthlyTokens: 600_000, monthlyCostUsd: 60 },
  { id: 'p7', name: 'Mistral', tier: 'connectable', models: ['—'], region: 'global', status: 'offline', monthlyTokens: 0, monthlyCostUsd: 0 },
  { id: 'p8', name: 'Ollama', tier: 'connectable', models: ['—'], region: 'global', status: 'offline', monthlyTokens: 0, monthlyCostUsd: 0 },
];

export const mockRoutes: ModelRoute[] = [
  { level: 'P0', primary: 'Sonnet-4', fallback1: 'GPT-4o', fallback2: 'Opus-4', crossBorder: true },
  { level: 'P1', primary: 'Sonnet-4', fallback1: 'Qwen2.5-72B', crossBorder: true },
  { level: 'P2', primary: 'Qwen2.5-72B', fallback1: '—', crossBorder: false },
  { level: 'P3', primary: 'Qwen2.5-72B', fallback1: '—', crossBorder: false },
  { level: 'audit', primary: '审计专用通道', fallback1: '—', crossBorder: false },
];

// ============ P10 渠道扩展数据 ============

export const mockChannelHealth = {
  c1: { status: 'healthy', latency: 120, success: 99.8, errorCount24h: 2 },
  c2: { status: 'healthy', latency: 95, success: 99.2, errorCount24h: 8 },
  c3: { status: 'healthy', latency: 110, success: 98.5, errorCount24h: 12 },
  c4: { status: 'disabled', latency: 0, success: 0, errorCount24h: 0 },
  c5: { status: 'healthy', latency: 280, success: 97.8, errorCount24h: 24 },
  c6: { status: 'healthy', latency: 45, success: 99.5, errorCount24h: 3 },
};

export const mockMessageStream = [
  { id: 'm1', time: '14:32:01', channel: '飞书', target: '王昊', content: '[P0] Redis OOM 告警已恢复', status: 'delivered', tone: 'success' as const },
  { id: 'm2', time: '14:30:18', channel: '企微', target: 'SRE 组', content: 'K8s 节点扩容审批通过', status: 'delivered', tone: 'success' as const },
  { id: 'm3', time: '14:28:45', channel: '飞书', target: '张睿', content: 'CVE-2026-3321 修复建议', status: 'delivered', tone: 'info' as const },
  { id: 'm4', time: '14:25:12', channel: '邮件', target: 'admin@acme.com', content: '本月合规审计报告 (94/94)', status: 'delivered', tone: 'success' as const },
  { id: 'm5', time: '14:18:32', channel: 'Webhook', target: 'SIEM', content: '告警降噪合并 23 条', status: 'failed', tone: 'warning' as const },
];

export const mockChannelConfig: Record<string, any> = {
  c1: {
    rateLimit: { qps: 50, daily: 10000 },
    retry: { max: 3, backoff: 'exponential' },
    silent: { start: '22:00', end: '08:00' },
    mergeWindow: '5 min',
  },
};

export const mockChannels: Channel[] = [
  { id: 'c1', name: '飞书', kind: 'feishu', enabled: true, monthlySent: 480, successRate: 0.998 },
  { id: 'c2', name: '企业微信', kind: 'wecom', enabled: true, monthlySent: 280, successRate: 0.992 },
  { id: 'c3', name: '钉钉', kind: 'dingtalk', enabled: true, monthlySent: 120, successRate: 0.985 },
  { id: 'c4', name: 'Slack', kind: 'slack', enabled: false, monthlySent: 0, successRate: 0 },
  { id: 'c5', name: '邮件', kind: 'email', enabled: true, monthlySent: 240, successRate: 0.978 },
  { id: 'c6', name: 'Webhook', kind: 'webhook', enabled: true, monthlySent: 120, successRate: 0.995 },
];

// 模型、渠道与技能的运行时 Mock 域。所有可写操作汇聚在这里，并写入审计，
// 让运营台的刷新查询、详情抽屉和操作反馈指向同一份数据。
const mockControlPlaneAudit: Array<{ id: string; time: string; actor: string; domain: 'model' | 'channel' | 'skill'; action: string; target: string; result: 'success' | 'failed' }> = [];
const mockSkillRuntime: Record<string, SkillRuntimeConfig> = {};
const mockSkillIntegrations: SkillIntegration[] = [
  { id: 'integration_mcp_gitlab', name: '企业 GitLab MCP', type: 'mcp', environment: 'production', status: 'enabled', owner: '李婷', endpoint: 'https://gitlab.internal.example.com/mcp', credentialRef: 'vault://integrations/gitlab/oauth', lastVerifiedAt: '4 分钟前', health: 'healthy', discoveredCapabilities: 18, writeApprovalRequired: true, allowedEgress: ['gitlab.internal.example.com'] },
  { id: 'integration_tool_itsm', name: 'ITSM 变更 API', type: 'tool', environment: 'production', status: 'pending_approval', owner: '周楠', endpoint: 'https://itsm.internal.example.com/openapi', credentialRef: 'vault://integrations/itsm/service-account', lastVerifiedAt: '12 分钟前', health: 'healthy', discoveredCapabilities: 9, writeApprovalRequired: true, allowedEgress: ['itsm.internal.example.com'] },
  { id: 'integration_mcp_servicenow', name: 'ServiceNow MCP', type: 'mcp', environment: 'test', status: 'validating', owner: '王昊', endpoint: 'https://sandbox.service-now.example.com/mcp', credentialRef: 'vault://integrations/servicenow/oauth', lastVerifiedAt: '刚刚', health: 'unknown', discoveredCapabilities: 0, writeApprovalRequired: true, allowedEgress: ['sandbox.service-now.example.com'] },
  { id: 'integration_skill_diagnosis', name: '内部诊断 Skill 包', type: 'skill', environment: 'test', status: 'failed', owner: '张睿', endpoint: 'registry://internal/diagnosis-skill:1.2.0', credentialRef: 'vault://registries/internal-reader', lastVerifiedAt: '26 分钟前', health: 'attention', discoveredCapabilities: 0, writeApprovalRequired: false, allowedEgress: ['registry.internal.example.com'], lastError: '制品签名校验失败：签发证书已过期' },
];
const mockSkillRuntimeHealth: SkillRuntimeHealth[] = [
  { id: 'health_s1', skillId: 's1', name: 'redis-cli', kind: 'skill', environment: 'production', status: 'healthy', calls24h: 2300, successRate: 99.6, p95Ms: 80, errorRate: 0.4, riskLevel: 'mid', owner: '李婷', references: 3, updatedAt: '刚刚' },
  { id: 'health_s2', skillId: 's2', name: 'kubectl', kind: 'skill', environment: 'production', status: 'attention', calls24h: 1820, successRate: 98.8, p95Ms: 220, errorRate: 1.2, riskLevel: 'high', owner: '王昊', references: 4, updatedAt: '2 分钟前' },
  { id: 'health_s5', skillId: 's5', name: 'prometheus', kind: 'mcp', environment: 'production', status: 'healthy', calls24h: 5600, successRate: 99.95, p95Ms: 30, errorRate: 0.05, riskLevel: 'low', owner: '张睿', references: 6, updatedAt: '刚刚' },
  { id: 'health_s7', skillId: 's7', name: 'cmdb-tool', kind: 'tool', environment: 'production', status: 'incident', calls24h: 3400, successRate: 95.8, p95Ms: 640, errorRate: 4.2, riskLevel: 'mid', owner: '陈默', references: 2, updatedAt: '6 分钟前' },
  { id: 'health_s9', skillId: 's9', name: 'itsm-change-tool', kind: 'tool', environment: 'production', status: 'attention', calls24h: 680, successRate: 98.2, p95Ms: 380, errorRate: 1.8, riskLevel: 'high', owner: '周楠', references: 3, updatedAt: '12 分钟前' },
  { id: 'health_s10', skillId: 's10', name: 'notification-tool', kind: 'tool', environment: 'production', status: 'healthy', calls24h: 4060, successRate: 99.9, p95Ms: 55, errorRate: 0.1, riskLevel: 'low', owner: '林晓', references: 8, updatedAt: '刚刚' },
  { id: 'health_s11', skillId: 's11', name: 'release-control-tool', kind: 'tool', environment: 'production', status: 'paused', calls24h: 120, successRate: 100, p95Ms: 180, errorRate: 0, riskLevel: 'high', owner: '王昊', references: 2, updatedAt: '1 小时前' },
];
const mockSkillGovernanceIncidents: SkillGovernanceIncident[] = [
  { id: 'incident_cmdb_latency', skillId: 's7', skillName: 'cmdb-tool', severity: 'P1', type: 'latency', title: '错误率超过 4% 且 P95 超阈值', detail: 'CMDB 查询接口响应变慢，影响 2 个工作流和 1 个智能体。', status: 'open', createdAt: '12:36', requestId: 'req_cmdb_20260719_01' },
  { id: 'incident_release_policy', skillId: 's11', skillName: 'release-control-tool', severity: 'P0', type: 'policy_blocked', title: '生产发布动作被双人审批策略阻断', detail: '审批人未齐备，已自动暂停新的发布执行请求。', status: 'open', createdAt: '11:58', requestId: 'req_release_20260719_12' },
  { id: 'incident_kube_credential', skillId: 's2', skillName: 'kubectl', severity: 'P2', type: 'credential', title: '服务凭据将在 7 天内到期', detail: '请在密钥中心完成轮换并执行重新验证。', status: 'acknowledged', createdAt: '09:20', requestId: 'req_kube_20260719_03' },
];
const mockSkillGovernanceEvents: SkillGovernanceEvent[] = [
  { id: 'gov_event_1', time: '12:41', skillName: 'release-control-tool', type: 'policy', action: '双人审批策略阻断', actor: '策略引擎', result: 'blocked', requestId: 'req_release_20260719_12' },
  { id: 'gov_event_2', time: '12:36', skillName: 'cmdb-tool', type: 'call', action: '错误率阈值告警', actor: '运行监控', result: 'failed', requestId: 'req_cmdb_20260719_01' },
  { id: 'gov_event_3', time: '12:20', skillName: 'prometheus', type: 'call', action: '健康验证完成', actor: '当前用户', result: 'success', requestId: 'req_prom_20260719_04' },
  { id: 'gov_event_4', time: '11:58', skillName: 'release-control-tool', type: 'lifecycle', action: '自动暂停高风险发布能力', actor: '策略引擎', result: 'success' },
];
const mockSkillGovernance: Record<string, SkillGovernancePolicy> = {};
const skillAssetDefaults: Record<string, Pick<Skill, 'lifecycleStatus' | 'source' | 'owner' | 'team' | 'lastVerifiedAt' | 'hasUpdate' | 'upgradeVersion' | 'tags'>> = {
  s1: { lifecycleStatus: 'enabled', source: 'market', owner: '李婷', team: 'SRE 平台组', lastVerifiedAt: '12 分钟前', hasUpdate: true, upgradeVersion: '1.5.0', tags: ['生产', '数据变更'] },
  s2: { lifecycleStatus: 'enabled', source: 'import', owner: '王昊', team: '云原生组', lastVerifiedAt: '昨天 18:20', tags: ['生产', '高风险'] },
  s3: { lifecycleStatus: 'enabled', source: 'market', owner: '张睿', team: '可观测性组', lastVerifiedAt: '8 分钟前', tags: ['只读', '日志'] },
  s5: { lifecycleStatus: 'enabled', source: 'mcp', owner: '李婷', team: 'SRE 平台组', lastVerifiedAt: '6 分钟前', tags: ['监控', '只读'] },
  s7: { lifecycleStatus: 'pending_approval', source: 'tool', owner: '陈默', team: '资产运营组', lastVerifiedAt: '2 小时前', tags: ['CMDB', '待审批'] },
  s9: { lifecycleStatus: 'enabled', source: 'tool', owner: '周楠', team: '变更运营组', lastVerifiedAt: '5 分钟前', tags: ['ITSM', '生产变更', '审批'] },
  s10: { lifecycleStatus: 'enabled', source: 'tool', owner: '林晓', team: '服务体验组', lastVerifiedAt: '3 分钟前', tags: ['通知', '只写消息'] },
  s11: { lifecycleStatus: 'pending_approval', source: 'tool', owner: '王昊', team: '交付工程组', lastVerifiedAt: '22 分钟前', tags: ['发布', '回滚', '双人审批'] },
  s12: { lifecycleStatus: 'enabled', source: 'tool', owner: '郑颖', team: '客户运营组', lastVerifiedAt: '1 小时前', tags: ['客户工单', 'SLA'] },
};

function skillAsset(skill: Skill): Skill {
  const defaults = skillAssetDefaults[skill.id] ?? {};
  return { lifecycleStatus: 'enabled', source: skill.kind === 'mcp' ? 'mcp' : skill.kind === 'tool' ? 'tool' : 'import', owner: '未分配', team: '平台工程组', lastVerifiedAt: '尚未验证', hasUpdate: false, tags: [], ...defaults, ...skill };
}

function skillGovernance(id: string): SkillGovernancePolicy {
  return mockSkillGovernance[id] ?? (mockSkillGovernance[id] = { skillId: id, secretRef: 'vault://digital-employee/skills/default', allowedEgress: ['api.internal.example.com'], writeApprovalRequired: true, rateLimitPerMinute: 60, circuitBreakerEnabled: true, dataMaskingEnabled: true });
}
const mockSkillPermissions: Record<string, SkillPermission[]> = Object.fromEntries(mockSkills.map((skill) => [skill.id, mockSkillPerms.map((item) => ({ ...item, skillId: skill.id }))]));
const mockSkillImpacts: Record<string, SkillImpactReport> = {
  s1: { skillId: 's1', agents: ['故障自愈'], workflows: ['Redis OOM 自动处置'], activeRuns: 1, uninstallAllowed: false, reason: '存在 1 个运行中的工作流和 1 个已发布智能体引用' },
  s2: { skillId: 's2', agents: ['故障自愈', '变更辅助'], workflows: ['K8s 节点自愈', '灰度发布'], activeRuns: 0, uninstallAllowed: false, reason: '存在 2 个已发布智能体引用' },
};
const mockSkillCatalog: Array<Skill & { publisher: string; signed: boolean; dependencies: string[]; license: string; lastScannedAt: string; vulnerabilityCount: number; supportedEnvironments: string[] }> = [
  { id: 'st1', name: 'mysql-cli', kind: 'skill', description: 'MySQL 命令执行', version: '2.0.0', status: 'available', rating: 4.7, installCount: 3200, riskLevel: 'mid', cacheable: true, publisher: '企业能力市场', signed: true, dependencies: [], license: 'Apache-2.0', lastScannedAt: '12 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['测试', '生产'] },
  { id: 'st2', name: 'pg-cli', kind: 'skill', description: 'PostgreSQL 客户端', version: '1.8.0', status: 'available', rating: 4.6, installCount: 2800, riskLevel: 'mid', cacheable: true, publisher: '企业能力市场', signed: true, dependencies: [], license: 'Apache-2.0', lastScannedAt: '18 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['测试', '生产'] },
  { id: 'st3', name: 'gitlab-mcp', kind: 'mcp', description: 'GitLab MR/Issue MCP', version: '0.9.0', status: 'available', rating: 4.4, installCount: 1200, riskLevel: 'mid', cacheable: false, publisher: '企业能力市场', signed: true, dependencies: ['gitlab-connector'], license: 'MIT', lastScannedAt: '36 分钟前', vulnerabilityCount: 1, supportedEnvironments: ['测试'] },
  { id: 'st4', name: 'jenkins-mcp', kind: 'mcp', description: 'Jenkins 构建触发', version: '1.0.0', status: 'available', rating: 4.3, installCount: 880, riskLevel: 'high', cacheable: false, publisher: '企业能力市场', signed: true, dependencies: ['jenkins-mcp'], license: '商业授权', lastScannedAt: '刚刚', vulnerabilityCount: 0, supportedEnvironments: ['隔离环境'] },
  { id: 'st5', name: 'runbook-executor', kind: 'skill', description: '按受控运行手册执行诊断与处置步骤', version: '1.3.0', status: 'available', rating: 4.8, installCount: 2180, riskLevel: 'mid', cacheable: false, publisher: 'SRE 平台组', signed: true, dependencies: ['knowledge-retrieval'], license: '内部许可', lastScannedAt: '9 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['测试', '生产'] },
  { id: 'st6', name: 'security-evidence-skill', kind: 'skill', description: '归集告警、日志与资产证据并输出安全研判材料', version: '1.1.0', status: 'available', rating: 4.6, installCount: 960, riskLevel: 'low', cacheable: true, publisher: '安全运营组', signed: true, dependencies: [], license: '内部许可', lastScannedAt: '16 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['测试', '生产'] },
  { id: 'st7', name: 'pagerduty-mcp', kind: 'mcp', description: '查询事件、升级策略与值班排班的 PagerDuty 连接器', version: '1.2.0', status: 'available', rating: 4.5, installCount: 760, riskLevel: 'mid', cacheable: false, publisher: '企业能力商店', signed: true, dependencies: ['pagerduty-oauth'], license: 'MIT', lastScannedAt: '28 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['测试', '生产'] },
  { id: 'st8', name: 'service-now-mcp', kind: 'mcp', description: 'ServiceNow 事件、请求与变更记录连接器', version: '1.0.2', status: 'available', rating: 4.4, installCount: 620, riskLevel: 'high', cacheable: false, publisher: '企业能力商店', signed: true, dependencies: ['servicenow-oauth'], license: '商业授权', lastScannedAt: '41 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['隔离环境'] },
  { id: 'st9', name: 'approval-center-tool', kind: 'tool', description: '发起、查询和回收企业审批；支持双人复核策略', version: '2.0.0', status: 'available', rating: 4.7, installCount: 1450, riskLevel: 'high', cacheable: false, publisher: '流程平台组', signed: true, dependencies: ['approval-api-v2'], license: '内部许可', lastScannedAt: '6 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['测试', '生产'] },
  { id: 'st10', name: 'message-delivery-tool', kind: 'tool', description: '向飞书、企微和邮件渠道投递可审计的业务通知', version: '1.8.1', status: 'available', rating: 4.8, installCount: 2660, riskLevel: 'low', cacheable: true, publisher: '消息平台组', signed: true, dependencies: [], license: '内部许可', lastScannedAt: '3 分钟前', vulnerabilityCount: 0, supportedEnvironments: ['测试', '生产'] },
];
const mockAgentSkillBindings: Record<string, Array<{ skillId: string; skillName: string; status: 'active' | 'pending_approval'; installedAt: string }>> = {
  a1: [{ skillId: 's1', skillName: 'redis-cli', status: 'active', installedAt: '2026-07-19 09:40' }],
  a3: [{ skillId: 's2', skillName: 'kubectl', status: 'active', installedAt: '2026-07-19 10:10' }],
};
const mockCapabilityBindings: CapabilityBinding[] = [
  { id: 'cap_a1_s1', targetType: 'agent', targetId: 'a1', capabilityKind: 'skill', capabilityId: 's1', pinnedVersion: '1.0', status: 'active', createdBy: '系统', createdAt: '2026-07-19T09:40:00Z', auditId: 'audit_cap_a1_s1' },
  { id: 'cap_wf1_s1', targetType: 'workflow', targetId: 'wf1', capabilityKind: 'skill', capabilityId: 's1', pinnedVersion: '1.0', status: 'active', createdBy: '系统', createdAt: '2026-07-19T09:45:00Z', auditId: 'audit_cap_wf1_s1' },
];
const mockWorkflowSkills: WorkflowSkill[] = [];

function skillAuditEvents(): SkillAuditEvent[] {
  return mockControlPlaneAudit.filter((event) => event.domain === 'skill').map((event) => ({ ...event, correlationId: `skill:${event.target}` }));
}
const mockChannelTemplates = [
  { id: 'card1', name: '告警卡片', tone: 'error', desc: 'P0/P1 紧急事件 · 含一键跳转', preview: '🔴 [P0] Redis OOM\n集群: prod-redis-01\n[查看详情 →]' },
  { id: 'card2', name: '审批卡片', tone: 'warn', desc: '双签审批 · 同意/拒绝按钮', preview: '✍️ 变更审批\n[批准] [拒绝]' },
];
const mockChannelBlacklist = [
  { id: 'b1', type: '用户', value: 'test-spammer@external.com', reason: '高频无效告警', addedBy: '系统', expires: '2026-08-01' },
];
const mockChannelLanguages = [
  { key: 'zh-CN', label: '简体中文', sample: '您的服务出现异常，请立即处理。' },
  { key: 'en-US', label: 'English', sample: 'Your service has encountered an anomaly, please handle immediately.' },
];
const mockChannelRoutes = [
  { event: 'P0 紧急告警', main: '飞书', f1: '企微', f2: '电话+SMS', fb: '邮件', tone: 'error' },
  { event: 'P1 重要升级', main: '飞书+企微', f1: '电话', f2: '邮件', fb: '—', tone: 'warn' },
  { event: 'P2 标准通知', main: '企微', f1: '飞书', f2: '邮件', fb: '—', tone: 'info' },
];

// 渠道控制面：部署、版本化投递策略、失败队列和审计均由同一领域状态持有。
const channelDeployments: ChannelDeployment[] = [
  { id: 'delivery-feishu', workspaceId: 'w1', name: '飞书生产投递', kind: 'feishu', environment: 'production', status: 'active', credentialRef: 'vault://channel-deployments/delivery-feishu/credential', credentialMasked: 'app-…prod', owner: '消息平台组', lastVerifiedAt: '2026-07-19T12:00:00.000Z' },
  { id: 'delivery-email', workspaceId: 'w1', name: '邮件生产投递', kind: 'email', environment: 'production', status: 'active', credentialRef: 'vault://channel-deployments/delivery-email/credential', credentialMasked: 'smtp-…prod', owner: '消息平台组', lastVerifiedAt: '2026-07-19T12:00:00.000Z' },
];
const deliveryPolicies: DeliveryPolicyDraft[] = [
  { id: 'delivery-policy-p0', workspaceId: 'w1', eventType: 'P0 紧急告警', primaryDeploymentId: 'delivery-feishu', fallbackDeploymentIds: ['delivery-email'], audience: 'SRE 值班组', dataClassification: 'internal', status: 'draft', validationIssues: [] },
];
const deliveryVersions: DeliveryPolicyVersion[] = [];
const deliveryAttempts: DeliveryAttempt[] = [];
const channelAuditEvents: ChannelAuditEvent[] = [];

function channelContext(opts: { headers?: Record<string, string> }) {
  const permissions = opts.headers?.['x-mock-permissions']?.split(',').map((item) => item.trim()) ?? [];
  const token = opts.headers?.Authorization?.replace(/^Bearer\s+/i, '');
  const resolved = permissions.length ? permissions : token === 'mock-model-admin-token' ? ['channel.read', 'channel.write'] : token === 'mock-jwt-token' ? ['channel.read'] : [];
  return { workspaceId: opts.headers?.['x-workspace-id'] ?? 'w1', permissions: resolved, actor: token === 'mock-model-admin-token' ? '模型管理员' : '当前用户' };
}
function requireChannel(opts: { headers?: Record<string, string> }, permission: 'channel.read' | 'channel.write', workspaceId?: string) {
  const context = channelContext(opts);
  if (!context.permissions.includes(permission)) throw new Error(`E_CHANNEL_${permission === 'channel.write' ? 'WRITE' : 'READ'}_FORBIDDEN: 缺少 ${permission} 权限`);
  if (workspaceId && context.workspaceId !== workspaceId) throw new Error('E_CHANNEL_WORKSPACE_SCOPE: 无权操作其他工作区渠道资源');
  return context;
}
function appendChannelAudit(opts: { headers?: Record<string, string> }, action: string, target: string, result: 'success' | 'failed', details: { reason?: string; policyVersion?: string; correlationId?: string } = {}) {
  const context = channelContext(opts);
  const event: ChannelAuditEvent = { id: mockId('channel_audit'), workspaceId: context.workspaceId, time: new Date().toISOString(), actor: context.actor, action, target, result, reason: details.reason, policyVersion: details.policyVersion, correlationId: details.correlationId ?? mockId('channel_corr') };
  channelAuditEvents.unshift(event);
  return event;
}
function validateDeliveryPolicy(policy: DeliveryPolicyDraft) {
  const ids = [policy.primaryDeploymentId, ...policy.fallbackDeploymentIds];
  const deployments = ids.map((id) => channelDeployments.find((item) => item.id === id));
  const issues: string[] = [];
  if (!deployments[0] || deployments[0].status !== 'active') issues.push('E_DELIVERY_PRIMARY_UNAVAILABLE: 主渠道不可用');
  if (new Set(ids).size !== ids.length) issues.push('E_DELIVERY_FALLBACK_INVALID: 降级链不能重复');
  if (deployments.some((item) => !item || item.workspaceId !== policy.workspaceId || item.status !== 'active')) issues.push('E_DELIVERY_FALLBACK_INVALID: 降级渠道不可用或不属于当前工作区');
  if (policy.dataClassification === 'restricted' && deployments.some((item) => item?.kind === 'webhook' || item?.kind === 'sms')) issues.push('E_DELIVERY_CLASSIFICATION_BLOCKED: 受限数据不能投递至外部渠道');
  return issues;
}
function maskTarget(value: string) { return value.length < 5 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`; }

function appendControlPlaneAudit(domain: 'model' | 'channel' | 'skill', action: string, target: string, result: 'success' | 'failed' = 'success') {
  const event = { id: mockId('control_audit'), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), actor: '当前用户', domain, action, target, result };
  mockControlPlaneAudit.unshift(event);
  return event;
}

// ============ 模型控制面 Mock 域 ============
// 注意：凭据仅在接入请求中一次性出现；领域状态绝不保存明文凭据。
const modelProfiles: ModelProfile[] = [
  { id: 'model-sonnet', providerId: 'p1', name: 'Claude Sonnet-4', cloudRegion: 'us-west-2', dataResidency: 'global', capabilities: ['chat', 'reasoning'], status: 'available', contextWindow: 200_000 },
  { id: 'model-gpt4o', providerId: 'p2', name: 'GPT-4o', cloudRegion: 'eastasia', dataResidency: 'global', capabilities: ['chat', 'vision'], status: 'available', contextWindow: 128_000 },
  { id: 'model-qwen', providerId: 'p5', name: 'Qwen2.5-72B', cloudRegion: 'cn-east-1', dataResidency: 'cn', capabilities: ['chat', 'reasoning'], status: 'available', contextWindow: 32_000 },
  { id: 'model-w2-isolated', providerId: 'p9', name: '隔离工作区模型', cloudRegion: 'cn-east-1', dataResidency: 'cn', capabilities: ['chat'], status: 'available', contextWindow: 32_000 },
];

const modelProviders: ModelProvider[] = [
  { id: 'p1', workspaceId: 'w1', name: 'Anthropic', tier: 'official', cloudRegion: 'us-west-2', dataResidency: 'global', status: 'active', credentialRef: 'vault://model-providers/p1/credential', credentialMasked: 'sk-…prod', lastVerifiedAt: '2026-07-19T14:32:00.000Z', models: modelProfiles.filter((model) => model.providerId === 'p1') },
  { id: 'p2', workspaceId: 'w1', name: 'Azure OpenAI', tier: 'official', cloudRegion: 'eastasia', dataResidency: 'global', status: 'standby', credentialRef: 'vault://model-providers/p2/credential', credentialMasked: 'key-…prod', lastVerifiedAt: '2026-07-19T14:28:00.000Z', models: modelProfiles.filter((model) => model.providerId === 'p2') },
  { id: 'p5', workspaceId: 'w1', name: 'Qwen2.5-72B', tier: 'self_hosted', cloudRegion: 'cn-east-1', dataResidency: 'cn', status: 'active', credentialRef: 'vault://model-providers/p5/credential', credentialMasked: 'vault-managed', lastVerifiedAt: '2026-07-19T14:31:00.000Z', models: modelProfiles.filter((model) => model.providerId === 'p5') },
  { id: 'p9', workspaceId: 'w2', name: '隔离工作区 Provider', tier: 'self_hosted', cloudRegion: 'cn-east-1', dataResidency: 'cn', status: 'active', credentialRef: 'vault://model-providers/p9/credential', credentialMasked: 'vault-managed', lastVerifiedAt: '2026-07-19T14:31:00.000Z', models: modelProfiles.filter((model) => model.providerId === 'p9') },
];

const routingPolicies: RoutingPolicyDraft[] = [
  { id: 'route-p0', workspaceId: 'w1', level: 'P0', primaryModelId: 'model-sonnet', fallbackModelIds: ['model-gpt4o'], dataScope: 'internal', egressAllowed: true, budgetLimitUsd: 1_500, status: 'published', validationIssues: [] },
  { id: 'route-p1', workspaceId: 'w1', level: 'P1', primaryModelId: 'model-qwen', fallbackModelIds: ['model-sonnet'], dataScope: 'internal', egressAllowed: true, budgetLimitUsd: 800, status: 'draft', validationIssues: [] },
  { id: 'route-p2', workspaceId: 'w1', level: 'P2', primaryModelId: 'model-qwen', fallbackModelIds: [], dataScope: 'restricted', egressAllowed: false, budgetLimitUsd: 400, status: 'published', validationIssues: [] },
];

const routingVersions: RoutingPolicyVersion[] = [
  { id: 'route-p0-v1', policyId: 'route-p0', version: 1, snapshot: { ...routingPolicies[0], fallbackModelIds: [...routingPolicies[0].fallbackModelIds] }, publishedAt: '2026-07-18T09:00:00.000Z', publishedBy: '王昊' },
  { id: 'route-p2-v1', policyId: 'route-p2', version: 1, snapshot: { ...routingPolicies[2], fallbackModelIds: [] }, publishedAt: '2026-07-18T09:00:00.000Z', publishedBy: '王昊' },
];

const modelAuditEvents: ModelAuditEvent[] = [];

type ModelRequestOptions = { headers?: Record<string, string>; body?: unknown };

function modelContext(opts: ModelRequestOptions) {
  const explicitPermissions = opts.headers?.['x-mock-permissions']?.split(',').map((item) => item.trim());
  const token = opts.headers?.Authorization?.replace(/^Bearer\s+/i, '');
  const permissions = explicitPermissions ?? (token === 'mock-model-admin-token' ? ['model.read', 'model.write'] : token === 'mock-jwt-token' ? ['model.read'] : []);
  const actor = opts.headers?.['x-mock-actor'] ?? (token === 'mock-model-admin-token' ? '模型管理员' : token === 'mock-jwt-token' ? '王昊' : '当前用户');
  return { workspaceId: opts.headers?.['x-workspace-id'] ?? 'w1', permissions, actor };
}

function requireModelRead(opts: ModelRequestOptions) {
  const context = modelContext(opts);
  if (!context.permissions.includes('model.read')) throw new Error('E_MODEL_READ_FORBIDDEN: 缺少 model.read 权限');
  return context;
}

function requireModelWrite(opts: ModelRequestOptions, workspaceId: string) {
  const context = modelContext(opts);
  if (!context.permissions.includes('model.write')) throw new Error('E_MODEL_WRITE_FORBIDDEN: 缺少 model.write 权限');
  if (context.workspaceId !== workspaceId) throw new Error('E_WORKSPACE_SCOPE: 无权操作其他工作区模型资源');
  return context;
}

function appendModelAudit(opts: ModelRequestOptions, action: string, target: string, result: 'success' | 'failed', details: { reason?: string; policyVersion?: string; correlationId?: string } = {}) {
  const context = modelContext(opts);
  const event: ModelAuditEvent = { id: mockId('model_audit'), time: new Date().toISOString(), workspaceId: context.workspaceId, actor: context.actor, action, target, result, reason: details.reason, policyVersion: details.policyVersion, correlationId: details.correlationId ?? mockId('corr') };
  modelAuditEvents.unshift(event);
  return event;
}

function modelById(id: string) {
  return modelProfiles.find((model) => model.id === id);
}

function validateRoutingPolicy(policy: RoutingPolicyDraft) {
  const issues: string[] = [];
  const primary = modelById(policy.primaryModelId);
  const modelIds = [policy.primaryModelId, ...policy.fallbackModelIds];
  const selectedProviders = modelIds.map((id) => modelById(id)).filter(Boolean).map((model) => modelProviders.find((provider) => provider.id === model!.providerId));
  if (!primary || primary.status !== 'available') issues.push('E_MODEL_UNAVAILABLE: 主模型不可用');
  if (selectedProviders.some((provider) => provider?.workspaceId !== policy.workspaceId)) issues.push('E_MODEL_SCOPE: 模型部署不属于当前工作区');
  if (new Set(modelIds).size !== modelIds.length) issues.push('E_FALLBACK_INVALID: 降级链不能重复或指向主模型');
  if (policy.fallbackModelIds.some((id) => !modelById(id) || modelById(id)?.status !== 'available')) issues.push('E_FALLBACK_INVALID: 降级模型不可用');
  if (policy.dataScope === 'restricted' && policy.egressAllowed) issues.push('E_EGRESS_BLOCKED: 受限数据不允许出境');
  if (policy.dataScope === 'restricted' && modelIds.some((id) => modelById(id)?.dataResidency !== 'cn')) issues.push('E_EGRESS_BLOCKED: 受限数据必须路由至境内模型部署');
  if (policy.budgetLimitUsd <= 0) issues.push('E_BUDGET_EXCEEDED: 预算必须大于 0');
  return issues;
}

function providerImpact(providerId: string): ProviderImpact {
  const routeReferences = routingVersions
    .filter((version) => [version.snapshot.primaryModelId, ...version.snapshot.fallbackModelIds].some((modelId) => modelById(modelId)?.providerId === providerId))
    .map((version) => ({ policyId: version.policyId, level: version.snapshot.level, versionId: version.id }));
  return { providerId, routeReferences, deletionAllowed: routeReferences.length === 0, blockedReason: routeReferences.length ? 'Provider 被已发布路由引用，需先替换或停用路由。' : undefined };
}

// ============ P11 设置扩展数据 ============

export const mockApiKeys = [
  { id: 'k1', name: 'Production Primary', prefix: 'sk-prod-****', created: '2026-04-01', lastUsed: '14:32', expires: '2026-08-01', status: 'active' },
  { id: 'k2', name: 'CI/CD Pipeline', prefix: 'sk-cicd-****', created: '2026-05-15', lastUsed: '12:18', expires: '2026-09-15', status: 'active' },
  { id: 'k3', name: 'Dev Sandbox', prefix: 'sk-dev-****', created: '2026-06-20', lastUsed: '昨天', expires: '2026-07-20', status: 'warning' },
];

export const mockWebhooks = [
  { id: 'w1', url: 'https://acme.com/webhook/alert', events: ['P0 告警', 'P1 升级'], status: 'active', secret: 'whsec_****', retry: 3, success: 99.2 },
  { id: 'w2', url: 'https://siem.acme.com/ingest', events: ['审计日志', '合规事件'], status: 'active', secret: 'whsec_****', retry: 5, success: 99.8 },
];

export const mockBackups = [
  { id: 'b1', time: '2026-07-13 02:00', type: '自动', size: '4.2 GB', status: 'success', duration: '12min' },
  { id: 'b2', time: '2026-07-12 02:00', type: '自动', size: '4.1 GB', status: 'success', duration: '11min' },
  { id: 'b3', time: '2026-07-11 02:00', type: '自动', size: '4.1 GB', status: 'success', duration: '12min' },
  { id: 'b4', time: '2026-07-10 02:00', type: '手动', size: '3.9 GB', status: 'success', duration: '15min' },
];

export const mockAuditStream = [
  { id: 'a1', time: '14:32:12', user: '王昊', action: 'CONFIG_SET', target: 'prod-redis-01', result: 'success' },
  { id: 'a2', time: '14:28:45', user: '王昊', action: 'APPROVE', target: 'TSK-20260713-001', result: 'success' },
  { id: 'a3', time: '14:25:30', user: '李婷', action: 'TASK_CREATE', target: 'TSK-20260713-004', result: 'success' },
  { id: 'a4', time: '14:18:22', user: '张睿', action: 'CVE_SCAN', target: 'PRD-CACHE-019', result: 'success' },
  { id: 'a5', time: '14:12:08', user: '孙博', action: 'DEPLOY', target: 'gateway-prod', result: 'success' },
  { id: 'a6', time: '14:05:15', user: '李婷', action: 'WORKFLOW_TRIGGER', target: 'cache-oom', result: 'failed' },
];

export const mockComplianceChecks = [
  { id: 'c1', name: '身份认证 (Authentik+OIDC)', category: 'identity', status: 'pass' },
  { id: 'c2', name: 'MFA 双因素 (100% 启用)', category: 'identity', status: 'pass' },
  { id: 'c3', name: '密码策略 (12 位 + 90d 轮转)', category: 'identity', status: 'pass' },
  { id: 'c4', name: '字段级权限', category: 'access', status: 'pass' },
  { id: 'c5', name: '数据出境策略', category: 'data', status: 'pass' },
  { id: 'c6', name: '双签复核 (写动作 100%)', category: 'access', status: 'pass' },
  { id: 'c7', name: 'SignedLog 审计', category: 'audit', status: 'pass' },
  { id: 'c8', name: 'API Key 30d 轮转', category: 'data', status: 'pass' },
  { id: 'c9', name: 'gVisor 沙箱隔离', category: 'compliance', status: 'pass' },
  { id: 'c10', name: '风险评估', category: 'compliance', status: 'pass' },
  { id: 'c11', name: '下次审计日期', category: 'compliance', status: 'pass' },
  { id: 'c12', name: '导出审计日志', category: 'audit', status: 'warn' },
  { id: 'c13', name: '字段脱敏增强', category: 'data', status: 'warn' },
  { id: 'c14', name: '灰度发布策略', category: 'compliance', status: 'warn' },
];

export const mockBilling = {
  plan: 'Enterprise Plus',
  price: '$5,000',
  usage: {
    cost: 1240,
    budget: 5000,
    tokens: 12.4e6,
    tokenBudget: 50e6,
    seats: 18,
    seatLimit: 50,
    agents: 8,
    agentLimit: 20,
  },
  nextBilling: '2026-08-01',
};

export const mockNotificationChannels = [
  { id: 'n1', name: '安全告警', channels: ['飞书', '邮件', '电话'], frequency: '即时', enabled: true },
  { id: 'n2', name: '系统状态', channels: ['飞书', '邮件'], frequency: '每 5 分钟', enabled: true },
  { id: 'n3', name: '日报', channels: ['邮件'], frequency: '每天 9:00', enabled: true },
  { id: 'n4', name: '营销活动', channels: ['邮件'], frequency: '每周', enabled: false },
];

export const mockAudits: AuditItem[] = mockComplianceChecks.map((c) => ({ ...c, updatedAt: '2026-07-12' })) as unknown as AuditItem[];

// ============ P2 会话扩展数据 ============

export interface AgentMeta {
  id: string;
  name: string;
  category: string;
  version: string;
  description: string;
  rating: number;
  ratingCount: number;
  lastActive: string;
  installCount: number;
  responseP95: number;
  totalTokens: number;
  // 新增字段
  sla: number; // 0-100
  errorRate: number; // 0-1
  knowledgeBases: number; // 引用的知识库数
  tools: number; // 工具数
  languages: string[]; // 支持语言
}

export const mockAgentMeta: AgentMeta = {
  id: 'a1',
  name: '故障自愈',
  category: 'AIOps',
  version: '1.4.2',
  description: '基于 Runbook 的自动故障定位与恢复 · 内置 8 个 Skill',
  rating: 4.8,
  ratingCount: 1240,
  lastActive: '14:32',
  installCount: 1240,
  responseP95: 580,
  totalTokens: 1240000,
  sla: 99.6,
  errorRate: 0.012,
  knowledgeBases: 4,
  tools: 8,
  languages: ['zh-CN', 'en-US'],
};

export interface ChatMessageEx {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  agentId?: string;
  agentName?: string;
  citations?: { id: string; docId: string; text: string; score: number; source: string; page?: number }[];
  toolCalls?: { id: string; name: string; args: Record<string, unknown>; result?: string; status: 'pending' | 'running' | 'success' | 'failed'; durationMs?: number }[];
  codeBlock?: { lang: string; code: string };
  attachment?: { name: string; size: string; type: 'file' | 'image' };
  thinking?: string;
  approvalRequest?: { action: string; approver?: string; status: 'pending' | 'approved' | 'rejected' };
  createdAt: string;
}

export const mockConversationEx = {
  agent: mockAgentMeta,
  messages: [
    {
      id: 'm1',
      role: 'user' as const,
      content: 'prod-redis-01 OOM 了，怎么处理？',
      createdAt: '2026-07-13T14:25:00Z',
    },
    {
      id: 'm2',
      role: 'assistant' as const,
      agentId: 'a1',
      agentName: '故障自愈',
      thinking: '用户问 OOM，我需要先查 Redis 指标 + 最近变更 + Runbook ...',
      content: '检测到 prod-redis-01 在 14:25 触发 maxmemory 限制（used_memory 7.2G / maxmemory 8G）。我已检索相关 Runbook 与最近变更记录，建议执行以下步骤：',
      citations: [
        { id: 'c1', docId: 'k1', text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率...', score: 0.92, source: 'Redis 故障 Runbook v3.2', page: 12 },
        { id: 'c2', docId: 'k2', text: 'prod-redis-01 资产编号 PRD-CACHE-019，归属 ACME 生产集群 cn-east-1 区...', score: 0.78, source: 'CMDB 全量资产清单' },
      ],
      createdAt: '2026-07-13T14:25:08Z',
    },
    {
      id: 'm3',
      role: 'tool' as const,
      content: 'execute_k8s_resource',
      toolCalls: [
        { id: 't1', name: 'redis-cli INFO memory', args: { host: 'prod-redis-01' }, result: 'used_memory_human: 7.2G · maxmemory_human: 8G · maxmemory_policy: noeviction', status: 'success' as const, durationMs: 120 },
        { id: 't2', name: 'redis-cli CONFIG GET maxmemory*', args: {}, result: 'maxmemory 8589934592 · maxmemory-policy noeviction', status: 'success' as const, durationMs: 80 },
      ],
      createdAt: '2026-07-13T14:25:30Z',
    },
    {
      id: 'm4',
      role: 'user' as const,
      content: '把 maxmemory 提到 16GB，并改成 volatile-lru',
      createdAt: '2026-07-13T14:26:12Z',
    },
    {
      id: 'm5',
      role: 'assistant' as const,
      agentId: 'a1',
      agentName: '故障自愈',
      content: '需要写操作，触发双签审批（等保 3）：',
      approvalRequest: { action: 'CONFIG SET maxmemory 16GB + volatile-lru', status: 'pending' as const },
      createdAt: '2026-07-13T14:26:18Z',
    },
    {
      id: 'm6',
      role: 'assistant' as const,
      agentId: 'a1',
      agentName: '故障自愈',
      content: '审批通过，已执行：',
      toolCalls: [
        { id: 't3', name: 'redis-cli CONFIG SET', args: { maxmemory: '16GB', 'maxmemory-policy': 'volatile-lru' }, result: 'OK', status: 'success' as const, durationMs: 45 },
      ],
      codeBlock: { lang: 'bash', code: '$ kubectl exec -it prod-redis-01 -- redis-cli CONFIG SET maxmemory 16GB\nOK\n$ kubectl exec -it prod-redis-01 -- redis-cli CONFIG SET maxmemory-policy volatile-lru\nOK' },
      createdAt: '2026-07-13T14:28:00Z',
    },
    {
      id: 'm7',
      role: 'user' as const,
      content: '给我看下当前的内存使用曲线',
      attachment: { name: 'redis-mem-curve.png', size: '124 KB', type: 'image' },
      createdAt: '2026-07-13T14:30:00Z',
    },
    {
      id: 'm8',
      role: 'assistant' as const,
      agentId: 'a1',
      agentName: '故障自愈',
      content: '根据你的截图，14:00-14:25 内存从 4.8G 涨到 7.2G（斜率 13%/15min），这是异常写入。已识别 3 个大 Key：\n\n• session:user:8a3f:1.4GB\n• cache:render:html:5e2:1.1GB\n• analytics:event:raw:2026-07-13:0.9GB\n\n建议：\n1. volatile-lru 已生效（最近 5min 释放 800MB）\n2. 大 Key 拆分（运维窗口执行）\n3. 加监控告警：内存 > 70% 持续 5min',
      createdAt: '2026-07-13T14:30:20Z',
    },
  ] as ChatMessageEx[],
};

// 会话按时间分组（侧栏）
export interface SessionItem {
  id: string;
  title: string;
  preview: string;
  agent: string;
  status: 'active' | 'done';
  group: 'today' | 'yesterday' | 'week';
  time: string;
  pinned?: boolean;
}

export const mockSessions: SessionItem[] = [
  { id: 's1', title: 'Redis OOM 处理', preview: '已扩容到 16GB + volatile-lru', agent: '故障自愈', status: 'active', group: 'today', time: '14:32', pinned: true },
  { id: 's2', title: '合规审计报告生成', preview: '本月 94 项审计已生成 PDF', agent: '合规审计', status: 'done', group: 'today', time: '11:20' },
  { id: 's3', title: 'K8s 节点扩容申请', preview: '需要 2 个 c5.2xlarge，预计影响 5 个服务', agent: '变更辅助', status: 'active', group: 'today', time: '10:15' },
  { id: 's4', title: 'CVE 周报', preview: '本周 12 个新漏洞，建议优先修复 CVE-2026-3321', agent: '漏洞修复', status: 'done', group: 'yesterday', time: '昨天 17:45' },
  { id: 's5', title: '告警降噪规则', preview: '合并 23 条重复 SIEM 告警', agent: '告警降噪', status: 'done', group: 'yesterday', time: '昨天 14:30' },
  { id: 's6', title: '客户咨询 · 价格问题', preview: '关于 Enterprise Plus 升级方案', agent: '客户支持', status: 'done', group: 'week', time: '7月10日' },
  { id: 's7', title: '容量预测 · Q3', preview: '预计增长 24%，建议提前扩容', agent: '容量预测', status: 'done', group: 'week', time: '7月9日' },
];

// Slash 命令面板
export const mockSlashCommands = [
  { cmd: '/agent', desc: '切换 Agent', icon: 'Bot', category: 'agent' },
  { cmd: '/search', desc: '检索知识库', icon: 'Search', category: 'kb' },
  { cmd: '/task', desc: '创建任务', icon: 'ListChecks', category: 'task' },
  { cmd: '/skill', desc: '调用技能', icon: 'Wrench', category: 'tool' },
  { cmd: '/workflow', desc: '触发工作流', icon: 'Workflow', category: 'tool' },
  { cmd: '/model', desc: '切换模型', icon: 'Cpu', category: 'tool' },
  { cmd: '/doc', desc: '查询文档', icon: 'FileText', category: 'kb' },
  { cmd: '/member', desc: '@ 提及成员', icon: 'Users', category: 'collab' },
  { cmd: '/clear', desc: '清空会话', icon: 'X', category: 'tool' },
  { cmd: '/export', desc: '导出对话', icon: 'Download', category: 'tool' },
  { cmd: '/help', desc: '显示所有命令', icon: 'Sparkles', category: 'tool' },
  { cmd: '/summary', desc: '生成会话摘要', icon: 'FileText', category: 'kb' },
];

export const mockConversation: Conversation = {
  id: 'cv1',
  agentId: 'a1',
  title: 'Redis 集群 OOM 排查',
  createdAt: '2026-07-13T08:12:00Z',
  updatedAt: '2026-07-13T08:24:00Z',
  messages: [
    { id: 'm1', role: 'user', content: 'prod-redis-01 OOM 了，怎么处理？', createdAt: '2026-07-13T08:12:00Z' },
    {
      id: 'm2',
      role: 'assistant',
      agentId: 'a1',
      content:
        '检测到 prod-redis-01 在 08:09:32 触发 maxmemory 限制。我已检索相关 Runbook 与最近变更记录，建议执行以下步骤：\n1. 临时提升 maxmemory 至 8GB（需双签）\n2. 清理已过期的会话缓存（预计释放 2.1GB）\n3. 排查最近 24h 是否存在大 Key 写入',
      citations: [
        { id: 'c1', docId: 'k1', text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率...', score: 0.92, source: 'Redis 故障 Runbook v3.2', page: 12 },
        { id: 'c2', docId: 'k2', text: 'prod-redis-01 资产编号 PRD-CACHE-019，归属 ACME 生产集群...', score: 0.78, source: 'CMDB 全量资产清单' },
      ],
      toolCalls: [
        { id: 't1', name: 'redis-cli INFO memory', args: {}, status: 'success', durationMs: 120, result: 'used_memory_human: 7.2G' },
        { id: 't2', name: 'redis-cli MONITOR', args: { duration: 5 }, status: 'success', durationMs: 5200 },
      ],
      createdAt: '2026-07-13T08:12:30Z',
    },
    {
      id: 'm3',
      role: 'tool',
      content: '正在请求双签审批：调整 maxmemory 至 8GB（需 1 名 SRE + 1 名 Admin 签发）',
      createdAt: '2026-07-13T08:13:00Z',
    },
    { id: 'm4', role: 'user', content: '已批准', createdAt: '2026-07-13T08:14:00Z' },
  ],
};

// ============ 运行时 Mock 领域状态 ============
// 让会话中的行动、审批、任务、审计和通知共享同一份数据。
// 后续切换真实后端时，页面只需保留相同的 API 契约。
type MockDomainEvent = { id: string; time: string; user: string; action: string; target: string; result: 'success' | 'failed' };
const mockDomain = {
  audits: mockAuditStream.map((event: any) => ({ ...event, result: event.result === 'failed' ? 'failed' as const : 'success' as const })),
  messages: [...mockMessageStream] as any[],
  actions: new Map<string, { id: string; conversationId: string; status: 'pending' | 'approved' | 'executed' | 'rejected'; taskId?: string }>(),
};
const taskDomain = createTaskDomain(mockTasks);

function mockId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function appendDomainEvent(action: string, target: string, result: MockDomainEvent['result'] = 'success') {
  const event: MockDomainEvent = { id: mockId('audit'), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), user: '数字员工', action, target, result };
  mockDomain.audits.unshift(event);
  mockDomain.messages.unshift({
    id: mockId('msg'),
    channel: '飞书',
    target: '会话工作台',
    status: result === 'success' ? 'delivered' : 'failed',
    tone: result === 'success' ? 'success' : 'warning',
    content: `${action}：${target}`,
    time: event.time,
  });
  return event;
}

function appendTaskDomainEvent(task: ControlledTask) {
  const event = task.auditEvents.at(-1);
  if (event) appendDomainEvent(event.action, task.code, event.tone === 'error' ? 'failed' : 'success');
}

// ============ Mock 路由 ============

export async function mockHandler(path: string, opts: { method?: string; body?: unknown; query?: Record<string, any>; headers?: Record<string, string> }): Promise<unknown> {
  await sleep(80); // 模拟网络延迟
  const method = opts.method?.toUpperCase() ?? 'GET';

  // 首页 KPI
  if (path === '/api/home/kpis') return mockKpis;
  if (path === '/api/home/events') return mockHomeExtra.recentActivities;
  if (path === '/api/home/extra') return mockHomeExtra;
  if (path === '/api/home/team') return mockHomeExtra.teamMembers;
  if (path === '/api/home/alerts') {
    return [
      { id: 'al1', severity: 'P0', tone: 'danger' as const, title: 'P0 · Redis cache-oom 临近超时', meta: '8 min 前 · 王昊 · INC-019', taskCode: 'TSK-20260713-001' },
      { id: 'al2', severity: 'P1', tone: 'warning' as const, title: 'P1 · 升级窗口确认', meta: '15 min 前 · 李婷 · 需确认', taskCode: 'TSK-20260713-002' },
      { id: 'al3', severity: 'P1', tone: 'warning' as const, title: 'P1 · CVE-2026-3321 待修复', meta: '32 min 前 · 张睿', taskCode: 'TSK-20260712-019' },
      { id: 'al4', severity: 'P2', tone: 'info' as const, title: 'P2 · K8s 节点扩容申请', meta: '1h 前 · 王昊', taskCode: 'TSK-20260713-004' },
      { id: 'al5', severity: 'P3', tone: 'info' as const, title: 'P3 · 月度报表就绪', meta: '2h 前 · 系统 · 可下载' },
      { id: 'al6', severity: 'P2', tone: 'info' as const, title: 'P2 · Log4j 检测告警', meta: '3h 前 · SIEM · 已合并' },
    ];
  }

  // 工作区
  if (path === '/api/workspaces') return mockWorkspaces;
  if (path.startsWith('/api/workspaces/') && path.endsWith('/agents')) {
    const id = path.split('/')[3];
    return mockWorkspaceAgents[id as keyof typeof mockWorkspaceAgents] ?? [];
  }
  if (path.startsWith('/api/workspaces/') && path.endsWith('/tools')) {
    const id = path.split('/')[3];
    return mockWorkspaceTools[id as keyof typeof mockWorkspaceTools] ?? null;
  }
  if (path.startsWith('/api/workspaces/') && path.endsWith('/members')) {
    const id = path.split('/')[3];
    return mockWorkspaceMembers[id as keyof typeof mockWorkspaceMembers] ?? [];
  }
  if (path === '/api/workspace-switch-history') return mockWorkspaceSwitchHistory;

  // 任务：所有写操作都经由受控任务领域，保证版本、审计和通知一致。
  if (path === '/api/tasks' && method === 'GET') return taskDomain.list();
  if (path === '/api/tasks' && method === 'POST') {
    const task = taskDomain.create((opts.body ?? {}) as Partial<ControlledTask> & Pick<Task, 'title'>, (opts.body ?? {}) as TaskActor);
    appendTaskDomainEvent(task);
    return task;
  }
  const taskRoute = path.match(/^\/api\/tasks\/([^/]+)(?:\/(transition|approve|takeover|retry|audit))?$/);
  if (taskRoute) {
    const [, id, action] = taskRoute;
    if (!action && method === 'GET') return taskDomain.get(id) ?? null;
    if (action === 'audit' && method === 'GET') return taskDomain.audit(id);
    const body = (opts.body ?? {}) as TaskActor & { status?: Task['status']; stage?: ControlledTask['lifecycleStage']; approved?: boolean };
    let task: ControlledTask | undefined;
    if (action === 'transition' && method === 'POST') task = taskDomain.transition(id, body.stage ?? body.status ?? 'pending', body);
    if (action === 'approve' && method === 'POST') task = taskDomain.approve(id, body);
    if (action === 'takeover' && method === 'POST') task = taskDomain.takeover(id, body);
    if (action === 'retry' && method === 'POST') task = taskDomain.retry(id, body);
    if (task) {
      appendTaskDomainEvent(task);
      return task;
    }
  }

  // 智能体
  const capabilityTarget = path.match(/^\/api\/(agents|workflows)\/([^/]+)\/capabilities(?:\/([^/]+))?$/);
  if (capabilityTarget) {
    const [, resource, targetId, bindingId] = capabilityTarget;
    const targetType = resource === 'agents' ? 'agent' as const : 'workflow' as const;
    if (method === 'GET') return mockCapabilityBindings.filter((binding) => binding.targetType === targetType && binding.targetId === targetId);
    if (method === 'POST') {
      const body = (opts.body ?? {}) as Partial<CapabilityBinding>;
      const capability = body.capabilityKind === 'workflow_skill' ? mockWorkflowSkills.find((item) => item.id === body.capabilityId) : mockSkills.find((item) => item.id === body.capabilityId);
      if (!capability) throw new Error('能力尚未安装或未发布');
      if (body.capabilityKind === 'workflow_skill' && (capability as WorkflowSkill).status !== 'published') throw new Error('工作流技能尚未发布');
      const binding: CapabilityBinding = { id: mockId('binding'), targetType, targetId, capabilityKind: body.capabilityKind ?? 'skill', capabilityId: body.capabilityId!, pinnedVersion: body.pinnedVersion ?? ('version' in capability ? capability.version : (capability as WorkflowSkill).sourceVersionId), status: body.status ?? 'active', createdBy: '当前用户', createdAt: new Date().toISOString(), auditId: mockId('audit') };
      mockCapabilityBindings.push(binding); appendControlPlaneAudit('skill', '绑定能力', `${targetType}:${targetId} → ${binding.capabilityId}`); return binding;
    }
    if (method === 'DELETE' && bindingId) { const index = mockCapabilityBindings.findIndex((binding) => binding.id === bindingId && binding.targetId === targetId); if (index < 0) throw new Error('能力绑定不存在'); const [removed] = mockCapabilityBindings.splice(index, 1); appendControlPlaneAudit('skill', '解绑能力', `${targetType}:${targetId} → ${removed.capabilityId}`); return removed; }
  }
  if (path === '/api/workflow-skills' && method === 'GET') return mockWorkflowSkills;
  const publishAsSkill = path.match(/^\/api\/workflows\/([^/]+)\/publish-as-skill$/);
  if (publishAsSkill && method === 'POST') {
    const body = (opts.body ?? {}) as { version?: string; name?: string; description?: string };
    const workflowSkill: WorkflowSkill = { id: mockId('workflow_skill'), sourceWorkflowId: publishAsSkill[1], sourceVersionId: body.version ?? 'v1', name: body.name?.trim() || '未命名工作流技能', description: body.description?.trim() || '由受控工作流发布的可复用能力', riskLevel: 'mid', approvalRequired: true, rollbackSupported: true, status: 'published' };
    mockWorkflowSkills.unshift(workflowSkill); appendControlPlaneAudit('skill', '发布工作流技能', workflowSkill.name); return workflowSkill;
  }
  if (path === '/api/agents' && method === 'GET') return mockAgents;
  if (path === '/api/agents/imports' && method === 'GET') return mockAgentImports;
  if (path === '/api/agents/import' && method === 'POST') {
    const body = (opts.body ?? {}) as Record<string, any>;
    const importId = mockId('import');
    const agent = { id: mockId('agent'), name: body.name ?? '未命名导入智能体', category: body.category ?? 'AIOps', description: body.description ?? '', version: body.version ?? '0.1.0', status: 'available', lifecycleStatus: 'pending_review', source: body.source ?? '内部导入', rating: 0, installCount: 0, tools: body.tools ?? [] } as Agent & Record<string, any>;
    mockAgents.unshift(agent);
    const record = { id: importId, agentId: agent.id, agentName: agent.name, source: agent.source, status: 'pending_review', submittedBy: '当前用户', submittedAt: new Date().toISOString(), checks: body.checks ?? [{ key: 'format', label: '配置格式', status: 'passed' }, { key: 'dependencies', label: '依赖检查', status: 'review' }, { key: 'risk', label: '风险扫描', status: 'review' }], mapping: body.mapping ?? { tools: [], mcp: [] }, risks: body.risks ?? [], audit: [{ id: mockId('audit'), action: 'IMPORT_SUBMIT', actor: '当前用户', time: new Date().toISOString(), result: '待审核' }] };
    mockAgentImports.unshift(record);
    return { ...agent, ...record };
  }
  const importAction = path.match(/^\/api\/agents\/imports\/([^/]+)(?:\/(approve|reject|audit))?$/);
  if (importAction) {
    const record = mockAgentImports.find((item) => item.id === importAction[1]);
    if (!record) return null;
    if (importAction[2] === 'audit' && method === 'GET') return record.audit;
    if ((importAction[2] === 'approve' || importAction[2] === 'reject') && method === 'POST') {
      record.status = importAction[2] === 'approve' ? 'approved' : 'rejected';
      record.audit.unshift({ id: mockId('audit'), action: importAction[2] === 'approve' ? 'IMPORT_APPROVE' : 'IMPORT_REJECT', actor: '当前用户', time: new Date().toISOString(), result: record.status });
      const agent = mockAgents.find((item) => item.id === record.agentId) as (Agent & Record<string, any>) | undefined;
      if (agent) agent.lifecycleStatus = record.status;
      return record;
    }
    if (method === 'GET') return record;
  }
  if (path === '/api/agents' && method === 'POST') {
    const body = (opts.body ?? {}) as Record<string, any>;
    const agent = { id: mockId('agent'), name: body.name ?? '未命名智能体', category: body.category ?? 'AIOps', description: body.description ?? '', version: '0.1.0', status: 'available', rating: 0, installCount: 0, tools: body.tools ?? [] } as Agent;
    mockAgents.unshift(agent);
    return agent;
  }
  if (path === '/api/evaluations' && method === 'GET') return mockAgentRuntime.evaluations;
  if (path === '/api/evaluations' && method === 'POST') {
    const body = (opts.body ?? {}) as Record<string, any>;
    const evaluation = { id: mockId('eval'), status: 'baseline', accuracy: 0, recall: 0, p95Ms: 0, calls: 0, passedAt: new Date().toISOString(), ...body };
    mockAgentRuntime.evaluations.unshift(evaluation);
    return evaluation;
  }
  if (path === '/api/agents/alerts' && method === 'GET') return mockAgentRuntime.alerts;
  if (path === '/api/agents/calls/live' && method === 'GET') return mockAgentRuntime.liveCalls;
  if (path === '/api/agents/calls/live' && method === 'POST') {
    const call = { id: mockId('call'), ts: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), status: 'ok', ...((opts.body ?? {}) as Record<string, any>) };
    mockAgentRuntime.liveCalls.unshift(call);
    if (call.status === 'timeout' || call.status === 'error') mockAgentRuntime.alerts.unshift({ id: mockId('agent_alert'), agent: (call as any).agent ?? '智能体', agentId: (call as any).agentId, severity: call.status === 'timeout' ? 'warn' : 'error', type: 'latency', title: `运行${call.status === 'timeout' ? '超时' : '失败'}，需要关注`, ts: call.ts, acknowledged: false });
    return call;
  }
  const agentSkillBinding = path.match(/^\/api\/agents\/([^/]+)\/skills(?:\/([^/]+))?$/);
  if (agentSkillBinding) {
    const [, agentId, bindingSkillId] = agentSkillBinding;
    const agent = mockAgents.find((item) => item.id === agentId);
    if (!agent) throw new Error('智能体不存在');
    const bindings = mockAgentSkillBindings[agentId] ?? (mockAgentSkillBindings[agentId] = []);
    if (method === 'GET') return bindings;
    if (method === 'POST') {
      const body = (opts.body ?? {}) as { skillId?: string; approvalTicket?: string };
      const skill = mockSkills.find((item) => item.id === body.skillId);
      if (!skill) throw new Error('技能尚未安装到工作区，无法分配给智能体');
      if (agent.status !== 'installed') throw new Error('智能体尚未启用，无法安装技能');
      if (skill.riskLevel === 'high' && !body.approvalTicket) throw new Error('E_APPROVAL_REQUIRED: 高风险技能分配需要审批单号');
      if (bindings.some((binding) => binding.skillId === skill.id)) return bindings;
      bindings.push({ skillId: skill.id, skillName: skill.name, status: 'active', installedAt: new Date().toLocaleString('zh-CN') });
      const impact = mockSkillImpacts[skill.id] ?? { skillId: skill.id, agents: [], workflows: [], activeRuns: 0, uninstallAllowed: true };
      if (!impact.agents.includes(agent.name)) impact.agents.push(agent.name);
      impact.uninstallAllowed = false; impact.reason = `已分配给 ${impact.agents.length} 个智能体`;
      mockSkillImpacts[skill.id] = impact;
      appendControlPlaneAudit('skill', '分配技能到智能体', `${skill.name} → ${agent.name}`); return bindings;
    }
    if (method === 'DELETE' && bindingSkillId) {
      const index = bindings.findIndex((binding) => binding.skillId === bindingSkillId);
      if (index < 0) throw new Error('智能体未安装该技能');
      const [binding] = bindings.splice(index, 1); appendControlPlaneAudit('skill', '从智能体移除技能', `${binding.skillName} → ${agent.name}`); return binding;
    }
  }
  const agentAction = path.match(/^\/api\/agents\/([^/]+)\/(install|uninstall|enable|disable|publish|config|audit|metrics|calls)$/);
  if (agentAction) {
    const [, agentId, action] = agentAction;
    const agent = mockAgents.find((item) => item.id === agentId);
    if (action === 'audit' && method === 'GET') return mockAgentRuntime.alerts.filter((item) => item.agentId === agentId);
    if (action === 'metrics' && method === 'GET') return { agentId, calls24h: mockAgentRuntime.liveCalls.filter((item) => item.agentId === agentId).length, successRate: 0.98, errorRate: 0.02, p95Ms: agent?.p95Ms ?? 0 };
    if (action === 'calls' && method === 'GET') return mockAgentRuntime.liveCalls.filter((item) => item.agentId === agentId);
    if (agent && method === 'POST') {
      if (action === 'install' || action === 'enable' || action === 'publish') agent.status = 'installed';
      if (action === 'uninstall' || action === 'disable') agent.status = 'available';
      return agent;
    }
  }
  const evaluationAction = path.match(/^\/api\/evaluations\/([^/]+)\/(run|stop|retry|report)$/);
  if (evaluationAction) {
    const evaluation = mockAgentRuntime.evaluations.find((item) => item.id === evaluationAction[1]);
    if (!evaluation) return null;
    if (evaluationAction[2] === 'report' && method === 'GET') return { ...evaluation, report: { passed: evaluation.accuracy >= 90, checks: ['准确率', '召回率', 'P95'] } };
    if (method === 'POST') { evaluation.status = evaluationAction[2] === 'stop' ? 'failed' : evaluationAction[2] === 'run' ? 'running' : 'baseline'; return evaluation; }
  }
  const alertAction = path.match(/^\/api\/agents\/alerts\/([^/]+)\/acknowledge$/);
  if (alertAction && method === 'POST') {
    const alert = mockAgentRuntime.alerts.find((item) => item.id === alertAction[1]);
    if (alert) alert.acknowledged = true;
    return alert ?? null;
  }
  if (path.startsWith('/api/agents/') && path.endsWith('/versions')) {
    const id = path.split('/')[3];
    return mockAgentVersions[id] ?? [];
  }
  if (path.startsWith('/api/agents/') && path.endsWith('/trend')) {
    const id = path.split('/')[3];
    return mockCallTrends[id] ?? [];
  }
  if (path === '/api/agents/rank') return mockAgentRank;

  // 工作流
  if (path === '/api/workflows') return [mockWorkflow];
  if (path === '/api/workflow-templates') return mockWorkflowTemplates.map((template, index) => ({
    ...template,
    version: ['v2.4', 'v3.1', 'v2.2', 'v1.8', 'v1.6', 'v2.0'][index],
    owner: ['SRE 平台组', '安全运营组', '合规运营组', '交付工程组', '安全运营组', '容量运营组'][index],
    verifiedAt: ['2026-07-16', '2026-07-12', '2026-07-17', '2026-07-14', '2026-07-15', '2026-07-10'][index],
    risk: ['L3', 'L3', 'L1', 'L3', 'L2', 'L2'][index],
    dependencies: index === 0 ? ['redis-cli', 'kubernetes-mcp'] : index === 1 ? ['cve-kb', 'patch-skill'] : ['受控连接器'],
    health: index === 0 ? '需授权' : '健康',
    successRate: ['98.6%', '96.8%', '99.2%', '97.9%', '98.1%', '95.4%'][index],
    sequence: index === 0 ? ['event', 'retrieve', 'decision', 'policy', 'approval', 'execute', 'compensate', 'audit', 'notify'] : index === 1 ? ['event', 'retrieve', 'decision', 'policy', 'approval', 'task', 'execute', 'compensate', 'audit', 'notify'] : ['schedule', 'retrieve', 'decision', 'policy', 'task', 'audit', 'notify'],
  }));
  if (path === '/api/workflow-runs') return mockWorkflowControl.runs;
  if (path === '/api/workflow-kpi') return mockWorkflowKpi;
  if (path === '/api/workflows/generations' && method === 'GET') {
    return mockWorkflowGenerations.filter((item) => item.tenantId === WORKFLOW_GENERATION_PRINCIPAL.tenantId && item.workspaceId === WORKFLOW_GENERATION_PRINCIPAL.workspaceId && item.ownerId === WORKFLOW_GENERATION_PRINCIPAL.userId && item.status !== 'expired');
  }
  if (path === '/api/workflows/generate' && method === 'POST') {
    const body = (opts.body ?? {}) as Record<string, any>;
    const prompt = String(body.prompt ?? '').trim();
    const constraints = body.constraints ?? {};
    if (body.workspaceId !== WORKFLOW_GENERATION_PRINCIPAL.workspaceId) throw new Error('当前账号无权在该工作区生成工作流');
    if (!prompt || prompt.length < 8 || prompt.length > 1000) throw new Error('业务目标需为 8 至 1000 个字符');
    rejectUnsafeGenerationPrompt(prompt);
    if (!ALLOWED_GENERATION_MODELS.has(String(body.model))) throw new Error('当前工作区不允许使用该生成模型');
    const workflow = buildGeneratedWorkflow(prompt);
    const hasExternalWrite = workflow.nodes.some((node) => ['execute', 'http', 'mcp'].includes(node.kind));
    const dependencies = hasExternalWrite ? [{ type: 'tool' as const, name: '受控执行 Skill', status: 'available' as const }, { type: 'mcp' as const, name: 'kubernetes-mcp', status: 'missing' as const, reason: '当前工作区未授权写权限' }] : [{ type: 'agent' as const, name: '数字员工编排器', status: 'available' as const }];
    const generated: WorkflowGenerationRecord = {
      id: mockId('gen'),
      prompt,
      promptDigest: generationDigest(prompt),
      model: String(body.model),
      workspaceId: WORKFLOW_GENERATION_PRINCIPAL.workspaceId,
      tenantId: WORKFLOW_GENERATION_PRINCIPAL.tenantId,
      ownerId: WORKFLOW_GENERATION_PRINCIPAL.userId,
      policyVersion: 'workflow-policy-v3',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      status: 'review_required',
      workflow,
      qualityScore: hasExternalWrite ? 82 : 90,
      requiresReview: true,
      checks: { structure: 'passed', dependencies: dependencies.some((dependency) => dependency.status === 'missing') ? 'review' : 'passed', risk: hasExternalWrite ? 'review' : 'passed' },
      dependencies,
      warnings: [
        '生成结果仅为可编辑草稿，不会自动执行或发布',
        '审计留痕由工作区策略强制开启',
        ...(hasExternalWrite ? ['高风险动作已自动补充审批与补偿回滚节点', '执行节点需要匹配工作区权限后才能试运行'] : []),
      ],
      risks: hasExternalWrite ? [{ level: constraints.riskLevel === 'L3' ? 'L3' : 'L2', node: '执行受控动作', text: '外部写入操作必须通过策略、审批、回滚和权限检查', requiresApproval: true }] : [],
    };
    mockWorkflowGenerations.unshift(generated);
    workflowAudit('WORKFLOW_GENERATE', `${generated.id}:${generated.promptDigest}`);
    return generated;
  }
  const generationAction = path.match(/^\/api\/workflows\/generations\/([^/]+)(?:\/(apply|discard))?$/);
  if (generationAction) {
    const record = mockWorkflowGenerations.find((item) => item.id === generationAction[1]);
    if (!record || record.tenantId !== WORKFLOW_GENERATION_PRINCIPAL.tenantId || record.workspaceId !== WORKFLOW_GENERATION_PRINCIPAL.workspaceId || record.ownerId !== WORKFLOW_GENERATION_PRINCIPAL.userId) throw new Error('无权访问该生成记录');
    if (!generationAction[2] && method === 'GET') return record;
    if (generationAction[2] === 'discard' && method === 'POST') { record.status = 'discarded'; workflowAudit('WORKFLOW_GENERATION_DISCARD', record.id); return record; }
    if (generationAction[2] === 'apply' && method === 'POST') {
      if (record.status !== 'review_required' && record.status !== 'generated') throw new Error('该生成记录不可再次应用');
      if (new Date(record.expiresAt).getTime() < Date.now()) { record.status = 'expired'; throw new Error('生成记录已过期，请重新生成'); }
      const revisionId = `rev_${mockId('wf')}`;
      const revision = { id: revisionId, generationId: record.id, nodes: JSON.parse(JSON.stringify(record.workflow.nodes)), edges: JSON.parse(JSON.stringify(record.workflow.edges)), createdAt: new Date().toISOString() };
      workflowGenerationRevisions.set(revisionId, revision);
      mockWorkflowControl.versions.unshift({ id: revisionId, label: `${revisionId} · AI 草稿`, time: '刚刚', desc: `AI 生成草稿 · ${record.promptDigest}` });
      record.status = 'applied';
      record.revisionId = revisionId;
      workflowAudit('WORKFLOW_GENERATION_APPLY', `${record.id}:${revisionId}`);
      return { ...record, revisionId, revision };
    }
  }
  const workflowDetail = path.match(/^\/api\/workflows\/([^/]+)(?:\/(validate|run|audit|versions|publish|rollback|draft))?$/);
  if (workflowDetail && workflowDetail[1] !== 'generate' && workflowDetail[1] !== 'generations') {
    const action = workflowDetail[2];
    if (!action && method === 'GET') return mockWorkflowControl.draft;
    if (action === 'draft' && method === 'PUT') {
      const body = (opts.body ?? {}) as Record<string, any>;
      mockWorkflowControl.draft = { ...mockWorkflowControl.draft, ...body };
      const revision = body.version ? workflowGenerationRevisions.get(String(body.version)) : undefined;
      if (revision) {
        revision.nodes = JSON.parse(JSON.stringify(body.nodes ?? revision.nodes));
        revision.edges = JSON.parse(JSON.stringify(body.edges ?? revision.edges));
      }
      workflowAudit('WORKFLOW_SAVE', `${workflowDetail[1]}:${body.version ?? 'current-draft'}`);
      return mockWorkflowControl.draft;
    }
    if (action === 'validate' && method === 'POST') {
      const body = (opts.body ?? {}) as Record<string, any>;
      const revision = body.revisionId ? workflowGenerationRevisions.get(String(body.revisionId)) : undefined;
      if (body.revisionId && !revision) throw new Error('工作流修订版本不存在或无权访问');
      const draft = revision ?? mockWorkflowControl.draft;
      const nodeKinds = (draft.nodes ?? []).map((node: any) => node.kind ?? node.data?.kind);
      const hasExternalWrite = nodeKinds.some((kind: string) => ['execute', 'http', 'mcp'].includes(kind));
      const checks = {
        structure: draft.nodes?.length > 0 && draft.nodes.some((n: any) => ['trigger', 'schedule', 'event'].includes(n.kind)) ? 'passed' : 'failed',
        connections: draft.nodes?.every((n: any) => draft.nodes.length <= 1 || draft.edges?.some((e: any) => e.source === n.id || e.target === n.id)) ? 'passed' : 'failed',
        dependencies: hasExternalWrite ? 'review' : 'passed',
        permissions: hasExternalWrite ? 'review' : 'passed',
        risk: hasExternalWrite ? 'review' : 'passed',
        approval: !hasExternalWrite || nodeKinds.includes('approval') ? 'passed' : 'review',
        audit: nodeKinds.includes('audit') ? 'passed' : 'review',
        rollback: !hasExternalWrite || nodeKinds.includes('compensate') ? 'passed' : 'review',
      };
      const passed = Object.values(checks).every((value) => value === 'passed');
      workflowAudit('WORKFLOW_VALIDATE', workflowDetail[1], passed ? 'success' : 'failed');
      return { passed, revisionId: revision?.id ?? body.revisionId ?? null, checks, warnings: passed ? [] : ['存在依赖、权限或治理项需要人工确认'] };
    }
    if (action === 'run' && method === 'POST') {
      const body = (opts.body ?? {}) as Record<string, any>;
      const revision = body.version ? workflowGenerationRevisions.get(String(body.version)) : undefined;
      const runnableDraft = revision ?? mockWorkflowControl.draft;
      const nodeKinds = (runnableDraft.nodes ?? []).map((node: any) => node.kind ?? node.data?.kind);
      const hasExternalWrite = nodeKinds.some((kind: string) => ['execute', 'http', 'mcp'].includes(kind));
      const hasGovernance = nodeKinds.includes('policy') && nodeKinds.includes('approval') && nodeKinds.includes('audit') && nodeKinds.includes('compensate');
      if (!nodeKinds.some((kind: string) => ['trigger', 'schedule', 'event'].includes(kind))) throw new Error('工作流缺少触发节点，无法试运行');
      if (hasExternalWrite && !hasGovernance) throw new Error('高风险动作缺少策略、审批、审计或补偿回滚，禁止试运行');
      if (hasExternalWrite) throw new Error('外部执行节点的依赖与权限尚未完成服务端授权，禁止试运行');
      const run = { id: mockId('run'), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), trigger: mockWorkflowControl.draft.name ?? '工作流', status: 'running', duration: 0, steps: runnableDraft.nodes?.length ?? 0, who: '当前用户', revisionId: revision?.id };
      mockWorkflowControl.runs.unshift(run);
      workflowAudit('WORKFLOW_RUN', `${workflowDetail[1]}:${revision?.id ?? 'current-draft'}`);
      return run;
    }
    if (action === 'versions' && method === 'GET') return mockWorkflowControl.versions;
    if (action === 'publish' && method === 'POST') {
      const nodeKinds = (mockWorkflowControl.draft.nodes ?? []).map((node: any) => node.kind ?? node.data?.kind);
      const hasExternalWrite = nodeKinds.some((kind: string) => ['execute', 'http', 'mcp'].includes(kind));
      const hasGovernance = nodeKinds.includes('policy') && nodeKinds.includes('approval') && nodeKinds.includes('audit') && nodeKinds.includes('compensate');
      if (hasExternalWrite && !hasGovernance) throw new Error('高风险工作流缺少治理节点，禁止发布');
      if (hasExternalWrite) throw new Error('外部执行节点尚未完成依赖与权限授权，禁止发布');
      workflowAudit('WORKFLOW_PUBLISH', workflowDetail[1]); return { ...mockWorkflowControl.draft, status: 'published' };
    }
    if (action === 'rollback' && method === 'POST') { workflowAudit('WORKFLOW_ROLLBACK', workflowDetail[1]); return mockWorkflowControl.draft; }
    if (action === 'audit' && method === 'GET') return mockWorkflowControl.audits;
  }
  const workflowRunAction = path.match(/^\/api\/workflows\/([^/]+)\/runs\/([^/]+)\/(retry|resume)$/);
  if (workflowRunAction && method === 'POST') {
    const run = mockWorkflowControl.runs.find((item) => item.id === workflowRunAction[2]);
    if (!run) return null;
    run.status = 'running';
    workflowAudit(`WORKFLOW_RUN_${workflowRunAction[3].toUpperCase()}`, workflowRunAction[2]);
    return run;
  }
  if (path.match(/^\/api\/workflows\/[^/]+\/runs$/) && method === 'GET') return mockWorkflowControl.runs;

  // 知识运营工作台：所有写操作回写到同一份 mock 领域状态，便于前端验证完整交互链路。
  if (path === '/api/knowledge/docs' && method === 'GET') return mockKnowledgeDocs;
  if (path === '/api/knowledge/docs' && method === 'POST') {
    const body = (opts.body ?? {}) as { title?: string; source?: string; tags?: string };
    if (!body.title?.trim()) throw new Error('文档标题不能为空');
    const doc: KnowledgeDoc = { id: mockId('knowledge_doc'), title: body.title.trim(), source: body.source ?? 'Runbook', sizeKb: 0, chunks: 0, citeCount: 0, status: 'parsing', updatedAt: new Date().toISOString() };
    mockKnowledgeDocs.unshift(doc);
    appendKnowledgeAudit('上传知识文档', doc.title);
    setTimeout(() => { doc.status = 'ready'; doc.sizeKb = 64; doc.chunks = 42; doc.updatedAt = new Date().toISOString(); appendKnowledgeAudit('文档解析与索引完成', doc.title); }, 1000);
    return doc;
  }
  if (path === '/api/knowledge/docs/review' && method === 'POST') {
    const body = (opts.body ?? {}) as { ids?: string[] };
    const ids = body.ids ?? [];
    if (!ids.length) throw new Error('请至少选择一项知识资产');
    appendKnowledgeAudit('发起知识复核', `${ids.length} 项资产`);
    return { ids, status: 'review_requested' };
  }
  const knowledgeDetailPath = path.match(/^\/api\/knowledge\/doc\/([^/]+)$/);
  if (knowledgeDetailPath && method === 'GET') {
    const doc = mockKnowledgeDocs.find((item) => item.id === knowledgeDetailPath[1]);
    if (!doc) throw new Error('知识文档不存在');
    return knowledgeDocDetail(doc);
  }
  if (path === '/api/knowledge/kb-list' && method === 'GET') return mockKbList;
  if (path === '/api/knowledge/kb-list' && method === 'POST') {
    const body = (opts.body ?? {}) as { key?: string; label?: string; source?: string; embedding?: string };
    if (!body.label?.trim()) throw new Error('知识库名称不能为空');
    const item = { key: body.key ?? mockId('kb'), label: body.label.trim(), source: body.source ?? 'Runbook', count: 0, embedding: body.embedding ?? 'BGE-M3' };
    mockKbList.push(item);
    appendKnowledgeAudit('创建知识库', item.label);
    return item;
  }
  if (path === '/api/knowledge/reindex' && method === 'POST') {
    const body = (opts.body ?? {}) as { kb?: string };
    const affected = mockKnowledgeDocs.filter((doc) => doc.status !== 'failed');
    affected.forEach((doc) => { doc.status = 'indexing'; });
    appendKnowledgeAudit('启动索引重建', body.kb ?? '当前知识库');
    setTimeout(() => { affected.forEach((doc) => { doc.status = 'ready'; doc.updatedAt = new Date().toISOString(); }); appendKnowledgeAudit('索引重建完成', body.kb ?? '当前知识库'); }, 1200);
    return { status: 'indexing', affected: affected.length };
  }
  if (path === '/api/knowledge/search-history' && method === 'GET') return mockSearchHistory;
  if (path === '/api/knowledge/citation-trace' && method === 'GET') return mockCitationTrace;
  if (path === '/api/knowledge/eval' && method === 'GET') return mockEvalMetrics;
  if (path === '/api/knowledge/chunks/top' && method === 'GET') return mockKnowledgeChunks;
  if (path === '/api/knowledge/retrieve' && method === 'POST') {
    const body = (opts.body ?? {}) as { query?: string; kb?: string };
    if (!body.query?.trim()) throw new Error('请输入检索问题');
    const query = body.query.trim();
    const normalized = query.toLowerCase();
    const results = mockKnowledgeChunks.filter((chunk) => `${chunk.source} ${chunk.text}`.toLowerCase().includes(normalized) || normalized.split(/\s+/).some((token) => token.length > 1 && `${chunk.source} ${chunk.text}`.toLowerCase().includes(token))).slice(0, 5);
    const resolved = (results.length ? results : mockKnowledgeChunks.slice(0, 4)).map((chunk, index) => ({ ...chunk, idx: index + 1, score: Math.min(.99, chunk.score + .01) }));
    mockSearchHistory.unshift({ id: mockId('search'), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), query, kb: body.kb ?? 'Runbook', results: resolved.length, topScore: resolved[0]?.score ?? 0 });
    appendKnowledgeAudit('执行检索验证', query);
    return { results: resolved, metrics: mockEvalMetrics };
  }
  if (path === '/api/knowledge/chunks/rescore' && method === 'POST') {
    mockKnowledgeChunks.sort((a, b) => b.score - a.score).forEach((chunk, index) => { chunk.idx = index + 1; chunk.score = Math.min(.99, Math.max(.35, chunk.score + ((index % 2 ? -1 : 1) * .01))); });
    appendKnowledgeAudit('重新评估检索证据', 'Top-K Chunks');
    return mockKnowledgeChunks;
  }
  if (path === '/api/knowledge/sources' && method === 'GET') return mockKnowledgeSources;
  if (path === '/api/knowledge/sources' && method === 'POST') {
    const body = (opts.body ?? {}) as Partial<KnowledgeSourceConnection>;
    if (!body.name?.trim()) throw new Error('数据源名称不能为空');
    const source: KnowledgeSourceConnection = { id: mockId('knowledge_source'), name: body.name.trim(), kind: body.kind ?? 'REST API', schedule: body.schedule ?? '每 1 小时', lastSync: '尚未同步', documents: 0, status: 'attention' };
    mockKnowledgeSources.unshift(source);
    appendKnowledgeAudit('接入知识数据源', source.name);
    return source;
  }
  const knowledgeSourceSync = path.match(/^\/api\/knowledge\/sources\/([^/]+)\/sync$/);
  if (knowledgeSourceSync && method === 'POST') {
    const source = mockKnowledgeSources.find((item) => item.id === knowledgeSourceSync[1]);
    if (!source) throw new Error('数据源不存在');
    source.status = 'healthy'; source.lastSync = '刚刚';
    appendKnowledgeAudit('执行数据源同步', source.name);
    return source;
  }
  if (path === '/api/knowledge/governance' && method === 'GET') return mockKnowledgeGovernance;
  if (path === '/api/knowledge/governance' && method === 'PATCH') {
    const body = (opts.body ?? {}) as Partial<KnowledgeGovernancePolicy>;
    Object.assign(mockKnowledgeGovernance, body);
    appendKnowledgeAudit('更新知识治理策略', '知识运营工作台');
    return mockKnowledgeGovernance;
  }
  if (path === '/api/knowledge/audit' && method === 'GET') return mockKnowledgeAudit;

  // 知识包、加工、评测、图谱与消费者绑定：所有运行时绑定必须锁定已发布版本。
  if (path === '/api/knowledge/packages' && method === 'GET') return mockKnowledgePackages;
  if (path === '/api/knowledge/packages' && method === 'POST') {
    const body = (opts.body ?? {}) as Partial<KnowledgePackage>;
    if (!body.name?.trim()) throw new Error('知识包名称不能为空');
    const version = { id: mockId('knowledge_package_version'), version: 'v0.1', status: 'draft' as const, indexVersion: `idx-${Date.now()}`, qualityScore: 0, changeSummary: '首次创建，等待加工与评测' };
    const item: KnowledgePackage = { id: mockId('knowledge_package'), name: body.name.trim(), description: body.description?.trim() ?? '待补充知识包说明', domain: body.domain?.trim() ?? '通用', classification: body.classification ?? 'internal', owner: '当前用户', status: 'draft', documentCount: 0, consumers: 0, currentVersion: version, versions: [version] };
    mockKnowledgePackages.unshift(item);
    appendKnowledgeAudit('创建知识包', item.name);
    return item;
  }
  const knowledgePackagePublish = path.match(/^\/api\/knowledge\/packages\/([^/]+)\/publish$/);
  if (knowledgePackagePublish && method === 'POST') {
    const item = mockKnowledgePackages.find((record) => record.id === knowledgePackagePublish[1]);
    if (!item) throw new Error('知识包不存在');
    const latestEvaluation = mockKnowledgeEvaluations.find((evaluation) => evaluation.packageId === item.id && evaluation.evaluatedVersion === item.currentVersion.version);
    if (item.documentCount === 0) throw new Error('E_KNOWLEDGE_PACKAGE_EMPTY');
    if (latestEvaluation?.status === 'failed') throw new Error('E_KNOWLEDGE_EVALUATION_FAILED');
    const published = { ...item.currentVersion, status: 'published' as const, publishedAt: new Date().toISOString(), qualityScore: latestEvaluation ? Math.round(latestEvaluation.ndcg * 100) : item.currentVersion.qualityScore || 90, changeSummary: item.currentVersion.changeSummary || '已通过发布检查' };
    item.currentVersion = published; item.status = 'published'; item.versions = item.versions.map((version) => version.id === published.id ? published : version);
    appendKnowledgeAudit('发布知识包版本', `${item.name} · ${published.version}`);
    return item;
  }
  const knowledgePackageProcess = path.match(/^\/api\/knowledge\/packages\/([^/]+)\/process$/);
  if (knowledgePackageProcess && method === 'POST') {
    const item = mockKnowledgePackages.find((record) => record.id === knowledgePackageProcess[1]);
    if (!item) throw new Error('知识包不存在');
    const body = (opts.body ?? {}) as { strategy?: KnowledgeProcessingJob['strategy'] };
    const job: KnowledgeProcessingJob = { id: mockId('knowledge_job'), packageId: item.id, source: item.name, strategy: body.strategy ?? 'structured', status: 'running', documentCount: Math.max(item.documentCount, 8), chunkCount: 0, indexVersion: `idx-${Date.now()}`, startedAt: new Date().toISOString() };
    mockKnowledgeProcessingJobs.unshift(job);
    appendKnowledgeAudit('启动知识加工', `${item.name} · ${job.strategy}`);
    return job;
  }
  const knowledgeJobRetry = path.match(/^\/api\/knowledge\/processing-jobs\/([^/]+)\/retry$/);
  if (knowledgeJobRetry && method === 'POST') {
    const job = mockKnowledgeProcessingJobs.find((record) => record.id === knowledgeJobRetry[1]);
    if (!job) throw new Error('知识加工任务不存在');
    job.status = 'running'; job.error = undefined; job.startedAt = new Date().toISOString();
    appendKnowledgeAudit('重试知识加工', job.source);
    return job;
  }
  if (path === '/api/knowledge/processing-jobs' && method === 'GET') return mockKnowledgeProcessingJobs;
  if (path === '/api/knowledge/retrieval-profiles' && method === 'GET') return mockKnowledgeProfiles;
  if (path === '/api/knowledge/evaluations' && method === 'GET') return mockKnowledgeEvaluations;
  if (path === '/api/knowledge/evaluations/run' && method === 'POST') {
    const body = (opts.body ?? {}) as { packageId?: string; profileId?: string };
    const item = mockKnowledgePackages.find((record) => record.id === body.packageId);
    const profile = mockKnowledgeProfiles.find((record) => record.id === body.profileId) ?? mockKnowledgeProfiles.find((record) => record.packageId === body.packageId);
    if (!item || !profile) throw new Error('请选择知识包和检索配置');
    const evaluation: KnowledgeEvaluation = { id: mockId('knowledge_evaluation'), packageId: item.id, profileId: profile.id, baselineVersion: item.currentVersion.version, evaluatedVersion: item.currentVersion.version, recallAtK: .93, mrr: .88, ndcg: .90, citationAccuracy: .96, p95LatencyMs: 352, status: 'passed', evaluatedAt: new Date().toISOString() };
    mockKnowledgeEvaluations.unshift(evaluation);
    appendKnowledgeAudit('执行检索评测', `${item.name} · ${profile.name}`);
    return evaluation;
  }
  if (path === '/api/knowledge/graph/entities' && method === 'GET') return mockKnowledgeGraphEntities;
  if (path === '/api/knowledge/graph/relations' && method === 'GET') return mockKnowledgeGraphRelations;
  if (path === '/api/knowledge/bindings' && method === 'GET') return mockKnowledgeBindings;
  if (path === '/api/knowledge/bindings' && method === 'POST') {
    const body = (opts.body ?? {}) as Partial<KnowledgeConsumerBinding>;
    const item = mockKnowledgePackages.find((record) => record.id === body.packageId);
    if (!item || item.status !== 'published' || item.currentVersion.status !== 'published') throw new Error('E_KNOWLEDGE_VERSION_NOT_PUBLISHED');
    if (!body.consumerId?.trim() || !body.consumerName?.trim() || !body.consumerType) throw new Error('引用方信息不完整');
    const profile = mockKnowledgeProfiles.find((record) => record.id === body.profileId && record.packageId === item.id) ?? mockKnowledgeProfiles.find((record) => record.packageId === item.id);
    if (!profile) throw new Error('知识包缺少可用检索配置');
    const binding: KnowledgeConsumerBinding = { id: mockId('knowledge_binding'), packageId: item.id, packageName: item.name, packageVersion: body.packageVersion ?? item.currentVersion.version, consumerType: body.consumerType, consumerId: body.consumerId, consumerName: body.consumerName, environment: body.environment ?? 'sandbox', profileId: profile.id, noResultPolicy: body.noResultPolicy ?? profile.noResultPolicy };
    mockKnowledgeBindings.unshift(binding); item.consumers += 1;
    appendKnowledgeAudit('绑定知识包引用', `${binding.consumerName} → ${item.name} ${binding.packageVersion}`);
    return binding;
  }

  // 技能：安装、运行、配置和权限统一写回同一个 Mock 领域，并产生日志。
  if (path === '/api/skills/governance/overview' && method === 'GET') {
    const calls = mockSkillRuntimeHealth.reduce((total, item) => total + item.calls24h, 0);
    const weightedSuccess = mockSkillRuntimeHealth.reduce((total, item) => total + item.calls24h * item.successRate, 0) / calls;
    return { calls24h: calls, successRate: Number(weightedSuccess.toFixed(2)), p95Ms: 220, abnormalSkills: mockSkillRuntimeHealth.filter((item) => item.status === 'attention' || item.status === 'incident').length, pendingActions: mockSkillGovernanceIncidents.filter((item) => item.status === 'open').length };
  }
  if (path === '/api/skills/governance/health' && method === 'GET') return mockSkillRuntimeHealth;
  if (path === '/api/skills/governance/incidents' && method === 'GET') return mockSkillGovernanceIncidents;
  if (path === '/api/skills/governance/events' && method === 'GET') return mockSkillGovernanceEvents;
  if (path === '/api/skills/governance/trends' && method === 'GET') return [{ time: '00:00', calls: 820, errorRate: .4, p95: 120 }, { time: '04:00', calls: 620, errorRate: .3, p95: 100 }, { time: '08:00', calls: 1480, errorRate: .8, p95: 180 }, { time: '12:00', calls: 2260, errorRate: 2.1, p95: 360 }, { time: '16:00', calls: 1880, errorRate: 1.2, p95: 240 }, { time: '20:00', calls: 1320, errorRate: .5, p95: 140 }];
  const governanceSkillAction = path.match(/^\/api\/skills\/([^/]+)\/(revalidate|isolate)$/);
  if (governanceSkillAction && method === 'POST') {
    const health = mockSkillRuntimeHealth.find((item) => item.skillId === governanceSkillAction[1]);
    if (!health) throw new Error('运行健康记录不存在');
    if (governanceSkillAction[2] === 'revalidate') { health.status = 'healthy'; health.errorRate = Math.min(health.errorRate, .2); health.successRate = Math.max(health.successRate, 99.8); health.updatedAt = '刚刚'; mockSkillGovernanceEvents.unshift({ id: mockId('gov_event'), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), skillName: health.name, type: 'call', action: '重新验证通过', actor: '当前用户', result: 'success' }); return health; }
    health.status = 'quarantined'; health.updatedAt = '刚刚'; mockSkillGovernanceEvents.unshift({ id: mockId('gov_event'), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), skillName: health.name, type: 'lifecycle', action: '隔离能力', actor: '当前用户', result: 'success' }); return health;
  }
  if (path === '/api/skills/governance/batch' && method === 'POST') { const body = (opts.body ?? {}) as { skillIds?: string[]; action?: 'revalidate' | 'pause' }; const affected = mockSkillRuntimeHealth.filter((item) => body.skillIds?.includes(item.skillId)); affected.forEach((item) => { item.status = body.action === 'pause' ? 'paused' : 'healthy'; item.updatedAt = '刚刚'; }); appendControlPlaneAudit('skill', body.action === 'pause' ? '批量暂停技能' : '批量重新验证技能', `${affected.length} 项`); return affected; }
  if (path === '/api/skill-integrations' && method === 'GET') return mockSkillIntegrations;
  const integrationAction = path.match(/^\/api\/skill-integrations\/([^/]+)\/(test|discover|lifecycle)$/);
  if (integrationAction) {
    const integration = mockSkillIntegrations.find((item) => item.id === integrationAction[1]);
    if (!integration) throw new Error('接入任务不存在');
    const body = (opts.body ?? {}) as Partial<SkillIntegration>;
    if (integrationAction[2] === 'test' && method === 'POST') { integration.lastVerifiedAt = '刚刚'; integration.health = integration.status === 'failed' ? 'attention' : 'healthy'; appendControlPlaneAudit('skill', '执行接入连通性验证', integration.name, integration.health === 'healthy' ? 'success' : 'failed'); return integration; }
    if (integrationAction[2] === 'discover' && method === 'POST') { if (integration.status === 'failed') throw new Error(integration.lastError ?? '接入验证未通过'); integration.discoveredCapabilities = integration.discoveredCapabilities || (integration.type === 'mcp' ? 12 : integration.type === 'tool' ? 6 : 1); integration.status = integration.writeApprovalRequired && integration.environment === 'production' ? 'pending_approval' : 'enabled'; appendControlPlaneAudit('skill', '发现接入能力', integration.name); return integration; }
    if (integrationAction[2] === 'lifecycle' && method === 'PATCH') { Object.assign(integration, body); appendControlPlaneAudit('skill', '更新接入任务状态', `${integration.name}:${integration.status}`); return integration; }
  }
  if (path === '/api/skills' && method === 'GET') return mockSkills.map(skillAsset);
  if (path === '/api/skills/catalog' && method === 'GET') return mockSkillCatalog;
  if (path === '/api/skills/audit' && method === 'GET') return skillAuditEvents();
  if (path === '/api/mcp-connections' && method === 'POST') {
    const body = (opts.body ?? {}) as { name?: string; endpoint?: string; authMode?: string };
    if (!body.name?.trim() || !/^https:\/\//.test(body.endpoint ?? '')) throw new Error('MCP 名称和 HTTPS 服务地址不能为空');
    const skill: Skill = { id: mockId('mcp'), name: body.name.trim(), kind: 'mcp', description: `MCP · ${body.endpoint}`, version: '1.0.0', status: 'installed', rating: 0, installCount: 0, riskLevel: 'mid', cacheable: false };
    mockSkills.unshift(skill); mockSkillPermissions[skill.id] = mockSkillPerms.map((item) => ({ ...item, skillId: skill.id })); mockSkillIntegrations.unshift({ id: mockId('integration'), name: skill.name, type: 'mcp', environment: 'test', status: 'validating', owner: '当前用户', endpoint: body.endpoint!, credentialRef: `vault://integrations/${skill.id}/oauth`, lastVerifiedAt: '刚刚', health: 'unknown', discoveredCapabilities: 0, writeApprovalRequired: true, allowedEgress: [new URL(body.endpoint!).host] }); appendControlPlaneAudit('skill', '配置 MCP 并预检', `${skill.name}:${body.authMode ?? 'OAuth'}`); return skill;
  }
  if (path === '/api/tools' && method === 'POST') {
    const body = (opts.body ?? {}) as { name?: string; endpoint?: string; schema?: string };
    if (!body.name?.trim() || !/^https:\/\//.test(body.endpoint ?? '') || !body.schema?.trim()) throw new Error('Tool 名称、HTTPS 地址和 Schema 不能为空');
    let schema: any;
    try { schema = JSON.parse(body.schema); } catch { throw new Error('Tool Schema 必须是有效的 JSON 文件或 JSON 文本'); }
    const isOpenApi = typeof schema?.openapi === 'string' && typeof schema?.info === 'object' && typeof schema?.paths === 'object';
    const isJsonSchema = typeof schema?.$schema === 'string' && (typeof schema?.type === 'string' || typeof schema?.properties === 'object');
    if (!isOpenApi && !isJsonSchema) throw new Error('仅支持标准 OpenAPI 3.x 或 JSON Schema Draft 文档');
    const skill: Skill = { id: mockId('tool'), name: body.name.trim(), kind: 'tool', description: `Tool · ${body.endpoint}`, version: '1.0.0', status: 'installed', rating: 0, installCount: 0, riskLevel: 'mid', cacheable: false };
    mockSkills.unshift(skill); mockSkillPermissions[skill.id] = mockSkillPerms.map((item) => ({ ...item, skillId: skill.id })); mockSkillIntegrations.unshift({ id: mockId('integration'), name: skill.name, type: 'tool', environment: 'test', status: 'validating', owner: '当前用户', endpoint: body.endpoint!, credentialRef: `vault://integrations/${skill.id}/service-account`, lastVerifiedAt: '刚刚', health: 'unknown', discoveredCapabilities: 0, writeApprovalRequired: true, allowedEgress: [new URL(body.endpoint!).host] }); appendControlPlaneAudit('skill', '配置 Tool 并预检', skill.name); return skill;
  }
  if (path === '/api/skills' && method === 'POST') {
    const body = (opts.body ?? {}) as Partial<Skill>;
    if (!body.name?.trim() || !body.description?.trim()) throw new Error('技能名称和说明不能为空');
    const riskLevel = body.riskLevel ?? 'mid';
    const skill: Skill = { id: mockId('skill'), name: body.name.trim(), kind: body.kind ?? 'skill', description: body.description.trim(), version: body.version ?? '0.1.0', status: riskLevel === 'high' ? 'beta' : 'installed', rating: 0, installCount: 0, riskLevel, cacheable: Boolean(body.cacheable) };
    mockSkills.unshift(skill);
    mockSkillPermissions[skill.id] = mockSkillPerms.map((item) => ({ ...item, skillId: skill.id }));
    appendControlPlaneAudit('skill', '创建技能', skill.name); return skill;
  }
  if (path === '/api/skills/import' && method === 'POST') {
    const body = (opts.body ?? {}) as { items?: Array<Partial<Skill>> };
    const items = (body.items ?? []).filter((item) => item.name?.trim()).map((item) => {
      const riskLevel = item.riskLevel ?? 'mid';
      const skill: Skill = { id: mockId('skill'), name: item.name!.trim(), kind: item.kind ?? 'skill', description: item.description ?? `导入技能 · ${item.name}`, version: item.version ?? '0.1.0', status: riskLevel === 'high' ? 'beta' : 'installed', rating: 0, installCount: 0, riskLevel, cacheable: Boolean(item.cacheable) };
      mockSkills.unshift(skill);
      mockSkillPermissions[skill.id] = mockSkillPerms.map((permission) => ({ ...permission, skillId: skill.id }));
      mockSkillIntegrations.unshift({ id: mockId('integration'), name: skill.name, type: 'skill', environment: 'test', status: 'validating', owner: '当前用户', endpoint: `registry://import/${skill.name}:${skill.version}`, credentialRef: 'vault://registries/import-reader', lastVerifiedAt: '刚刚', health: 'unknown', discoveredCapabilities: 0, writeApprovalRequired: riskLevel === 'high', allowedEgress: ['registry.internal.example.com'] });
      return skill;
    });
    if (!items.length) throw new Error('未识别到可导入的技能');
    appendControlPlaneAudit('skill', '批量导入技能', `${items.length} 项`); return items;
  }
  const skillAction = path.match(/^\/api\/skills\/([^/]+)\/(install|uninstall|upgrade|test|runtime|permissions|impact|preflight|lifecycle|governance|upgrade-plan)$/);
  if (skillAction) {
    const [, id, action] = skillAction;
    const body = (opts.body ?? {}) as any;
    let skill = mockSkills.find((item) => item.id === id);
    const catalogSkill = mockSkillCatalog.find((item) => item.id === id);
    if (action === 'preflight' && method === 'POST') {
      const candidate = skill ?? catalogSkill;
      if (!candidate) throw new Error('技能或市场制品不存在');
      const missingDependency = (catalogSkill?.dependencies ?? []).filter((dependency) => dependency === 'jenkins-mcp').map((name) => ({ name, status: 'missing' as const }));
      const requiresApproval = candidate.riskLevel === 'high';
      const result: SkillInstallPreflight = { skillId: id, trustedPublisher: catalogSkill?.publisher === '企业能力市场' || !catalogSkill, signatureValid: catalogSkill?.signed ?? true, dependencies: missingDependency, requiresApproval, decision: missingDependency.length ? 'blocked' : requiresApproval ? 'review_required' : 'approved', reason: missingDependency.length ? '缺少受控 Jenkins 连接器，禁止安装' : requiresApproval ? '高风险能力需要安全负责人审批' : undefined };
      appendControlPlaneAudit('skill', '安装预检', candidate.name, result.decision === 'blocked' ? 'failed' : 'success');
      return result;
    }
    if (action === 'install' && method === 'POST') {
      if (skill) return skill;
      const candidate = catalogSkill ?? body;
      if (candidate.riskLevel === 'high' && !body.approvalTicket) throw new Error('E_APPROVAL_REQUIRED: 高风险技能安装需要安全负责人审批');
      if ((catalogSkill?.dependencies ?? []).includes('jenkins-mcp')) throw new Error('E_DEPENDENCY_BLOCKED: 缺少受控 Jenkins 连接器');
      const installedSkill: Skill = { id: mockId('skill'), name: candidate.name ?? '未命名技能', kind: candidate.kind ?? 'skill', description: candidate.description ?? '', version: candidate.version ?? '0.1.0', status: 'installed', rating: candidate.rating ?? 0, installCount: candidate.installCount ?? 0, riskLevel: candidate.riskLevel ?? 'mid', cacheable: Boolean(candidate.cacheable) };
      mockSkills.unshift(installedSkill);
      mockSkillPermissions[installedSkill.id] = mockSkillPerms.map((permission) => ({ ...permission, skillId: installedSkill.id }));
      appendControlPlaneAudit('skill', '安装技能', installedSkill.name); return installedSkill;
    }
    if (!skill) throw new Error('技能不存在');
    skill = skillAsset(skill);
    const impact = mockSkillImpacts[id] ?? { skillId: id, agents: [], workflows: [], activeRuns: 0, uninstallAllowed: true };
    if (action === 'impact' && method === 'GET') return impact;
    if (action === 'uninstall' && method === 'POST') {
      if (!impact.uninstallAllowed && !body.force) throw new Error(`E_SKILL_IN_USE: ${impact.reason}`);
      if (!impact.uninstallAllowed && !body.approvalTicket) throw new Error('E_APPROVAL_REQUIRED: 强制卸载必须提供审批单号');
      mockSkills.splice(mockSkills.indexOf(skill), 1); delete mockSkillPermissions[id]; delete mockSkillRuntime[id]; appendControlPlaneAudit('skill', body.force ? '强制卸载技能' : '卸载技能', skill.name); return { id, status: 'uninstalled', impact };
    }
    if (action === 'lifecycle' && method === 'PATCH') { const next = body.lifecycleStatus; if (!['enabled', 'disabled', 'pending_approval', 'quarantined', 'deprecated'].includes(next)) throw new Error('不支持的技能生命周期状态'); skill.lifecycleStatus = next; Object.assign(mockSkills.find((item) => item.id === id)!, skill); appendControlPlaneAudit('skill', `更新技能状态为 ${next}`, skill.name); return skill; }
    if (action === 'governance' && method === 'GET') return skillGovernance(id);
    if (action === 'governance' && method === 'PATCH') { const policy = Object.assign(skillGovernance(id), body); appendControlPlaneAudit('skill', '更新运行治理策略', skill.name); return policy; }
    if (action === 'upgrade-plan' && method === 'POST') return { skillId: id, currentVersion: skill.version, targetVersion: body.targetVersion ?? skill.upgradeVersion ?? `${skill.version}-next`, checks: [{ label: '签名与供应链校验', status: 'passed' }, { label: '权限差异分析', status: skill.riskLevel === 'high' ? 'review' : 'passed' }, { label: '引用版本影响', status: impact.agents.length + impact.workflows.length ? 'review' : 'passed' }], impacted: impact, rollbackVersion: skill.version, approvalRequired: skill.riskLevel === 'high' || impact.agents.length + impact.workflows.length > 0 };
    if (action === 'upgrade' && method === 'POST') { const targetVersion = body.targetVersion ?? skill.upgradeVersion; if (!targetVersion) { const parts = skill.version.split('.').map(Number); skill.version = `${parts[0]}.${(parts[1] ?? 0) + 1}.${parts[2] ?? 0}`; } else skill.version = targetVersion; skill.hasUpdate = false; skill.upgradeVersion = undefined; Object.assign(mockSkills.find((item) => item.id === id)!, skill); appendControlPlaneAudit('skill', '升级技能', skill.name); return skill; }
    if (action === 'test' && method === 'POST') { const command = String(body.command ?? '').trim(); if (!command) throw new Error('请输入测试命令'); const blocked = /\b(rm\s+-rf|drop\s+database|force\s*push|--hard)\b/i.test(command); appendControlPlaneAudit('skill', blocked ? '策略拦截测试命令' : '执行沙箱测试', skill.name, blocked ? 'failed' : 'success'); return { command, status: blocked ? 'blocked' : 'success', output: blocked ? '⛔ 拒绝执行：高危命令已被策略拦截。' : `+OK\n${skill.name} v${skill.version} 已在受控沙箱中完成测试`, durationMs: blocked ? 5 : 80 }; }
    if (action === 'runtime' && method === 'GET') return mockSkillRuntime[id] ?? { cacheable: skill.cacheable, timeout: '30', retries: '1' };
    if (action === 'runtime' && method === 'PATCH') { mockSkillRuntime[id] = { ...(mockSkillRuntime[id] ?? { cacheable: skill.cacheable, timeout: '30', retries: '1' }), ...body }; appendControlPlaneAudit('skill', '更新运行配置', skill.name); return mockSkillRuntime[id]; }
    if (action === 'permissions' && method === 'GET') return mockSkillPermissions[id] ?? [];
    if (action === 'permissions' && method === 'PATCH') { const role = mockSkillPermissions[id]?.find((item) => item.role === body.role); if (!role) throw new Error('角色不存在'); Object.assign(role, { canCall: Boolean(body.canCall), canConfig: Boolean(body.canConfig) }); appendControlPlaneAudit('skill', '更新调用权限', `${skill.name}:${role.role}`); return role; }
  }
  if (path.startsWith('/api/skills/') && path.endsWith('/trace')) {
    const id = path.split('/')[3];
    return mockSkillExecTrace[id as keyof typeof mockSkillExecTrace] ?? null;
  }
  if (path.startsWith('/api/skills/') && path.endsWith('/versions')) {
    const id = path.split('/')[3];
    return mockSkillVersions[id as keyof typeof mockSkillVersions] ?? [];
  }
  if (path === '/api/skills/perms') return mockSkillPerms;

  // 模型控制面：以领域状态为唯一事实源。旧 P9 路径保留给历史页面，新增路径用于受控治理。
  if (path === '/api/model-providers' && method === 'GET') { const context = requireModelRead(opts); return modelProviders.filter((provider) => provider.workspaceId === context.workspaceId).map((provider) => ({ ...provider, models: provider.models.map((model) => ({ ...model })) })); }
  if (path === '/api/model-providers' && method === 'POST') {
    const body = (opts.body ?? {}) as any;
    const context = requireModelWrite(opts, body.workspaceId ?? 'w1');
    if (!body.name?.trim() || !body.model?.trim() || !body.credential?.trim()) {
      appendModelAudit(opts, '接入 Provider', body.name ?? '未命名 Provider', 'failed', { reason: '名称、模型和凭据引用必填' });
      throw new Error('E_PROVIDER_INVALID: Provider 名称、模型和凭据不能为空');
    }
    const providerId = mockId('model_provider');
    const model: ModelProfile = { id: mockId('model'), providerId, name: body.model.trim(), cloudRegion: body.region ?? 'global', dataResidency: String(body.region ?? '').startsWith('cn-') ? 'cn' : 'global', capabilities: ['chat'], status: 'available', contextWindow: 32_000 };
    const provider: ModelProvider = { id: providerId, workspaceId: context.workspaceId, name: body.name.trim(), tier: body.tier ?? 'connectable', cloudRegion: model.cloudRegion, dataResidency: model.dataResidency, status: 'standby', credentialRef: `vault://model-providers/${providerId}/credential`, credentialMasked: '••••••••', models: [model] };
    modelProfiles.push(model);
    modelProviders.unshift(provider);
    appendModelAudit(opts, '接入 Provider', provider.name, 'success', { reason: body.reason });
    return provider;
  }
  const modelProviderAction = path.match(/^\/api\/model-providers\/([^/]+)(?:\/(impact|test|disable))?$/);
  if (modelProviderAction) {
    const [, providerId, action] = modelProviderAction;
    const provider = modelProviders.find((item) => item.id === providerId);
    if (!provider) throw new Error('E_PROVIDER_NOT_FOUND: Provider 不存在');
    if (method === 'GET' && action === 'impact') { const context = requireModelRead(opts); if (provider.workspaceId !== context.workspaceId) throw new Error('E_WORKSPACE_SCOPE: 无权读取其他工作区模型资源'); return providerImpact(provider.id); }
    const body = (opts.body ?? {}) as any;
    requireModelWrite(opts, provider.workspaceId);
    if (method === 'POST' && action === 'test') {
      provider.lastVerifiedAt = new Date().toISOString();
      appendModelAudit(opts, '验证 Provider 连通性', provider.name, 'success', { reason: body.reason });
      return { providerId: provider.id, status: 'healthy', verifiedAt: provider.lastVerifiedAt };
    }
    if (method === 'POST' && action === 'disable') {
      provider.status = 'disabled';
      provider.models.forEach((model) => { model.status = 'unavailable'; });
      appendModelAudit(opts, '停用 Provider', provider.name, 'success', { reason: body.reason });
      return provider;
    }
    if (method === 'DELETE' && !action) {
      const impact = providerImpact(provider.id);
      if (!impact.deletionAllowed) {
        appendModelAudit(opts, '删除 Provider', provider.name, 'failed', { reason: impact.blockedReason });
        throw new Error(`E_PROVIDER_IN_USE: ${impact.blockedReason}`);
      }
      modelProviders.splice(modelProviders.indexOf(provider), 1);
      provider.models.forEach((model) => modelProfiles.splice(modelProfiles.indexOf(model), 1));
      appendModelAudit(opts, '删除 Provider', provider.name, 'success', { reason: body.reason });
      return { id: provider.id, status: 'deleted' };
    }
  }
  if (path === '/api/model-routing/policies' && method === 'GET') { const context = requireModelRead(opts); return routingPolicies.filter((policy) => policy.workspaceId === context.workspaceId).map((policy) => ({ ...policy, fallbackModelIds: [...policy.fallbackModelIds], validationIssues: [...policy.validationIssues] })); }
  if (path === '/api/model-routing/policies' && method === 'POST') {
    const body = (opts.body ?? {}) as Partial<RoutingPolicyDraft>;
    const context = requireModelWrite(opts, body.workspaceId ?? 'w1');
    const policy: RoutingPolicyDraft = { id: mockId('route'), workspaceId: context.workspaceId, level: body.level ?? 'P3', primaryModelId: body.primaryModelId ?? '', fallbackModelIds: body.fallbackModelIds ?? [], dataScope: body.dataScope ?? 'internal', egressAllowed: Boolean(body.egressAllowed), budgetLimitUsd: body.budgetLimitUsd ?? 0, status: 'draft', validationIssues: [] };
    routingPolicies.unshift(policy);
    appendModelAudit(opts, '创建路由草稿', policy.level, 'success');
    return policy;
  }
  const policyAction = path.match(/^\/api\/model-routing\/policies\/([^/]+)(?:\/(draft|validate|publish|versions|rollback))?$/);
  if (policyAction) {
    const [, policyId, action] = policyAction;
    const policy = routingPolicies.find((item) => item.id === policyId);
    if (!policy) throw new Error('E_POLICY_NOT_FOUND: 路由策略不存在');
    if (method === 'GET' && action === 'versions') { const context = requireModelRead(opts); if (policy.workspaceId !== context.workspaceId) throw new Error('E_WORKSPACE_SCOPE: 无权读取其他工作区路由版本'); return routingVersions.filter((version) => version.policyId === policy.id).map((version) => ({ ...version, snapshot: { ...version.snapshot, fallbackModelIds: [...version.snapshot.fallbackModelIds] } })); }
    const body = (opts.body ?? {}) as any;
    requireModelWrite(opts, policy.workspaceId);
    if (method === 'PATCH' && action === 'draft') {
      Object.assign(policy, { ...body, id: policy.id, workspaceId: policy.workspaceId, status: 'draft', validationIssues: [] });
      appendModelAudit(opts, '更新路由草稿', policy.level, 'success', { reason: body.reason });
      return policy;
    }
    if (method === 'POST' && action === 'validate') {
      policy.validationIssues = validateRoutingPolicy(policy);
      policy.status = policy.validationIssues.length ? 'draft' : 'ready';
      const result = policy.validationIssues.length ? 'failed' : 'success';
      appendModelAudit(opts, '校验路由草稿', policy.level, result, { reason: policy.validationIssues.join('；') || body.reason });
      return policy;
    }
    if (method === 'POST' && action === 'publish') {
      if (policy.status !== 'ready') {
        appendModelAudit(opts, '发布路由版本', policy.level, 'failed', { reason: '草稿尚未通过校验' });
        throw new Error('E_POLICY_NOT_READY: 草稿尚未通过校验，无法发布');
      }
      const version: RoutingPolicyVersion = { id: mockId('route_version'), policyId: policy.id, version: Math.max(0, ...routingVersions.filter((item) => item.policyId === policy.id).map((item) => item.version)) + 1, snapshot: { ...policy, fallbackModelIds: [...policy.fallbackModelIds], validationIssues: [] }, publishedAt: new Date().toISOString(), publishedBy: modelContext(opts).actor };
      routingVersions.unshift(version);
      policy.status = 'published';
      appendModelAudit(opts, '发布路由版本', policy.level, 'success', { reason: body.reason, policyVersion: version.id });
      return version;
    }
    if (method === 'POST' && action === 'rollback') {
      const target = routingVersions.find((version) => version.id === body.versionId && version.policyId === policy.id);
      if (!target) throw new Error('E_VERSION_NOT_FOUND: 路由版本不存在');
      const rollbackSnapshot: RoutingPolicyDraft = { ...target.snapshot, status: 'ready', fallbackModelIds: [...target.snapshot.fallbackModelIds], validationIssues: [] };
      const rollbackIssues = validateRoutingPolicy(rollbackSnapshot);
      if (rollbackIssues.length) {
        appendModelAudit(opts, '回滚路由版本', policy.level, 'failed', { reason: rollbackIssues.join('；'), policyVersion: target.id });
        throw new Error(`E_ROLLBACK_INVALID: ${rollbackIssues.join('；')}`);
      }
      const version: RoutingPolicyVersion = { id: mockId('route_version'), policyId: policy.id, version: Math.max(...routingVersions.filter((item) => item.policyId === policy.id).map((item) => item.version)) + 1, snapshot: { ...target.snapshot, status: 'published', fallbackModelIds: [...target.snapshot.fallbackModelIds], validationIssues: [] }, publishedAt: new Date().toISOString(), publishedBy: modelContext(opts).actor, rollbackOf: target.id };
      routingVersions.unshift(version);
      Object.assign(policy, version.snapshot);
      appendModelAudit(opts, '回滚路由版本', policy.level, 'success', { reason: body.reason, policyVersion: version.id });
      return version;
    }
  }
  if (path === '/api/model-routing/failover-tests' && method === 'POST') {
    const body = (opts.body ?? {}) as any;
    const policy = routingPolicies.find((item) => item.id === body.policyId);
    if (!policy) throw new Error('E_POLICY_NOT_FOUND: 路由策略不存在');
    requireModelWrite(opts, policy.workspaceId);
    if (!['sandbox', 'canary'].includes(body.scope)) throw new Error('E_DRILL_SCOPE_INVALID: 演练仅允许在 sandbox 或 canary 隔离范围执行');
    if (policy.status !== 'published') {
      appendModelAudit(opts, '执行隔离故障切换演练', policy.level, 'failed', { reason: '仅已发布路由可执行演练' });
      throw new Error('E_POLICY_NOT_PUBLISHED: 仅已发布路由可执行演练');
    }
    const drillIssues = validateRoutingPolicy(policy);
    if (drillIssues.length) {
      appendModelAudit(opts, '执行隔离故障切换演练', policy.level, 'failed', { reason: drillIssues.join('；') });
      throw new Error(`E_DRILL_INVALID: ${drillIssues.join('；')}`);
    }
    const fallback = policy.fallbackModelIds[0];
    if (!fallback) throw new Error('E_FALLBACK_INVALID: 当前策略没有可用降级链');
    const correlationId = mockId('drill');
    appendModelAudit(opts, '执行隔离故障切换演练', policy.level, 'success', { reason: body.reason, correlationId });
    return { id: mockId('failover'), policyId: policy.id, scope: body.scope, status: 'passed', fromModelId: policy.primaryModelId, toModelId: fallback, correlationId };
  }
  if (path === '/api/model-governance/overview' && method === 'GET') { const context = requireModelRead(opts); return { activeProviders: modelProviders.filter((provider) => provider.workspaceId === context.workspaceId && provider.status === 'active').length, publishedRoutes: routingPolicies.filter((policy) => policy.workspaceId === context.workspaceId && policy.status === 'published').length, budgetRisk: 'normal', updatedAt: new Date().toISOString() }; }
  if (path === '/api/model-audit' && method === 'GET') { const context = requireModelRead(opts); return modelAuditEvents.filter((event) => event.workspaceId === context.workspaceId).map((event) => ({ ...event })); }

  // 模型 Provider 与路由策略（历史 P9 API，待页面迁移后删除）
  if (path === '/api/providers' && method === 'GET') return mockProviders;
  if (path === '/api/providers' && method === 'POST') {
    const body = (opts.body ?? {}) as Partial<Provider> & { model?: string };
    if (!body.name?.trim() || !(body.model ?? body.models?.[0])?.trim()) throw new Error('Provider 名称和模型不能为空');
    const provider: Provider = { id: mockId('provider'), name: body.name.trim(), tier: body.tier ?? 'connectable', models: body.models ?? [body.model!.trim()], region: body.region ?? 'global', status: 'standby', monthlyTokens: 0, monthlyCostUsd: 0 };
    mockProviders.unshift(provider); appendControlPlaneAudit('model', '接入 Provider', provider.name); return provider;
  }
  const providerAction = path.match(/^\/api\/providers\/([^/]+)$/);
  if (providerAction && method === 'DELETE') { const index = mockProviders.findIndex((item) => item.id === providerAction[1]); if (index < 0) throw new Error('Provider 不存在'); const [removed] = mockProviders.splice(index, 1); appendControlPlaneAudit('model', '移除 Provider', removed.name); return removed; }
  if (path === '/api/provider-health') return mockProviderHealth;
  if (path === '/api/prompt-templates' && method === 'GET') return mockPromptTemplates;
  if (path === '/api/prompt-templates' && method === 'POST') { const body = (opts.body ?? {}) as any; if (!body.name?.trim() || !body.preview?.trim()) throw new Error('模板名称和内容不能为空'); const template = { id: mockId('prompt'), name: body.name.trim(), category: body.category ?? 'ops', preview: body.preview.trim(), uses: 0, rating: 0 }; mockPromptTemplates.unshift(template); appendControlPlaneAudit('model', '创建提示词模板', template.name); return template; }
  if (path === '/api/route-flow') return mockRouteFlow;
  if (path === '/api/export-routes') return mockExportRoutes;
  if (path === '/api/model-compare') return mockModelCompare;
  if (path === '/api/model-audit') return [...mockControlPlaneAudit.filter((item) => item.domain === 'model'), ...mockAuditLog];
  if (path === '/api/routes' && method === 'GET') return mockRoutes;
  if (path === '/api/routes' && method === 'PATCH') { const body = (opts.body ?? {}) as Partial<ModelRoute>; const route = mockRoutes.find((item) => item.level === body.level); if (!route) throw new Error('路由策略不存在'); Object.assign(route, body); appendControlPlaneAudit('model', '更新模型路由', route.level); return route; }
  if (path === '/api/model-failover-test' && method === 'POST') { const route = mockRoutes.find((item) => item.fallback1 && item.fallback1 !== '—') ?? mockRoutes[0]; appendControlPlaneAudit('model', '执行故障切换演练', route.level); return { level: route.level, from: route.primary, to: route.fallback1, reason: '模拟主 Provider 503 故障' }; }

  // 渠道控制面 P0/P1/P2
  if (path === '/api/channel-control/deployments' && method === 'GET') { const context = requireChannel(opts, 'channel.read'); return channelDeployments.filter((item) => item.workspaceId === context.workspaceId).map((item) => ({ ...item })); }
  if (path === '/api/channel-control/deployments' && method === 'POST') {
    const body = (opts.body ?? {}) as any; const context = requireChannel(opts, 'channel.write', body.workspaceId ?? 'w1');
    if (!body.name?.trim() || !body.kind || !body.credential?.trim()) throw new Error('E_CHANNEL_DEPLOYMENT_INVALID: 名称、类型和凭据不能为空');
    const id = mockId('channel_deployment'); const deployment: ChannelDeployment = { id, workspaceId: context.workspaceId, name: body.name.trim(), kind: body.kind, environment: body.environment ?? 'sandbox', status: 'draft', credentialRef: `vault://channel-deployments/${id}/credential`, credentialMasked: '••••••••', owner: body.owner?.trim() || context.actor };
    channelDeployments.unshift(deployment); appendChannelAudit(opts, '接入渠道部署', deployment.name, 'success', { reason: body.reason }); return deployment;
  }
  const deploymentAction = path.match(/^\/api\/channel-control\/deployments\/([^/]+)(?:\/(verify|disable|impact))?$/);
  if (deploymentAction) {
    const [, id, action] = deploymentAction; const deployment = channelDeployments.find((item) => item.id === id); if (!deployment) throw new Error('E_CHANNEL_DEPLOYMENT_NOT_FOUND: 渠道部署不存在');
    if (method === 'GET' && action === 'impact') { requireChannel(opts, 'channel.read', deployment.workspaceId); const references = deliveryVersions.filter((version) => [version.snapshot.primaryDeploymentId, ...version.snapshot.fallbackDeploymentIds].includes(id)); return { deploymentId: id, deletionAllowed: references.length === 0, references: references.map((item) => item.id) }; }
    requireChannel(opts, 'channel.write', deployment.workspaceId); const body = (opts.body ?? {}) as any;
    if (method === 'POST' && action === 'verify') { deployment.lastVerifiedAt = new Date().toISOString(); deployment.status = 'active'; appendChannelAudit(opts, '验证渠道连通性', deployment.name, 'success', { reason: body.reason }); return deployment; }
    if (method === 'POST' && action === 'disable') { deployment.status = 'disabled'; appendChannelAudit(opts, '停用渠道部署', deployment.name, 'success', { reason: body.reason }); return deployment; }
    if (method === 'DELETE' && !action) { const referenced = deliveryVersions.some((version) => [version.snapshot.primaryDeploymentId, ...version.snapshot.fallbackDeploymentIds].includes(id)); if (referenced) { appendChannelAudit(opts, '删除渠道部署', deployment.name, 'failed', { reason: '渠道被已发布投递策略引用' }); throw new Error('E_CHANNEL_IN_USE: 渠道被已发布投递策略引用'); } channelDeployments.splice(channelDeployments.indexOf(deployment), 1); appendChannelAudit(opts, '删除渠道部署', deployment.name, 'success', { reason: body.reason }); return { id, status: 'deleted' }; }
  }
  if (path === '/api/channel-control/policies' && method === 'GET') { const context = requireChannel(opts, 'channel.read'); return deliveryPolicies.filter((item) => item.workspaceId === context.workspaceId).map((item) => ({ ...item, fallbackDeploymentIds: [...item.fallbackDeploymentIds], validationIssues: [...item.validationIssues] })); }
  const deliveryPolicyAction = path.match(/^\/api\/channel-control\/policies\/([^/]+)\/(draft|validate|publish|versions|rollback|simulate)$/);
  if (deliveryPolicyAction) {
    const [, id, action] = deliveryPolicyAction; const policy = deliveryPolicies.find((item) => item.id === id); if (!policy) throw new Error('E_DELIVERY_POLICY_NOT_FOUND: 投递策略不存在');
    if (method === 'GET' && action === 'versions') { requireChannel(opts, 'channel.read', policy.workspaceId); return deliveryVersions.filter((version) => version.policyId === id); }
    requireChannel(opts, 'channel.write', policy.workspaceId); const body = (opts.body ?? {}) as any;
    if (method === 'PATCH' && action === 'draft') { Object.assign(policy, { ...body, id: policy.id, workspaceId: policy.workspaceId, status: 'draft', validationIssues: [] }); appendChannelAudit(opts, '更新投递策略草稿', policy.eventType, 'success', { reason: body.reason }); return policy; }
    if (method === 'POST' && action === 'validate') { policy.validationIssues = validateDeliveryPolicy(policy); policy.status = policy.validationIssues.length ? 'draft' : 'ready'; appendChannelAudit(opts, '校验投递策略', policy.eventType, policy.validationIssues.length ? 'failed' : 'success', { reason: policy.validationIssues.join('；') || body.reason }); return policy; }
    if (method === 'POST' && action === 'publish') { if (policy.status !== 'ready') throw new Error('E_DELIVERY_POLICY_NOT_READY: 策略尚未通过校验'); const version: DeliveryPolicyVersion = { id: mockId('delivery_version'), policyId: policy.id, version: Math.max(0, ...deliveryVersions.filter((item) => item.policyId === id).map((item) => item.version)) + 1, snapshot: { ...policy, status: 'published', fallbackDeploymentIds: [...policy.fallbackDeploymentIds], validationIssues: [] }, publishedAt: new Date().toISOString(), publishedBy: channelContext(opts).actor }; deliveryVersions.unshift(version); policy.status = 'published'; appendChannelAudit(opts, '发布投递策略', policy.eventType, 'success', { reason: body.reason, policyVersion: version.id }); return version; }
    if (method === 'POST' && action === 'rollback') { const target = deliveryVersions.find((version) => version.id === body.versionId && version.policyId === id); if (!target) throw new Error('E_DELIVERY_VERSION_NOT_FOUND: 策略版本不存在'); const issues = validateDeliveryPolicy(target.snapshot); if (issues.length) throw new Error(`E_DELIVERY_ROLLBACK_INVALID: ${issues.join('；')}`); const version: DeliveryPolicyVersion = { id: mockId('delivery_version'), policyId: id, version: Math.max(...deliveryVersions.filter((item) => item.policyId === id).map((item) => item.version)) + 1, snapshot: { ...target.snapshot, status: 'published', fallbackDeploymentIds: [...target.snapshot.fallbackDeploymentIds] }, publishedAt: new Date().toISOString(), publishedBy: channelContext(opts).actor, rollbackOf: target.id }; deliveryVersions.unshift(version); Object.assign(policy, version.snapshot); appendChannelAudit(opts, '回滚投递策略', policy.eventType, 'success', { policyVersion: version.id, reason: body.reason }); return version; }
    if (method === 'POST' && action === 'simulate') { const issues = validateDeliveryPolicy(policy); return { policyId: id, scope: body.scope === 'canary' ? 'canary' : 'sandbox', status: issues.length ? 'blocked' : 'passed', issues, capacityRisk: policy.fallbackDeploymentIds.length ? 'normal' : 'attention' }; }
  }
  if (path === '/api/channel-control/deliveries' && method === 'POST') { const body = (opts.body ?? {}) as any; const policy = deliveryPolicies.find((item) => item.id === body.policyId); if (!policy) throw new Error('E_DELIVERY_POLICY_NOT_FOUND: 投递策略不存在'); requireChannel(opts, 'channel.write', policy.workspaceId); if (policy.status !== 'published') throw new Error('E_DELIVERY_POLICY_NOT_PUBLISHED: 仅已发布策略可以投递'); const failed = String(body.target ?? '').includes('fail'); const attempt: DeliveryAttempt = { id: mockId('delivery_attempt'), workspaceId: policy.workspaceId, policyId: policy.id, deploymentId: policy.primaryDeploymentId, targetMasked: maskTarget(String(body.target ?? '')), payloadSummary: String(body.content ?? '').slice(0, 24).replace(/[\w@.-]/g, '*'), status: failed ? 'dead_letter' : 'delivered', attempts: failed ? 3 : 1, correlationId: mockId('delivery_corr'), createdAt: new Date().toISOString() }; deliveryAttempts.unshift(attempt); appendChannelAudit(opts, failed ? '投递进入死信队列' : '投递消息', policy.eventType, failed ? 'failed' : 'success', { correlationId: attempt.correlationId }); return attempt; }
  if (path === '/api/channel-control/dead-letters' && method === 'GET') { const context = requireChannel(opts, 'channel.read'); return deliveryAttempts.filter((item) => item.workspaceId === context.workspaceId && item.status === 'dead_letter'); }
  if (path === '/api/channel-control/audit' && method === 'GET') { const context = requireChannel(opts, 'channel.read'); return channelAuditEvents.filter((item) => item.workspaceId === context.workspaceId); }
  if (path === '/api/channel-control/overview' && method === 'GET') { const context = requireChannel(opts, 'channel.read'); return { activeDeployments: channelDeployments.filter((item) => item.workspaceId === context.workspaceId && item.status === 'active').length, publishedPolicies: deliveryPolicies.filter((item) => item.workspaceId === context.workspaceId && item.status === 'published').length, deadLetters: deliveryAttempts.filter((item) => item.workspaceId === context.workspaceId && item.status === 'dead_letter').length, capacityRisk: 'normal' }; }

  // 渠道：投递、策略、模板和黑名单均由 Mock 域持有。
  if (path === '/api/channels' && method === 'GET') return mockChannels;
  if (path === '/api/channels' && method === 'POST') { const body = (opts.body ?? {}) as Partial<Channel>; if (!body.name?.trim() || !body.kind) throw new Error('渠道名称和类型不能为空'); const channel: Channel = { id: mockId('channel'), name: body.name.trim(), kind: body.kind, enabled: true, monthlySent: 0, successRate: 1 }; mockChannels.unshift(channel); appendControlPlaneAudit('channel', '接入渠道', channel.name); return channel; }
  const channelAction = path.match(/^\/api\/channels\/([^/]+)(?:\/(toggle|test|config))?$/);
  if (channelAction) { const channel = mockChannels.find((item) => item.id === channelAction[1]); if (!channel) throw new Error('渠道不存在'); const action = channelAction[2]; const body = (opts.body ?? {}) as any; if (action === 'toggle' && method === 'PATCH') { channel.enabled = !channel.enabled; appendControlPlaneAudit('channel', channel.enabled ? '恢复渠道投递' : '暂停渠道投递', channel.name); return channel; } if (action === 'test' && method === 'POST') { if (!channel.enabled) throw new Error('渠道已暂停，无法发送测试消息'); if (!body.target?.trim() || !body.content?.trim()) throw new Error('接收对象和消息内容不能为空'); const message = { id: mockId('message'), time: new Date().toLocaleTimeString('zh-CN'), channel: channel.name, target: body.target.trim(), content: body.content.trim(), status: 'delivered' as const, tone: 'success' as const }; mockDomain.messages.unshift(message); appendControlPlaneAudit('channel', '发送测试消息', channel.name); return message; } if (action === 'config' && method === 'PATCH') { mockChannelConfig[channel.id] = { ...(mockChannelConfig[channel.id] ?? {}), ...body }; appendControlPlaneAudit('channel', '更新渠道配置', channel.name); return mockChannelConfig[channel.id]; } }
  if (path === '/api/channel-health') return mockChannelHealth;
  if (path === '/api/message-stream') return mockDomain.messages;
  if (path === '/api/channel-config') return mockChannelConfig;
  if (path === '/api/channel-templates' && method === 'GET') return mockChannelTemplates;
  if (path === '/api/channel-templates' && method === 'POST') { const body = (opts.body ?? {}) as any; if (!body.name?.trim()) throw new Error('模板名称不能为空'); const item = { id: mockId('template'), ...body, name: body.name.trim() }; mockChannelTemplates.unshift(item); appendControlPlaneAudit('channel', '创建消息模板', item.name); return item; }
  if (path === '/api/channel-blacklist' && method === 'GET') return mockChannelBlacklist;
  if (path === '/api/channel-blacklist' && method === 'POST') { const body = (opts.body ?? {}) as any; if (!body.value?.trim()) throw new Error('黑名单对象不能为空'); const item = { id: mockId('blacklist'), type: body.type ?? '用户', value: body.value.trim(), reason: body.reason ?? '手动添加', addedBy: '当前用户', expires: '永久' }; mockChannelBlacklist.unshift(item); appendControlPlaneAudit('channel', '加入黑名单', item.value); return item; }
  if (path === '/api/channel-languages' && method === 'GET') return mockChannelLanguages;
  if (path === '/api/channel-languages' && method === 'POST') { const body = (opts.body ?? {}) as any; if (!body.key?.trim() || !body.label?.trim()) throw new Error('语言代码和名称不能为空'); const item = { key: body.key.trim(), label: body.label.trim(), sample: body.sample ?? '' }; mockChannelLanguages.push(item); appendControlPlaneAudit('channel', '新增多语言模板', item.key); return item; }
  if (path === '/api/channel-routes' && method === 'GET') return mockChannelRoutes;
  if (path === '/api/control-plane-audit' && method === 'GET') return mockControlPlaneAudit;

  // 设置
  if (path === '/api/audits') return mockComplianceChecks;
  if (path === '/api/api-keys') return mockApiKeys;
  if (path === '/api/webhooks-config') return mockWebhooks;
  if (path === '/api/backups') return mockBackups;
  if (path === '/api/audit-stream') return mockDomain.audits;
  if (path === '/api/billing') return mockBilling;
  if (path === '/api/notification-channels') return mockNotificationChannels;

  // 会话
  if (path === '/api/conversations/cv1') return mockConversation;
  if (path === '/api/conversations/cv1/ex') return mockConversationEx;
  if (path === '/api/sessions') return mockSessions;
  if (path === '/api/slash-commands') return mockSlashCommands;
  if (path.startsWith('/api/agents/') && path.endsWith('/meta')) return mockAgentMeta;

  // 会话工作台写接口：用于演示“会话 → 任务/审批/执行 → 审计/通知”的闭环。
  if (path.startsWith('/api/conversations/') && path.endsWith('/tasks') && opts.method === 'POST') {
    const conversationId = path.split('/')[3];
    const body = (opts.body ?? {}) as { title?: string; priority?: string; assignee?: string };
    const task = taskDomain.create({
      title: body.title ?? '数字员工会话行动项', description: `由会话 ${conversationId} 创建`, priority: (body.priority as Task['priority']) ?? 'P1', assignee: body.assignee ?? '王昊', agentId: 'a1', progress: { done: 0, total: 3 }, tags: ['会话转任务'], source: 'conversation', links: { conversationId },
    }, { actor: '数字员工' });
    appendTaskDomainEvent(task);
    return task;
  }
  if (path.startsWith('/api/actions/') && path.endsWith('/approve') && opts.method === 'POST') {
    const actionId = path.split('/')[3];
    const action = mockDomain.actions.get(actionId) ?? { id: actionId, conversationId: 'cv1', status: 'pending' as const };
    const next = { ...action, status: 'approved' as const };
    mockDomain.actions.set(actionId, next);
    appendDomainEvent('审批通过', actionId);
    return next;
  }
  if (path.startsWith('/api/actions/') && path.endsWith('/execute') && opts.method === 'POST') {
    const actionId = path.split('/')[3];
    const body = (opts.body ?? {}) as { taskId?: string };
    const action = { ...(mockDomain.actions.get(actionId) ?? { id: actionId, conversationId: 'cv1', status: 'approved' as const }), taskId: body.taskId ?? mockDomain.actions.get(actionId)?.taskId };
    const task = action.taskId ? taskDomain.get(action.taskId) : undefined;
    const completedTask = task ? taskDomain.transition(task.id, 'completed', { actor: '数字员工', reason: '会话行动执行完成' }) : undefined;
    if (completedTask) appendTaskDomainEvent(completedTask);
    const next = { ...action, status: 'executed' as const };
    mockDomain.actions.set(actionId, next);
    appendDomainEvent('受控执行完成', completedTask?.code ?? actionId);
    return { ...next, task: completedTask };
  }
  if (path === '/api/mock/reset' && opts.method === 'POST') {
    taskDomain.reset();
    mockDomain.audits.splice(0, mockDomain.audits.length, ...mockAuditStream);
    mockDomain.messages.splice(0, mockDomain.messages.length, ...mockMessageStream);
    mockDomain.actions.clear();
    return { ok: true };
  }

  // 登录
  if (path === '/api/auth/login') {
    const body = opts.body as { email?: string; password?: string } | undefined;
    if (body?.email && body.password) {
      const isAdmin = body.email.toLowerCase().startsWith('admin@');
      return {
        token: isAdmin ? 'mock-model-admin-token' : 'mock-jwt-token',
        user: {
          id: 'u1',
          name: isAdmin ? '模型管理员' : '王昊',
          email: body.email,
          role: isAdmin ? 'admin' : 'sre',
          workspaceId: 'w1',
          permissions: [
            'workspace.read',
            'agent.read',
            'workflow.read',
            'workflow.write',
            'workflow.execute',
            'knowledge.read',
            'skill.execute',
            'model.read',
            ...(isAdmin ? ['model.write' as const] : []),
            'task.read',
            'task.write',
            'task.approve',
            'channel.read',
            ...(isAdmin ? ['channel.write' as const] : []),
            'audit.read',
          ],
          mfaEnabled: true,
        },
      };
    }
    throw new Error('缺少凭据');
  }

  return null;
}
