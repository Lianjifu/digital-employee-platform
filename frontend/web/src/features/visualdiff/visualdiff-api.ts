import type { VisualDiffRequest, VisualDiffResponse, VisualDiffOutcome } from './visualdiff-types';

export type VisualDiffFetchOptions = {
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
};

export async function postVisualDiff(
  req: VisualDiffRequest,
  options: VisualDiffFetchOptions = {},
): Promise<VisualDiffOutcome> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
  let res: Response;
  try {
    res = await fetch('/api/visualdiff', {
      method: 'POST',
      credentials: options.credentials ?? 'same-origin',
      headers,
      body: JSON.stringify({
        before: req.before,
        after: req.after,
        ...(req.threshold !== undefined ? { threshold: req.threshold } : {}),
        ...(req.tolerance !== undefined ? { tolerance: req.tolerance } : {}),
        ...(req.highlight !== undefined ? { highlight: req.highlight } : {}),
        ...(req.resizeWidth !== undefined ? { resizeWidth: req.resizeWidth } : {}),
        ...(req.resizeHeight !== undefined ? { resizeHeight: req.resizeHeight } : {}),
      }),
    });
  } catch (err) {
    return {
      kind: 'err',
      error: {
        status: 0,
        message: err instanceof Error ? err.message : '网络请求失败',
      },
    };
  }

  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { message?: string; data?: { message?: string } };
          detail = parsed.data?.message ?? parsed.message ?? text.slice(0, 240);
        } catch {
          detail = text.slice(0, 240);
        }
      }
    } catch {
      // ignore body-read failure
    }
    return { kind: 'err', error: { status: res.status, message: detail } };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    return {
      kind: 'err',
      error: {
        status: res.status,
        message: err instanceof Error ? `响应解析失败: ${err.message}` : '响应解析失败',
      },
    };
  }
  // Backend uses response.OK which wraps the body in {ok:true, data:…};
  // some legacy endpoints return the body directly. Accept both shapes.
  if (raw && typeof raw === 'object' && 'data' in raw) {
    raw = (raw as { data: unknown }).data;
  }
  return { kind: 'ok', data: raw as VisualDiffResponse };
}

export function visualDiffCacheURL(cacheKey: string): string {
  if (!cacheKey) {
    return '';
  }
  return `/api/visualdiff/${encodeURIComponent(cacheKey)}.png`;
}