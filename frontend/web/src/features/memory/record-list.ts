/** 记忆列表分页与内容预览。 */

export const MEMORY_PAGE_SIZE_OPTIONS = [5, 10, 20] as const;
export const MEMORY_PAGE_SIZE_KEY = 'de.memory.pageSize';

export function readMemoryPageSize(storage?: Pick<Storage, 'getItem'> | null): number {
  try {
    const raw = storage?.getItem(MEMORY_PAGE_SIZE_KEY);
    const n = Number(raw);
    if (MEMORY_PAGE_SIZE_OPTIONS.includes(n as (typeof MEMORY_PAGE_SIZE_OPTIONS)[number])) return n;
  } catch {
    /* ignore */
  }
  return 10;
}

export function clampMemoryPage(page: number, pageCount: number): number {
  if (pageCount < 1) return 1;
  return Math.min(Math.max(1, page), pageCount);
}

export function memoryPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const count = memoryPageCount(items.length, pageSize);
  const safe = clampMemoryPage(page, count);
  const start = (safe - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function truncateText(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export type MemoryPreviewLine = { role: string; text: string };

/** 将「用户/助手」对话拆成紧凑预览；否则返回单段摘要。 */
export function memoryContentPreview(
  content: string,
  maxLen = 120,
): { kind: 'dialog'; lines: MemoryPreviewLine[] } | { kind: 'text'; text: string } {
  const raw = (content || '').trim();
  if (!raw) return { kind: 'text', text: '（空内容）' };

  const userRe = /(?:^|\n)\s*(?:用户|User)\s*[:：]\s*/i;
  const asstRe = /(?:^|\n)\s*(?:助手|Assistant)\s*[:：]\s*/i;
  const hasUser = userRe.test(raw);
  const hasAsst = asstRe.test(raw);

  if (hasUser || hasAsst) {
    const userPart = raw.split(asstRe)[0]?.replace(userRe, '').trim() ?? '';
    const asstPart = hasAsst ? raw.split(asstRe).slice(1).join(' ').trim() : '';
    const lines: MemoryPreviewLine[] = [];
    if (userPart) lines.push({ role: '用户', text: truncateText(userPart, maxLen) });
    if (asstPart) lines.push({ role: '助手', text: truncateText(asstPart, maxLen) });
    if (lines.length) return { kind: 'dialog', lines };
  }

  return { kind: 'text', text: truncateText(raw, maxLen * 2) };
}

export function sortMemoryRecordsByRecency<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return tb - ta;
  });
}
