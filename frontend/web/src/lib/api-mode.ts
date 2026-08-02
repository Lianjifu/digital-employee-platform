/**
 * API 运行模式：默认走真实 de-core；仅当显式 VITE_USE_MOCK=true 时启用本地 Mock。
 */
export function isMockApiMode(): boolean {
  return import.meta.env.VITE_USE_MOCK === 'true';
}

export function apiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  // 空字符串 → 同源相对路径，经 Vite proxy 转发到 de-core
  if (raw === undefined || raw === '') return '';
  return raw.replace(/\/$/, '');
}
