/**
 * 跨模块共享类型 — 来自「数字员工平台 v3.0」架构文档
 * 这里只放真正跨多个模块共享的类型；模块私有类型放在各模块 internal 目录。
 */

// ============ 通用基础 ============
export type ID = string;
export type ISODate = string;
export type Timestamp = number;

// ============ 角色与权限（来自 P11）============
/** 4 角色 RBAC：Admin / SRE / Sec / View */
export type Role = 'admin' | 'sre' | 'sec' | 'view';

export type Permission =
  | 'workspace.read'
  | 'workspace.write'
  | 'agent.read'
  | 'agent.write'
  | 'agent.install'
  | 'workflow.read'
  | 'workflow.write'
  | 'workflow.execute'
  | 'knowledge.read'
  | 'knowledge.write'
  | 'skill.read'
  | 'skill.write'
  | 'skill.execute'
  | 'model.read'
  | 'model.write'
  | 'task.read'
  | 'task.write'
  | 'task.approve' // 双签
  | 'channel.read'
  | 'channel.write'
  | 'audit.read'
  | 'billing.read'
  | 'billing.write';

export interface User {
  id: ID;
  name: string;
  email: string;
  avatar?: string;
  role: Role;
  workspaceId: ID;
  permissions: Permission[];
  mfaEnabled: boolean;
}

// ============ 工作区 P4 ============
export type WorkspacePlan = 'enterprise' | 'enterprise_plus' | 'standard';

export interface Workspace {
  id: ID;
  name: string;
  region: 'cn-east-1' | 'cn-south-1' | 'global';
  plan: WorkspacePlan;
  memberCount: number;
  complianceScore: number; // 0-100
  createdAt: ISODate;
}

// ============ 任务 P3 ============
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'completed' | 'archived';

export interface Task {
  id: ID;
  code: string; // TSK-20260710-019
  title: string;
  description?: string;
  priority: Priority;
  status: TaskStatus;
  assignee?: string;
  agentId?: ID;
  progress: { done: number; total: number };
  slaRemainingMin?: number;
  tags: string[];
  relatedTaskCode?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type TaskLifecycleStage =
  | 'pending'
  | 'running'
  | 'human_action'
  | 'risk'
  | 'completed'
  | 'archived';

export type TaskRisk = 'none' | 'warning' | 'critical' | 'overdue' | 'failed' | 'blocked';

export interface TaskAuditEvent {
  id: ID;
  at: ISODate;
  actor: string;
  action: string;
  detail?: string;
  tone: 'info' | 'success' | 'warn' | 'error';
}

export interface ControlledTask extends Task {
  lifecycleStage: TaskLifecycleStage;
  source: 'alert' | 'conversation' | 'workflow' | 'manual';
  sla: {
    dueAt?: ISODate;
    remainingMin?: number;
    risk: TaskRisk;
    escalated: boolean;
  };
  execution: {
    runId?: string;
    currentStep?: string;
    retryCount: number;
    error?: string;
    paused: boolean;
  };
  governance: {
    approvalRequired: boolean;
    approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
    takeoverBy?: string;
    takeoverReason?: string;
    policyBlocked?: boolean;
  };
  links: {
    conversationId?: ID;
    alertCode?: string;
    workflowId?: ID;
    assetName?: string;
    blockedBy?: ID;
  };
  auditEvents: TaskAuditEvent[];
  version: number;
}

// ============ 智能体 P5 ============
export type AgentCategory = 'AIOps' | 'SecOps';
export type AgentStatus = 'installed' | 'available' | 'beta' | 'deprecated';

export interface Agent {
  id: ID;
  name: string;
  category: AgentCategory;
  description: string;
  version: string;
  status: AgentStatus;
  rating: number; // 0-5
  installCount: number;
  cacheHitRate?: number; // 0-1
  p95Ms?: number;
  tools: string[];
  price?: string;
  isStarred?: boolean;
}

// ============ 工作流 P6 ============
export type WorkflowNodeKind =
  | 'trigger'
  | 'schedule'
  | 'event'
  | 'retrieve'
  | 'transform'
  | 'decision'
  | 'condition'
  | 'approval'
  | 'policy'
  | 'branch'
  | 'parallel'
  | 'execute'
  | 'http'
  | 'mcp'
  | 'task'
  | 'retry'
  | 'compensate'
  | 'audit'
  | 'notify';

export interface WorkflowNode {
  id: ID;
  kind: WorkflowNodeKind;
  label: string;
  status?: 'idle' | 'running' | 'success' | 'failed';
  durationMs?: number;
}

export interface WorkflowEdge {
  id: ID;
  source: ID;
  target: ID;
}

export interface Workflow {
  id: ID;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggerCount: number;
  successRate: number; // 0-1
  avgDurationSec: number;
  status: 'active' | 'draft' | 'paused';
}

// ============ 知识 P7 ============
export type KnowledgeStep = 'ingest' | 'chunk' | 'embed' | 'index' | 'retrieve';

export interface KnowledgeChunk {
  id: ID;
  docId: ID;
  text: string;
  score: number;
  source: string;
  page?: number;
}

export interface KnowledgeDoc {
  id: ID;
  title: string;
  source: string; // Runbook / CMDB / CVE / ...
  sizeKb: number;
  chunks: number;
  citeCount: number;
  status: 'parsing' | 'indexing' | 'ready' | 'failed';
  updatedAt: ISODate;
}

export interface KnowledgeSourceConnection {
  id: ID;
  name: string;
  kind: 'REST API' | 'Git / Markdown' | 'Webhook' | '数据库只读连接';
  schedule: string;
  lastSync: string;
  documents: number;
  status: 'healthy' | 'syncing' | 'attention';
}

export interface KnowledgeGovernancePolicy {
  sensitiveDataDetection: boolean;
  versionRetention: boolean;
  retentionDays: number;
  highRiskChangeApproval: boolean;
}

export interface KnowledgeAuditEvent {
  id: ID;
  time: string;
  actor: string;
  action: string;
  target: string;
  result: 'success' | 'failed';
}

export interface KnowledgeRetrievalResult {
  idx: number;
  source: string;
  page?: number | null;
  score: number;
  docId: ID;
  text: string;
}

/** 可被智能体和工作流引用的知识交付单元，而非浮动的原始文档集合。 */
export type KnowledgePackageStatus = 'draft' | 'review' | 'published' | 'deprecated' | 'archived';
export type KnowledgeChunkStrategy = 'structured' | 'semantic' | 'fixed' | 'table';
export type KnowledgeConsumerType = 'agent' | 'workflow';

export interface KnowledgePackageVersion {
  id: ID;
  version: string;
  status: KnowledgePackageStatus;
  indexVersion: string;
  publishedAt?: ISODate;
  qualityScore: number;
  changeSummary: string;
}

export interface KnowledgePackage {
  id: ID;
  name: string;
  description: string;
  domain: string;
  classification: 'internal' | 'confidential' | 'restricted';
  owner: string;
  status: KnowledgePackageStatus;
  documentCount: number;
  consumers: number;
  currentVersion: KnowledgePackageVersion;
  versions: KnowledgePackageVersion[];
}

export interface KnowledgeProcessingJob {
  id: ID;
  packageId: ID;
  source: string;
  strategy: KnowledgeChunkStrategy;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  documentCount: number;
  chunkCount: number;
  indexVersion: string;
  startedAt: ISODate;
  error?: string;
}

export interface KnowledgeRetrievalProfile {
  id: ID;
  name: string;
  packageId: ID;
  retrievalModes: Array<'keyword' | 'vector' | 'graph'>;
  topK: number;
  rerankEnabled: boolean;
  noResultPolicy: 'clarify' | 'handoff' | 'block';
}

export interface KnowledgeEvaluation {
  id: ID;
  packageId: ID;
  profileId: ID;
  baselineVersion: string;
  evaluatedVersion: string;
  recallAtK: number;
  mrr: number;
  ndcg: number;
  citationAccuracy: number;
  p95LatencyMs: number;
  status: 'passed' | 'needs_review' | 'failed';
  evaluatedAt: ISODate;
}

export interface KnowledgeGraphEntity {
  id: ID;
  name: string;
  type: 'service' | 'asset' | 'runbook' | 'alert' | 'vulnerability' | 'owner';
  confidence: number;
  sourceDocId: ID;
  sourceVersion: string;
}

export interface KnowledgeGraphRelation {
  id: ID;
  fromId: ID;
  toId: ID;
  type: 'depends_on' | 'impacts' | 'owned_by' | 'handled_by' | 'references';
  confidence: number;
  sourceDocId: ID;
  sourceVersion: string;
}

export interface KnowledgeConsumerBinding {
  id: ID;
  packageId: ID;
  packageName: string;
  packageVersion: string;
  consumerType: KnowledgeConsumerType;
  consumerId: ID;
  consumerName: string;
  environment: 'production' | 'staging' | 'sandbox';
  profileId: ID;
  noResultPolicy: KnowledgeRetrievalProfile['noResultPolicy'];
}

// ============ 技能 P8 ============
export type SkillKind = 'skill' | 'mcp' | 'tool';
export type SkillLifecycleStatus = 'enabled' | 'disabled' | 'pending_approval' | 'quarantined' | 'deprecated';
export type SkillSource = 'market' | 'import' | 'mcp' | 'tool';

export interface Skill {
  id: ID;
  name: string;
  kind: SkillKind;
  description: string;
  version: string;
  status: AgentStatus;
  rating: number;
  installCount: number;
  riskLevel: 'low' | 'mid' | 'high';
  cacheable: boolean;
  costPerCall?: string;
  lifecycleStatus?: SkillLifecycleStatus;
  source?: SkillSource;
  owner?: string;
  team?: string;
  lastVerifiedAt?: string;
  hasUpdate?: boolean;
  upgradeVersion?: string;
  tags?: string[];
}

export interface SkillGovernancePolicy {
  skillId: ID;
  secretRef: string;
  allowedEgress: string[];
  writeApprovalRequired: boolean;
  rateLimitPerMinute: number;
  circuitBreakerEnabled: boolean;
  dataMaskingEnabled: boolean;
}

export type SkillIntegrationType = 'skill' | 'mcp' | 'tool';
export type SkillIntegrationStatus = 'draft' | 'validating' | 'pending_approval' | 'enabled' | 'failed' | 'quarantined' | 'disabled';

export interface SkillIntegration {
  id: ID;
  name: string;
  type: SkillIntegrationType;
  environment: 'development' | 'test' | 'production';
  status: SkillIntegrationStatus;
  owner: string;
  endpoint: string;
  credentialRef: string;
  lastVerifiedAt: string;
  health: 'healthy' | 'attention' | 'unknown';
  discoveredCapabilities: number;
  writeApprovalRequired: boolean;
  allowedEgress: string[];
  lastError?: string;
}

export type SkillHealthStatus = 'healthy' | 'attention' | 'incident' | 'paused' | 'quarantined';

export interface SkillRuntimeHealth {
  id: ID;
  skillId: ID;
  name: string;
  kind: SkillKind;
  environment: 'development' | 'test' | 'production';
  status: SkillHealthStatus;
  calls24h: number;
  successRate: number;
  p95Ms: number;
  errorRate: number;
  riskLevel: 'low' | 'mid' | 'high';
  owner: string;
  references: number;
  updatedAt: string;
}

export interface SkillGovernanceIncident {
  id: ID;
  skillId: ID;
  skillName: string;
  severity: 'P0' | 'P1' | 'P2';
  type: 'execution_failure' | 'latency' | 'policy_blocked' | 'credential' | 'connection';
  title: string;
  detail: string;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: string;
  requestId: string;
}

export interface SkillGovernanceEvent {
  id: ID;
  time: string;
  skillName: string;
  type: 'call' | 'policy' | 'approval' | 'change' | 'lifecycle';
  action: string;
  actor: string;
  result: 'success' | 'failed' | 'blocked';
  requestId?: string;
}

export interface SkillRuntimeConfig {
  cacheable: boolean;
  timeout: string;
  retries: string;
}

export interface SkillPermission {
  skillId: ID;
  role: string;
  canCall: boolean;
  canConfig: boolean;
}

export interface SkillImpactReport {
  skillId: ID;
  agents: string[];
  workflows: string[];
  activeRuns: number;
  uninstallAllowed: boolean;
  reason?: string;
}

export interface SkillInstallPreflight {
  skillId: ID;
  trustedPublisher: boolean;
  signatureValid: boolean;
  dependencies: Array<{ name: string; status: 'ready' | 'missing' }>;
  requiresApproval: boolean;
  decision: 'approved' | 'review_required' | 'blocked';
  reason?: string;
}

export interface SkillAuditEvent {
  id: ID;
  time: string;
  actor: string;
  action: string;
  target: string;
  result: 'success' | 'failed';
  correlationId?: string;
}

export interface CapabilityBinding {
  id: ID;
  targetType: 'agent' | 'workflow';
  targetId: ID;
  capabilityKind: 'skill' | 'workflow_skill';
  capabilityId: ID;
  pinnedVersion: string;
  status: 'active' | 'pending_approval' | 'disabled';
  createdBy: string;
  createdAt: string;
  auditId: string;
}

export interface WorkflowSkill {
  id: ID;
  sourceWorkflowId: ID;
  sourceVersionId: string;
  name: string;
  description: string;
  riskLevel: 'low' | 'mid' | 'high';
  approvalRequired: boolean;
  rollbackSupported: boolean;
  status: 'draft' | 'published' | 'deprecated';
}

// ============ 模型 Provider P9 ============
export type ProviderTier = 'official' | 'self_hosted' | 'connectable';

export interface Provider {
  id: ID;
  name: string;
  tier: ProviderTier;
  models: string[];
  region: 'global' | 'cn';
  status: 'active' | 'standby' | 'offline';
  monthlyTokens: number;
  monthlyCostUsd: number;
}

export type ModelLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'audit';

export interface ModelRoute {
  level: ModelLevel;
  primary: string;
  fallback1: string;
  fallback2?: string;
  crossBorder: boolean; // 是否出境
}

// ============ 模型控制面（P0/P1 治理契约）============
export type ModelCapability = 'chat' | 'reasoning' | 'embedding' | 'vision';
export type ModelProviderStatus = 'draft' | 'standby' | 'active' | 'disabled' | 'offline';
export type RoutingPolicyStatus = 'draft' | 'ready' | 'published' | 'superseded';

/** 已准入的模型部署；凭据只以引用和掩码形式出现在客户端。 */
export interface ModelProfile {
  id: ID;
  providerId: ID;
  name: string;
  cloudRegion: string;
  dataResidency: 'cn' | 'global';
  capabilities: ModelCapability[];
  status: 'available' | 'unavailable';
  contextWindow: number;
}

export interface ModelProvider {
  id: ID;
  workspaceId: ID;
  name: string;
  tier: ProviderTier;
  cloudRegion: string;
  dataResidency: 'cn' | 'global';
  status: ModelProviderStatus;
  credentialRef: string;
  credentialMasked: string;
  lastVerifiedAt?: ISODate;
  models: ModelProfile[];
}

export interface ProviderImpact {
  providerId: ID;
  routeReferences: Array<{ policyId: ID; level: ModelLevel; versionId: ID }>;
  deletionAllowed: boolean;
  blockedReason?: string;
}

export interface RoutingPolicyDraft {
  id: ID;
  workspaceId: ID;
  level: Exclude<ModelLevel, 'audit'>;
  primaryModelId: ID;
  fallbackModelIds: ID[];
  dataScope: 'internal' | 'restricted';
  egressAllowed: boolean;
  budgetLimitUsd: number;
  status: RoutingPolicyStatus;
  validationIssues: string[];
}

export interface RoutingPolicyVersion {
  id: ID;
  policyId: ID;
  version: number;
  snapshot: RoutingPolicyDraft;
  publishedAt: ISODate;
  publishedBy: string;
  rollbackOf?: ID;
}

export interface ModelAuditEvent {
  id: ID;
  time: ISODate;
  workspaceId: ID;
  actor: string;
  action: string;
  target: string;
  result: 'success' | 'failed';
  reason?: string;
  policyVersion?: ID;
  correlationId: string;
}

// ============ 渠道 P10 ============
export type ChannelKind = 'feishu' | 'wecom' | 'slack' | 'dingtalk' | 'email' | 'webhook' | 'sms' | 'phone';

export interface Channel {
  id: ID;
  name: string;
  kind: ChannelKind;
  enabled: boolean;
  monthlySent: number;
  successRate: number; // 0-1
}

// ============ 渠道控制面（P0/P1/P2）============
export type ChannelDeploymentStatus = 'draft' | 'active' | 'disabled' | 'offline';
export type DeliveryPolicyStatus = 'draft' | 'ready' | 'published' | 'superseded';

export interface ChannelDeployment {
  id: ID;
  workspaceId: ID;
  name: string;
  kind: ChannelKind;
  environment: 'production' | 'sandbox';
  status: ChannelDeploymentStatus;
  credentialRef: string;
  credentialMasked: string;
  owner: string;
  lastVerifiedAt?: ISODate;
}

export interface DeliveryPolicyDraft {
  id: ID;
  workspaceId: ID;
  eventType: string;
  primaryDeploymentId: ID;
  fallbackDeploymentIds: ID[];
  audience: string;
  dataClassification: 'internal' | 'restricted';
  status: DeliveryPolicyStatus;
  validationIssues: string[];
}

export interface DeliveryPolicyVersion {
  id: ID;
  policyId: ID;
  version: number;
  snapshot: DeliveryPolicyDraft;
  publishedAt: ISODate;
  publishedBy: string;
  rollbackOf?: ID;
}

export interface DeliveryAttempt {
  id: ID;
  workspaceId: ID;
  policyId: ID;
  deploymentId: ID;
  targetMasked: string;
  payloadSummary: string;
  status: 'delivered' | 'failed' | 'dead_letter';
  attempts: number;
  correlationId: string;
  createdAt: ISODate;
}

export interface ChannelAuditEvent {
  id: ID;
  workspaceId: ID;
  time: ISODate;
  actor: string;
  action: string;
  target: string;
  result: 'success' | 'failed';
  reason?: string;
  policyVersion?: ID;
  correlationId: string;
}

// ============ 会话 P2 ============
export interface ChatMessage {
  id: ID;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  agentId?: ID;
  citations?: KnowledgeChunk[];
  toolCalls?: ToolCall[];
  createdAt: ISODate;
}

export interface ToolCall {
  id: ID;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  durationMs?: number;
}

export interface Conversation {
  id: ID;
  agentId: ID;
  title: string;
  messages: ChatMessage[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ============ 设置 P11 ============
export interface AuditItem {
  id: ID;
  name: string;
  category: 'identity' | 'data' | 'access' | 'audit' | 'compliance';
  status: 'pass' | 'warn' | 'fail';
  updatedAt: ISODate;
}

// ============ KPI（首页 P1）============
export interface KpiCard {
  id: ID;
  label: string;
  value: string | number;
  delta?: { value: number; trend: 'up' | 'down' | 'flat' };
  status?: 'ok' | 'warn' | 'error';
  unit?: string;
}

// ============ 通用 API 响应 ============
export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

export interface PageQuery {
  page: number;
  pageSize: number;
  keyword?: string;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
