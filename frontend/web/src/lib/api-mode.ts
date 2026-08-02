/**
 * API 运行模式：默认走真实 de-core；仅当显式 VITE_USE_MOCK=true 时启用本地 Mock。
 */
export function isMockApiMode(): boolean {
  return import.meta.env.VITE_USE_MOCK === 'true';
}

function isLoopbackBase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * 开发态默认走同源 `/api`（Vite proxy → de-core），避免浏览器/Cursor 沙箱
 * 无法直连 `127.0.0.1:8080` 导致「模型控制面数据读取失败」。
 * 需要直连时设置 `VITE_API_DIRECT=true` 并填写非空 `VITE_API_BASE`。
 */
export function apiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  const forceDirect = import.meta.env.VITE_API_DIRECT === 'true';

  if (import.meta.env.DEV && !forceDirect) {
    if (!raw || isLoopbackBase(raw)) return '';
  }
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}
