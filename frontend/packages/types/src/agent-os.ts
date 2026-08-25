/**
 * Agent OS 线格式（SSE / JSON）。与 `de.common.v1` 及 ADR-013 对齐。
 * 入站 channel 是 Caller 种类，不是投递目录 ChannelKind 全集。
 */

export const SESSION_MODES = ['investigate', 'execute'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const POLICY_DECISIONS = ['allow', 'mask', 'approval_required', 'deny'] as const;
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export const INBOUND_CHANNEL_KINDS = ['web', 'api', 'feishu', 'wecom', 'dingtalk'] as const;
export type InboundChannelKind = (typeof INBOUND_CHANNEL_KINDS)[number];

export const STREAM_EVENT_TYPES = ['stage', 'delta', 'tool', 'route', 'thought', 'evidence', 'done', 'error'] as const;
export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export const LOOP_MODES = ['direct', 'react', 'plan_exec', 'multi_agent'] as const;
export type LoopMode = (typeof LOOP_MODES)[number];

export const MEMORY_LAYERS = ['short_term', 'working', 'long_term'] as const;
export type MemoryLayerWire = (typeof MEMORY_LAYERS)[number];

export const AGENT_OS_ERROR_CODES = [
  'E_SESSION_CLOSED',
  'E_SESSION_HANDOFF',
  'E_REPLAY_NOT_FOUND',
  'E_SNAPSHOT_NOT_FOUND',
  'E_CHANNEL_THREAD_UNBOUND',
  'E_RUNTIME_UNAVAILABLE',
  'E_CONTEXT_INVALID',
  'E_IDENTITY_MOCK_FORBIDDEN',
  'E_ZERO_TRUST_DENY',
  'E_UNAUTHORIZED',
] as const;
export type AgentOSErrorCode = (typeof AGENT_OS_ERROR_CODES)[number];

export interface Envelope {
  tenantId: string;
  workspaceId: string;
  actorId: string;
  channel: InboundChannelKind;
  channelThreadId: string;
  sessionId: string;
  employeeId: string;
  correlationId: string;
  classification: string;
  sessionMode: SessionMode;
  riskLevel: RiskLevel;
}

export interface MemoryProvenance {
  id: string;
  title: string;
  layer: MemoryLayerWire | string;
  score: number;
}

export interface EmployeeBinding {
  employeeId?: string;
  modelId?: string;
  modelRouteId?: string;
  knowledgeIds?: string[];
  skillIds?: string[];
  channelIds?: string[];
  memoryPolicyId?: string;
  frozen?: boolean;
  frozenAt?: string;
}

export interface ContextSnapshot {
  id: string;
  correlationId: string;
  system: string;
  historyTurns: number;
  memoryProvenance: MemoryProvenance[];
  ragHits: number;
  toolRegistry: string[];
  builtAt: string;
  employeeId: string;
  sessionMode: SessionMode;
  employeeBinding?: EmployeeBinding;
}

export interface StreamEvent {
  type: StreamEventType;
  stage?: string;
  text?: string;
  correlationId: string;
  snapshotId?: string;
  ragHits?: number;
  memoryHits?: number;
  policyDecision?: PolicyDecision;
  meta?: Record<string, string>;
}

export function isSessionMode(v: string): v is SessionMode {
  return (SESSION_MODES as readonly string[]).includes(v);
}

export function isPolicyDecision(v: string): v is PolicyDecision {
  return (POLICY_DECISIONS as readonly string[]).includes(v);
}

export function isStreamEventType(v: string): v is StreamEventType {
  return (STREAM_EVENT_TYPES as readonly string[]).includes(v);
}

export function isInboundChannelKind(v: string): v is InboundChannelKind {
  return (INBOUND_CHANNEL_KINDS as readonly string[]).includes(v);
}

export interface ReplayTurnResponse {
  replay: true;
  correlationId: string;
  snapshot: ContextSnapshot;
  events: StreamEvent[];
}
