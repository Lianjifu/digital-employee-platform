import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ImageDown, Loader2, RefreshCw, Upload } from 'lucide-react';
import { postVisualDiff, visualDiffCacheURL } from './visualdiff-api';
import {
  clampThreshold,
  clampTolerance,
  DEFAULT_THRESHOLD,
  DEFAULT_TOLERANCE,
  diffVerdictLabel,
  diffVerdictTone,
  formatDiffPercent,
  formatDiffPixels,
  readFilesAsPair,
  type VisualDiffOutcome,
  type VisualDiffResponse,
} from './visualdiff-types';

export type VisualDiffViewerProps = {
  /** Optional pre-loaded before/after base64 pair (e.g. from a parent). */
  initialBefore?: string;
  initialAfter?: string;
  /** Disable file pickers (consumer controls inputs). */
  readOnly?: boolean;
  /** Title shown above the viewer. */
  title?: string;
  /** Called with the cache key when a comparison finishes successfully. */
  onCacheKey?: (key: string, summary: { match: boolean; diffRatio: number; width: number; height: number; latencyMS: number }) => void;
};

type Slot = {
  file: File | null;
  preview: string | null;
};

function emptySlot(): Slot {
  return { file: null, preview: null };
}

async function loadSlot(file: File): Promise<Slot> {
  const preview = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
  return { file, preview };
}

function resetSlot(slot: Slot): Slot {
  if (slot.preview) {
    // preview is a data: URL — no external resources to revoke.
  }
  return emptySlot();
}

const TONE_CLASS: Record<'pass' | 'warn' | 'fail', string> = {
  pass: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  warn: 'border-amber-400 bg-amber-50 text-amber-800',
  fail: 'border-rose-400 bg-rose-50 text-rose-800',
};

export function VisualDiffViewer({
  initialBefore = '',
  initialAfter = '',
  readOnly = false,
  title = '视觉对比',
  onCacheKey,
}: VisualDiffViewerProps): JSX.Element {
  const [before, setBefore] = useState<Slot>(emptySlot);
  const [after, setAfter] = useState<Slot>(emptySlot);
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [tolerance, setTolerance] = useState<number>(DEFAULT_TOLERANCE);
  const [highlight, setHighlight] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<VisualDiffResponse | null>(null);
  const [outcome, setOutcome] = useState<VisualDiffOutcome | null>(null);
  const lastRequestId = useRef(0);

  const verdict = useMemo(() => {
    if (!result) {
      return null;
    }
    return {
      tone: diffVerdictTone(result.match, result.diffRatio),
      label: diffVerdictLabel(result.match, result.diffRatio),
    };
  }, [result]);

  const handleFile = useCallback(async (side: 'before' | 'after', file: File) => {
    const slot = await loadSlot(file);
    if (side === 'before') {
      setBefore(slot);
    } else {
      setAfter(slot);
    }
  }, []);

  const clear = useCallback((side: 'before' | 'after') => {
    if (side === 'before') {
      setBefore((prev) => resetSlot(prev));
    } else {
      setAfter((prev) => resetSlot(prev));
    }
  }, []);

  const run = useCallback(async () => {
    if (!before.file || !after.file) {
      setOutcome({
        kind: 'err',
        error: { status: 0, message: '请先选择 before 与 after 两张图片' },
      });
      return;
    }
    setBusy(true);
    const requestId = ++lastRequestId.current;
    try {
      const pair = await readFilesAsPair(before.file, after.file);
      const out = await postVisualDiff({
        before: pair.before,
        after: pair.after,
        tolerance: clampTolerance(tolerance),
        threshold: clampThreshold(threshold),
        highlight,
      });
      if (requestId !== lastRequestId.current) {
        return; // newer run superseded this one
      }
      setOutcome(out);
      if (out.kind === 'ok') {
        setResult(out.data);
        if (onCacheKey && out.data.cacheKey) {
          onCacheKey(out.data.cacheKey, {
            match: out.data.match,
            diffRatio: out.data.diffRatio,
            width: out.data.width,
            height: out.data.height,
            latencyMS: out.data.latencyMS,
          });
        }
      } else {
        setResult(null);
      }
    } catch (err) {
      if (requestId !== lastRequestId.current) {
        return;
      }
      setOutcome({
        kind: 'err',
        error: { status: 0, message: err instanceof Error ? err.message : '对比失败' },
      });
      setResult(null);
    } finally {
      if (requestId === lastRequestId.current) {
        setBusy(false);
      }
    }
  }, [before.file, after.file, tolerance, threshold, highlight, onCacheKey]);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {verdict && (
          <span
            data-testid="visualdiff-verdict"
            data-tone={verdict.tone}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${TONE_CLASS[verdict.tone]}`}
          >
            {verdict.label}
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SlotPanel
          label="Before"
          slot={before}
          readOnly={readOnly}
          onPick={(file) => handleFile('before', file)}
          onClear={() => clear('before')}
        />
        <SlotPanel
          label="After"
          slot={after}
          readOnly={readOnly}
          onPick={(file) => handleFile('after', file)}
          onClear={() => clear('after')}
        />
      </div>

      <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">阈值（threshold）</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(clampThreshold(parseFloat(e.target.value)))}
            disabled={readOnly}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">容差（tolerance 0-255）</span>
          <input
            type="number"
            min={0}
            max={255}
            step={1}
            value={tolerance}
            onChange={(e) => setTolerance(clampTolerance(parseFloat(e.target.value)))}
            disabled={readOnly}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 pt-5 text-sm">
          <input
            type="checkbox"
            checked={highlight}
            onChange={(e) => setHighlight(e.target.checked)}
            disabled={readOnly}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span>返回高亮 PNG</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy || readOnly || !before.file || !after.file}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {busy ? '对比中…' : '开始对比'}
        </button>
        {result && (
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <div>
              <dt className="inline font-medium">差异像素</dt>{' '}
              <dd className="inline">{formatDiffPixels(result.diffPixels, result.total)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">差异比例</dt>{' '}
              <dd className="inline">{formatDiffPercent(result.diffRatio)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">图像</dt>{' '}
              <dd className="inline">
                {result.width}×{result.height}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">耗时</dt>{' '}
              <dd className="inline">{result.latencyMS} ms</dd>
            </div>
          </dl>
        )}
      </div>

      {outcome?.kind === 'err' && (
        <div className="flex items-start gap-2 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>
            对比失败（HTTP {outcome.error.status}）{outcome.error.message ? `：${outcome.error.message}` : ''}
          </span>
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <DiffPanel
            label="Before"
            src={before.preview ?? (initialBefore ? `data:image/png;base64,${initialBefore}` : '')}
            alt="before"
          />
          <DiffPanel
            label="After"
            src={after.preview ?? (initialAfter ? `data:image/png;base64,${initialAfter}` : '')}
            alt="after"
          />
          <DiffPanel
            label="Diff"
            src={
              result.diffPng
                ? `data:image/png;base64,${result.diffPng}`
                : visualDiffCacheURL(result.cacheKey)
            }
            alt="diff"
            downloadName={result.cacheKey ? `${result.cacheKey}.png` : undefined}
          />
        </div>
      )}
    </section>
  );
}

function SlotPanel(props: {
  label: string;
  slot: Slot;
  readOnly: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}): JSX.Element {
  const { label, slot, readOnly, onPick, onClear } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3">
      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
        <span>{label}</span>
        {slot.file && !readOnly && (
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
            onClick={onClear}
          >
            清除
          </button>
        )}
      </div>
      {slot.preview ? (
        <img
          src={slot.preview}
          alt={label}
          className="max-h-48 w-full rounded border border-slate-200 object-contain"
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded border border-slate-100 bg-slate-50 text-xs text-slate-400">
          未选择
        </div>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" />
          选择 PNG
        </button>
      )}
      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          data-testid="visualdiff-file-input"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              onPick(f);
            }
            e.target.value = '';
          }}
        />
      )}
      {slot.file && (
        <span className="truncate text-xs text-slate-500" title={slot.file.name}>
          {slot.file.name} · {Math.round(slot.file.size / 1024)} KB
        </span>
      )}
    </div>
  );
}

function DiffPanel(props: {
  label: string;
  src: string;
  alt: string;
  downloadName?: string;
}): JSX.Element {
  const { label, src, alt, downloadName } = props;
  return (
    <figure className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <figcaption className="flex items-center justify-between text-xs font-medium text-slate-600">
        <span>{label}</span>
        {downloadName && src && (
          <a
            href={src}
            download={downloadName}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
          >
            <ImageDown className="h-3 w-3" />
            下载
          </a>
        )}
      </figcaption>
      {src ? (
        <img
          src={src}
          alt={alt}
          className="max-h-64 w-full rounded border border-slate-200 object-contain"
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded border border-slate-100 bg-slate-50 text-xs text-slate-400">
          等待对比
        </div>
      )}
    </figure>
  );
}

export default VisualDiffViewer;