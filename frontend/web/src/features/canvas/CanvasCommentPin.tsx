import { Check, Eye, MessageSquare, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { CanvasComment, CanvasPresence } from './canvas-types';

export type CanvasCommentPinProps = {
  comment: CanvasComment;
  presence: CanvasPresence[];
  onResolve?: (commentId: string, resolved: boolean) => void;
  onDelete?: (commentId: string) => void;
  canMutate: boolean;
  /** Container width/height in pixels so 0..1 coords can be positioned. */
  width: number;
  height: number;
};

export function CanvasCommentPin({
  comment,
  presence,
  onResolve,
  onDelete,
  canMutate,
  width,
  height,
}: CanvasCommentPinProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const left = Math.max(0, Math.min(width, comment.x * width));
  const top = Math.max(0, Math.min(height, comment.y * height));
  const isPresent = presence.some((p) => p.identity === comment.author);
  const resolved = comment.status === 'resolved';

  return (
    <span
      data-testid="canvas-comment-pin"
      data-comment-id={comment.id}
      data-resolved={resolved ? 'true' : 'false'}
      className="absolute z-10"
      style={{ left: `${left}px`, top: `${top}px`, transform: 'translate(-50%, -100%)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 w-7 items-center justify-center rounded-full shadow-md ring-2 ring-white ${
          resolved ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}
        aria-label={`评论 by ${comment.author}`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
      {isPresent && (
        <span
          data-testid="canvas-comment-pin-online"
          className="absolute -right-1 -top-1 inline-flex h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white"
          title={`${comment.author} 在线`}
        />
      )}
      {open && (
        <div
          data-testid="canvas-comment-popover"
          className="absolute left-1/2 top-full z-20 mt-1 w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-3 text-left text-xs shadow-lg"
        >
          <header className="mb-1 flex items-center justify-between">
            <span className="font-medium text-slate-700">{comment.author}</span>
            <span className="text-[10px] text-slate-400">
              {new Date(comment.createdAt).toLocaleTimeString()}
            </span>
          </header>
          <p className="whitespace-pre-wrap text-slate-700">{comment.text}</p>
          {canMutate && (
            <footer className="mt-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onResolve?.(comment.id, !resolved)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-slate-100"
              >
                {resolved ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                {resolved ? '重新开启' : '标记已解决'}
              </button>
              <button
                type="button"
                onClick={() => onDelete?.(comment.id)}
                className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3 w-3" />
                删除
              </button>
            </footer>
          )}
        </div>
      )}
    </span>
  );
}

export type CanvasPresenceBarProps = {
  presence: CanvasPresence[];
  width?: number;
};

export function CanvasPresenceBar({ presence }: CanvasPresenceBarProps): JSX.Element {
  if (presence.length === 0) {
    return (
      <span
        data-testid="canvas-presence-bar"
        data-empty="true"
        className="inline-flex items-center gap-1 text-xs text-slate-500"
      >
        <Eye className="h-3.5 w-3.5" /> 暂无在线
      </span>
    );
  }
  return (
    <span data-testid="canvas-presence-bar" className="inline-flex items-center gap-1 text-xs text-slate-600">
      <Eye className="h-3.5 w-3.5" />
      {presence.map((p) => (
        <span
          key={`${p.boardId}-${p.identity}`}
          data-testid="canvas-presence-identity"
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"
          title={`最后活跃 ${new Date(p.lastTouch).toLocaleTimeString()}`}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {p.identity}
        </span>
      ))}
    </span>
  );
}