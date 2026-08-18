import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** 种子/快捷入口等用户可见叙事禁词（LEGACY API 错误文案不在此约束）。 */
const BANNED = [
  'Agent 商店',
  '企业智能体市场',
  '智能体市场',
  '配置数字员工',
  '创建并分配给 Agent',
];

describe('mock.ts user-facing copy bans', () => {
  it('does not reintroduce banned market / 数字员工 product copy in string literals', () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'mock.ts');
    const source = readFileSync(file, 'utf8');
    const literals = [...source.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
    const joined = literals.join('\n');
    for (const phrase of BANNED) {
      expect(joined.includes(phrase), `banned phrase still present in string literal: ${phrase}`).toBe(false);
    }
  });
});
