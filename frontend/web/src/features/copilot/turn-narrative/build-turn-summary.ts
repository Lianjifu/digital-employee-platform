import type { ChatMessageEx } from '@/hooks/types';
import type { TurnMeta, TurnPhaseBlock } from './types';

export function buildTurnSummary(
  message: Pick<ChatMessageEx, 'metrics' | 'cognitive' | 'turnMeta' | 'reasoningSteps'>,
  phases: TurnPhaseBlock[],
  streaming?: boolean,
): string {
  if (message.turnMeta?.summary && !streaming) {
    return message.turnMeta.summary;
  }
  const frameworkHint = message.cognitive?.bypass
    ? ''
    : (message.cognitive?.primaryLabel
      || message.reasoningSteps?.find((s) => s.frameworkLabel)?.frameworkLabel
      || '');
  if (streaming) {
    const running = phases.find((p) => p.status === 'running');
    const activeLabel = running?.label ?? '思考中';
    const stepCount = message.reasoningSteps?.length ?? 0;
    return `思考中 · ${activeLabel}${stepCount ? ` · ${stepCount} 步` : ''}${frameworkHint ? ` · ${frameworkHint}` : ''}`;
  }
  const durationMs = message.metrics?.durationMs;
  const durationLabel = durationMs && durationMs > 0
    ? `${Math.max(1, Math.round(durationMs / 1000))}s`
    : '';
  const activePhases = phases.filter((p) => p.status !== 'skipped' && (p.steps.length > 0 || p.status === 'done')).length;
  const parts = ['已思考'];
  if (durationLabel) parts.push(durationLabel);
  if (activePhases > 0) parts.push(`${activePhases} 阶段`);
  if (frameworkHint) parts.push(frameworkHint);
  else if (message.cognitive?.bypass) parts.push('直接作答');
  return parts.join(' · ');
}

export function parseTurnMeta(raw: unknown): TurnMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as TurnMeta;
}
