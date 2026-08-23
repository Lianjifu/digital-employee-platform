import { useEffect, useState } from 'react';
import { Activity, Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { ChatMessageEx } from '@/hooks/types';

type Props = {
  message: ChatMessageEx;
  streaming?: boolean;
};

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '';
  const sec = Math.max(1, Math.round(ms / 1000));
  return `${sec}s`;
}

/** 助手气泡内可折叠思考：合并 thinking + reasoningSteps */
export function ThoughtPanel({ message, streaming }: Props) {
  const thinking = (message.thinking ?? message.thinkingSummary ?? '').trim();
  const steps = message.reasoningSteps ?? [];
  const hasContent = thinking.length > 0 || steps.length > 0;
  const [expanded, setExpanded] = useState(Boolean(streaming));

  useEffect(() => {
    if (streaming) setExpanded(true);
    else setExpanded(false);
  }, [streaming, message.id]);

  if (!hasContent && streaming) {
    return (
      <div className="copilot-message__thought max-w-[920px] rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/60 px-3 py-2 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-2">
          <Brain className="h-3 w-3 shrink-0 text-[var(--brand)]" />
          正在准备推理与工具调用，复杂任务可能需要数十秒…
        </span>
      </div>
    );
  }

  if (!hasContent) return null;

  const durationLabel = formatDuration(message.metrics?.durationMs);
  const summary = durationLabel
    ? `已思考 · ${durationLabel}`
    : steps.length
      ? `已思考 · ${steps.length} 步`
      : '已思考';

  return (
    <div className="copilot-message__thought max-w-[920px] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`thought-${message.id}`}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <Brain className="h-3 w-3 shrink-0" />
        <span className="font-semibold">{streaming ? '思考中…' : summary}</span>
        {expanded ? <ChevronDown className="ml-auto h-3 w-3" /> : <ChevronRight className="ml-auto h-3 w-3" />}
      </button>
      {expanded && (
        <div id={`thought-${message.id}`} className="space-y-2 px-3 pb-2">
          {thinking ? (
            <div className="text-[11px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap">
              {thinking}
            </div>
          ) : null}
          {steps.length > 0 && (
            <div className="space-y-1.5">
              {!thinking && (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)]">
                  <Activity className="h-3 w-3" />
                  执行步骤
                </div>
              )}
              {steps.map((s, i) => (
                <div key={s.id} className="flex items-start gap-2 text-[11px]">
                  <span className={cn(
                    'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--brand-light)] text-[9px] font-mono text-[var(--brand)]',
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-secondary)]">
                      <span className="mr-1 font-mono text-[9px] text-[var(--text-muted)]">[{s.kind}]</span>
                      {s.title}
                    </div>
                    {s.detail ? <div className="text-[var(--text-muted)]">{s.detail}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
