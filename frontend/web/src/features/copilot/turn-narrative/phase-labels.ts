import type { TurnPhaseId } from './types';

export const PHASE_LABELS: Record<TurnPhaseId, string> = {
  understand: '意图理解',
  plan: '任务规划',
  execute: '工具执行',
  reflect: '质量复核',
};

export function phaseLabel(phase: TurnPhaseId): string {
  return PHASE_LABELS[phase] ?? phase;
}
