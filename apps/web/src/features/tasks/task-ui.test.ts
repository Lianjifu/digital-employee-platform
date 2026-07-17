import { describe, expect, it } from 'vitest';
import { getPrimaryAction } from './task-ui';

describe('controlled task primary actions', () => {
  it('requires a human takeover before a failed risk task can proceed', () => {
    expect(getPrimaryAction('risk', 'failed')).toEqual({ key: 'takeover', label: '人工接管' });
  });

  it('retries non-failed risk tasks', () => {
    expect(getPrimaryAction('risk', 'blocked')).toEqual({ key: 'retry', label: '重试执行' });
  });

  it('maps normal lifecycle stages to direct transitions', () => {
    expect(getPrimaryAction('pending', 'none').key).toBe('start');
    expect(getPrimaryAction('running', 'none').key).toBe('pause');
    expect(getPrimaryAction('completed', 'none').key).toBe('archive');
  });
});
