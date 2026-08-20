import { useId, useRef, useState } from 'react';
import { cn } from '@de/web-utils';
import { formatTokenCount, type ContextUsage } from './composer-context';
import { ComposerPortal } from './composer-portal';

type Props = {
  usage: ContextUsage;
};

export function ComposerContextUsage({ usage }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const pct = Math.max(0, Math.min(100, Math.round(usage.percent)));
  const pctLabel = `${pct}%`;
  const tone = usage.percent > 90 ? 'danger' : usage.percent > 60 ? 'warning' : 'ok';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        title="上下文占用"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'copilot-composer__usage-btn inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px]',
          'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
          tone === 'warning' && 'text-[var(--warning)]',
          tone === 'danger' && 'text-[var(--danger)]',
        )}
      >
        <span className="text-[var(--text-secondary)]">上下文</span>
        <span className="font-mono tabular-nums font-medium">{pctLabel}</span>
      </button>
      <ComposerPortal
        open={open}
        anchorRef={btnRef}
        onClose={() => setOpen(false)}
        width={224}
        className="copilot-composer__menu overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 shadow-lg"
      >
        <div id={popId} role="dialog" aria-label="Context window">
          <div className="text-[11px] font-semibold text-[var(--text)]">Context window</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-mono tabular-nums text-[var(--text-secondary)]">
              {formatTokenCount(usage.used)} / {formatTokenCount(usage.max)}
            </span>
            <span className="font-mono tabular-nums text-[var(--text-muted)]">{pctLabel}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-hover)]">
            <div
              className={cn(
                'h-full rounded-full transition-[width]',
                tone === 'danger' ? 'bg-[var(--danger)]' : tone === 'warning' ? 'bg-[var(--warning)]' : 'bg-[var(--success)]',
              )}
              style={{ width: `${Math.min(100, usage.percent)}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {usage.estimated
              ? '当前为估算占用（尚无 promptTokens）。接近上限时将优先保留近期对话，更早要点写入工作记忆。'
              : '接近上限时将自动压缩历史，优先保留近期对话与工作记忆。'}
          </p>
        </div>
      </ComposerPortal>
    </>
  );
}
