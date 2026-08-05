import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './Markdown';

describe('Markdown tables', () => {
  it('renders GFM tables as HTML instead of raw pipes', () => {
    const md = [
      '### 人事档案整理清单及核验表',
      '',
      '部门：________    整理人：________    整理日期：____年__月__日',
      '',
      '| 序号 | 档案编号 | 姓名 | 性别 |',
      '|---|---|---|---|',
      '| 1 |  |  |  |',
      '| 2 |  |  |  |',
      '',
      '**材料核验清单**（缺项打√）',
      '',
      '| 材料名称 | 员工1 | 员工2 | 核验要点 |',
      '|---|---|---|---|',
      '| 身份证复印件 |  |  | 与原件一致 |',
    ].join('\n');

    const html = renderMarkdown(md);
    expect(html).toContain('md-table');
    expect(html).toContain('<th');
    expect(html).toContain('档案编号');
    expect(html).toContain('身份证复印件');
    expect(html).not.toContain('|---|');
    expect(html).toContain('md-form-meta');
    expect(html).toContain('md-blank');
  });

  it('keeps non-table pipes as paragraphs', () => {
    const html = renderMarkdown('状态：成功 | 失败均可');
    expect(html).toContain('md-p');
    expect(html).not.toContain('md-table');
  });
});
