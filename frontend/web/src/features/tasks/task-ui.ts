import type { ControlledTask, TaskLifecycleStage, TaskRisk } from '@de/web-types';

export const STAGES: TaskLifecycleStage[] = ['pending', 'running', 'human_action', 'risk', 'completed'];

const stages: Record<TaskLifecycleStage, { label: string; tone: 'neutral' | 'brand' | 'warn' | 'error' | 'success' }> = {
  pending: { label: '待处理', tone: 'warn' },
  running: { label: '执行中', tone: 'brand' },
  human_action: { label: '等待人工动作', tone: 'warn' },
  risk: { label: '风险异常', tone: 'error' },
  completed: { label: '已完成', tone: 'success' },
  archived: { label: '已归档', tone: 'neutral' },
};

export function getStageMeta(stage: TaskLifecycleStage) {
  return stages[stage];
}

export function isRiskTask(sla: Pick<ControlledTask['sla'], 'risk'> | { risk: TaskRisk }) {
  return sla.risk !== 'none';
}

export type PrimaryAction = { key: 'start' | 'human_action' | 'takeover' | 'retry' | 'pause' | 'archive'; label: string };

export function getPrimaryAction(stage: TaskLifecycleStage, risk: TaskRisk): PrimaryAction {
  if (stage === 'risk' && risk === 'failed') return { key: 'takeover', label: '人工接管' };
  if (stage === 'risk') return { key: 'retry', label: '重试执行' };
  if (stage === 'pending') return { key: 'start', label: '开始执行' };
  if (stage === 'running') return { key: 'pause', label: '暂停任务' };
  if (stage === 'human_action') return { key: 'human_action', label: '处理人工动作' };
  return { key: 'archive', label: '确认归档' };
}

export function riskLabel(risk: TaskRisk) {
  return ({ none: '正常', warning: '临期', critical: '高风险', overdue: '已超时', failed: '执行失败', blocked: '依赖阻塞' } as const)[risk];
}

export function sourceLabel(source: ControlledTask['source']) {
  return ({ alert: '告警', conversation: '会话', workflow: '工作流', manual: '手工创建' } as const)[source];
}
