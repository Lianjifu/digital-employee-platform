import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { postVisualDiff, visualDiffCacheURL } from './visualdiff-api';
import { MAX_PAYLOAD_BYTES, readFileAsBase64, readFilesAsPair } from './visualdiff-types';

describe('visualdiff-api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs base64 + tunables as JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            match: true,
            diffRatio: 0,
            diffPixels: 0,
            total: 4096,
            width: 64,
            height: 64,
            latencyMS: 12,
            cacheKey: 'k1',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const out = await postVisualDiff({
      before: 'AAAA',
      after: 'BBBB',
      threshold: 0.2,
      tolerance: 4,
      highlight: true,
    });

    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') {
      throw new Error('expected ok');
    }
    expect(out.data.match).toBe(true);
    expect(out.data.cacheKey).toBe('k1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/visualdiff');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    const body = JSON.parse(init.body as string);
    expect(body.before).toBe('AAAA');
    expect(body.after).toBe('BBBB');
    expect(body.threshold).toBe(0.2);
    expect(body.tolerance).toBe(4);
    expect(body.highlight).toBe(true);
    expect(body.resizeWidth).toBeUndefined();
  });

  it('surfaces HTTP 400 with backend message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, message: 'before 必须是 base64 PNG' }),
        { status: 400 },
      ),
    );
    const out = await postVisualDiff({ before: 'x', after: 'y' });
    expect(out.kind).toBe('err');
    if (out.kind !== 'err') {
      throw new Error('expected err');
    }
    expect(out.error.status).toBe(400);
    expect(out.error.message).toContain('before');
  });

  it('surfaces network failures as status 0', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const out = await postVisualDiff({ before: 'a', after: 'b' });
    expect(out.kind).toBe('err');
    if (out.kind !== 'err') {
      throw new Error('expected err');
    }
    expect(out.error.status).toBe(0);
    expect(out.error.message).toBe('boom');
  });

  it('handles non-JSON error bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response('plain text error', { status: 502 }));
    const out = await postVisualDiff({ before: 'a', after: 'b' });
    expect(out.kind).toBe('err');
    if (out.kind !== 'err') {
      throw new Error('expected err');
    }
    expect(out.error.status).toBe(502);
    expect(out.error.message).toContain('plain text error');
  });

  it('decodes top-level data envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            match: false,
            diffRatio: 0.123,
            diffPixels: 50,
            total: 1000,
            width: 32,
            height: 32,
            latencyMS: 7,
            cacheKey: 'k2',
            diffPng: 'BASE64',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const out = await postVisualDiff({ before: 'a', after: 'b', highlight: true });
    if (out.kind !== 'ok') {
      throw new Error('expected ok');
    }
    expect(out.data.diffPng).toBe('BASE64');
  });

  it('handles bare-object response shape', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          match: true,
          diffRatio: 0,
          diffPixels: 0,
          total: 1,
          width: 1,
          height: 1,
          latencyMS: 1,
          cacheKey: 'k3',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const out = await postVisualDiff({ before: 'a', after: 'b' });
    if (out.kind !== 'ok') {
      throw new Error('expected ok');
    }
    expect(out.data.cacheKey).toBe('k3');
  });

  it('handles JSON parse failure on success status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    const out = await postVisualDiff({ before: 'a', after: 'b' });
    expect(out.kind).toBe('err');
    if (out.kind !== 'err') {
      throw new Error('expected err');
    }
    expect(out.error.status).toBe(200);
    expect(out.error.message).toContain('响应解析失败');
  });
});

describe('visualdiff-api: visualDiffCacheURL', () => {
  it('returns empty string for empty key', () => {
    expect(visualDiffCacheURL('')).toBe('');
  });

  it('encodes cache key in path', () => {
    expect(visualDiffCacheURL('abc/123')).toBe('/api/visualdiff/abc%2F123.png');
  });

  it('keeps safe keys verbatim', () => {
    expect(visualDiffCacheURL('k_1-2.3')).toBe('/api/visualdiff/k_1-2.3.png');
  });
});

describe('visualdiff-types: readFileAsBase64', () => {
  it('rejects oversized files', async () => {
    // 9 MB file > 8 MB cap
    const big = new File([new Uint8Array(MAX_PAYLOAD_BYTES + 1)], 'big.png', {
      type: 'image/png',
    });
    await expect(readFileAsBase64(big)).rejects.toThrow(/超过/);
  });

  it('decodes a small PNG to base64', async () => {
    const tiny = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'tiny.png', {
      type: 'image/png',
    });
    const out = await readFileAsBase64(tiny);
    // iVBORw== = base64 of [0x89, 0x50, 0x4e, 0x47] (first 4 bytes of PNG magic).
    expect(out).toBe('iVBORw==');
  });
});

describe('visualdiff-types: readFilesAsPair', () => {
  it('reads two files at once', async () => {
    const a = new File([new Uint8Array([0x01, 0x02])], 'a.png');
    const b = new File([new Uint8Array([0x03, 0x04])], 'b.png');
    const out = await readFilesAsPair(a, b);
    expect(out.before.length).toBeGreaterThan(0);
    expect(out.after.length).toBeGreaterThan(0);
    expect(out.before).not.toEqual(out.after);
  });
});