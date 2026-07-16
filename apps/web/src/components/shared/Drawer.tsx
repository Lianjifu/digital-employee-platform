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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease]"
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute top-0 h-full overflow-hidden border-[var(--border)] bg-[var(--surface-1)] shadow-2xl flex flex-col',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        )}
        style={{ width, maxWidth: '92vw' }}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="min-w-0">
              {title && <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>}
              {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {/* Footer */}
        {footer && (
          <div className="border-t border-[var(--border)] bg-[var(--bg)] px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}