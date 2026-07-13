/**
 * @web/ui — 原子化组件库（shadcn 风格、CSS 变量主题、原生可复制）
 * 不引入额外样式依赖（保持轻量、可被 Tailwind 配置覆盖）
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
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap';

const btnVariants: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-primary)] text-white hover:opacity-90 active:opacity-80',
  secondary: 'bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface-3)]',
  ghost: 'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
  outline: 'border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-surface-2)]',
};

const btnSizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-4 text-sm',
  icon: 'h-8 w-8',
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
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]',
        'shadow-sm',
        className,
      )}
      {...rest}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3', className)} {...rest} />
);
export const CardTitle = ({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-sm font-semibold text-[var(--color-text)]', className)} {...rest} />
);
export const CardBody = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4', className)} {...rest} />
);
export const CardFooter = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-t border-[var(--color-border)] px-4 py-3', className)} {...rest} />
);

// ============ Input ============
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 text-sm',
        'placeholder:text-[var(--color-text-muted)]',
        'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';

// ============ Badge ============
export type BadgeTone = 'neutral' | 'success' | 'warn' | 'error' | 'info' | 'primary';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)]',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  error: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  info: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  primary: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
};

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none',
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
        'inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs',
        className,
      )}
    >
      {children}
      {onClose && (
        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
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
      ? 'bg-emerald-500'
      : tone === 'warn'
        ? 'bg-amber-500'
        : tone === 'error'
          ? 'bg-rose-500'
          : 'bg-[var(--color-primary)]';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]', className)}>
      <div className={cn('h-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ============ Separator ============
export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-[var(--color-border)]', className)} />;
}

// ============ Avatar ============
export function Avatar({ name, src, size = 28, className }: { name: string; src?: string; size?: number; className?: string }) {
  const initial = name?.[0]?.toUpperCase() ?? '?';
  const hue = Array.from(name || '').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const bg = `hsl(${Math.abs(hue) % 360}, 60%, 45%)`;
  return (
    <div
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full text-white font-medium', className)}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.45 }}
    >
      {src ? <img src={src} alt={name} className="h-full w-full rounded-full object-cover" /> : initial}
    </div>
  );
}

// ============ Tabs (原子化、无依赖) ============
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
    <div className={cn('flex items-center gap-1 border-b border-[var(--color-border)]', className)}>
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            'relative flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
            value === it.key
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          )}
        >
          {it.label}
          {it.badge}
          {value === it.key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-primary)]" />}
        </button>
      ))}
    </div>
  );
}

// ============ Skeleton ============
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[var(--color-surface-3)]', className)} />;
}

// ============ Empty ============
export function Empty({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="text-3xl text-[var(--color-text-muted)]">{icon}</div>}
      <div className="text-sm font-medium text-[var(--color-text)]">{title}</div>
      {description && <div className="max-w-xs text-xs text-[var(--color-text-muted)]">{description}</div>}
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

// ============ Modal (轻量、不依赖 portal 库) ============
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="rounded-xl bg-[var(--color-surface-1)] shadow-2xl"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="text-sm font-semibold">{title}</div>
            <button className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ============ Toast (最轻量实现) ============
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    listeners.push((it) => {
      setItems((arr) => [...arr, it]);
      setTimeout(() => setItems((arr) => arr.filter((x) => x.id !== it.id)), 3000);
    });
  });
  const toneClass: Record<ToastItem['tone'], string> = {
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  };
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {items.map((it) => (
        <div
          key={it.id}
          className={cn(
            'pointer-events-auto min-w-[200px] rounded-md border bg-[var(--color-surface-1)] px-3 py-2 text-sm shadow-lg',
            toneClass[it.tone],
          )}
        >
          {it.text}
        </div>
      ))}
    </div>
  );
}