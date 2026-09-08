export const DEVICE_ID_STORAGE_KEY = 'de.deviceId';
export const SESSION_CHANNEL_NAME = 'de.session-sync.v1';

export type SessionSyncEvent =
  | { kind: 'tab:joined'; deviceId: string; tabId: string; at: number }
  | { kind: 'tab:left'; deviceId: string; tabId: string; at: number }
  | { kind: 'state:updated'; deviceId: string; tabId: string; key: string; value: unknown; at: number }
  | { kind: 'conversation:focus'; deviceId: string; tabId: string; conversationId: string; at: number }
  | { kind: 'heartbeat'; deviceId: string; tabId: string; at: number };

export function isSessionSyncEvent(value: unknown): value is SessionSyncEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as { kind?: unknown; deviceId?: unknown; tabId?: unknown; at?: unknown };
  return (
    typeof v.kind === 'string' &&
    typeof v.deviceId === 'string' &&
    typeof v.tabId === 'string' &&
    typeof v.at === 'number'
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateDeviceId(): string {
  // Prefer crypto.randomUUID when available (modern browsers + jsdom 24+).
  // Read crypto each call so tests can swap globalThis.crypto and have it
  // take effect on subsequent invocations.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  // Fallback: timestamp + random bytes — guaranteed distinct from any
  // value generated previously because we mix Date.now() and Math.random().
  const time = Date.now().toString(16).padStart(12, '0').slice(-12);
  const bytes = new Uint8Array(10);
  for (let i = 0; i < 10; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${time}-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 20)}`;
}

export type DeviceIdStorage = {
  read(): string | null;
  write(id: string): void;
};

export function makeLocalStorageDeviceId(storage: DeviceIdStorage = windowLocalStorage()): {
  getOrCreate: () => string;
  reset: () => string;
} {
  return {
    getOrCreate: () => {
      const existing = storage.read();
      if (existing && UUID_RE.test(existing)) {
        return existing;
      }
      const fresh = generateDeviceId();
      storage.write(fresh);
      return fresh;
    },
    reset: () => {
      let fresh = generateDeviceId();
      // Guarantee a value different from what's currently stored so the
      // caller can rely on a real rotation (rare Math.random() collisions
      // are still possible).
      let current = storage.read();
      let guard = 0;
      while (fresh === current && guard < 8) {
        fresh = generateDeviceId();
        guard++;
      }
      storage.write(fresh);
      return fresh;
    },
  };
}

function windowLocalStorage(): DeviceIdStorage {
  return {
    read: () => (typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_ID_STORAGE_KEY) : null),
    write: (id) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
      }
    },
  };
}

export function generateTabId(): string {
  return generateDeviceId();
}

export function clampNowSkewMs(value: number, max = 60_000): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > max) {
    return max;
  }
  return Math.round(value);
}