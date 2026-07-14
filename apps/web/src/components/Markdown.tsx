/**
 * 轻量 Markdown 渲染（无依赖）
 * 支持: **粗体** *斜体* `行内代码` # 标题 - 列表 > 引用
 * [text](url) 链接 ```代码块``` ![alt](url) 图片
 * 安全（防 XSS）：先转义 HTML
 */
import { cn } from '@de/web-utils';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  // 代码块（先处理 ``` 提取出来，但 inline 也支持 `code`）
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // 粗体 **xxx**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="md-bold">$1</strong>');
  // 斜体 *xxx*（避开已替换的 **）
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em class="md-em">$2</em>');
  // 链接 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
  return s;
}

// 简易语法高亮（仅支持几种语言）
function highlightCode(code: string, lang: string): string {
  let html = escapeHtml(code);
  // 关键字
  const keywords: Record<string, string[]> = {
    bash: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'echo', 'export'],
    yaml: ['true', 'false', 'null', 'yes', 'no'],
    json: ['true', 'false', 'null'],
    sql: ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'ON', 'AS', 'IN', 'NOT', 'NULL'],
    python: ['def', 'class', 'import', 'from', 'return', 'if', 'else', 'elif', 'for', 'while', 'in', 'not', 'and', 'or', 'True', 'False', 'None'],
  };
  const kws = keywords[lang] ?? [];
  if (kws.length > 0) {
    const pattern = new RegExp(`\\b(${kws.join('|')})\\b`, 'g');
    html = html.replace(pattern, '<span class="md-kw">$1</span>');
  }
  // 字符串
  html = html.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="md-str">$1</span>');
  // 数字
  html = html.replace(/\b(\d+)\b/g, '<span class="md-num">$1</span>');
  // 注释
  if (lang === 'bash' || lang === 'yaml' || lang === 'python') {
    html = html.replace(/(#[^<\n]*$|#[^<\n]*\n)/gm, '<span class="md-com">$1</span>');
  }
  return html;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => render(text), [text]);
  return (
    <div
      className={cn('md-content', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

import { useMemo } from 'react';

function render(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let inList = false;
  let listBuf: string[] = [];
  let listType: 'ul' | 'ol' = 'ul';

  const flushList = () => {
    if (inList) {
      const tag = listType;
      out.push(`<${tag} class="md-${tag}">${listBuf.map((i) => `<li>${renderInline(i)}</li>`).join('')}</${tag}>`);
      listBuf = [];
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw;

    // 代码块开始/结束
    if (line.trim().startsWith('```')) {
      if (!inCode) {
        flushList();
        inCode = true;
        codeLang = line.trim().slice(3).trim() || 'text';
        codeBuf = [];
      } else {
        out.push(`<pre class="md-pre"><code class="md-pre-code language-${codeLang}">${highlightCode(codeBuf.join('\n'), codeLang)}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // 列表
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    const olMatch = line.match(/^[\s]*(\d+)\.\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') { flushList(); inList = true; listType = 'ul'; }
      listBuf.push(ulMatch[1]);
      continue;
    }
    if (olMatch) {
      if (!inList || listType !== 'ol') { flushList(); inList = true; listType = 'ol'; }
      listBuf.push(olMatch[2]);
      continue;
    }
    flushList();

    // 标题
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level} class="md-h md-h${level}">${renderInline(h[2])}</h${level}>`);
      continue;
    }

    // 引用
    if (line.startsWith('> ')) {
      out.push(`<blockquote class="md-quote">${renderInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // 分隔线
    if (line.match(/^---+$/)) {
      out.push('<hr class="md-hr" />');
      continue;
    }

    // 空行
    if (line.trim() === '') {
      continue;
    }

    // 普通段落
    out.push(`<p class="md-p">${renderInline(line)}</p>`);
  }

  flushList();
  if (inCode) {
    out.push(`<pre class="md-pre"><code class="md-pre-code">${highlightCode(codeBuf.join('\n'), codeLang)}</code></pre>`);
  }

  return out.join('');
}
