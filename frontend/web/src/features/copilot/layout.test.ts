import { describe, expect, it } from 'vitest';
import { sessionHistoryPresentation } from './layout';

describe('copilot session history presentation', () => {
  it('keeps session history pinned from tablet widths upward', () => {
    expect(sessionHistoryPresentation(900)).toBe('pinned');
    expect(sessionHistoryPresentation(1440)).toBe('pinned');
  });

  it('uses a drawer only when the viewport cannot safely reserve a history column', () => {
    expect(sessionHistoryPresentation(899)).toBe('drawer');
  });
});
