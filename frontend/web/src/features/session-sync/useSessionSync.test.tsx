// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useSessionSync } from './useSessionSync';
import type { SessionSyncEvent } from './session-sync-types';

type Listener = (ev: { data: unknown }) => void;

class FakeChannel {
  static all: FakeChannel[] = [];
  listeners = new Set<Listener>();
  closed = false;
  posted: SessionSyncEvent[] = [];

  constructor(public name: string) {
    FakeChannel.all.push(this);
  }

  postMessage(message: unknown): void {
    if (this.closed) return;
    if (
      message &&
      typeof message === 'object' &&
      'kind' in (message as Record<string, unknown>) &&
      'deviceId' in (message as Record<string, unknown>)
    ) {
      this.posted.push(message as SessionSyncEvent);
    }
    // Real BroadcastChannel does NOT echo to the sender — skip self.
    for (const other of FakeChannel.all) {
      if (other === this || other.closed) continue;
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

beforeEach(() => {
  FakeChannel.all.length = 0;
  const g = globalThis as { BroadcastChannel?: unknown };
  g.BroadcastChannel = FakeChannel as unknown as typeof BroadcastChannel;
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

afterEach(() => {
  cleanup();
  FakeChannel.all.forEach((c) => c.close());
  FakeChannel.all.length = 0;
});

function Probe() {
  const sync = useSessionSync();
  return (
    <div>
      <span data-testid="device-id">{sync.deviceId}</span>
      <span data-testid="tab-id">{sync.tabId}</span>
      <span data-testid="tab-count">{sync.tabCount}</span>
      <span data-testid="last-event-at">{sync.lastEventAt ?? 'none'}</span>
      <span data-testid="state-keys">{Object.keys(sync.sharedState).join(',')}</span>
      <button
        data-testid="push-state"
        onClick={() => sync.updateState('lastConversationId', 'c-1')}
      >
        push
      </button>
      <button
        data-testid="push-focus"
        onClick={() => sync.focusConversation('c-9')}
      >
        focus
      </button>
    </div>
  );
}

describe('useSessionSync', () => {
  it('persists a stable deviceId across mounts', async () => {
    const { unmount, getByTestId } = render(<Probe />);
    await waitFor(() => {
      expect((getByTestId('device-id').textContent ?? '').length).toBeGreaterThan(0);
    });
    const firstId = getByTestId('device-id').textContent;
    unmount();
    const { getByTestId: get } = render(<Probe />);
    await waitFor(() => {
      expect(get('device-id').textContent).toBe(firstId);
    });
  });

  it('announces itself as a tab:joined event', async () => {
    render(<Probe />);
    await waitFor(() => {
      expect(FakeChannel.all.length).toBeGreaterThan(0);
    });
    const ch = FakeChannel.all[FakeChannel.all.length - 1];
    await waitFor(() => {
      expect(ch.posted.some((m) => m.kind === 'tab:joined')).toBe(true);
    });
  });

  it('increments tabCount when another peer joins', async () => {
    const { getByTestId } = render(<Probe />);
    await waitFor(() => {
      expect(getByTestId('tab-count').textContent).toBe('1');
    });

    const peer = new FakeChannel('peer');
    act(() => {
      peer.postMessage({
        kind: 'tab:joined',
        deviceId: 'other-device',
        tabId: 'peer-tab',
        at: Date.now(),
      });
    });
    await waitFor(() => {
      expect(getByTestId('tab-count').textContent).toBe('2');
    });
    peer.close();
  });

  it('updateState posts state:updated to the channel', async () => {
    const { getByTestId } = render(<Probe />);
    await waitFor(() => {
      expect(FakeChannel.all.length).toBeGreaterThan(0);
    });
    const ch = FakeChannel.all[FakeChannel.all.length - 1];
    const before = ch.posted.filter((m) => m.kind === 'state:updated').length;
    await act(async () => {
      getByTestId('push-state').click();
    });
    await waitFor(() => {
      expect(
        ch.posted.filter((m) => m.kind === 'state:updated').length
      ).toBeGreaterThan(before);
    });
    const evt = ch.posted.find((m) => m.kind === 'state:updated');
    expect(evt).toMatchObject({
      kind: 'state:updated',
      key: 'lastConversationId',
      value: 'c-1',
    });
  });

  it('records incoming state:updated events in sharedState', async () => {
    const { getByTestId } = render(<Probe />);
    await waitFor(() => {
      expect(FakeChannel.all.length).toBeGreaterThan(0);
    });
    const peer = new FakeChannel('peer');
    act(() => {
      peer.postMessage({
        kind: 'state:updated',
        deviceId: 'd-other',
        tabId: 'peer-tab',
        key: 'lastViewedConversation',
        value: 'c-7',
        at: Date.now(),
      });
    });
    await waitFor(() => {
      expect(getByTestId('state-keys').textContent).toContain('lastViewedConversation');
    });
    peer.close();
  });

  it('records conversation:focus events', async () => {
    const { getByTestId } = render(<Probe />);
    await waitFor(() => {
      expect(FakeChannel.all.length).toBeGreaterThan(0);
    });
    const peer = new FakeChannel('peer');
    act(() => {
      peer.postMessage({
        kind: 'conversation:focus',
        deviceId: 'd-other',
        tabId: 'peer-tab',
        conversationId: 'c-9',
        at: Date.now(),
      });
    });
    await waitFor(() => {
      expect(getByTestId('last-event-at').textContent).not.toBe('none');
    });
    peer.close();
  });

  it('does not crash when BroadcastChannel is missing', async () => {
    const g = globalThis as { BroadcastChannel?: unknown };
    const orig = g.BroadcastChannel;
    g.BroadcastChannel = undefined;
    try {
      const { getByTestId } = render(<Probe />);
      await waitFor(() => {
        expect(getByTestId('device-id').textContent).toBeTruthy();
      });
    } finally {
      g.BroadcastChannel = orig;
    }
  });
});