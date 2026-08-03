import { ShieldCheck } from 'lucide-react';
import { isAuditorReadonly } from '@/features/role-nav/role-nav';
import { useAuthStore } from '@/stores/authStore';

export function RoleReadonlyBanner({ className }: { className?: string }) {
  const role = useAuthStore((state) => state.user?.role);
  if (!isAuditorReadonly(role)) return null;
  return (
    <div
      role="status"
      className={className ?? 'mb-3 flex items-start gap-2 rounded-lg bg-[var(--info-bg)] px-3 py-2 text-[11px] leading-5 text-[var(--info)]'}
    >
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>审计只读模式 · 可核查证据与策略，不可变更配置或执行写操作。</span>
    </div>
  );
}
