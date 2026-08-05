import { describe, expect, it } from 'vitest';
import {
  clampMemoryPage,
  memoryContentPreview,
  memoryPageCount,
  paginateItems,
  readMemoryPageSize,
  sortMemoryRecordsByRecency,
  truncateText,
} from './record-list';

describe('memory pagination', () => {
  it('computes page count and slices items', () => {
    expect(memoryPageCount(19, 10)).toBe(2);
    expect(paginateItems([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(clampMemoryPage(9, 2)).toBe(2);
  });

  it('reads persisted page size', () => {
    expect(readMemoryPageSize({ getItem: () => '5' })).toBe(5);
    expect(readMemoryPageSize({ getItem: () => '99' })).toBe(10);
  });
});

describe('memoryContentPreview', () => {
  it('splits user/assistant dialog', () => {
    const preview = memoryContentPreview('用户：请生成入职培训 PPT\n助手：已为您规划四页结构……');
    expect(preview.kind).toBe('dialog');
    if (preview.kind === 'dialog') {
      expect(preview.lines[0]?.role).toBe('用户');
      expect(preview.lines[1]?.role).toBe('助手');
    }
  });

  it('truncates plain text', () => {
    expect(truncateText('abcdefghij', 6)).toBe('abcde…');
    expect(memoryContentPreview('一段普通记忆内容').kind).toBe('text');
  });
});

describe('sortMemoryRecordsByRecency', () => {
  it('orders newest first', () => {
    const sorted = sortMemoryRecordsByRecency([
      { id: 'a', updatedAt: '2026-08-05T10:00:00.000Z' },
      { id: 'b', updatedAt: '2026-08-05T12:00:00.000Z' },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'a']);
  });
});
