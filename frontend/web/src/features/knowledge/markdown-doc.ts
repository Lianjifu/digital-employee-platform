/** Lightweight Markdown → HTML for knowledge document paper preview. */

export type MarkdownOutlineItem = {
  id: string;
  level: 2 | 3;
  title: string;
};

export type MarkdownRenderResult = {
  html: string;
  outline: MarkdownOutlineItem[];
  isEmpty: boolean;
  isUploadStub: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function slugifyHeading(title: string, used: Map<string, number>) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.includes('|', 1);
}

function renderTable(rows: string[][]): string {
  if (!rows.length) return '';
  const [header, ...body] = rows;
  const thead = `<thead><tr>${header.map((cell) => `<th>${formatInlineMarkdown(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = body.length
    ? `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${formatInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`
    : '';
  return `<div class="knowledge-md__table-wrap"><table class="knowledge-md__table">${thead}${tbody}</table></div>`;
}

export function renderMarkdownDocument(text?: string | null): MarkdownRenderResult {
  const normalized = (text ?? '').replace(/^\uFEFF/, '');
  const trimmed = normalized.trim();
  const isUploadStub = /^已上传[：:]/.test(trimmed);
  if (!trimmed || isUploadStub) {
    return { html: '', outline: [], isEmpty: !trimmed, isUploadStub };
  }

  const lines = normalized.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const outline: MarkdownOutlineItem[] = [];
  const usedIds = new Map<string, number>();
  let inUl = false;
  let inOl = false;
  let inQuote = false;
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let quoteBuf: string[] = [];
  let i = 0;

  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };
  const flushQuote = () => {
    if (!inQuote) return;
    out.push(`<blockquote><p>${quoteBuf.join('<br />')}</p></blockquote>`);
    quoteBuf = [];
    inQuote = false;
  };
  const flushCode = () => {
    if (!inCode) return;
    const body = escapeHtml(codeBuf.join('\n'));
    out.push(`<pre class="knowledge-md__pre"><code class="language-${escapeHtml(codeLang || 'text')}">${body}</code></pre>`);
    codeBuf = [];
    codeLang = '';
    inCode = false;
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const lineTrimmed = line.trim();

    if (lineTrimmed.startsWith('```')) {
      closeLists();
      flushQuote();
      if (!inCode) {
        inCode = true;
        codeLang = lineTrimmed.slice(3).trim() || 'text';
        codeBuf = [];
      } else {
        flushCode();
      }
      i += 1;
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      i += 1;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trimEnd())) {
      closeLists();
      flushQuote();
      const tableRows: string[][] = [splitTableRow(line)];
      i += 2; // skip header + separator
      while (i < lines.length && isTableRow(lines[i].trimEnd())) {
        tableRows.push(splitTableRow(lines[i].trimEnd()));
        i += 1;
      }
      out.push(renderTable(tableRows));
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeLists();
      if (!inQuote) inQuote = true;
      quoteBuf.push(formatInlineMarkdown(line.replace(/^>\s?/, '')));
      i += 1;
      continue;
    }
    if (inQuote) flushQuote();

    const h3 = line.match(/^### (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h1 = line.match(/^# (.+)$/);
    if (h3 || h2 || h1) {
      closeLists();
      const title = (h3?.[1] ?? h2?.[1] ?? h1?.[1] ?? '').trim();
      const level = h3 ? 3 : h2 ? 2 : 1;
      const id = slugifyHeading(title, usedIds);
      if (level === 2 || level === 3) {
        outline.push({ id, level, title });
      }
      out.push(`<h${level} id="${escapeHtml(id)}">${formatInlineMarkdown(title)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^[-*] (.+)$/.test(line)) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${formatInlineMarkdown(line.replace(/^[-*] /, ''))}</li>`);
      i += 1;
      continue;
    }
    if (/^\d+\. (.+)$/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${formatInlineMarkdown(line.replace(/^\d+\. /, ''))}</li>`);
      i += 1;
      continue;
    }
    if (/^---+$/.test(lineTrimmed)) {
      closeLists();
      out.push('<hr />');
      i += 1;
      continue;
    }
    if (!lineTrimmed) {
      closeLists();
      i += 1;
      continue;
    }

    closeLists();
    out.push(`<p>${formatInlineMarkdown(line)}</p>`);
    i += 1;
  }

  flushCode();
  flushQuote();
  closeLists();
  return { html: out.join(''), outline, isEmpty: false, isUploadStub: false };
}

export function extractMarkdownOutline(text?: string | null): MarkdownOutlineItem[] {
  return renderMarkdownDocument(text).outline;
}

/** Strip markdown markers for compact list/card previews. */
export function plainTextFromMarkdown(text?: string | null, maxLength = 180): string {
  const raw = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/^---+$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '暂无摘要';
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function estimateChunkTokens(text?: string | null): number {
  const value = String(text ?? '').trim();
  if (!value) return 0;
  // Rough bilingual estimate: CJK ~1 token/char, latin ~0.25 token/char.
  const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const rest = Math.max(0, value.length - cjk);
  return Math.max(1, Math.round(cjk + rest / 4));
}
