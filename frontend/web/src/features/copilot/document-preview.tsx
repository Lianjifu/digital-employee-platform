import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, Presentation } from 'lucide-react';
import { renderMarkdownDocument } from '@/features/knowledge/markdown-doc';
import type { SkillArtifactLink } from '@/features/copilot/artifact-links';
import { artifactKindLabel } from '@/features/copilot/artifact-links';

export type DocxPreviewBlock = {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blank';
  text?: string;
  ordered?: boolean;
};

export type PptxPreviewSlide = {
  index: number;
  title: string;
  lines?: string[];
  bullets?: string[];
};

export type DocPreviewPayload = {
  kind?: 'docx' | 'pptx' | 'pdf' | string;
  title: string;
  filename: string;
  downloadName?: string;
  pageCount?: number;
  blocks: DocxPreviewBlock[];
  slides?: PptxPreviewSlide[];
  contentWarning?: string;
};

export function artifactPreviewHref(artifact: Pick<SkillArtifactLink, 'filename'>): string {
  return `/api/skill-artifacts/${encodeURIComponent(artifact.filename)}/preview`;
}

export async function downloadArtifactSafely(href: string, downloadName: string): Promise<void> {
  const res = await fetch(href, { method: 'GET', credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(res.status === 404 ? '文件不存在或已过期' : `下载失败（${res.status}）`);
  }
  const blob = await res.blob();
  const sniff = await blob.slice(0, 120).text();
  if ((blob.type || '').includes('json') || sniff.trimStart().startsWith('{')) {
    throw new Error('文件不存在或已过期');
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = downloadName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function blocksToPreviewMarkdown(blocks: DocxPreviewBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === 'blank' || !block.text?.trim()) {
      lines.push('');
      continue;
    }
    const text = block.text.trim();
    switch (block.type) {
      case 'h1':
        lines.push(`# ${text}`);
        break;
      case 'h2':
        lines.push(`## ${text}`);
        break;
      case 'h3':
        lines.push(`### ${text}`);
        break;
      case 'li':
        lines.push(block.ordered ? `1. ${text}` : `- ${text}`);
        break;
      default:
        lines.push(text);
    }
  }
  return lines.join('\n');
}

/** 从扁平 blocks（h2 分隔）还原为幻灯片列表，兼容旧预览载荷。 */
export function slidesFromPreviewPayload(payload: DocPreviewPayload): PptxPreviewSlide[] {
  if (Array.isArray(payload.slides) && payload.slides.length > 0) {
    return payload.slides.map((s, i) => ({
      index: s.index || i + 1,
      title: s.title || `第 ${i + 1} 页`,
      lines: s.lines || [],
      bullets: s.bullets || [],
    }));
  }
  const slides: PptxPreviewSlide[] = [];
  let cur: PptxPreviewSlide | null = null;
  for (const block of payload.blocks || []) {
    if (block.type === 'h2' && block.text?.trim()) {
      cur = { index: slides.length + 1, title: block.text.trim(), lines: [], bullets: [] };
      slides.push(cur);
      continue;
    }
    if (!cur || !block.text?.trim()) continue;
    const text = block.text.trim();
    if (block.type === 'li') {
      cur.bullets = [...(cur.bullets || []), text];
      cur.lines = [...(cur.lines || []), text];
    } else if (block.type === 'p' || block.type === 'h3') {
      cur.lines = [...(cur.lines || []), text];
    }
  }
  return slides;
}

function DocumentMarkdownBody({ blocks }: { blocks: DocxPreviewBlock[] }) {
  const rendered = useMemo(() => renderMarkdownDocument(blocksToPreviewMarkdown(blocks)), [blocks]);
  if (rendered.isEmpty) {
    return null;
  }
  return (
    <div
      className="knowledge-md copilot-doc-preview__markdown"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}

function SlideDeckReader({
  slides,
  deckTitle,
}: {
  slides: PptxPreviewSlide[];
  deckTitle: string;
}) {
  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[Math.min(index, Math.max(0, total - 1))];

  useEffect(() => {
    setIndex(0);
  }, [slides]);

  if (!slide || total === 0) {
    return <div className="copilot-doc-preview__state">暂无幻灯片内容</div>;
  }

  const bodyLines = (slide.lines && slide.lines.length > 0)
    ? slide.lines
    : (slide.bullets || []);
  const bulletSet = new Set(slide.bullets || []);
  const isCover = slide.index === 1;

  return (
    <div className="copilot-pptx-reader" aria-label={`${deckTitle} 幻灯片预览`}>
      <div className="copilot-pptx-reader__stage">
        <article className="copilot-pptx-slide" aria-label={`第 ${slide.index} 页：${slide.title}`}>
          <header className="copilot-pptx-slide__title">{slide.title}</header>
          <div className="copilot-pptx-slide__body">
            {bodyLines.length === 0 ? (
              <p className="copilot-pptx-slide__empty">
                {isCover ? '封面 · 请补充副标题 / 汇报人 / 日期' : '本页要点待补充'}
              </p>
            ) : (
              <ul className="copilot-pptx-slide__list">
                {bodyLines.map((line, i) => {
                  const isBullet = bulletSet.has(line) || bodyLines.length > 1;
                  return (
                    <li
                      key={`${slide.index}-${i}`}
                      className={isBullet ? 'is-bullet' : 'is-plain'}
                    >
                      {line}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <footer className="copilot-pptx-slide__footer">
            {slide.index} / {total}
          </footer>
        </article>
      </div>
      <div className="copilot-pptx-reader__nav">
        <button
          type="button"
          className="copilot-pptx-reader__btn"
          disabled={index <= 0}
          onClick={() => setIndex((v) => Math.max(0, v - 1))}
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </button>
        <div className="copilot-pptx-reader__dots" role="tablist" aria-label="幻灯片页码">
          {slides.map((s, i) => (
            <button
              key={s.index}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`copilot-pptx-reader__dot${i === index ? ' is-active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`第 ${s.index} 页`}
            />
          ))}
        </div>
        <button
          type="button"
          className="copilot-pptx-reader__btn"
          disabled={index >= total - 1}
          onClick={() => setIndex((v) => Math.min(total - 1, v + 1))}
          aria-label="下一页"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DocumentPreviewPanel({
  artifact,
  onDownload,
}: {
  artifact: SkillArtifactLink;
  onDownload?: () => void;
}) {
  const [payload, setPayload] = useState<DocPreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dlBusy, setDlBusy] = useState(false);
  const isPptx = artifact.kind === 'pptx' || /\.pptx$/i.test(artifact.filename);
  const isDocx = artifact.kind === 'docx' || /\.docx$/i.test(artifact.filename);
  const isPdf = artifact.kind === 'pdf' || /\.pdf$/i.test(artifact.filename);
  const supportsPreview = isPptx || isDocx || isPdf;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);
    if (!supportsPreview) {
      setLoading(false);
      setError('该文件类型暂不支持在线预览，请下载后打开');
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const res = await fetch(artifactPreviewHref(artifact), { credentials: 'same-origin' });
        if (!res.ok) {
          throw new Error(res.status === 404 ? '文档不存在或尚未生成' : `预览失败（${res.status}）`);
        }
        const body = await res.json() as { ok?: boolean; data?: DocPreviewPayload & { contentWarning?: string } };
        const data = (body?.data ?? body) as DocPreviewPayload;
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '预览失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifact.filename, artifact.href, artifact.kind, supportsPreview]);

  const title = payload?.title || artifact.title;
  const downloadName = payload?.downloadName || artifact.downloadName;
  const kind = (payload?.kind as SkillArtifactLink['kind'] | undefined) || artifact.kind;
  const isSlideKind = kind === 'pptx';
  const isPaperKind = kind === 'docx' || kind === 'pdf';
  const intro = isSlideKind
    ? '按幻灯片逐页阅读；完整动画与版式请下载后用 PowerPoint / WPS 打开。'
    : kind === 'pdf'
      ? '以纸张版式查看 PDF 摘要；完整排版请下载后用 PDF 阅读器打开。'
      : kind === 'docx'
        ? '以纸张版式阅读生成文档；下载后可用 Word / WPS 打开编辑。'
        : '在专家上下文中查看生成文件。';
  const Icon = isSlideKind ? Presentation : FileText;
  const slides = useMemo(
    () => (payload && isSlideKind ? slidesFromPreviewPayload(payload) : []),
    [payload, isSlideKind],
  );

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    onDownload?.();
    if (dlBusy) return;
    setDlBusy(true);
    try {
      await downloadArtifactSafely(artifact.href, downloadName);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    } finally {
      setDlBusy(false);
    }
  };

  return (
    <section className={`copilot-details-panel copilot-doc-preview-panel${isSlideKind ? ' is-pptx' : isPaperKind ? ' is-docx' : ''}`}>
      <div className="copilot-details-panel__intro">
        <div className="copilot-details-panel__title">
          <Icon className="h-4 w-4" />
          {isSlideKind ? '演示文稿预览' : kind === 'pdf' ? 'PDF 预览' : '文档预览'}
        </div>
        <div>{intro}</div>
      </div>

      <div className="copilot-doc-preview__toolbar">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[var(--text)]">{title}</div>
          <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
            {artifactKindLabel(kind)} · {downloadName}
            {payload?.pageCount ? ` · ${payload.pageCount} ${isSlideKind ? '页幻灯片' : '页'}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={dlBusy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text)] hover:border-[var(--brand)]/40"
        >
          <Download className="h-3 w-3" />
          {dlBusy ? '下载中…' : '下载'}
        </button>
      </div>

      {loading && (
        <div className="copilot-doc-preview__state" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>正在加载{isSlideKind ? '幻灯片' : '文档'}…</span>
        </div>
      )}
      {!loading && error && (
        <div className="copilot-doc-preview__state copilot-doc-preview__state--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleDownload}
            className="mt-2 text-[11px] font-medium text-[var(--brand)]"
          >
            改为下载文件
          </button>
        </div>
      )}
      {!loading && !error && payload && isSlideKind && (
        <>
          {payload.contentWarning ? (
            <div
              className="copilot-doc-preview__state copilot-doc-preview__state--error mx-3 mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200"
              role="alert"
            >
              {payload.contentWarning}
            </div>
          ) : null}
          <SlideDeckReader slides={slides} deckTitle={title} />
        </>
      )}
      {!loading && !error && payload && isPaperKind && (
        <>
          {payload.contentWarning ? (
            <div
              className="copilot-doc-preview__state copilot-doc-preview__state--error mx-3 mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200"
              role="alert"
            >
              {payload.contentWarning}
            </div>
          ) : null}
          <div className="copilot-doc-preview__paper-stage">
            <article className="copilot-doc-preview__page copilot-doc-preview__page--paper" aria-label={title}>
              <DocumentMarkdownBody blocks={payload.blocks} />
            </article>
          </div>
        </>
      )}
    </section>
  );
}
