// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { WorkflowBoard } from './WorkflowBoard';
import type { WorkflowGraph } from './workflow-types';

// jsdom lacks the ResizeObserver / DOMMatrix that react-flow uses to
// compute layout. Stub them so the component mounts without throwing.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = (globalThis as any).DOMMatrix || class {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).DOMMatrix = (window as any).DOMMatrix || class {};
});

afterEach(() => cleanup());

const baseGraph: WorkflowGraph = {
  nodes: [
    { id: 'n1', kind: 'start', label: 'Begin', x: 0, y: 0 },
    { id: 'n2', kind: 'task', label: 'Do work', x: 120, y: 0 },
    { id: 'n3', kind: 'end', label: 'Done', x: 240, y: 0 },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ],
};

describe('WorkflowBoard', () => {
  it('renders nodes from props and reports counts in the header', () => {
    const { getByTestId } = render(
      <WorkflowBoard boardId="b1" initialGraph={baseGraph} canMutate={false} autoSave={false} />,
    );
    expect(getByTestId('workflow-board').getAttribute('data-board-id')).toBe('b1');
    expect(getByTestId('workflow-counts').textContent).toContain('节点 3');
    expect(getByTestId('workflow-edges-count').textContent).toContain('边 2');
    // Custom node renders for every kind.
    expect(document.querySelectorAll('[data-testid^="workflow-node-"]')).toHaveLength(3);
  });

  it('renders the toolbar + add buttons when canMutate is true', () => {
    const { getByTestId } = render(
      <WorkflowBoard boardId="b1" initialGraph={baseGraph} canMutate />,
    );
    expect(getByTestId('workflow-toolbar')).toBeTruthy();
    expect(getByTestId('workflow-add-start')).toBeTruthy();
    expect(getByTestId('workflow-add-task')).toBeTruthy();
    expect(getByTestId('workflow-add-decision')).toBeTruthy();
    expect(getByTestId('workflow-add-end')).toBeTruthy();
    expect(getByTestId('workflow-remove-selected')).toBeTruthy();
    expect(getByTestId('workflow-save')).toBeTruthy();
  });

  it('hides the toolbar when canMutate is false', () => {
    const { queryByTestId } = render(
      <WorkflowBoard boardId="b1" initialGraph={baseGraph} canMutate={false} />,
    );
    expect(queryByTestId('workflow-toolbar')).toBeNull();
  });

  it('save() triggers saveImpl with the latest graph', async () => {
    const saveImpl = vi.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <WorkflowBoard
        boardId="b1"
        initialGraph={baseGraph}
        saveImpl={saveImpl}
        canMutate
        autoSave={false}
      />,
    );
    fireEvent.click(getByTestId('workflow-save'));
    await waitFor(() => expect(saveImpl).toHaveBeenCalled());
    const arg = saveImpl.mock.calls[0]![0] as WorkflowGraph;
    expect(arg.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3']);
    expect(arg.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('adds a node when the corresponding toolbar button is clicked', async () => {
    const saveImpl = vi.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <WorkflowBoard
        boardId="b1"
        initialGraph={baseGraph}
        saveImpl={saveImpl}
        canMutate
        autoSave={false}
      />,
    );
    fireEvent.click(getByTestId('workflow-add-decision'));
    // Save should now send 4 nodes.
    fireEvent.click(getByTestId('workflow-save'));
    await waitFor(() => expect(saveImpl).toHaveBeenCalled());
    const arg = saveImpl.mock.calls[0]![0] as WorkflowGraph;
    expect(arg.nodes).toHaveLength(4);
    expect(arg.nodes.some((n) => n.kind === 'decision')).toBe(true);
  });

  it('flags cycles in the header chip', () => {
    const cyclic: WorkflowGraph = {
      nodes: [
        { id: 'a', kind: 'task', label: 'a', x: 0, y: 0 },
        { id: 'b', kind: 'task', label: 'b', x: 120, y: 0 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    };
    const { getByTestId } = render(
      <WorkflowBoard
        boardId="b1"
        initialGraph={cyclic}
        saveImpl={vi.fn()}
        canMutate
        autoSave={false}
      />,
    );
    fireEvent.click(getByTestId('workflow-save'));
    expect(getByTestId('workflow-cycle-warning').textContent).toContain('检测到');
  });
});