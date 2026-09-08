import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '@de/web-ui';
import { Plus, Trash2 } from 'lucide-react';
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
} from '@/features/canvas/canvas-api';
import { CanvasBoardView } from '@/features/canvas/CanvasBoardView';
import type { CanvasBoard } from '@/features/canvas/canvas-types';
import { WorkflowBoard } from '@/features/workflow-canvas/WorkflowBoard';
import { getWorkflow } from '@/features/workflow-canvas/workflow-canvas-api';
import type { WorkflowGraph } from '@/features/workflow-canvas/workflow-types';

type BoardViewKind = 'comments' | 'workflow';

export default function CanvasPage() {
  const { boardId } = useParams<{ boardId?: string }>();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<CanvasBoard[]>([]);
  const [active, setActive] = useState<string | null>(boardId ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBoards()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBoards(res.data.boards);
        if (!boardId && res.data.boards.length > 0) {
          setActive(res.data.boards[0]!.id);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => {
    if (boardId && boardId !== active) setActive(boardId);
  }, [boardId, active]);

  async function onCreate(kind: BoardViewKind) {
    const title = window.prompt(kind === 'workflow' ? '新流程画布标题' : '新画布标题');
    if (!title) return;
    const res = await createBoard(title, { kind });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBoards((prev) => [res.data, ...prev]);
    setActive(res.data.id);
    navigate(`/canvas/${res.data.id}`);
  }

  async function onDelete(id: string) {
    if (!window.confirm('确认删除画布？')) return;
    const res = await deleteBoard(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBoards((prev) => prev.filter((b) => b.id !== id));
    if (active === id) {
      const next = boards.find((b) => b.id !== id);
      setActive(next?.id ?? null);
      navigate(next ? `/canvas/${next.id}` : '/canvas');
    }
  }

  return (
    <div data-testid="canvas-page" className="mx-auto flex h-full max-w-6xl gap-4 p-6">
      <aside
        data-testid="canvas-sidebar"
        className="w-64 shrink-0 rounded-md border border-slate-200 bg-white p-3"
      >
        <header className="mb-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">协作画布</h2>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onCreate('comments')}
              data-testid="canvas-create-comments"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-rose-500 px-2 py-1 text-xs text-white hover:bg-rose-600"
            >
              <Plus className="h-3.5 w-3.5" />
              画布
            </button>
            <button
              type="button"
              onClick={() => onCreate('workflow')}
              data-testid="canvas-create-workflow"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-sky-500 px-2 py-1 text-xs text-white hover:bg-sky-600"
            >
              <Plus className="h-3.5 w-3.5" />
              流程
            </button>
          </div>
        </header>
        {loading && <p className="text-xs text-slate-500">加载中…</p>}
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <ul className="space-y-1">
          {boards.map((b) => (
            <li
              key={b.id}
              data-testid="canvas-sidebar-item"
              data-active={b.id === active ? 'true' : 'false'}
              data-kind={b.kind}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                b.id === active ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => {
                  setActive(b.id);
                  navigate(`/canvas/${b.id}`);
                }}
              >
                <span className="mr-1 inline-block rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">
                  {b.kind === 'workflow' ? 'flow' : 'pin'}
                </span>
                {b.title}
              </button>
              <button
                type="button"
                onClick={() => onDelete(b.id)}
                aria-label={`删除 ${b.title}`}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
          {boards.length === 0 && !loading && (
            <li className="rounded border border-dashed border-slate-200 px-2 py-3 text-center text-xs text-slate-400">
              暂无画布
            </li>
          )}
        </ul>
      </aside>

      <main className="flex-1 rounded-md border border-slate-200 bg-white p-4">
        {active ? (
          <CanvasBoardHost boardId={active} canMutate={true} />
        ) : (
          <p className="p-10 text-center text-sm text-slate-500">请在左侧选择或新建画布。</p>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BoardHost — picks the right view per board kind.                  */
/* ------------------------------------------------------------------ */

type CanvasBoardHostProps = {
  boardId: string;
  canMutate: boolean;
};

function CanvasBoardHost({ boardId, canMutate }: CanvasBoardHostProps): JSX.Element {
  const [kind, setKind] = useState<BoardViewKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKind(null);
    setError(null);
    setGraph(null);
    (async () => {
      const detail = await getBoard(boardId);
      if (cancelled) return;
      if (!detail.ok) {
        setError(detail.error);
        return;
      }
      const detected: BoardViewKind = detail.data.board.kind === 'workflow' ? 'workflow' : 'comments';
      setKind(detected);
      if (detected === 'workflow') {
        const wf = await getWorkflow(boardId);
        if (cancelled) return;
        if (!wf.ok) {
          setError(wf.error);
          return;
        }
        setGraph(wf.data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  if (error) {
    return <p className="p-10 text-center text-sm text-rose-700">{error}</p>;
  }
  if (!kind) {
    return <p className="p-10 text-center text-sm text-slate-500">加载画布…</p>;
  }
  if (kind === 'workflow') {
    if (!graph) {
      return <p className="p-10 text-center text-sm text-slate-500">加载工作流…</p>;
    }
    return <WorkflowBoard boardId={boardId} initialGraph={graph} canMutate={canMutate} />;
  }
  return <CanvasBoardView boardId={boardId} canMutate={canMutate} />;
}