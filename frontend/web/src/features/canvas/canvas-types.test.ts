import { describe, expect, it } from 'vitest';
import {
  MAX_COMMENT_LENGTH,
  clampBoardTitle,
  clampCommentText,
  isCanvasStreamEvent,
  normaliseCoordinate,
  uniqueAuthors,
  type CanvasComment,
} from './canvas-types';

describe('canvas-types: clamp helpers', () => {
  it('trims and clamps comment text', () => {
    expect(clampCommentText('  hello  ')).toBe('hello');
    expect(clampCommentText('a'.repeat(MAX_COMMENT_LENGTH + 100))).toHaveLength(MAX_COMMENT_LENGTH);
  });

  it('trims and clamps board title', () => {
    expect(clampBoardTitle('  board  ')).toBe('board');
    expect(clampBoardTitle('x'.repeat(500))).toHaveLength(200);
  });
});

describe('canvas-types: normaliseCoordinate', () => {
  it('clamps into [0, 1]', () => {
    expect(normaliseCoordinate(-0.5)).toBe(0);
    expect(normaliseCoordinate(0.5)).toBe(0.5);
    expect(normaliseCoordinate(1.5)).toBe(1);
    expect(normaliseCoordinate(Number.NaN)).toBe(0);
    expect(normaliseCoordinate(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('canvas-types: uniqueAuthors', () => {
  it('returns distinct, sorted authors', () => {
    const comments: CanvasComment[] = [
      { id: '1', boardId: 'b', workspaceId: 'w', x: 0.1, y: 0.1, text: 't', author: 'bob', status: 'open', createdAt: 't', updatedAt: 't' },
      { id: '2', boardId: 'b', workspaceId: 'w', x: 0.1, y: 0.1, text: 't', author: 'alice', status: 'open', createdAt: 't', updatedAt: 't' },
      { id: '3', boardId: 'b', workspaceId: 'w', x: 0.1, y: 0.1, text: 't', author: 'bob', status: 'open', createdAt: 't', updatedAt: 't' },
    ];
    expect(uniqueAuthors(comments)).toEqual(['alice', 'bob']);
  });

  it('skips empty authors', () => {
    expect(
      uniqueAuthors([
        { id: '1', boardId: 'b', workspaceId: 'w', x: 0, y: 0, text: '', author: '', status: 'open', createdAt: 't', updatedAt: 't' },
      ]),
    ).toEqual([]);
  });
});

describe('canvas-types: isCanvasStreamEvent', () => {
  it('accepts known event types', () => {
    expect(isCanvasStreamEvent({ type: 'snapshot' })).toBe(true);
    expect(isCanvasStreamEvent({ type: 'ping', now: 't' })).toBe(true);
    expect(isCanvasStreamEvent({ type: 'tick', now: 't' })).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(isCanvasStreamEvent({ type: 'random' })).toBe(false);
    expect(isCanvasStreamEvent(null)).toBe(false);
    expect(isCanvasStreamEvent('snapshot')).toBe(false);
  });
});