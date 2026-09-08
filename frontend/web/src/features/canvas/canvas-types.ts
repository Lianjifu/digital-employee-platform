export type CanvasCommentStatus = 'open' | 'resolved';

export type CanvasBoardKind = 'comments' | 'workflow';

export type CanvasBoard = {
  id: string;
  workspaceId: string;
  title: string;
  owner: string;
  /** comments (default) or workflow. Empty/missing treated as 'comments'. */
  kind: CanvasBoardKind;
  createdAt: string;
  updatedAt: string;
};

export type CanvasComment = {
  id: string;
  boardId: string;
  workspaceId: string;
  /** Normalised 0..1 X coordinate. */
  x: number;
  /** Normalised 0..1 Y coordinate. */
  y: number;
  text: string;
  author: string;
  status: CanvasCommentStatus;
  createdAt: string;
  updatedAt: string;
};

export type CanvasPresence = {
  boardId: string;
  identity: string;
  lastTouch: string;
};

export type CanvasStreamEvent =
  | { type: 'snapshot'; board: CanvasBoard; comments: CanvasComment[]; presence: CanvasPresence[] }
  | { type: 'presence'; presence: CanvasPresence[] }
  | { type: 'comment'; comment: CanvasComment; deleted?: boolean }
  | { type: 'tick'; presence: CanvasPresence[]; now: string }
  | { type: 'ping'; now: string };

export function isCanvasStreamEvent(value: unknown): value is CanvasStreamEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as { type?: unknown };
  return (
    typeof v.type === 'string' &&
    ['snapshot', 'presence', 'comment', 'tick', 'ping'].includes(v.type)
  );
}

export const MAX_COMMENT_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 200;

export function clampCommentText(text: string, max = MAX_COMMENT_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(0, max);
}

export function clampBoardTitle(title: string, max = MAX_TITLE_LENGTH): string {
  const trimmed = title.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(0, max);
}

export function normaliseCoordinate(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  if (value < 0) {
    return 0;
  }
  return value;
}

export function uniqueAuthors(comments: CanvasComment[]): string[] {
  const set = new Set<string>();
  for (const c of comments) {
    if (c.author) set.add(c.author);
  }
  return Array.from(set).sort();
}