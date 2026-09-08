import {
  SESSION_CHANNEL_NAME,
  generateTabId,
  isSessionSyncEvent,
  type SessionSyncEvent,
} from './session-sync-types';

export type SessionSyncChannel = {
  post(event: SessionSyncEvent): void;
  subscribe(listener: (event: SessionSyncEvent) => void): () => void;
  close(): void;
};

type BroadcastLike = {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  close(): void;
};

export type BroadcastChannelFactory = (name: string) => BroadcastLike;

function defaultFactory(name: string): BroadcastLike {
  if (typeof BroadcastChannel === 'undefined') {
    throw new Error('BroadcastChannel is not available in this environment');
  }
  return new BroadcastChannel(name);
}

export function openSessionChannel(
  factory: BroadcastChannelFactory = defaultFactory,
): SessionSyncChannel {
  let channel: BroadcastLike;
  try {
    channel = factory(SESSION_CHANNEL_NAME);
  } catch {
    // Environment without BroadcastChannel (older jsdom, SSR). Return a
    // no-op channel so consumers can still wire up the hook without
    // crashing the page.
    return createNoopChannel();
  }

  const listeners = new Set<(event: SessionSyncEvent) => void>();
  const wrapped = (ev: { data: unknown }) => {
    if (isSessionSyncEvent(ev.data)) {
      for (const l of listeners) {
        try {
          l(ev.data);
        } catch {
          // listener errors must not break the channel
        }
      }
    }
  };
  channel.addEventListener('message', wrapped);

  return {
    post(event) {
      try {
        channel.postMessage(event);
      } catch {
        // postMessage can throw if the channel is closed mid-flight; ignore.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      listeners.clear();
      try {
        channel.removeEventListener('message', wrapped);
        channel.close();
      } catch {
        // closing a malformed channel may throw — ignore.
      }
    },
  };
}

function createNoopChannel(): SessionSyncChannel {
  return {
    post: () => {},
    subscribe: () => () => {},
    close: () => {},
  };
}

export function createSessionSync(options: {
  deviceId: string;
  channel?: SessionSyncChannel;
  factory?: BroadcastChannelFactory;
  now?: () => number;
}): {
  post(event: SessionSyncEvent): void;
  subscribe(listener: (event: SessionSyncEvent) => void): () => void;
  close(): void;
  announceJoined(): void;
  announceLeft(): void;
  updateState(key: string, value: unknown): void;
  focusConversation(conversationId: string): void;
  tabId: string;
} {
  const now = options.now ?? (() => Date.now());
  const tabId = generateTabId();
  const channel = options.channel ?? openSessionChannel(options.factory);

  function post(event: SessionSyncEvent): void {
    channel.post(event);
  }

  function subscribe(listener: (event: SessionSyncEvent) => void): () => void {
    return channel.subscribe(listener);
  }

  return {
    post,
    subscribe,
    close: () => channel.close(),
    tabId,
    announceJoined: () => post({ kind: 'tab:joined', deviceId: options.deviceId, tabId, at: now() }),
    announceLeft: () => post({ kind: 'tab:left', deviceId: options.deviceId, tabId, at: now() }),
    updateState: (key, value) =>
      post({ kind: 'state:updated', deviceId: options.deviceId, tabId, key, value, at: now() }),
    focusConversation: (conversationId) =>
      post({
        kind: 'conversation:focus',
        deviceId: options.deviceId,
        tabId,
        conversationId,
        at: now(),
      }),
  };
}