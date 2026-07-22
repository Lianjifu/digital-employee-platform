import type { ProviderImpact, RoutingPolicyStatus } from '@de/web-types';

export function providerLifecycleAction(impact: Pick<ProviderImpact, 'deletionAllowed'>) {
  return impact.deletionAllowed
    ? { disabled: false, label: '删除供应商' }
    : { disabled: true, label: '已被路由引用' };
}

export function policyStatusLabel(status: RoutingPolicyStatus) {
  return ({ draft: '草稿', ready: '待发布', published: '已发布', superseded: '已替代' } as const)[status];
}

export function modelQueryState({ isLoading, isError, data }: { isLoading: boolean; isError: boolean; data?: readonly unknown[] }) {
  if (isLoading) return { kind: 'loading' as const, label: '正在读取模型控制面数据' };
  if (isError) return { kind: 'error' as const, label: '模型控制面数据读取失败' };
  if (data && data.length === 0) return { kind: 'empty' as const, label: '暂无模型控制面数据' };
  return { kind: 'ready' as const, label: '' };
}
