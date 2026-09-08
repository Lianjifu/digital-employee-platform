import { useRef, useState } from 'react';
import { useCanvasBoard } from './useCanvasBoard';
import {
  CanvasCommentPin,
  CanvasPresenceBar,
} from './CanvasCommentPin';
import { MAX_COMMENT_LENGTH, normaliseCoordinate } from './canvas-types';

export type CanvasBoardViewProps = {
  boardId: string;
  canMutate: boolean;
  width?: number;
  height?: number;
};

export function CanvasBoardView({
  boardId,
  canMutate,
  width = 800,
  height = 480,
}: CanvasBoardViewProps): JSX.Element {
  const { state, postComment, resolveComment, removeComment } = useCanvasBoard(boardId);
  const [draft, setDraft] = useState('');
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  function onSurfaceClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canMutate) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = normaliseCoordinate((e.clientX - rect.left) / rect.width);
    const y = normaliseCoordinate((e.clientY - rect.top) / rect.height);
    setPendingPoint({ x, y });
  }

  async function onSubmit() {
    if (!draft.trim() || !pendingPoint) return;
    const ok = await postComment(draft, pendingPoint.x, pendingPoint.y);
    if (ok) {
      setDraft('');
      setPendingPoint(null);
    }
  }

  return (
    <div data-testid="canvas-board-view" className="flex h-full flex-col gap-3">
      <header className="flex items-center justify-between text-sm text-slate-600">
        <span className="font-medium text-slate-800">
          {state.board?.title ?? '加载中…'}
        </span>
        <CanvasPresenceBar presence={state.presence} />
      </header>

      <div
        ref={surfaceRef}
        onClick={onSurfaceClick}
        data-testid="canvas-surface"
        className="relative flex-1 cursor-crosshair overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50"
        style={{ width, height }}
      >
        {state.loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            加载画布…
          </div>
        )}
        {state.error && (
          <div className="absolute left-2 top-2 rounded bg-rose-100 px-2 py-1 text-xs text-rose-700">
            {state.error}
          </div>
        )}
        {state.comments.map((c) => (
          <CanvasCommentPin
            key={c.id}
            comment={c}
            presence={state.presence}
            canMutate={canMutate}
            width={width}
            height={height}
            onResolve={(id, resolved) => resolveComment(id, resolved)}
            onDelete={(id) => removeComment(id)}
          />
        ))}
        {pendingPoint && (
          <span
            data-testid="canvas-pending-pin"
            className="pointer-events-none absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-500 bg-white"
            style={{
              left: `${pendingPoint.x * width}px`,
              top: `${pendingPoint.y * height}px`,
            }}
          />
        )}
      </div>

      {pendingPoint && (
        <div data-testid="canvas-comment-composer" className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-3">
          <textarea
            data-testid="canvas-comment-input"
            value={draft}
            maxLength={MAX_COMMENT_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="输入评论..."
            rows={2}
            className="w-full resize-none rounded border border-slate-200 p-2 text-sm outline-none focus:border-rose-400"
          />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{draft.length} / {MAX_COMMENT_LENGTH}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  setPendingPoint(null);
                }}
                className="rounded px-2 py-1 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!draft.trim()}
                data-testid="canvas-comment-submit"
                className="rounded bg-rose-500 px-3 py-1 text-white hover:bg-rose-600 disabled:opacity-50"
              >
                发布评论
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CanvasBoardView;