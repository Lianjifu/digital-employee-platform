import { describe, expect, it } from 'vitest';
import { modelQueryState, policyStatusLabel, providerLifecycleAction } from './model-ui';

describe('model control-plane UI state', () => {
  it('blocks destructive provider removal when published routes still reference it', () => {
    expect(providerLifecycleAction({ deletionAllowed: false })).toEqual({ disabled: true, label: '已被路由引用' });
  });

  it('surfaces ready policies as pending publication rather than published', () => {
    expect(policyStatusLabel('ready')).toBe('待发布');
    expect(policyStatusLabel('published')).toBe('已发布');
  });

  it('does not present query failures as empty model-control-plane data', () => {
    expect(modelQueryState({ isLoading: false, isError: true, data: [] })).toEqual({ kind: 'error', label: '模型控制面数据读取失败' });
    expect(modelQueryState({ isLoading: false, isError: false, data: [] })).toEqual({ kind: 'empty', label: '暂无模型控制面数据' });
  });
});
