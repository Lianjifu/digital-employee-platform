import type { DeliveryPolicyStatus } from '@de/web-types';

export function deploymentDeletionAction(deletionAllowed: boolean) {
  return deletionAllowed ? { disabled: false, label: '删除部署' } : { disabled: true, label: '已被策略引用' };
}

export function deliveryPolicyStatusLabel(status: DeliveryPolicyStatus) {
  return ({ draft: '草稿', ready: '待发布', published: '已发布', superseded: '已替代' } as const)[status];
}
