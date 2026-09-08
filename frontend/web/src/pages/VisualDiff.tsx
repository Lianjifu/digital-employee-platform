import { useState } from 'react';
import { Camera, FileImage } from 'lucide-react';
import { VisualDiffViewer } from '@/features/visualdiff';

export default function VisualDiffPage(): JSX.Element {
  const [history, setHistory] = useState<Array<{
    cacheKey: string;
    diffRatio: number;
    match: boolean;
    width: number;
    height: number;
    latencyMS: number;
    timestamp: number;
  }>>([]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Camera className="h-6 w-6 text-indigo-600" />
            视觉对比
          </h1>
          <p className="text-sm text-slate-500">
            上传 before / after 两张 PNG，自动按像素对齐、容差过滤并产出高亮图。
            <span className="ml-1">
              后端：
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/visualdiff</code>
              ；
              缓存图：
              <code className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-xs">GET /api/visualdiff/&lt;key&gt;.png</code>
            </span>
          </p>
        </div>
        <FileImage className="h-10 w-10 text-slate-200" />
      </header>

      <VisualDiffViewer
        title="新建对比"
        onCacheKey={(key) =>
          setHistory((prev) => [
            {
              cacheKey: key,
              diffRatio: 0,
              match: false,
              width: 0,
              height: 0,
              latencyMS: 0,
              timestamp: Date.now(),
            },
            ...prev,
          ].slice(0, 12))
        }
      />

      {history.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">最近缓存</h2>
          <ul className="divide-y divide-slate-100 text-xs text-slate-600">
            {history.map((h) => (
              <li key={h.cacheKey} className="flex items-center justify-between py-2">
                <code className="rounded bg-slate-50 px-2 py-1">{h.cacheKey}</code>
                <a
                  className="text-indigo-600 hover:underline"
                  href={`/api/visualdiff/${encodeURIComponent(h.cacheKey)}.png`}
                  rel="noreferrer"
                  target="_blank"
                >
                  打开 PNG
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}