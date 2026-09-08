// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SessionSync from './SessionSync';
import { I18nProvider } from '@/i18n';

type Listener = (ev: { data: unknown }) => void;

class FakeChannel {
  static all: FakeChannel[] = [];
  listeners = new Set<Listener>();
  closed = false;
  posted: unknown[] = [];

  constructor(public name: string) {
    FakeChannel.all.push(this);
  }

  postMessage(message: unknown): void {
    if (this.closed) return;
    this.posted.push(message);
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
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
    FakeChannel as unknown as typeof BroadcastChannel;
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

afterEach(() => {
  cleanup();
  FakeChannel.all.forEach((c) => c.close());
  FakeChannel.all.length = 0;
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          <Route path="/session-sync" element={<SessionSync />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('SessionSync page', () => {
  it('renders deviceId, tabId, tabCount', async () => {
    const { getByTestId } = renderAt('/session-sync');
    await waitFor(() => {
      expect(getByTestId('session-sync-page-device-id').textContent).not.toBe('…');
    });
    expect(getByTestId('session-sync-page-device-id').textContent).toMatch(/^[0-9a-f-]{36}$/);
    expect(getByTestId('session-sync-page-tab-id').textContent).toMatch(/^[0-9a-f-]{36}$/);
    expect(getByTestId('session-sync-page-tab-count').textContent).toBe('1');
  });

  it('broadcasts a conversation:focus on mount', async () => {
    renderAt('/session-sync');
    await waitFor(() => {
      expect(FakeChannel.all.length).toBeGreaterThan(0);
    });
    const ch = FakeChannel.all[FakeChannel.all.length - 1];
    await waitFor(() => {
      expect(
        ch.posted.some(
          (m): m is { kind: string; conversationId: string } =>
            typeof m === 'object' &&
            m !== null &&
            (m as { kind?: string }).kind === 'conversation:focus' &&
            (m as { conversationId?: string }).conversationId === 'session-sync-overview',
        ),
      ).toBe(true);
    });
  });
});