import { describe, expect, it } from 'vitest';
import {
  estimateChunkTokens,
  extractMarkdownOutline,
  formatInlineMarkdown,
  plainTextFromMarkdown,
  renderMarkdownDocument,
  slugifyHeading,
} from './markdown-doc';

describe('markdown-doc', () => {
  it('renders GFM-style tables instead of raw pipes', () => {
    const { html } = renderMarkdownDocument([
      '| 层级 | 视觉字号 |',
      '|------|----------|',
      '| H1 | 18-20px |',
      '| 正文 | 14px |',
    ].join('\n'));
    expect(html).toContain('<table');
    expect(html).toContain('<th>');
    expect(html).toContain('H1');
    expect(html).not.toContain('|------|');
  });

  it('builds outline ids for H2/H3', () => {
    const outline = extractMarkdownOutline('# 标题\n\n## 字体\n\n### 字号\n\n## 字体\n');
    expect(outline).toEqual([
      { id: '字体', level: 2, title: '字体' },
      { id: '字号', level: 3, title: '字号' },
      { id: '字体-2', level: 2, title: '字体' },
    ]);
  });

  it('detects empty and upload stub', () => {
    expect(renderMarkdownDocument('').isEmpty).toBe(true);
    expect(renderMarkdownDocument('已上传：规范').isUploadStub).toBe(true);
    expect(formatInlineMarkdown('**粗**')).toContain('<strong>');
    const used = new Map<string, number>();
    expect(slugifyHeading('A B', used)).toBe('a-b');
    expect(slugifyHeading('A B', used)).toBe('a-b-2');
  });

  it('strips markdown for evidence card previews', () => {
    expect(plainTextFromMarkdown('## 标题\n\n**加粗**与[链接](https://x.com)', 80)).toBe('标题 加粗与链接');
    expect(plainTextFromMarkdown('a'.repeat(40), 20).endsWith('…')).toBe(true);
    expect(estimateChunkTokens('Redis OOM')).toBeGreaterThan(0);
  });
});
