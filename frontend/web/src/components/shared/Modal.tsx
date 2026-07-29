import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@de/web-utils';
import { Button } from '@de/web-ui';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  children?: ReactNode;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-6xl',
};

/**
 * 通用居中弹窗。open 由父级 state 控制，纯受控。
 * - ESC 关闭
 * - 点遮罩关闭（可通过 closeOnBackdrop 关闭）
 * - 自带 Header (title + 关闭按钮) + body + footer
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  children,
}: ModalProps) {
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease]"
        onClick={() => closeOnBackdrop && onClose()}
      />
      {/* 弹窗本体 */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_20px_60px_rgba(15,23,42,0.16)] animate-[scaleIn_0.18s_ease]',
          SIZE_CLASS[size],
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="app-glass flex items-start justify-between gap-3 border-b px-6 py-5">
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
        <div className="max-h-[72vh] overflow-y-auto px-6 py-5">{children}</div>
        {/* Footer */}
        {footer && (
          <div className="app-glass flex items-center justify-end gap-2 border-t px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** 标准化 Modal 底部"取消 + 确认"按钮组 */
export function ModalActions({
  onCancel,
  onConfirm,
  confirmText = '确认',
  cancelText = '取消',
  confirmTone = 'primary',
  disabled = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmTone?: 'primary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>{cancelText}</Button>
      <Button
        variant={confirmTone === 'danger' ? 'danger' : 'primary'}
        onClick={onConfirm}
        disabled={disabled}
      >
        {confirmText}
      </Button>
    </>
  );
}
