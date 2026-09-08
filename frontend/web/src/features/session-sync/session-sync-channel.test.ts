import { describe, expect, it, vi } from 'vitest';
import { openSessionChannel, createSessionSync, type BroadcastChannelFactory } from './session-sync-channel';
import type { SessionSyncEvent } from './session-sync-types';

type Listener = (ev: { data: unknown }) => void;

class FakeChannel {
  static all: FakeChannel[] = [];
  private listeners = new Set<Listener>();
  closed = false;
  posted: unknown[] = [];

  constructor(public name: string) {
    FakeChannel.all.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
    for (const other of FakeChannel.all) {
      if (other.closed) continue;
      for (const l of other.listeners) {
        l({ data: message });
      }
    }
  }

  addEventListener(_type: 'message', listener: Listener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: Listener): void {
    this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

function factory(name: string) {
  return new FakeChannel(name);
}

describe('session-sync-channel: openSessionChannel', () => {
  it('opens a channel with the standard name', () => {
    const ch = openSessionChannel(factory);
    expect(FakeChannel.all[FakeChannel.all.length - 1]!.name).toBe('de.session-sync.v1');
    ch.close();
  });

  it('returns a no-op channel when BroadcastChannel is unavailable', () => {
    const original = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
    try {
      const ch = openSessionChannel();
      expect(() => ch.post({ kind: 'tab:joined', deviceId: 'd', tabId: 't', at: 1 })).not.toThrow();
      expect(ch.subscribe(() => {})()).toBeUndefined();
      expect(() => ch.close()).not.toThrow();
    } finally {
      (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
    }
  });

  it('drops non-conforming messages', () => {
    const ch = openSessionChannel(factory);
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    const listener = vi.fn();
    ch.subscribe(listener);
    fake.postMessage('not an event');
    fake.postMessage({ kind: 'wrong' });
    expect(listener).not.toHaveBeenCalled();
    ch.close();
  });

  it('forwards conforming events to subscribers', () => {
    const ch = openSessionChannel(factory);
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    const listener = vi.fn();
    ch.subscribe(listener);
    const ev: SessionSyncEvent = { kind: 'tab:joined', deviceId: 'd1', tabId: 't1', at: 1 };
    fake.postMessage(ev);
    expect(listener).toHaveBeenCalledWith(ev);
    ch.close();
  });

  it('unsubscribe removes the listener', () => {
    const ch = openSessionChannel(factory);
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    const listener = vi.fn();
    const off = ch.subscribe(listener);
    off();
    fake.postMessage({ kind: 'tab:joined', deviceId: 'd1', tabId: 't1', at: 1 });
    expect(listener).not.toHaveBeenCalled();
    ch.close();
  });

  it('listener errors do not break the channel', () => {
    const ch = openSessionChannel(factory);
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    ch.subscribe(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();
    ch.subscribe(ok);
    fake.postMessage({ kind: 'tab:joined', deviceId: 'd', tabId: 't', at: 1 });
    expect(ok).toHaveBeenCalled();
    ch.close();
  });

  it('close removes listeners and closes the underlying channel', () => {
    const ch = openSessionChannel(factory);
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    const listener = vi.fn();
    ch.subscribe(listener);
    ch.close();
    fake.postMessage({ kind: 'tab:joined', deviceId: 'd', tabId: 't', at: 1 });
    expect(listener).not.toHaveBeenCalled();
    expect(fake.closed).toBe(true);
  });
});

describe('session-sync-channel: createSessionSync', () => {
  it('returns a stable tabId', () => {
    const sync = createSessionSync({ deviceId: 'd1', factory });
    expect(sync.tabId).toMatch(/^[0-9a-f-]{36}$/);
    sync.close();
  });

  it('announceJoined posts a tab:joined event with the device + tab id', () => {
    const sync = createSessionSync({ deviceId: 'd1', factory });
    sync.announceJoined();
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    expect(fake.posted).toContainEqual({
      kind: 'tab:joined',
      deviceId: 'd1',
      tabId: sync.tabId,
      at: expect.any(Number),
    });
    sync.close();
  });

  it('updateState posts a state:updated event with the key + value', () => {
    const sync = createSessionSync({ deviceId: 'd2', factory });
    sync.updateState('lastViewedConversation', 'c-42');
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    expect(fake.posted).toContainEqual({
      kind: 'state:updated',
      deviceId: 'd2',
      tabId: sync.tabId,
      key: 'lastViewedConversation',
      value: 'c-42',
      at: expect.any(Number),
    });
    sync.close();
  });

  it('focusConversation posts a conversation-focus event', () => {
    const sync = createSessionSync({ deviceId: 'd3', factory });
    sync.focusConversation('conv-x');
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    expect(fake.posted).toContainEqual({
      kind: 'conversation:focus',
      deviceId: 'd3',
      tabId: sync.tabId,
      conversationId: 'conv-x',
      at: expect.any(Number),
    });
    sync.close();
  });

  it('announceLeft posts a tab:left event', () => {
    const sync = createSessionSync({ deviceId: 'd4', factory });
    sync.announceLeft();
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    expect(fake.posted).toContainEqual({
      kind: 'tab:left',
      deviceId: 'd4',
      tabId: sync.tabId,
      at: expect.any(Number),
    });
    sync.close();
  });

  it('post swallows errors from a closed channel', () => {
    const sync = createSessionSync({ deviceId: 'd5', factory });
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    fake.postMessage = () => {
      throw new Error('closed');
    };
    expect(() => sync.updateState('k', 'v')).not.toThrow();
    sync.close();
  });

  it('uses provided now() for timestamps', () => {
    let now = 100;
    const sync = createSessionSync({
      deviceId: 'd6',
      factory,
      now: () => now,
    });
    sync.announceJoined();
    now = 200;
    sync.announceLeft();
    const fake = FakeChannel.all[FakeChannel.all.length - 1]!;
    const joined = fake.posted.find(
      (m): m is SessionSyncEvent =>
        typeof m === 'object' && m !== null && (m as { kind?: string }).kind === 'tab:joined',
    );
    const left = fake.posted.find(
      (m): m is SessionSyncEvent =>
        typeof m === 'object' && m !== null && (m as { kind?: string }).kind === 'tab:left',
    );
    expect(joined?.at).toBe(100);
    expect(left?.at).toBe(200);
    sync.close();
  });
});