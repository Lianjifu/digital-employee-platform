import type { ChatMessageEx, ReasoningStep } from '@/hooks/types';
import { inferPhaseFromStep } from './infer-phase';
import { phaseLabel } from './phase-labels';
import type { TurnMeta, TurnPhaseBlock, TurnPhaseId, TurnPhaseStatus, TurnTaskItem } from './types';
import { TURN_PHASE_ORDER } from './types';

const MAX_STEPS_PER_PHASE = 6;

function emptyBlocks(): TurnPhaseBlock[] {
  return TURN_PHASE_ORDER.map((phase) => ({
    phase,
    label: phaseLabel(phase),
    status: 'pending' as TurnPhaseStatus,
    steps: [],
  }));
}

function mergePhaseStatus(current: TurnPhaseStatus, next: TurnPhaseStatus): TurnPhaseStatus {
  if (current === 'running' || next === 'running') return 'running';
  if (current === 'done' || next === 'done') return 'done';
  if (current === 'skipped' || next === 'skipped') return 'skipped';
  return next;
}

export function groupTurnPhases(
  steps: ReasoningStep[] | undefined,
  tasks: TurnTaskItem[] | undefined,
  cognitive: ChatMessageEx['cognitive'],
  streaming?: boolean,
  persisted?: TurnMeta,
): TurnPhaseBlock[] {
  if (persisted?.phases?.length) {
    const byPhase = new Map(persisted.phases.map((p) => [p.phase, p]));
    return TURN_PHASE_ORDER.map((phase) => {
      const saved = byPhase.get(phase);
      const liveSteps = (steps ?? []).filter((s) => inferPhaseFromStep(s) === phase);
      return {
        phase,
        label: saved?.label ?? phaseLabel(phase),
        status: saved?.status ?? (liveSteps.length ? 'done' : 'pending'),
        steps: liveSteps.length ? liveSteps.slice(-MAX_STEPS_PER_PHASE) : (saved?.steps ?? []),
        startedAt: saved?.startedAt,
        endedAt: saved?.endedAt,
      };
    }).filter((b) => b.status !== 'pending' || b.steps.length > 0 || (b.phase === 'plan' && (tasks?.length ?? 0) > 0));
  }

  const blocks = emptyBlocks();
  const index = new Map<TurnPhaseId, TurnPhaseBlock>();
  for (const b of blocks) index.set(b.phase, b);

  for (const step of steps ?? []) {
    const phase = inferPhaseFromStep(step);
    const block = index.get(phase);
    if (!block) continue;
    block.steps.push(step);
    block.status = mergePhaseStatus(block.status, 'done');
    if (!block.startedAt && step.startedAt) block.startedAt = step.startedAt;
    if (step.endedAt || step.startedAt) block.endedAt = step.endedAt ?? step.startedAt;
  }

  if (cognitive?.bypass) {
    const plan = index.get('plan');
    if (plan && plan.steps.length === 0) plan.status = 'skipped';
  }

  if ((tasks?.length ?? 0) > 0) {
    const plan = index.get('plan');
    if (plan && plan.status === 'pending') plan.status = 'done';
  }

  if (streaming) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]!;
      if (b.steps.length > 0 || b.status === 'done') {
        if (b.status !== 'skipped') b.status = 'running';
        break;
      }
    }
  }

  return blocks
    .map((b) => ({
      ...b,
      steps: b.steps.length > MAX_STEPS_PER_PHASE
        ? b.steps.slice(-MAX_STEPS_PER_PHASE)
        : b.steps,
    }))
    .filter((b) => {
      if (b.phase === 'reflect' && b.steps.length === 0 && b.status === 'pending') return false;
      if (cognitive?.bypass && b.phase === 'plan' && b.status === 'skipped') return true;
      return b.status !== 'pending' || b.steps.length > 0;
    });
}

export function hiddenStepCount(steps: ReasoningStep[], visible: ReasoningStep[]): number {
  return Math.max(0, steps.length - visible.length);
}
