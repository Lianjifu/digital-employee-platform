import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@de/web-utils';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  side?: 'right' | 'left';
  width?: number;
  footer?: ReactNode;
  flush?: boolean;
  children?: ReactNode;
}

/**
 * 通用侧滑面板。open 受控。
 * - ESC 关闭
 * - 点遮罩关闭
 * - 滑入动画（CSS keyframes 由全局样式提供，或内联 transition）
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = 'right',
  width = 480,
  footer,
  flush = false,
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[drawerFadeIn_220ms_ease-out]"
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute top-0 h-full overflow-hidden border-[var(--border)] bg-[var(--surface-1)] shadow-[-12px_0_40px_rgba(15,23,42,0.12)] flex flex-col animate-[drawerSlideIn_240ms_ease-out]',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          'max-sm:!left-0 max-sm:!right-0 max-sm:!w-full max-sm:border-l-0 max-sm:border-r-0',
        )}
        style={{ width, maxWidth: '92vw' }}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-6 py-5">
            <div className="min-w-0">
              {title && <h3 className="text-[15px] font-semibold text-[var(--text)]">{title}</h3>}
              {description && <p className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* Body */}
        <div className={cn('flex-1 overflow-y-auto bg-[var(--bg-elevated)]/20', flush ? 'px-0 py-0' : 'px-6 py-5')}>{children}</div>
        {/* Footer */}
        {footer && (
          <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)]/50 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
