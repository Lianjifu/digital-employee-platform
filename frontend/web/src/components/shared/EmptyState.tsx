import type { ComponentType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * 空状态占位：图标 + 标题 + 描述 + 可选操作。
 * 用于检索无结果、黑名单为空、Top-K 无匹配等场景。
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={className || 'flex flex-col items-center justify-center py-10 px-4 text-center'}>
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-sm font-medium text-[var(--text)]">{title}</div>
      {description && (
        <div className="mt-1 max-w-xs text-xs text-[var(--text-muted)]">{description}</div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}