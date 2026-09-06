import type { ReasoningStep } from '@/hooks/types';
import type { TurnPhaseId } from './types';

const NARRATIVE_PHASES = new Set<TurnPhaseId>(['understand', 'plan', 'execute', 'reflect']);

export function isNarrativePhase(value?: string): value is TurnPhaseId {
  return !!value && NARRATIVE_PHASES.has(value as TurnPhaseId);
}

export function inferPhaseFromStep(step: Pick<ReasoningStep, 'kind' | 'title' | 'phase'>): TurnPhaseId {
  if (isNarrativePhase(step.phase)) return step.phase;
  const kind = (step.kind ?? '').toLowerCase();
  const title = (step.title ?? '').trim();
  switch (kind) {
    case 'framework':
    case 'search':
      return 'understand';
    case 'plan':
    case 'finalize':
      return 'plan';
    case 'tool_call':
      return 'execute';
    case 'reflect':
      return 'reflect';
    case 'analyze':
      if (/调用|能力|审批|失败|完成/.test(title)) return 'execute';
      return 'understand';
    default:
      return 'plan';
  }
}
