import { describe, expect, it } from 'vitest';
import {
  blocksToPreviewMarkdown,
  slidesFromPreviewPayload,
  type DocPreviewPayload,
} from './document-preview';
import { renderMarkdownDocument } from '@/features/knowledge/markdown-doc';

describe('blocksToPreviewMarkdown', () => {
  it('preserves markdown tables and bold from paragraph blocks', () => {
    const md = blocksToPreviewMarkdown([
      { type: 'h1', text: '招聘模板' },
      { type: 'p', text: '**Word 文件尚未实际产出**' },
      { type: 'p', text: '| 职位名称 | Python 开发工程师 | 职位编号 | PY-001 |' },
      { type: 'p', text: '|---|---|---|---|' },
      { type: 'p', text: '| 所属部门 | 技术部 | 汇报对象 | 技术总监 |' },
    ]);
    expect(md).toContain('**Word 文件尚未实际产出**');
    expect(md).toContain('| 职位名称 |');
    const { html } = renderMarkdownDocument(md);
    expect(html).toContain('<strong');
    expect(html).toContain('<table');
    expect(html).toContain('Python 开发工程师');
  });
});

describe('slidesFromPreviewPayload', () => {
  it('prefers structured slides array', () => {
    const payload: DocPreviewPayload = {
      kind: 'pptx',
      title: '团队季度考评',
      filename: 'x.pptx',
      pageCount: 2,
      blocks: [],
      slides: [
        { index: 1, title: '封面', lines: ['汇报人'], bullets: [] },
        { index: 2, title: '目录', lines: ['概况', 'KPI'], bullets: ['概况', 'KPI'] },
      ],
    };
    const slides = slidesFromPreviewPayload(payload);
    expect(slides).toHaveLength(2);
    expect(slides[0]?.title).toBe('封面');
    expect(slides[1]?.bullets).toEqual(['概况', 'KPI']);
  });

  it('falls back to h2-separated blocks', () => {
    const payload: DocPreviewPayload = {
      kind: 'pptx',
      title: 'x',
      filename: 'x.pptx',
      blocks: [
        { type: 'h2', text: '封面' },
        { type: 'p', text: '副标题' },
        { type: 'blank' },
        { type: 'h2', text: '目录' },
        { type: 'li', text: '一、概况' },
      ],
    };
    const slides = slidesFromPreviewPayload(payload);
    expect(slides.map((s) => s.title)).toEqual(['封面', '目录']);
    expect(slides[1]?.bullets).toEqual(['一、概况']);
  });
});
