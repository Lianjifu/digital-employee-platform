/**
 * @de/web-ui — PSSP 设计系统组件库
 * 与 docs/01-product/mockups/assets/styles.css 1:1 对齐
 * 双主题自适应（light / dark）
 */
import { forwardRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@de/web-utils';

// ============ Button ============
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-200 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 focus-visible:ring-offset-1 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap';

const btnVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-[var(--brand)] to-[var(--brand-hover)] text-white border border-transparent ' +
    'shadow-[0_2px_8px_rgba(79,70,229,0.3)] hover:shadow-[0_4px_12px_rgba(79,70,229,0.4)] hover:-translate-y-px',
  secondary:
    'bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--bg-hover)]',
  ghost: 'bg-transparent text-[var(--text)] hover:bg-[var(--bg-elevated)]',
  danger:
    'bg-gradient-to-br from-[var(--danger)] to-[#dc2626] text-white border border-transparent ' +
    'shadow-[0_2px_8px_rgba(239,68,68,0.3)] hover:shadow-[0_4px_12px_rgba(239,68,68,0.4)]',
  outline: 'border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--bg-hover)] hover:-translate-y-px',
};

const btnSizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-[13px]',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-[15px]',
  icon: 'h-9 w-9',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(btnBase, btnVariants[variant], btnSizes[size], className)}
      {...rest}
    >
      {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

// ============ Card ============
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-sm transition-shadow duration-200 hover:shadow-md',
        className,
      )}
      {...rest}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between border-b border-[var(--border)] px-5 py-4', className)} {...rest} />
);
export const CardTitle = ({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-base font-semibold text-[var(--text)] flex items-center gap-2', className)} {...rest} />
);
export const CardBody = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-5', className)} {...rest} />
);
export const CardFooter = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-t border-[var(--border)] px-5 py-3', className)} {...rest} />
);

// ============ Input ============
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3.5 text-sm text-[var(--text)]',
        'placeholder:text-[var(--text-muted)] transition-all duration-200',
        'focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';

// ============ Textarea ============
export const Textarea = forwardRef<HTMLTextAreaElement, HTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--text)]',
        'placeholder:text-[var(--text-muted)] transition-all duration-200',
        'focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';

// ============ Badge ============
export type BadgeTone = 'neutral' | 'success' | 'warn' | 'error' | 'info' | 'brand' | 'purple';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--bg-hover)] text-[var(--text-secondary)]',
  success: 'bg-[var(--success-bg)] text-[var(--success)]',
  warn: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  error: 'bg-[var(--danger-bg)] text-[var(--danger)]',
  info: 'bg-[var(--info-bg)] text-[var(--info)]',
  brand: 'bg-[var(--brand-light)] text-[var(--brand)]',
  purple: 'bg-[var(--purple-bg)] text-[var(--purple)]',
};

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium leading-none font-mono',
        badgeTones[tone],
        className,
      )}
      {...rest}
    />
  );
}

// ============ Tag (chip) ============
export function Tag({ children, onClose, className }: { children: ReactNode; onClose?: () => void; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs',
        className,
      )}
    >
      {children}
      {onClose && (
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
          ×
        </button>
      )}
    </span>
  );
}

// ============ Progress ============
export function Progress({ value, max = 100, tone = 'primary', className }: { value: number; max?: number; tone?: 'primary' | 'success' | 'warn' | 'error'; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color =
    tone === 'success'
      ? 'bg-gradient-to-r from-[var(--success)] to-[#059669]'
      : tone === 'warn'
        ? 'bg-gradient-to-r from-[var(--warning)] to-[#d97706]'
        : tone === 'error'
          ? 'bg-gradient-to-r from-[var(--danger)] to-[#dc2626]'
          : 'bg-gradient-to-r from-[var(--brand)] to-[var(--purple)]';
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded bg-[var(--bg-hover)]', className)}>
      <div className={cn('h-full transition-all duration-300 rounded', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ============ Separator ============
export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-[var(--border)]', className)} />;
}

// ============ Avatar ============
export function Avatar({ name, src, size = 28, className }: { name: string; src?: string; size?: number; className?: string }) {
  const initial = name?.[0]?.toUpperCase() ?? '?';
  const hue = Array.from(name || '').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const bg = `linear-gradient(135deg, hsl(${Math.abs(hue) % 360}, 65%, 55%), hsl(${(Math.abs(hue) + 60) % 360}, 65%, 50%))`;
  return (
    <div
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full text-white font-semibold shadow-sm', className)}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
    >
      {src ? <img src={src} alt={name} className="h-full w-full rounded-full object-cover" /> : initial}
    </div>
  );
}

// ============ Tabs ============
export interface TabItem {
  key: string;
  label: ReactNode;
  badge?: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (k: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex border-b border-[var(--border)] gap-1', className)}>
      {items.map((it) => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={cn(
              'relative flex items-center gap-1.5 px-5 py-3 text-sm transition-colors duration-200',
              active
                ? 'text-[var(--brand)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]',
            )}
          >
            {it.label}
            {it.badge}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--brand)]" />}
          </button>
        );
      })}
    </div>
  );
}

// ============ Status Dot ============
export function Dot({ tone = 'success' }: { tone?: 'success' | 'warning' | 'danger' | 'idle' }) {
  const color =
    tone === 'success' ? 'bg-[var(--success)]'
    : tone === 'warning' ? 'bg-[var(--warning)]'
    : tone === 'danger' ? 'bg-[var(--danger)]'
    : 'bg-[var(--text-muted)]';
  const animate = tone !== 'idle' ? 'animate-pulse' : '';
  return <span className={cn('inline-block h-2 w-2 rounded-full mr-1.5', color, animate)} />;
}

// ============ Skeleton ============
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[var(--bg-hover)]', className)} />;
}

// ============ Empty ============
export function Empty({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {icon && <div className="text-4xl text-[var(--text-muted)] opacity-30">{icon}</div>}
      <div className="text-base font-semibold text-[var(--text-secondary)]">{title}</div>
      {description && <div className="max-w-xs text-sm text-[var(--text-muted)]">{description}</div>}
      {action}
    </div>
  );
}

// ============ Spinner ============
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      style={{ width: size, height: size }}
    />
  );
}

// ============ Modal ============
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-lg bg-[var(--surface-1)] border border-[var(--border)] shadow-xl"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="text-base font-semibold">{title}</div>
            <button className="text-[var(--text-muted)] hover:text-[var(--text)]" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ============ Toast ============
type ToastItem = { id: number; tone: 'success' | 'warn' | 'error' | 'info'; text: string };

const listeners: Array<(t: ToastItem) => void> = [];
let counter = 0;

export const toast = {
  success: (text: string) => emit('success', text),
  warn: (text: string) => emit('warn', text),
  error: (text: string) => emit('error', text),
  info: (text: string) => emit('info', text),
};

function emit(tone: ToastItem['tone'], text: string) {
  const item = { id: ++counter, tone, text };
  listeners.forEach((l) => l(item));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useState(() => {
    listeners.push((it) => {
      setItems((arr) => [...arr, it]);
      setTimeout(() => setItems((arr) => arr.filter((x) => x.id !== it.id)), 3000);
    });
  });
  const toneClass: Record<ToastItem['tone'], string> = {
    success: 'border-[var(--success)]/40 bg-[var(--surface-1)] text-[var(--success)]',
    warn: 'border-[var(--warning)]/40 bg-[var(--surface-1)] text-[var(--warning)]',
    error: 'border-[var(--danger)]/40 bg-[var(--surface-1)] text-[var(--danger)]',
    info: 'border-[var(--info)]/40 bg-[var(--surface-1)] text-[var(--info)]',
  };
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {items.map((it) => (
        <div
          key={it.id}
          className={cn(
            'pointer-events-auto min-w-[200px] rounded-lg border bg-[var(--surface-1)] px-4 py-2.5 text-sm shadow-lg',
            toneClass[it.tone],
          )}
        >
          {it.text}
        </div>
      ))}
    </div>
  );
}