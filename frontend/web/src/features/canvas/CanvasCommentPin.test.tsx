// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CanvasCommentPin, CanvasPresenceBar } from './CanvasCommentPin';
import type { CanvasComment, CanvasPresence } from './canvas-types';

afterEach(() => cleanup());

const baseComment: CanvasComment = {
  id: 'c1',
  boardId: 'b1',
  workspaceId: 'w1',
  x: 0.4,
  y: 0.6,
  text: 'hello world',
  author: 'alice',
  status: 'open',
  createdAt: '2026-09-08T10:00:00Z',
  updatedAt: '2026-09-08T10:00:00Z',
};

describe('CanvasCommentPin', () => {
  it('renders positioned by normalized coords', () => {
    const { getByTestId } = render(
      <svg width={1000} height={600} /> as unknown as JSX.Element,
    );
    // Render with explicit width/height via wrapper
    const Wrapper = () => (
      <div style={{ position: 'relative', width: 1000, height: 600 }}>
        <CanvasCommentPin comment={baseComment} presence={[]} width={1000} height={600} canMutate={false} />
      </div>
    );
    cleanup();
    const { getByTestId: g } = render(<Wrapper />);
    const pin = g('canvas-comment-pin');
    expect(pin.style.left).toBe('400px');
    expect(pin.style.top).toBe('360px');
  });

  it('shows popover on click and resolve/delete actions when canMutate', () => {
    const onResolve = vi.fn();
    const onDelete = vi.fn();
    const presence: CanvasPresence[] = [
      { boardId: 'b1', identity: 'alice', lastTouch: '2026-09-08T10:01:00Z' },
    ];
    const { getByTestId, getAllByRole, getByText } = render(
      <div style={{ position: 'relative', width: 1000, height: 600 }}>
        <CanvasCommentPin
          comment={baseComment}
          presence={presence}
          onResolve={onResolve}
          onDelete={onDelete}
          canMutate
          width={1000}
          height={600}
        />
      </div>,
    );
    expect(getByTestId('canvas-comment-pin-online')).toBeTruthy();
    fireEvent.click(getByTestId('canvas-comment-pin').querySelector('button')!);
    expect(getByTestId('canvas-comment-popover').textContent).toContain('hello world');
    fireEvent.click(getByText('标记已解决'));
    expect(onResolve).toHaveBeenCalledWith('c1', true);
    fireEvent.click(getByText('删除'));
    expect(onDelete).toHaveBeenCalledWith('c1');
    // Sanity: 3 buttons total — pin trigger + resolve + delete.
    expect(getAllByRole('button')).toHaveLength(3);
  });

  it('hides resolve/delete buttons when canMutate=false', () => {
    const { getByTestId, getByLabelText, queryByText } = render(
      <div style={{ position: 'relative', width: 1000, height: 600 }}>
        <CanvasCommentPin comment={baseComment} presence={[]} canMutate={false} width={1000} height={600} />
      </div>,
    );
    fireEvent.click(getByLabelText('评论 by alice'));
    expect(queryByText('标记已解决')).toBeNull();
    expect(queryByText('删除')).toBeNull();
    expect(getByTestId('canvas-comment-popover').textContent).toContain('hello world');
  });

  it('uses emerald color when resolved', () => {
    const { getByTestId } = render(
      <div style={{ position: 'relative', width: 1000, height: 600 }}>
        <CanvasCommentPin
          comment={{ ...baseComment, status: 'resolved' }}
          presence={[]}
          canMutate={false}
          width={1000}
          height={600}
        />
      </div>,
    );
    expect(getByTestId('canvas-comment-pin').getAttribute('data-resolved')).toBe('true');
  });
});

describe('CanvasPresenceBar', () => {
  it('renders empty state when no presence', () => {
    const { getByTestId } = render(<CanvasPresenceBar presence={[]} />);
    expect(getByTestId('canvas-presence-bar').getAttribute('data-empty')).toBe('true');
  });

  it('lists each present identity', () => {
    const presence: CanvasPresence[] = [
      { boardId: 'b1', identity: 'alice', lastTouch: '2026-09-08T10:01:00Z' },
      { boardId: 'b1', identity: 'bob', lastTouch: '2026-09-08T10:01:30Z' },
    ];
    const { getAllByTestId } = render(<CanvasPresenceBar presence={presence} />);
    expect(getAllByTestId('canvas-presence-identity')).toHaveLength(2);
  });
});