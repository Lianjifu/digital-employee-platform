import type { ReasoningStep } from '@/hooks/types';

export type TurnPhaseId = 'understand' | 'plan' | 'execute' | 'reflect';
export type TurnPhaseStatus = 'pending' | 'running' | 'done' | 'skipped';

export interface TurnTaskItem {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  startedAt?: string;
  endedAt?: string;
  detail?: string;
}

export interface TurnPhaseBlock {
  phase: TurnPhaseId;
  label: string;
  status: TurnPhaseStatus;
  steps: ReasoningStep[];
  startedAt?: string;
  endedAt?: string;
}

export interface TurnMeta {
  narrative?: 'standard' | 'bypass' | 'plan' | 'direct' | string;
  phases?: TurnPhaseBlock[];
  tasks?: TurnTaskItem[];
  summary?: string;
}

export const TURN_PHASE_ORDER: TurnPhaseId[] = ['understand', 'plan', 'execute', 'reflect'];
