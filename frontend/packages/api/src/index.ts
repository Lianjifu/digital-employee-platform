/**
 * API 客户端层 — 默认请求真实后端（de-core）。
 * Mock 适配器仅在应用入口显式注入时启用（VITE_USE_MOCK=true）。
 */
import type { ApiResponse } from '@de/web-types';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 500) {
    super(message);
  }
}

const DEFAULT_TIMEOUT = 15_000;

/** fetch Header values must be ByteString (ISO-8859-1); encode anything outside. */
function sanitizeHeaderValue(value: string): string {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 255) return encodeURIComponent(value);
  }
  return value;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    out[k] = sanitizeHeaderValue(String(v));
  }
  return out;
}

function resolveRequestURL(baseURL: string, path: string, query?: RequestOptions['query']): string {
  let href: string;
  if (!baseURL) {
    href = path.startsWith('/') ? path : `/${path}`;
  } else {
    href = new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`).toString();
  }
  if (!query) return href;
  const u = href.startsWith('http') ? new URL(href) : new URL(href, 'http://local.invalid');
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  if (!href.startsWith('http')) {
    return `${u.pathname}${u.search}`;
  }
  return u.toString();
}

export class ApiClient {
  constructor(
    private baseURL: string,
    private getAuthToken: () => string | null = () => null,
    private mockHandler?: (path: string, opts: RequestOptions) => Promise<unknown>,
    private getContextHeaders: () => Record<string, string> = () => ({}),
  ) {}

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const token = this.getAuthToken();
    const requestHeaders: Record<string, string> = {
      ...opts.headers,
      ...this.getContextHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (this.mockHandler) {
      const data = await this.mockHandler(path, { ...opts, headers: requestHeaders });
      return data as T;
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
    try {
      const url = resolveRequestURL(this.baseURL, path, opts.query);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...sanitizeHeaders(requestHeaders),
      };

      let res: Response;
      try {
        res = await fetch(url, {
          method: opts.method ?? 'GET',
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: opts.signal ?? controller.signal,
        });
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (aborted) {
          throw new ApiError('E_TIMEOUT', '请求超时，请确认 de-core 是否可达', 408);
        }
        const hint = this.baseURL
          ? `无法连接控制面 ${this.baseURL}，请先启动：cd backend && make run`
          : '无法连接控制面（同源 /api → Vite 代理 → :8080）。请确认 de-core 已启动（cd backend && make run），并重启前端 dev（环境变量变更需重启 Vite）';
        throw new ApiError('E_NETWORK', hint, 0);
      }
      let json: ApiResponse<T>;
      try {
        json = (await res.json()) as ApiResponse<T>;
      } catch {
        throw new ApiError('E_BAD_RESPONSE', `控制面返回非 JSON（HTTP ${res.status}）`, res.status);
      }
      if (!res.ok || !json.ok) {
        throw new ApiError(json.error?.code ?? 'E_UNKNOWN', json.error?.message ?? '请求失败', res.status);
      }
      return json.data;
    } finally {
      clearTimeout(t);
    }
  }

  get<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'GET' });
  }
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'POST', body });
  }
  put<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'PUT', body });
  }
  delete<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...opts, method: 'DELETE' });
  }
}

/** 全局单例 — 在 web 应用启动时注入 */
let _client: ApiClient | null = null;

export function setApiClient(c: ApiClient) {
  _client = c;
}

export function getApiClient(): ApiClient {
  if (!_client) throw new Error('ApiClient 未初始化 — 请在应用入口调用 setApiClient');
  return _client;
}

export * from './mock';
import * as mockModule from './mock';
export const mock = mockModule;
