/**
 * API 客户端层
 * 目标：与后端 Go + Python 双栈通过 Connect-RPC（gRPC + REST 双协议）互通
 * 当前阶段：内置 mock 适配器，前端可独立运行；后续切到真实 Connect-RPC 客户端只需替换 transport。
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

export class ApiClient {
  constructor(
    private baseURL: string,
    private getAuthToken: () => string | null = () => null,
    private mockHandler?: (path: string, opts: RequestOptions) => Promise<unknown>,
  ) {}

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    if (this.mockHandler) {
      const data = await this.mockHandler(path, opts);
      return data as T;
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
    try {
      const url = new URL(path, this.baseURL);
      if (opts.query) {
        for (const [k, v] of Object.entries(opts.query)) {
          if (v !== undefined) url.searchParams.set(k, String(v));
        }
      }
      const token = this.getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...opts.headers,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url.toString(), {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal ?? controller.signal,
      });
      const json = (await res.json()) as ApiResponse<T>;
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