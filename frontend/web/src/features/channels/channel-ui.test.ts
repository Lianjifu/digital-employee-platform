import { describe, expect, it } from 'vitest';
import { deliveryPolicyStatusLabel, deploymentDeletionAction } from './channel-ui';

describe('channel control-plane UI state', () => {
  it('disables deployment deletion while published policies reference it', () => {
    expect(deploymentDeletionAction(false)).toEqual({ disabled: true, label: '已被策略引用' });
  });

  it('shows a validated draft as pending publication', () => {
    expect(deliveryPolicyStatusLabel('ready')).toBe('待发布');
  });
});
