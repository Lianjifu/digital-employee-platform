import { describe, expect, it, vi } from 'vitest';
import {
  clampNowSkewMs,
  generateDeviceId,
  generateTabId,
  isSessionSyncEvent,
  makeLocalStorageDeviceId,
  type SessionSyncEvent,
} from './session-sync-types';

describe('session-sync-types: generateDeviceId', () => {
  it('returns uuid-shaped strings', () => {
    const id = generateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('produces unique ids across calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++) {
      ids.add(generateDeviceId());
    }
    // Some collisions are statistically possible but extremely unlikely.
    expect(ids.size).toBeGreaterThan(20);
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-2222-3333-4444-555555555555');
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    const origDescriptor = Object.getOwnPropertyDescriptor(g, 'crypto');
    Object.defineProperty(g, 'crypto', {
      value: { randomUUID },
      configurable: true,
      writable: true,
    });
    try {
      expect(generateDeviceId()).toBe('11111111-2222-3333-4444-555555555555');
      expect(randomUUID).toHaveBeenCalled();
    } finally {
      if (origDescriptor) {
        Object.defineProperty(g, 'crypto', origDescriptor);
      } else {
        delete (g as { crypto?: unknown }).crypto;
      }
    }
  });
});

describe('session-sync-types: isSessionSyncEvent', () => {
  const valid: SessionSyncEvent = {
    kind: 'tab:joined',
    deviceId: 'd1',
    tabId: 't1',
    at: 1,
  };

  it('accepts well-formed events', () => {
    expect(isSessionSyncEvent(valid)).toBe(true);
    expect(isSessionSyncEvent({ ...valid, kind: 'state:updated', key: 'k', value: 1 })).toBe(true);
  });

  it('rejects malformed events', () => {
    expect(isSessionSyncEvent(null)).toBe(false);
    expect(isSessionSyncEvent({})).toBe(false);
    expect(isSessionSyncEvent({ kind: 'tab:joined' })).toBe(false);
    expect(isSessionSyncEvent({ ...valid, deviceId: 1 })).toBe(false);
    expect(isSessionSyncEvent({ ...valid, at: 'now' })).toBe(false);
  });
});

describe('session-sync-types: makeLocalStorageDeviceId', () => {
  it('returnss the existing id when present and valid', () => {
    const existing = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    let stored = existing;
    const store = {
      read: () => stored,
      write: (id: string) => {
        stored = id;
      },
    };
    expect(makeLocalStorageDeviceId(store).getOrCreate()).toBe(existing);
  });

  it('writes a new id when storage is empty', () => {
    let stored: string | null = null;
    const store = {
      read: () => stored,
      write: (id: string) => {
        stored = id;
      },
    };
    const id = makeLocalStorageDeviceId(store).getOrCreate();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored).toBe(id);
  });

  it('overwrites malformed ids', () => {
    let stored = 'not-a-uuid';
    const store = {
      read: () => stored,
      write: (id: string) => {
        stored = id;
      },
    };
    const id = makeLocalStorageDeviceId(store).getOrCreate();
    expect(id).not.toBe('not-a-uuid');
    expect(stored).toBe(id);
  });

  it('reset always returns a fresh id', () => {
    const initial = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    let stored: string | null = initial;
    const store = {
      read: () => stored,
      write: (id: string) => {
        stored = id;
      },
    };
    const fresh = makeLocalStorageDeviceId(store).reset();
    expect(fresh).not.toBe(initial);
    expect(stored).toBe(fresh);
  });
});

describe('session-sync-types: generateTabId', () => {
  it('returns uuid-shaped strings', () => {
    expect(generateTabId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('session-sync-types: clampNowSkewMs', () => {
  it('clamps to [0, max]', () => {
    expect(clampNowSkewMs(-5)).toBe(0);
    expect(clampNowSkewMs(0)).toBe(0);
    expect(clampNowSkewMs(1234.6)).toBe(1235);
    expect(clampNowSkewMs(60_001)).toBe(60_000);
    expect(clampNowSkewMs(Number.NaN)).toBe(0);
    expect(clampNowSkewMs(Number.POSITIVE_INFINITY)).toBe(60_000);
  });
});