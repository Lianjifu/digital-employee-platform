import type { ChatSession } from '@/hooks/types';

export type WorkbenchContextTab = 'overview' | 'evidence' | 'tasks' | 'approvals' | 'audit' | 'admin';

export function deriveWorkbenchSummary(session?: Pick<ChatSession, 'title' | 'messages'>) {
  const messages = session?.messages ?? [];
  const pendingApprovals = messages.filter((message) => message.approvalRequest?.decision === 'pending').length;
  const linkedTasks = messages.filter((message) => message.linkedTaskId ?? message.approvalRequest?.ticketId).length;
  const evidence = messages.reduce((total, message) => total + (message.citations?.length ?? 0), 0);
  const executions = messages.reduce((total, message) => total + (message.toolCalls?.length ?? 0), 0);

  return {
    title: session?.title || '新会话',
    pendingApprovals,
    linkedTasks,
    evidence,
    executions,
    nextAction: pendingApprovals
      ? `等待 ${pendingApprovals} 项审批`
      : linkedTasks
        ? '查看关联任务执行状态'
        : '等待下一条指令',
    tone: pendingApprovals ? 'warning' as const : 'brand' as const,
  };
}
