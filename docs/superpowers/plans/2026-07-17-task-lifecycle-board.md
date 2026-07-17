# Task Lifecycle Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current general-purpose Tasks page with a controlled-execution lifecycle board backed by a single mutable Mock API domain.

**Architecture:** Extend the shared task type and Mock API first, keeping lifecycle, governance, execution and audit as the API truth. Replace the local-state-heavy `Tasks.tsx` with a focused composition of lifecycle-board components which read through TanStack Query and mutate only through `useApiMutation`. Keep the current global design tokens and add page-scoped styling for density, risk semantics and responsive layout.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, Lucide, workspace API/types packages, Vitest.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/types/src/index.ts` | Stable lifecycle task, execution, governance and audit contracts. |
| `packages/api/src/mock.ts` | Seed scenarios, lifecycle rules and all task Mock API routes. |
| `packages/api/src/mock.test.ts` | API contract tests for transition guards and audit updates. |
| `apps/web/src/features/tasks/types.ts` | UI-only filter, summary and view types. |
| `apps/web/src/features/tasks/taskSelectors.ts` | Pure mapping/filtering/grouping functions. |
| `apps/web/src/features/tasks/taskSelectors.test.ts` | Selector tests for action summary and lifecycle grouping. |
| `apps/web/src/features/tasks/TaskCard.tsx` | Accessible, compact lifecycle task card. |
| `apps/web/src/features/tasks/LifecycleBoard.tsx` | Five-column board and API-backed drag/drop request. |
| `apps/web/src/features/tasks/TaskList.tsx` | Dense alternate list view. |
| `apps/web/src/features/tasks/TaskDrawer.tsx` | Overview/execution/governance/audit detail and staged primary actions. |
| `apps/web/src/pages/Tasks.tsx` | Query/mutation wiring and page-level layout only. |
| `apps/web/src/styles/global.css` | Page-scoped task-control styles and responsive rules. |
| `apps/web/vitest.config.ts` | Test environment configuration. |
| `apps/web/src/test/setup.ts` | DOM matcher setup for component tests if required. |

### Task 1: Add lifecycle-domain contracts

**Files:**
- Modify: `packages/types/src/index.ts:66-83`
- Test: `packages/api/src/mock.test.ts`

- [ ] **Step 1: Write the failing task contract test**

```ts
import { expect, test } from 'vitest';
import { mockHandler } from './mock';

test('returns a lifecycle task with execution, governance and audit facts', async () => {
  const task = await mockHandler('/api/tasks/t1', { method: 'GET' }) as any;
  expect(task.lifecycleStage).toBe('risk');
  expect(task.execution.currentStep).toBeTruthy();
  expect(task.governance).toBeDefined();
  expect(task.auditEvents.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/api/src/mock.test.ts`

Expected: FAIL because `lifecycleStage`, `execution`, `governance` and `auditEvents` do not exist.

- [ ] **Step 3: Define the minimal shared types**

Add `TaskLifecycleStage`, `TaskSource`, `TaskRisk`, `TaskExecution`, `TaskGovernance`, `TaskAuditEvent` and `LifecycleTask` to `packages/types/src/index.ts`. Preserve the existing `Task` export for other pages; use `LifecycleTask` for the new task API.

```ts
export type TaskLifecycleStage = 'pending' | 'running' | 'awaiting_human' | 'risk' | 'completed' | 'archived';
export interface LifecycleTask extends Task {
  lifecycleStage: TaskLifecycleStage;
  source: 'alert' | 'conversation' | 'workflow' | 'manual';
  risk: 'none' | 'attention' | 'critical' | 'overdue';
  execution: { runId?: string; currentStep: string; steps: { name: string; status: 'done' | 'active' | 'failed' | 'pending'; detail?: string }[]; error?: string; retryCount: number };
  governance: { approval: 'not_required' | 'pending' | 'approved' | 'rejected'; blockedReason?: string; takeover?: { by: string; reason: string; at: string }; escalation?: string };
  auditEvents: { id: string; at: string; actor: string; action: string; result: 'success' | 'failed' | 'info' }[];
  version: number;
}
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `pnpm exec vitest run packages/api/src/mock.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts packages/api/src/mock.ts packages/api/src/mock.test.ts
git commit -m "feat(tasks): add lifecycle task contracts"
```

### Task 2: Implement the authoritative Mock task API

**Files:**
- Modify: `packages/api/src/mock.ts:780-870`
- Modify: `packages/api/package.json`
- Test: `packages/api/src/mock.test.ts`

- [ ] **Step 1: Write failing guard and audit tests**

```ts
test('rejects completion of a blocked task without changing its version', async () => {
  const before = await mockHandler('/api/tasks/t-blocked', { method: 'GET' }) as any;
  await expect(mockHandler('/api/tasks/t-blocked/transition', {
    method: 'POST', body: { stage: 'completed', version: before.version },
  })).rejects.toMatchObject({ code: 'E_DEPENDENCY_BLOCKED' });
  const after = await mockHandler('/api/tasks/t-blocked', { method: 'GET' }) as any;
  expect(after.version).toBe(before.version);
});

test('approving a pending task appends an audit event and moves it to running', async () => {
  const task = await mockHandler('/api/tasks/t-approval', { method: 'GET' }) as any;
  const updated = await mockHandler('/api/tasks/t-approval/approve', {
    method: 'POST', body: { version: task.version, actor: '王昊' },
  }) as any;
  expect(updated.lifecycleStage).toBe('running');
  expect(updated.auditEvents[0].action).toContain('审批通过');
});
```

- [ ] **Step 2: Verify failing behavior**

Run: `pnpm exec vitest run packages/api/src/mock.test.ts`

Expected: FAIL because action routes are not registered.

- [ ] **Step 3: Implement immutable-response mutations in `mock.ts`**

Create seed tasks for `t-overdue`, `t-approval`, `t-failed`, `t-blocked` and a completed task. Add `findTask`, `assertVersion`, `appendTaskAudit`, `taskResponse` helpers. Route `GET /api/tasks` through filters and route POST requests by suffix before the generic `GET /api/tasks/:id` match.

```ts
if (path.endsWith('/transition') && opts.method === 'POST') {
  return transitionTask(id, opts.body as { stage: TaskLifecycleStage; version: number; actor?: string });
}
if (path.endsWith('/approve') && opts.method === 'POST') return approveTask(id, opts.body as MutationBody);
if (path.endsWith('/takeover') && opts.method === 'POST') return takeoverTask(id, opts.body as MutationBody & { reason: string });
if (path.endsWith('/retry') && opts.method === 'POST') return retryTask(id, opts.body as MutationBody);
if (path.endsWith('/audit') && opts.method === 'GET') return findTask(id).auditEvents;
```

Use `ApiError`-shaped values with the required error codes. On every successful mutation increment `version`, prepend one audit event and return a cloned task. Add `POST /api/mock/reset` to restore the immutable seed copy.

- [ ] **Step 4: Verify API tests and API typecheck**

Run: `pnpm exec vitest run packages/api/src/mock.test.ts && pnpm --filter @de/web-api typecheck`

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/mock.ts packages/api/src/mock.test.ts packages/api/package.json apps/web/package.json pnpm-lock.yaml
git commit -m "feat(tasks): add lifecycle mock mutations"
```

### Task 3: Build and test pure task view selectors

**Files:**
- Create: `apps/web/src/features/tasks/types.ts`
- Create: `apps/web/src/features/tasks/taskSelectors.ts`
- Create: `apps/web/src/features/tasks/taskSelectors.test.ts`

- [ ] **Step 1: Write failing selector tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildActionSummary, groupByLifecycle } from './taskSelectors';

describe('buildActionSummary', () => {
  it('puts overdue and governance work before completed tasks', () => {
    const summary = buildActionSummary(fixtures);
    expect(summary.risk.ids).toEqual(['t-overdue']);
    expect(summary.awaitingHuman.ids).toEqual(['t-approval']);
  });
});

it('groups only active lifecycle stages for the default board', () => {
  expect(groupByLifecycle(fixtures).completed.map((task) => task.id)).toEqual(['t-completed']);
  expect(groupByLifecycle(fixtures).archived).toBeUndefined();
});
```

- [ ] **Step 2: Verify selector tests fail**

Run: `pnpm --filter web exec vitest run src/features/tasks/taskSelectors.test.ts`

Expected: FAIL because the selector module is missing.

- [ ] **Step 3: Implement deterministic selectors**

Export `LIFECYCLE_COLUMNS`, `TaskBoardFilters`, `buildActionSummary`, `filterTasks`, `groupByLifecycle`, `formatSla` and `primaryActionForTask`. Keep these functions side-effect free; task ordering is risk, SLA, then `updatedAt`.

```ts
export function primaryActionForTask(task: LifecycleTask): 'start' | 'approve' | 'retry' | 'pause' | 'archive' | 'takeover' {
  if (task.lifecycleStage === 'pending') return 'start';
  if (task.lifecycleStage === 'awaiting_human') return task.governance.approval === 'pending' ? 'approve' : 'takeover';
  if (task.lifecycleStage === 'risk') return task.execution.error ? 'retry' : 'takeover';
  if (task.lifecycleStage === 'running') return 'pause';
  return 'archive';
}
```

- [ ] **Step 4: Verify selectors pass**

Run: `pnpm --filter web exec vitest run src/features/tasks/taskSelectors.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/tasks apps/web/package.json pnpm-lock.yaml
git commit -m "feat(tasks): add lifecycle view selectors"
```

### Task 4: Replace the page shell with the lifecycle workspace

**Files:**
- Modify: `apps/web/src/pages/Tasks.tsx`
- Create: `apps/web/src/features/tasks/TaskCard.tsx`
- Create: `apps/web/src/features/tasks/LifecycleBoard.tsx`
- Create: `apps/web/src/features/tasks/TaskList.tsx`
- Modify: `apps/web/src/styles/global.css`

- [ ] **Step 1: Write the failing page interaction test**

```tsx
it('filters the board when the risk summary is activated', async () => {
  render(<Tasks />);
  await userEvent.click(await screen.findByRole('button', { name: /风险异常/ }));
  expect(await screen.findByText('Redis 集群 OOM 自愈')).toBeVisible();
  expect(screen.queryByText('网关灰度')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify the page test fails**

Run: `pnpm --filter web exec vitest run src/pages/Tasks.test.tsx`

Expected: FAIL because the page has no action-summary control or test harness.

- [ ] **Step 3: Implement the shell and views**

Replace `Tasks.tsx` local task state, saved views, templates, batch selection, comments, attachments, tags, timeline and mine view with:

```tsx
const { data: tasks = [], isLoading, isError, refetch } = useApiQuery<LifecycleTask[]>(['tasks', filters], '/api/tasks', { query: filters });
const transition = useApiMutation<LifecycleTask, { id: string; stage: TaskLifecycleStage; version: number }>(
  ({ id }) => `/api/tasks/${id}/transition`,
);
```

Render three button summaries, compact filters, a `kanban | list` view switch, `LifecycleBoard`, and `TaskList`. Feed drag/drop to `transition.mutate`; do not mutate cards optimistically. Show a local error callout with an action-specific retry button.

`TaskCard` must be a semantic button, show explicit SLA/risk text and use a separate drag handle. `LifecycleBoard` must render exactly pending, running, awaiting_human, risk and completed. `TaskList` has no row actions beyond opening the drawer.

- [ ] **Step 4: Add page-scoped style rules**

Add `.task-control-*` rules: 12px card radii, restrained shadow hover, semantic left border, 300px minimum board columns, reduced-motion overrides and the 1024px list-first responsive breakpoint. Use existing CSS variables only.

- [ ] **Step 5: Verify interaction and type correctness**

Run: `pnpm --filter web exec vitest run src/pages/Tasks.test.tsx && pnpm --filter web typecheck`

Expected: PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Tasks.tsx apps/web/src/features/tasks apps/web/src/styles/global.css apps/web/vitest.config.ts apps/web/src/test apps/web/package.json pnpm-lock.yaml
git commit -m "feat(tasks): build lifecycle control board"
```

### Task 5: Implement controlled drawer actions and audit feedback

**Files:**
- Create: `apps/web/src/features/tasks/TaskDrawer.tsx`
- Modify: `apps/web/src/pages/Tasks.tsx`
- Modify: `apps/web/src/components/shared/Drawer.tsx`
- Test: `apps/web/src/features/tasks/TaskDrawer.test.tsx`

- [ ] **Step 1: Write failing governance tests**

```tsx
it('requires a reason before takeover', async () => {
  render(<TaskDrawer task={failedTask} open onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /人工接管/ }));
  await userEvent.click(screen.getByRole('button', { name: /确认接管/ }));
  expect(screen.getByText('请填写接管原因')).toBeVisible();
});

it('disables the primary action during a mutation', () => {
  render(<TaskDrawer task={failedTask} open onClose={vi.fn()} isMutating />);
  expect(screen.getByRole('button', { name: /重试执行/ })).toBeDisabled();
});
```

- [ ] **Step 2: Verify drawer tests fail**

Run: `pnpm --filter web exec vitest run src/features/tasks/TaskDrawer.test.tsx`

Expected: FAIL because `TaskDrawer` is missing.

- [ ] **Step 3: Implement drawer, mutations and confirmation flow**

Create the four tabs prescribed by the design. Request `GET /api/tasks/:id` and `GET /api/tasks/:id/audit` when active. Map primary actions to the `transition`, `approve`, `takeover` and `retry` endpoints. Use a reason confirmation panel for reject, takeover and archive, passing `{ version, reason, actor: '王昊' }`; update the selected task from mutation data and invalidate `['tasks']`.

Update `Drawer` with `aria-label` on close control and a mobile full-width class while retaining existing consumers' API.

- [ ] **Step 4: Verify drawer behavior**

Run: `pnpm --filter web exec vitest run src/features/tasks/TaskDrawer.test.tsx && pnpm --filter web typecheck`

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/tasks/TaskDrawer.tsx apps/web/src/features/tasks/TaskDrawer.test.tsx apps/web/src/pages/Tasks.tsx apps/web/src/components/shared/Drawer.tsx
git commit -m "feat(tasks): add governed task drawer"
```

### Task 6: Verify full production build and documented scenarios

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-task-lifecycle-board-design.md`

- [ ] **Step 1: Run complete automated verification**

Run: `pnpm --filter @de/web-api typecheck && pnpm --filter web typecheck && pnpm --filter web exec vitest run && pnpm --filter web build && git diff --check`

Expected: every command exits 0.

- [ ] **Step 2: Run manual scenario matrix**

Verify the API and UI for: P0 overdue takeover, second approval moves to running, execution failure retries, blocked completion shows `E_DEPENDENCY_BLOCKED`, version conflict provides refresh, and reset restores the five seed scenarios.

- [ ] **Step 3: Record results in the spec**

Append a dated verification note listing the commands and each scenario outcome; do not claim an unrun result.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-17-task-lifecycle-board-design.md
git commit -m "docs(tasks): record lifecycle board verification"
```

## Plan self-review

- Spec coverage: Tasks 1–2 implement the shared state and API contract; Task 3 derives action-oriented data; Task 4 renders the two allowed main views and removes unrelated features; Task 5 implements execution, governance and audit actions; Task 6 covers the required verification matrix.
- Placeholder scan: no unassigned actions or deferred requirements; all test/implementation steps name concrete files, APIs and commands.
- Type consistency: all API/UI layers use `LifecycleTask`, `TaskLifecycleStage`, `version`, `auditEvents` and the five lifecycle stage values defined in Task 1.
