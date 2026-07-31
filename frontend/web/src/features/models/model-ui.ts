import type { ModelLevel, ModelProviderStatus, ProviderImpact, RoutingPolicyDraft, RoutingPolicyStatus } from '@de/web-types';

export type ModelWorkspaceTab = 'access' | 'routing' | 'governance' | 'audit';
export type RoutingPolicyLevel = Exclude<ModelLevel, 'audit'>;

const TAB_KEYS: ModelWorkspaceTab[] = ['access', 'routing', 'governance', 'audit'];

export function parseModelTab(value: string | null | undefined): ModelWorkspaceTab {
  return TAB_KEYS.includes(value as ModelWorkspaceTab) ? (value as ModelWorkspaceTab) : 'access';
}

/** 路由等级用途：调度优先级与可用性期望，不是会话里的模型选择器。 */
export function routingLevelPurpose(level: RoutingPolicyLevel): string {
  return ({
    P0: '关键链路 · 建议配置降级链',
    P1: '核心业务 · 主备可用优先',
    P2: '常规任务 · 成本与合规并重',
    P3: '低风险探索 · 可先单模型发布',
  } as const)[level];
}

export function routingDataScopeLabel(policy: Pick<RoutingPolicyDraft, 'dataScope' | 'egressAllowed'>): string {
  if (policy.dataScope === 'restricted') return '受限 · 禁止出境';
  return policy.egressAllowed ? '内部 · 可出境' : '内部 · 境内';
}

/** 列表「下一步」提示，驱动草稿→校验→发布闭环。 */
export function routingPolicyNextAction(status: RoutingPolicyStatus): string {
  return ({
    draft: '校验草稿',
    ready: '发布版本',
    published: '查看版本 / 调整需重校验',
    superseded: '查看历史快照',
  } as const)[status];
}

export function summarizeRoutingPolicies(policies: RoutingPolicyDraft[]) {
  const published = policies.filter((item) => item.status === 'published').length;
  const draft = policies.filter((item) => item.status === 'draft').length;
  const ready = policies.filter((item) => item.status === 'ready').length;
  const withFallback = policies.filter((item) => item.status === 'published' && item.fallbackModelIds.length > 0).length;
  return { published, draft, ready, withFallback, total: policies.length };
}

/** 预算占用比例（0–100），用于治理页进度条；无上限时返回 null。 */
export function budgetUtilizationPercent(spendUsd: number, budgetUsd: number): number | null {
  if (budgetUsd <= 0) return null;
  return Math.min(100, Math.round((spendUsd / budgetUsd) * 100));
}

export function governanceDrillEligibility(policies: RoutingPolicyDraft[]) {
  const drillable = policies.filter((item) => item.status === 'published' && item.fallbackModelIds.length > 0);
  return { drillable, count: drillable.length, total: policies.length };
}

export function providerLifecycleAction(impact: Pick<ProviderImpact, 'deletionAllowed'>) {
  return impact.deletionAllowed
    ? { disabled: false, label: '删除供应商' }
    : { disabled: true, label: '已被路由引用' };
}

export function policyStatusLabel(status: RoutingPolicyStatus) {
  return ({ draft: '草稿', ready: '待发布', published: '已发布', superseded: '已替代' } as const)[status];
}

export function providerStatusLabel(status: ModelProviderStatus) {
  return ({
    draft: '草稿',
    standby: '待命',
    active: '可用',
    disabled: '已停用',
    offline: '离线',
  } as const)[status];
}

export function providerStatusTone(status: ModelProviderStatus): 'success' | 'warn' | 'error' | 'neutral' | 'info' {
  if (status === 'active') return 'success';
  if (status === 'standby' || status === 'draft') return 'warn';
  if (status === 'disabled' || status === 'offline') return 'error';
  return 'neutral';
}

export function budgetRiskLabel(risk: string) {
  return ({ normal: '正常', attention: '关注', critical: '告警' } as const)[risk as 'normal' | 'attention' | 'critical'] ?? risk;
}

export function modelQueryState({ isLoading, isError, data }: { isLoading: boolean; isError: boolean; data?: readonly unknown[] }) {
  if (isLoading) return { kind: 'loading' as const, label: '正在读取模型控制面数据' };
  if (isError) return { kind: 'error' as const, label: '模型控制面数据读取失败' };
  if (data && data.length === 0) return { kind: 'empty' as const, label: '暂无模型控制面数据' };
  return { kind: 'ready' as const, label: '' };
}
