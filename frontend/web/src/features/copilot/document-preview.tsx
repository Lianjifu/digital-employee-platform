import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { SkillArtifactLink } from '@/features/copilot/artifact-links';

export type DocxPreviewBlock = {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blank';
  text?: string;
  ordered?: boolean;
};

export type DocxPreviewPayload = {
  title: string;
  filename: string;
  downloadName?: string;
  blocks: DocxPreviewBlock[];
};

export function artifactPreviewHref(artifact: Pick<SkillArtifactLink, 'filename'>): string {
  return `/api/skill-artifacts/${encodeURIComponent(artifact.filename)}/preview`;
}

function DocumentBlock({ block }: { block: DocxPreviewBlock }) {
  if (block.type === 'blank' || !block.text) return <div className="copilot-doc-preview__gap" aria-hidden="true" />;
  if (block.type === 'h1') {
    return <h1 className="copilot-doc-preview__h1">{block.text}</h1>;
  }
  if (block.type === 'h2') {
    return <h2 className="copilot-doc-preview__h2">{block.text}</h2>;
  }
  if (block.type === 'h3') {
    return <h3 className="copilot-doc-preview__h3">{block.text}</h3>;
  }
  if (block.type === 'li') {
    return (
      <li className={cn('copilot-doc-preview__li', block.ordered ? 'is-ordered' : 'is-bullet')}>
        {block.text}
      </li>
    );
  }
  return <p className="copilot-doc-preview__p">{block.text}</p>;
}

export function DocumentPreviewPanel({
  artifact,
  onDownload,
}: {
  artifact: SkillArtifactLink;
  onDownload?: () => void;
}) {
  const [payload, setPayload] = useState<DocxPreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);
    (async () => {
      try {
        const res = await fetch(artifactPreviewHref(artifact), { credentials: 'same-origin' });
        if (!res.ok) {
          throw new Error(res.status === 404 ? '文档不存在或尚未生成' : `预览失败（${res.status}）`);
        }
        const body = await res.json() as { ok?: boolean; data?: DocxPreviewPayload };
        const data = body?.data ?? body;
        if (!cancelled) setPayload(data as DocxPreviewPayload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '预览失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifact.filename, artifact.href]);

  const title = payload?.title || artifact.title;
  const downloadName = payload?.downloadName || artifact.downloadName;

  return (
    <section className="copilot-details-panel copilot-doc-preview-panel">
      <div className="copilot-details-panel__intro">
        <div className="copilot-details-panel__title">
          <FileText className="h-4 w-4" />
          文档预览
        </div>
        <div>在专家上下文中阅读生成文档，版式与 Word 导出一致。</div>
      </div>

      <div className="copilot-doc-preview__toolbar">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[var(--text)]">{title}</div>
          <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{downloadName}</div>
        </div>
        <a
          href={artifact.href}
          download={downloadName}
          onClick={onDownload}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text)] no-underline hover:border-[var(--brand)]/40"
        >
          <Download className="h-3 w-3" />
          下载
        </a>
      </div>

      {loading && (
        <div className="copilot-doc-preview__state" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>正在加载文档…</span>
        </div>
      )}
      {!loading && error && (
        <div className="copilot-doc-preview__state copilot-doc-preview__state--error" role="alert">
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && payload && (
        <article className="copilot-doc-preview__page" aria-label={title}>
          {payload.blocks.map((block, index) => (
            <DocumentBlock key={`${block.type}-${index}`} block={block} />
          ))}
        </article>
      )}
    </section>
  );
}
