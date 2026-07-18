/**
 * Mock 适配器 — 前端可独立运行
 * 后续切真实后端：删除 mockHandler 注入，baseURL 指向 Connect-RPC 网关即可。
 */
import type {
  Agent,
  AuditItem,
  Channel,
  ControlledTask,
  Conversation,
  KnowledgeDoc,
  KpiCard,
  ModelRoute,
  Provider,
  Skill,
  Task,
  Workflow,
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

export type WorkflowGenerationRecord = {
  id: string;
  prompt: string;
  status: 'completed' | 'discarded';
  model: string;
  createdAt: string;
  workflow: { nodes: Array<{ id: string; kind: string; label: string; position: { x: number; y: number }; description?: string }>; edges: Array<{ id: string; source: string; target: string }> };
  checks: { structure: 'passed' | 'review'; dependencies: 'passed' | 'review'; risk: 'passed' | 'review' };
  dependencies: Array<{ type: 'tool' | 'mcp' | 'agent'; name: string; status: 'available' | 'missing'; reason?: string }>;
  risks: Array<{ level: 'L1' | 'L2' | 'L3'; node: string; text: string; requiresApproval: boolean }>;
  warnings: string[];
  qualityScore: number;
  requiresReview: boolean;
};

export const mockWorkflowGenerations: WorkflowGenerationRecord[] = [
  {
    id: 'gen_demo_001', prompt: '当 Redis 触发 OOM 告警时自动处理并通知负责人', status: 'completed', model: '企业默认模型', createdAt: '2026-07-18T09:20:00Z',
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

export const mockChannelConfig = {
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

export async function mockHandler(path: string, opts: { method?: string; body?: unknown; query?: Record<string, any> }): Promise<unknown> {
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
  if (path === '/api/workflow-templates') return mockWorkflowTemplates;
  if (path === '/api/workflow-runs') return mockWorkflowRuns;
  if (path === '/api/workflow-kpi') return mockWorkflowKpi;
  if (path === '/api/workflows/generations' && method === 'GET') return mockWorkflowGenerations;
  if (path === '/api/workflows/generate' && method === 'POST') {
    const body = (opts.body ?? {}) as Record<string, any>;
    const prompt = String(body.prompt ?? '').trim();
    const constraints = body.constraints ?? {};
    const base = mockWorkflowGenerations[0];
    const generated: WorkflowGenerationRecord = {
      ...JSON.parse(JSON.stringify(base)),
      id: mockId('gen'),
      prompt: prompt || base.prompt,
      model: body.model || '企业默认模型',
      createdAt: new Date().toISOString(),
      status: 'completed',
      qualityScore: constraints.requireRollback ? 89 : 84,
      requiresReview: true,
      checks: { structure: 'passed', dependencies: 'review', risk: constraints.requireApproval === false ? 'passed' : 'review' },
      warnings: [
        '生成结果仅为可编辑草稿，不会自动执行或发布',
        ...(constraints.requireRollback ? [] : ['建议补充回滚分支']),
        '执行恢复节点需要 kubernetes-mcp 写权限',
      ],
      risks: constraints.requireApproval === false ? [] : base.risks,
    };
    mockWorkflowGenerations.unshift(generated);
    return generated;
  }
  const generationAction = path.match(/^\/api\/workflows\/generations\/([^/]+)(?:\/(apply|discard))?$/);
  if (generationAction) {
    const record = mockWorkflowGenerations.find((item) => item.id === generationAction[1]);
    if (!record) return null;
    if (!generationAction[2] && method === 'GET') return record;
    if (generationAction[2] === 'discard' && method === 'POST') { record.status = 'discarded'; return record; }
    if (generationAction[2] === 'apply' && method === 'POST') return { ...record, status: 'completed', appliedAt: new Date().toISOString() };
  }

  // 知识
  if (path === '/api/knowledge/docs') return mockKnowledgeDocs;
  if (path === '/api/knowledge/kb-list') return mockKbList;
  if (path === '/api/knowledge/doc/k1') return mockDocDetail;
  if (path === '/api/knowledge/search-history') return mockSearchHistory;
  if (path === '/api/knowledge/citation-trace') return mockCitationTrace;
  if (path === '/api/knowledge/eval') return mockEvalMetrics;
  if (path === '/api/knowledge/chunks/top') {
    return mockConversation.messages.find((m) => m.citations)?.citations ?? [];
  }

  // 技能
  if (path === '/api/skills') return mockSkills;
  if (path.startsWith('/api/skills/') && path.endsWith('/trace')) {
    const id = path.split('/')[3];
    return mockSkillExecTrace[id as keyof typeof mockSkillExecTrace] ?? null;
  }
  if (path.startsWith('/api/skills/') && path.endsWith('/versions')) {
    const id = path.split('/')[3];
    return mockSkillVersions[id as keyof typeof mockSkillVersions] ?? [];
  }
  if (path === '/api/skills/perms') return mockSkillPerms;

  // 模型
  if (path === '/api/providers') return mockProviders;
  if (path === '/api/provider-health') return mockProviderHealth;
  if (path === '/api/prompt-templates') return mockPromptTemplates;
  if (path === '/api/route-flow') return mockRouteFlow;
  if (path === '/api/export-routes') return mockExportRoutes;
  if (path === '/api/model-compare') return mockModelCompare;
  if (path === '/api/model-audit') return mockAuditLog;
  if (path === '/api/routes') return mockRoutes;

  // 渠道
  if (path === '/api/channels') return mockChannels;
  if (path === '/api/channel-health') return mockChannelHealth;
  if (path === '/api/message-stream') return mockDomain.messages;
  if (path === '/api/channel-config') return mockChannelConfig;

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
      return {
        token: 'mock-jwt-token',
        user: {
          id: 'u1',
          name: '王昊',
          email: body.email,
          role: 'sre',
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
            'task.read',
            'task.write',
            'task.approve',
            'channel.read',
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
