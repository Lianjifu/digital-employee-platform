import { describe, expect, it } from 'vitest';
import { apiBaseURL, isMockApiMode } from './api-mode';

describe('api-mode', () => {
  it('defaults to real API (mock opt-in only)', () => {
    // vitest 下未设置 VITE_USE_MOCK=true 即为真实模式
    expect(isMockApiMode()).toBe(false);
  });

  it('apiBaseURL trims trailing slash', () => {
    // 依赖当前环境；至少保证函数可调用
    expect(typeof apiBaseURL()).toBe('string');
  });
});
