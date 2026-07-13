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
  | 'retrieve'
  | 'decision'
  | 'approval'
  | 'branch'
  | 'execute'
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

// ============ 技能 P8 ============
export type SkillKind = 'skill' | 'mcp' | 'tool';

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