/**
 * Mock 适配器 — 前端可独立运行
 * 后续切真实后端：删除 mockHandler 注入，baseURL 指向 Connect-RPC 网关即可。
 */
import type {
  Agent,
  AuditItem,
  Channel,
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

export const mockWorkspaces: Workspace[] = [
  { id: 'w1', name: 'ACME 生产', region: 'cn-east-1', plan: 'enterprise_plus', memberCount: 18, complianceScore: 98, createdAt: '2024-03-12T00:00:00Z' },
  { id: 'w2', name: 'ACME 预发', region: 'cn-east-1', plan: 'enterprise', memberCount: 6, complianceScore: 92, createdAt: '2024-05-08T00:00:00Z' },
  { id: 'w3', name: 'ACME 安全', region: 'cn-east-1', plan: 'enterprise_plus', memberCount: 4, complianceScore: 100, createdAt: '2024-06-01T00:00:00Z' },
  { id: 'w4', name: '外协沙箱', region: 'cn-south-1', plan: 'standard', memberCount: 2, complianceScore: 85, createdAt: '2025-01-15T00:00:00Z' },
];

// ============ 首页扩展数据（healthTrend/team/activities）============
export interface HomeExtra {
  healthTrend24h: number[];
  teamMembers: { id: string; name: string; role: string; online: boolean }[];
  recentActivities: { id: string; type: string; tone: 'success' | 'warning' | 'info' | 'danger'; text: string; actor: string; resource: string; time: string }[];
  agentCallSummary: { total: number; healthy: number; warning: number; offline: number };
}

export const mockHomeExtra: HomeExtra = {
  healthTrend24h: [92, 94, 95, 93, 96, 98, 97, 96, 98, 99, 98, 97, 99, 100, 99, 98, 97, 96, 98, 99, 98, 99, 100, 99],
  teamMembers: [
    { id: 'u1', name: '王昊', role: 'SRE', online: true },
    { id: 'u2', name: '李婷', role: 'SRE', online: true },
    { id: 'u3', name: '张睿', role: 'Sec', online: true },
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

export const mockAgents: Agent[] = [
  { id: 'a1', name: 'Redis 故障自愈', category: 'AIOps', description: 'redis-cli · MONITOR · CONFIG 自动恢复', version: '1.4.2', status: 'installed', rating: 4.8, installCount: 1240, cacheHitRate: 0.32, p95Ms: 580, tools: ['redis-cli', 'MONITOR'], isStarred: true },
  { id: 'a2', name: 'K8s 操作助手', category: 'AIOps', description: 'kubectl apply / scale / rollout', version: '2.1.0', status: 'installed', rating: 4.7, installCount: 980, cacheHitRate: 0.28, p95Ms: 720, tools: ['kubectl'] },
  { id: 'a3', name: '变更辅助', category: 'AIOps', description: '灰度发布 + 风险评估 + 回滚', version: '1.2.5', status: 'installed', rating: 4.6, installCount: 760, cacheHitRate: 0.22, p95Ms: 1100, tools: ['kubectl', 'argo'] },
  { id: 'a4', name: '容量预测', category: 'AIOps', description: '历史数据 + 趋势分析 + 建议', version: '1.0.8', status: 'installed', rating: 4.5, installCount: 540, cacheHitRate: 0.18, p95Ms: 2300, tools: ['prometheus'] },
  { id: 'a5', name: '威胁狩猎', category: 'SecOps', description: 'ATT&CK 框架 + EDR + SIEM', version: '1.6.0', status: 'installed', rating: 4.9, installCount: 460, p95Ms: 880, tools: ['siem', 'edr'] },
  { id: 'a6', name: '告警降噪', category: 'SecOps', description: '误报识别 + 规则合并', version: '1.3.2', status: 'installed', rating: 4.7, installCount: 380, p95Ms: 420, tools: ['siem'] },
  { id: 'a7', name: '漏洞修复', category: 'SecOps', description: 'CVE → 资产 → 工单', version: '2.0.1', status: 'installed', rating: 4.8, installCount: 320, p95Ms: 1500, tools: ['cmdb', 'jira'] },
  { id: 'a8', name: '合规审计', category: 'SecOps', description: '等保 3 / SOX 自动核查', version: '1.1.0', status: 'installed', rating: 4.6, installCount: 210, p95Ms: 3200, tools: ['audit'] },
  { id: 'a9', name: 'PromQL 生成', category: 'AIOps', description: '自然语言转 PromQL', version: '1.0.0', status: 'available', rating: 4.4, installCount: 120, price: '免费', tools: ['prometheus'] },
  { id: 'a10', name: '日志查询', category: 'AIOps', description: 'Loki · ES · S3 统一查询', version: '2.3.0', status: 'available', rating: 4.7, installCount: 880, price: '免费', tools: ['loki', 'opensearch'] },
];

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

export const mockKnowledgeDocs: KnowledgeDoc[] = [
  { id: 'k1', title: 'Redis 故障 Runbook v3.2', source: 'Runbook', sizeKb: 128, chunks: 86, citeCount: 320, status: 'ready', updatedAt: '2026-07-10T00:00:00Z' },
  { id: 'k2', title: 'CMDB 全量资产清单', source: 'CMDB', sizeKb: 2400, chunks: 1280, citeCount: 1280, status: 'ready', updatedAt: '2026-07-08T00:00:00Z' },
  { id: 'k3', title: 'CVE-2026 漏洞库', source: 'CVE', sizeKb: 840, chunks: 620, citeCount: 88, status: 'ready', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'k4', title: 'K8s 节点运维手册', source: 'Runbook', sizeKb: 320, chunks: 210, citeCount: 156, status: 'ready', updatedAt: '2026-07-05T00:00:00Z' },
  { id: 'k5', title: '等保 3 合规白皮书', source: '合规', sizeKb: 1240, chunks: 580, citeCount: 240, status: 'ready', updatedAt: '2026-06-28T00:00:00Z' },
  { id: 'k6', title: 'Prometheus 告警规则', source: 'Runbook', sizeKb: 96, chunks: 72, citeCount: 110, status: 'indexing', updatedAt: '2026-07-13T01:00:00Z' },
  { id: 'k7', title: '网关灰度发布流程', source: 'Runbook', sizeKb: 64, chunks: 48, citeCount: 78, status: 'ready', updatedAt: '2026-07-02T00:00:00Z' },
  { id: 'k8', title: 'ATT&CK 检测用例', source: 'SIEM', sizeKb: 540, chunks: 380, citeCount: 95, status: 'ready', updatedAt: '2026-07-09T00:00:00Z' },
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

export const mockChannels: Channel[] = [
  { id: 'c1', name: '飞书', kind: 'feishu', enabled: true, monthlySent: 480, successRate: 0.998 },
  { id: 'c2', name: '企业微信', kind: 'wecom', enabled: true, monthlySent: 280, successRate: 0.992 },
  { id: 'c3', name: '钉钉', kind: 'dingtalk', enabled: true, monthlySent: 120, successRate: 0.985 },
  { id: 'c4', name: 'Slack', kind: 'slack', enabled: false, monthlySent: 0, successRate: 0 },
  { id: 'c5', name: '邮件', kind: 'email', enabled: true, monthlySent: 240, successRate: 0.978 },
  { id: 'c6', name: 'Webhook', kind: 'webhook', enabled: true, monthlySent: 120, successRate: 0.995 },
];

export const mockAudits: AuditItem[] = [
  { id: 'a1', name: '身份认证 (Authentik+OIDC)', category: 'identity', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a2', name: 'MFA 双因素', category: 'identity', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a3', name: '密码策略', category: 'identity', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a4', name: '字段级权限', category: 'access', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a5', name: '数据出境策略', category: 'data', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a6', name: '双签复核', category: 'access', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a7', name: 'SignedLog 审计', category: 'audit', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a8', name: 'API Key 30d 轮转', category: 'data', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a9', name: '风险评估', category: 'compliance', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a10', name: '下次审计日期', category: 'compliance', status: 'pass', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a11', name: '导出审计日志', category: 'audit', status: 'warn', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a12', name: '字段脱敏增强', category: 'data', status: 'warn', updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'a13', name: '灰度发布', category: 'compliance', status: 'warn', updatedAt: '2026-07-12T00:00:00Z' },
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

// ============ Mock 路由 ============

export async function mockHandler(path: string, opts: { method?: string; body?: unknown; query?: Record<string, any> }): Promise<unknown> {
  await sleep(80); // 模拟网络延迟

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

  // 任务
  if (path === '/api/tasks') return mockTasks;
  if (path.startsWith('/api/tasks/')) {
    const id = path.split('/').pop();
    return mockTasks.find((t) => t.id === id) ?? null;
  }

  // 智能体
  if (path === '/api/agents') return mockAgents;

  // 工作流
  if (path === '/api/workflows') return [mockWorkflow];

  // 知识
  if (path === '/api/knowledge/docs') return mockKnowledgeDocs;
  if (path === '/api/knowledge/chunks/top') {
    return mockConversation.messages.find((m) => m.citations)?.citations ?? [];
  }

  // 技能
  if (path === '/api/skills') return mockSkills;

  // 模型
  if (path === '/api/providers') return mockProviders;
  if (path === '/api/routes') return mockRoutes;

  // 渠道
  if (path === '/api/channels') return mockChannels;

  // 设置
  if (path === '/api/audits') return mockAudits;

  // 会话
  if (path === '/api/conversations/cv1') return mockConversation;

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