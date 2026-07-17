# 受控执行任务控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将任务页升级为生产运营与受控执行控制台，并由统一 Mock API 驱动处置、执行、人工治理和审计。

**Architecture:** 共享类型定义受控执行任务与生命周期。API 层维护唯一任务领域状态、规则和审计事件；任务页只保存视图和筛选 UI 状态，全部任务事实读写都经 Query 与 Mutation 完成。

**Tech Stack:** React 18、TypeScript、TanStack Query、Tailwind CSS、Vite、Vitest、pnpm workspace。

---

## File Structure

- Modify: `packages/types/src/index.ts` — 受控执行任务类型。
- Modify: `packages/api/src/mock.ts` — 领域状态、路由、审计和场景模拟。
- Modify: `packages/api/package.json` — API 测试脚本。
- Create: `packages/api/src/task-domain.test.ts` — 领域规则测试。
- Create: `apps/web/src/features/tasks/task-ui.ts` — 生命周期 UI 映射。
- Create: `apps/web/src/features/tasks/TaskActionSummary.tsx` — 三项行动摘要。
- Create: `apps/web/src/features/tasks/TaskToolbar.tsx` — 精简工具栏。
- Create: `apps/web/src/features/tasks/TaskLifecycleBoard.tsx` — 看板与列表。
- Create: `apps/web/src/features/tasks/TaskLifecycleDrawer.tsx` — 详情抽屉。
- Modify: `apps/web/src/pages/Tasks.tsx` — 页面组合和 API 调用。
- Modify: `apps/web/src/styles/global.css` — 任务控制台局部样式。

### Task 1: 定义领域类型并建立测试基线

**Files:**
- Modify: `packages/types/src/index.ts:64-84`
- Modify: `packages/api/package.json`
- Create: `packages/api/src/task-domain.test.ts`

- [ ] **Step 1: 增加 API 测试脚本**

在 `packages/api/package.json` 增加：

```json
{
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^2.1.9" }
}
```

- [ ] **Step 2: 写入失败的领域测试**

```ts
import { describe, expect, it } from 'vitest';
import { createTaskDomain } from './mock';

describe('task domain', () => {
  it('rejects completion while approval is pending', () => {
    expect(() => createTaskDomain().transition('t2', 'completed', { actor: '王昊' }))
      .toThrow('任务等待人工审批');
  });
  it('writes an audit event for takeover', () => {
    const task = createTaskDomain().takeover('t1', { actor: '王昊', reason: '处理超时风险' });
    expect(task.auditEvents.at(-1)?.action).toBe('人工接管');
  });
});
```

- [ ] **Step 3: 运行失败测试**

运行：`pnpm --filter @de/web-api test`

预期：失败，`createTaskDomain` 尚未导出。

- [ ] **Step 4: 扩展共享类型**

在 `packages/types/src/index.ts` 增加：

```ts
export type TaskLifecycleStage = 'pending' | 'running' | 'human_action' | 'risk' | 'completed' | 'archived';
export type TaskRisk = 'none' | 'warning' | 'critical' | 'overdue' | 'failed' | 'blocked';
export interface TaskAuditEvent { id: ID; at: ISODate; actor: string; action: string; detail?: string; tone: 'info' | 'success' | 'warn' | 'error'; }
export interface ControlledTask extends Task {
  lifecycleStage: TaskLifecycleStage;
  source: 'alert' | 'conversation' | 'workflow' | 'manual';
  sla: { dueAt?: ISODate; remainingMin?: number; risk: TaskRisk; escalated: boolean };
  execution: { runId?: string; currentStep?: string; retryCount: number; error?: string; paused: boolean };
  governance: { approvalRequired: boolean; approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected'; takeoverBy?: string; takeoverReason?: string; policyBlocked?: boolean };
  links: { conversationId?: ID; alertCode?: string; workflowId?: ID; assetName?: string; blockedBy?: ID };
  auditEvents: TaskAuditEvent[];
  version: number;
}
```

- [ ] **Step 5: 验证类型并提交**

运行：`pnpm --filter @de/web-types typecheck`，预期退出码 0。

```bash
git add packages/types/src/index.ts packages/api/package.json packages/api/src/task-domain.test.ts
git commit -m "feat(tasks): define controlled execution task contract"
```

### Task 2: 实现 Mock 领域规则和路由

**Files:**
- Modify: `packages/api/src/mock.ts:790-975`
- Modify: `packages/api/src/task-domain.test.ts`

- [ ] **Step 1: 扩展失败测试**

```ts
it('requires approval before starting an approval-gated task', () => {
  expect(() => createTaskDomain().transition('t2', 'running', { actor: '李婷' }))
    .toThrow('审批尚未通过');
});
it('clears an execution error when retrying', () => {
  const task = createTaskDomain().retry('t1', { actor: '王昊' });
  expect(task.execution.retryCount).toBe(1);
  expect(task.lifecycleStage).toBe('running');
});
```

- [ ] **Step 2: 运行失败测试**

运行：`pnpm --filter @de/web-api test`

预期：失败，`transition` 与 `retry` 尚未实现。

- [ ] **Step 3: 实现任务领域工厂**

在 `mock.ts` 导出：

```ts
export function createTaskDomain(seed = mockControlledTasks) {
  return {
    list(filters?: TaskListFilters): ControlledTask[],
    getTask(id: string): ControlledTask | null,
    create(input: CreateTaskInput): ControlledTask,
    transition(id: string, stage: TaskLifecycleStage, command: TaskCommand): ControlledTask,
    approve(id: string, command: TaskCommand & { decision: 'approved' | 'rejected'; reason?: string }): ControlledTask,
    takeover(id: string, command: TaskCommand & { reason: string }): ControlledTask,
    retry(id: string, command: TaskCommand): ControlledTask,
    audit(id: string): TaskAuditEvent[],
    reset(): void,
  };
}
```

每个写操作递增 `version`、更新 `updatedAt` 并追加审计。审批未通过时禁止运行或完成；风险任务只能重试或接管；接管写入责任人和原因。

- [ ] **Step 4: 实现 REST Mock 路由**

先按方法分派，避免旧的 GET 路由抢占写请求：

```ts
if (path === '/api/tasks' && opts.method === 'GET') return taskDomain.list(opts.query);
if (path === '/api/tasks' && opts.method === 'POST') return taskDomain.create(opts.body as CreateTaskInput);
if (path.match(/^\/api\/tasks\/[^/]+\/transition$/) && opts.method === 'POST') {
  return taskDomain.transition(path.split('/')[3], (opts.body as { stage: TaskLifecycleStage }).stage, opts.body as TaskCommand);
}
```

同样实现 `approve`、`takeover`、`retry`、`audit`。成功后调用 `appendDomainEvent`，重置接口调用 `taskDomain.reset()`。

- [ ] **Step 5: 验证并提交**

运行：

```bash
pnpm --filter @de/web-api test
pnpm --filter @de/web-api typecheck
```

预期：退出码 0。

```bash
git add packages/api/src/mock.ts packages/api/src/task-domain.test.ts packages/types/src/index.ts
git commit -m "feat(tasks): add controlled execution mock domain"
```

### Task 3: 实现 UI 映射与行动摘要

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/features/tasks/task-ui.ts`
- Create: `apps/web/src/features/tasks/task-ui.test.ts`
- Create: `apps/web/src/features/tasks/TaskActionSummary.tsx`
- Create: `apps/web/src/features/tasks/TaskToolbar.tsx`

- [ ] **Step 1: 建立 Web 测试基线**

在 `apps/web/package.json` 增加 `"test": "vitest run"`，并加入 `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`。

- [ ] **Step 2: 写入失败的 UI 映射测试**

```ts
import { describe, expect, it } from 'vitest';
import { getPrimaryAction, getStageMeta, isRiskTask } from './task-ui';

describe('task UI mapping', () => {
  it('uses the enterprise label for human action', () => {
    expect(getStageMeta('human_action').label).toBe('等待人工动作');
  });
  it('uses takeover as the only action for failed tasks', () => {
    expect(getPrimaryAction('risk', 'failed')).toEqual({ key: 'takeover', label: '人工接管' });
  });
  it('treats overdue SLA as risk', () => expect(isRiskTask({ risk: 'overdue' })).toBe(true));
});
```

- [ ] **Step 3: 运行测试并确认失败**

运行：`pnpm --filter web test`

预期：失败，`task-ui.ts` 尚不存在。

- [ ] **Step 4: 实现 UI 映射模块**

实现阶段：待处理、执行中、等待人工动作、风险异常、已完成。主操作只能是：开始执行、处理审批、人工接管、重试执行、暂停任务或确认归档。品牌靛蓝只用于运行和主操作；风险使用语义色。

- [ ] **Step 5: 实现行动摘要和工具栏**

`TaskActionSummary` 仅显示待处理、待审批或接管、风险异常，点击调用预设筛选。工具栏只保留搜索、状态、负责人、风险、筛选和新建。高级筛选只含优先级、数字员工、来源、审批、阻塞和归档。

### Task 4: 实现主面板和查询驱动页面

**Files:**
- Create: `apps/web/src/features/tasks/TaskLifecycleBoard.tsx`
- Modify: `apps/web/src/pages/Tasks.tsx`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/features/tasks/task-ui.test.ts`

- [ ] **Step 1: 编写行动摘要组件失败测试**

```tsx
it('applies the risk preset from the action summary', async () => {
  const onPreset = vi.fn();
  render(<TaskActionSummary counts={{ pending: 2, humanAction: 1, risk: 3 }} onPreset={onPreset} />);
  await userEvent.click(screen.getByRole('button', { name: /风险异常/ }));
  expect(onPreset).toHaveBeenCalledWith('risk');
});
```

- [ ] **Step 2: 运行测试并确认失败**

运行：`pnpm --filter web test`

预期：失败，`TaskActionSummary` 尚未实现。

- [ ] **Step 3: 实现生命周期主面板**

`TaskLifecycleBoard` 渲染五列“待处理、执行中、等待人工动作、风险异常、已完成”，并提供紧凑列表模式。卡片只展示优先级、SLA、标题、数字员工、责任人、来源和风险。删除 KPI、风险地图、模板、评论、附件、时间线、我的任务和复杂批量编辑。

拖拽调用状态流转 Mutation；失败时保留原位置并显示 API 错误。

- [ ] **Step 4: 组合页面与局部样式**

在 `Tasks.tsx` 使用：

```ts
const tasks = useApiQuery<ControlledTask[]>(['tasks', filters], '/api/tasks', { query: filters });
const transition = useApiMutation<ControlledTask, TransitionInput>(({ id }) => `/api/tasks/${id}/transition`);
```

只将视图和筛选保存在 `localStorage`。在 `.task-console` 下统一 16px 页面标题、14px 任务标题、13px 正文、12px 元信息，任务卡保持白底、12px 圆角和细边框，窄屏工具栏自动换行。

- [ ] **Step 5: 验证并提交**

运行：

```bash
pnpm --filter web test
pnpm --filter web typecheck
```

预期：退出码 0。

```bash
git add apps/web/package.json apps/web/src/features/tasks apps/web/src/pages/Tasks.tsx apps/web/src/styles/global.css package.json pnpm-lock.yaml
git commit -m "feat(tasks): build controlled execution task console"
```

### Task 5: 实现详情抽屉、联动与异常体验

**Files:**
- Create: `apps/web/src/features/tasks/TaskLifecycleDrawer.tsx`
- Modify: `apps/web/src/pages/Tasks.tsx`
- Modify: `packages/api/src/mock.ts`
- Modify: `packages/api/src/task-domain.test.ts`
- Modify: `apps/web/src/features/tasks/task-ui.test.ts`

- [ ] **Step 1: 写入抽屉失败测试**

```tsx
it('shows only takeover for a failed task', () => {
  render(<TaskLifecycleDrawer task={failedTask} open onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: '人工接管' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '暂停任务' })).toBeNull();
});
```

- [ ] **Step 2: 运行测试并确认失败**

运行：`pnpm --filter web test`

预期：失败，`TaskLifecycleDrawer` 尚未实现。

- [ ] **Step 3: 实现四个标签和唯一主操作**

抽屉仅实现概览、执行、人工治理和审计。概览中的来源和关联对象只读；执行显示运行 ID、步骤、结果、错误和重试；人工治理显示审批、策略、接管和升级；审计显示事件序列。禁止加入附件、评论、模板、依赖编辑和项目协作。

接管、驳回、归档需要理由与确认。主按钮来自 `getPrimaryAction`，调用对应 Mutation，成功后失效任务查询，失败时在按钮附近显示错误并防止重复提交。

- [ ] **Step 4: 实现跨模块联动与异常场景**

会话创建任务改为调用 `taskDomain.create`，受控执行改为调用 `taskDomain.transition`。每次写入同时追加任务审计、全局审计和渠道通知。

为 `opts.query.scenario` 实现 `slow`（3000ms）、`error`（503）、`forbidden`（403）和版本冲突 `conflict`（409）。前端分别展示 loading、错误、无权限和刷新重试反馈。

- [ ] **Step 5: 完整验证**

运行：

```bash
pnpm --filter @de/web-api test
pnpm --filter @de/web-api typecheck
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
git diff --check
```

预期：每条命令退出码 0。

- [ ] **Step 6: 手动验证与提交**

手动验证：风险摘要筛选、失败任务接管、审批后开始执行、会话创建任务回写、慢响应、权限拒绝和版本冲突。

```bash
git add packages/api/src/mock.ts packages/api/src/task-domain.test.ts apps/web/src/pages/Tasks.tsx apps/web/src/features/tasks/TaskLifecycleDrawer.tsx apps/web/src/features/tasks/task-ui.test.ts
git commit -m "feat(tasks): synchronize governed task lifecycle"
```
