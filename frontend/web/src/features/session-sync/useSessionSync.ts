import { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateTabId,
  isSessionSyncEvent,
  makeLocalStorageDeviceId,
  type DeviceIdStorage,
  type SessionSyncEvent,
} from './session-sync-types';

const DEFAULT_STORAGE_KEY = 'de.deviceId';

export type SessionSyncListener = (event: SessionSyncEvent) => void;

export type UseSessionSyncOptions = {
  /** Local storage key for deviceId persistence (defaults to de.deviceId). */
  storageKey?: string;
  /** Subscribe to events of this kind only (defaults to all). */
  filterKinds?: ReadonlyArray<SessionSyncEvent['kind']>;
};

export type SessionSyncHandle = {
  deviceId: string;
  tabId: string;
  /** Active tabs count seen on this device (including the current tab). */
  tabCount: number;
  /** Last event timestamp (ms since epoch). */
  lastEventAt: number | null;
  /** Latest 'state:updated' values keyed by `key`. */
  sharedState: Record<string, unknown>;
  /** Recent conversation:focus events (most recent first). */
  recentFocus: Array<{ conversationId: string; tabId: string; at: number }>;
  /** Re-broadcast a state value to other tabs. */
  updateState: (key: string, value: unknown) => void;
  /** Re-broadcast a conversation focus event. */
  focusConversation: (conversationId: string) => void;
};

type TabPeer = {
  tabId: string;
  deviceId: string;
  lastSeenAt: number;
};

const TAB_OFFLINE_AFTER_MS = 30_000;

function isSessionSyncEnabled(): boolean {
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return true;
  }
  const raw = import.meta.env.VITE_SESSION_SYNC_ENABLED;
  if (raw === undefined || raw === null || raw === '') return true;
  return !(String(raw).toLowerCase() === 'false' || String(raw) === '0');
}

function resolveDeviceId(storage: DeviceIdStorage | null, fallbackKey: string): string {
  if (typeof window === 'undefined' || !storage) {
    return 'ssr';
  }
  return storage.getOrCreate();
}

function resolveStorage(storageKey: string): DeviceIdStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return makeLocalStorageDeviceId({
    read: () => window.localStorage.getItem(storageKey),
    write: (id) => window.localStorage.setItem(storageKey, id),
  });
}

export function useSessionSync(options: UseSessionSyncOptions = {}): SessionSyncHandle {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;

  // Initialize refs/state lazily on first render — avoid empty placeholders
  // that flicker in the UI.
  const storageRef = useRef<DeviceIdStorage | null>(resolveStorage(storageKey));
  const deviceIdRef = useRef<string>(resolveDeviceId(storageRef.current, storageKey));
  const tabIdRef = useRef<string>(generateTabId());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peersRef = useRef<Map<string, TabPeer>>(new Map());
  const filterRef = useRef(options.filterKinds);

  const [tabCount, setTabCount] = useState(1);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [sharedState, setSharedState] = useState<Record<string, unknown>>({});
  const [recentFocus, setRecentFocus] = useState<
    Array<{ conversationId: string; tabId: string; at: number }>
  >([]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    filterRef.current = options.filterKinds;
  }, [options.filterKinds]);

  // Open the BroadcastChannel + announce + listen.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    if (!isSessionSyncEnabled()) {
      // Operator opt-out: skip channel + announcements. State still
      // resolves so the UI can render an offline indicator.
      return;
    }
    const ch = new BroadcastChannel('de.session-sync.v1');
    channelRef.current = ch;

    const onMessage = (ev: MessageEvent<unknown>) => {
      if (!isSessionSyncEvent(ev.data)) {
        return;
      }
      const event = ev.data;
      // Ignore our own messages — real BroadcastChannel echoes back to
      // the sender, but we don't want to react to ourselves.
      if (
        deviceIdRef.current &&
        event.deviceId === deviceIdRef.current &&
        tabIdRef.current &&
        event.tabId === tabIdRef.current
      ) {
        return;
      }
      if (filterRef.current && !filterRef.current.includes(event.kind)) {
        return;
      }
      if (event.kind === 'tab:left') {
        peersRef.current.delete(event.tabId);
      } else {
        peersRef.current.set(event.tabId, {
          tabId: event.tabId,
          deviceId: event.deviceId,
          lastSeenAt: Date.now(),
        });
      }

      setLastEventAt(event.at);
      if (event.kind === 'state:updated') {
        setSharedState((prev) => ({ ...prev, [event.key]: event.value }));
      } else if (event.kind === 'conversation:focus') {
        setRecentFocus((prev) => {
          const filtered = prev.filter((p) => p.tabId !== event.tabId);
          return [
            { conversationId: event.conversationId, tabId: event.tabId, at: event.at },
            ...filtered,
          ].slice(0, 8);
        });
      }
      // Recompute tab count from peer liveness + self.
      const now = Date.now();
      let count = 1;
      for (const p of peersRef.current.values()) {
        if (now - p.lastSeenAt <= TAB_OFFLINE_AFTER_MS) {
          count++;
        }
      }
      setTabCount(count);
    };

    ch.addEventListener('message', onMessage);

    if (deviceIdRef.current) {
      ch.postMessage({
        kind: 'tab:joined',
        deviceId: deviceIdRef.current,
        tabId: tabIdRef.current,
        at: Date.now(),
      } satisfies SessionSyncEvent);
    }

    // Force one render so consumers receive the resolved deviceId/tabId
    // even when storage was unavailable on first render.
    forceUpdate((n) => n + 1);

    return () => {
      if (deviceIdRef.current && tabIdRef.current) {
        try {
          ch.postMessage({
            kind: 'tab:left',
            deviceId: deviceIdRef.current,
            tabId: tabIdRef.current,
            at: Date.now(),
          } satisfies SessionSyncEvent);
        } catch {
          // channel may already be closed
        }
      }
      ch.removeEventListener('message', onMessage);
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // Heartbeat every 15s to keep peer liveness current.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return;
    }
    if (!isSessionSyncEnabled()) return;
    const id = window.setInterval(() => {
      const ch = channelRef.current;
      if (!ch || !deviceIdRef.current || !tabIdRef.current) {
        return;
      }
      try {
        ch.postMessage({
          kind: 'heartbeat',
          deviceId: deviceIdRef.current,
          tabId: tabIdRef.current,
          at: Date.now(),
        } satisfies SessionSyncEvent);
      } catch {
        // channel may be closed mid-tick
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const updateState = useCallback((key: string, value: unknown) => {
    const ch = channelRef.current;
    if (!ch || !deviceIdRef.current || !tabIdRef.current) {
      return;
    }
    try {
      ch.postMessage({
        kind: 'state:updated',
        deviceId: deviceIdRef.current,
        tabId: tabIdRef.current,
        key,
        value,
        at: Date.now(),
      } satisfies SessionSyncEvent);
    } catch {
      // ignore
    }
  }, []);

  const focusConversation = useCallback((conversationId: string) => {
    const ch = channelRef.current;
    if (!ch || !deviceIdRef.current || !tabIdRef.current) {
      return;
    }
    try {
      ch.postMessage({
        kind: 'conversation:focus',
        deviceId: deviceIdRef.current,
        tabId: tabIdRef.current,
        conversationId,
        at: Date.now(),
      } satisfies SessionSyncEvent);
    } catch {
      // ignore
    }
  }, []);

  return {
    deviceId: deviceIdRef.current,
    tabId: tabIdRef.current,
    tabCount,
    lastEventAt,
    sharedState,
    recentFocus,
    updateState,
    focusConversation,
  };
}