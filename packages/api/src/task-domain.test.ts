import { describe, expect, it } from 'vitest';
import { createTaskDomain } from './mock';

describe('task domain', () => {
  it('rejects completion while approval is pending', () => {
    expect(() => createTaskDomain().transition('t2', 'completed', { actor: '王昊' }))
      .toThrow('任务等待人工审批');
  });

  it('writes an audit event for takeover', () => {
    const task = createTaskDomain().takeover('t1', { actor: '王昊', reason: '处理超时风险' });

    expect(task.auditEvents.at(-1)?.action).toBe('人工接管');
  });
});
