import { describe, expect, it } from 'vitest';
import {
  budgetRiskLabel,
  modelQueryState,
  parseModelTab,
  policyStatusLabel,
  providerLifecycleAction,
  providerStatusLabel,
  providerStatusTone,
  routingDataScopeLabel,
  routingLevelPurpose,
  routingPolicyNextAction,
  summarizeRoutingPolicies,
  budgetUtilizationPercent,
  governanceDrillEligibility,
} from './model-ui';

describe('model control-plane UI state', () => {
  it('blocks destructive provider removal when published routes still reference it', () => {
    expect(providerLifecycleAction({ deletionAllowed: false })).toEqual({ disabled: true, label: '已被路由引用' });
  });

  it('surfaces ready policies as pending publication rather than published', () => {
    expect(policyStatusLabel('ready')).toBe('待发布');
    expect(policyStatusLabel('published')).toBe('已发布');
  });

  it('localizes provider lifecycle statuses', () => {
    expect(providerStatusLabel('standby')).toBe('待命');
    expect(providerStatusLabel('active')).toBe('可用');
    expect(providerStatusTone('active')).toBe('success');
    expect(providerStatusTone('standby')).toBe('warn');
  });

  it('parses model workspace tabs from URL with a safe default', () => {
    expect(parseModelTab('governance')).toBe('governance');
    expect(parseModelTab('unknown')).toBe('access');
    expect(parseModelTab(null)).toBe('access');
  });

  it('maps budget risk labels for governance summary', () => {
    expect(budgetRiskLabel('normal')).toBe('正常');
    expect(budgetRiskLabel('attention')).toBe('关注');
  });

  it('does not present query failures as empty model-control-plane data', () => {
    expect(modelQueryState({ isLoading: false, isError: true, data: [] })).toEqual({ kind: 'error', label: '模型控制面数据读取失败' });
    expect(modelQueryState({ isLoading: false, isError: false, data: [] })).toEqual({ kind: 'empty', label: '暂无模型控制面数据' });
  });

  it('explains routing level purpose and next lifecycle action', () => {
    expect(routingLevelPurpose('P0')).toContain('降级');
    expect(routingPolicyNextAction('draft')).toBe('校验草稿');
    expect(routingPolicyNextAction('ready')).toBe('发布版本');
    expect(routingDataScopeLabel({ dataScope: 'restricted', egressAllowed: false })).toBe('受限 · 禁止出境');
  });

  it('summarizes routing policy counts for workspace KPIs', () => {
    expect(summarizeRoutingPolicies([
      { id: 'a', workspaceId: 'w1', level: 'P0', primaryModelId: 'm1', fallbackModelIds: ['m2'], dataScope: 'internal', egressAllowed: true, budgetLimitUsd: 100, status: 'published', validationIssues: [] },
      { id: 'b', workspaceId: 'w1', level: 'P1', primaryModelId: 'm1', fallbackModelIds: [], dataScope: 'internal', egressAllowed: false, budgetLimitUsd: 50, status: 'draft', validationIssues: [] },
      { id: 'c', workspaceId: 'w1', level: 'P2', primaryModelId: 'm1', fallbackModelIds: [], dataScope: 'restricted', egressAllowed: false, budgetLimitUsd: 20, status: 'ready', validationIssues: [] },
    ])).toEqual({ published: 1, draft: 1, ready: 1, withFallback: 1, total: 3 });
  });

  it('computes budget utilization and drill eligibility for governance', () => {
    expect(budgetUtilizationPercent(420, 1000)).toBe(42);
    expect(budgetUtilizationPercent(10, 0)).toBeNull();
    expect(governanceDrillEligibility([
      { id: 'a', workspaceId: 'w1', level: 'P0', primaryModelId: 'm1', fallbackModelIds: ['m2'], dataScope: 'internal', egressAllowed: true, budgetLimitUsd: 100, status: 'published', validationIssues: [] },
      { id: 'b', workspaceId: 'w1', level: 'P2', primaryModelId: 'm1', fallbackModelIds: [], dataScope: 'restricted', egressAllowed: false, budgetLimitUsd: 20, status: 'published', validationIssues: [] },
    ]).count).toBe(1);
  });
});
