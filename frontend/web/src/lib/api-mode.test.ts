import { describe, expect, it } from 'vitest';
import { apiBaseURL, isMockApiMode } from './api-mode';

describe('api-mode', () => {
  it('defaults to real API (mock opt-in only)', () => {
    // vitest 下未设置 VITE_USE_MOCK=true 即为真实模式
    expect(isMockApiMode()).toBe(false);
  });

  it('apiBaseURL uses same-origin proxy in DEV for loopback bases', () => {
    // vitest 默认 DEV=true；loopback 直连会被折叠为空字符串（走 Vite proxy）
    expect(typeof apiBaseURL()).toBe('string');
    expect(apiBaseURL()).toBe('');
  });
});
