# Copilot Conversation Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the enterprise Copilot page a single, conversation-first digital-employee workbench with contextual drawers.

**Architecture:** Keep `Copilot.tsx` as the feature composition point and retain `useChat` as the sole session/message state owner. Derive a compact event summary from the active session in a pure helper, render it in a new work header, and reuse the existing drawer state for a tabbed contextual inspector. CSS limits the reading column while preserving responsive drawer behavior.

**Tech Stack:** React 18, TypeScript, Tailwind utility classes, existing `@de/web-ui`, TanStack Query, existing Mock API.

---

## File structure

- Create: `apps/web/src/features/copilot/workbench.ts` — derives event title, urgency, next action and tab badge counts from `ChatSession`.
- Create: `apps/web/src/features/copilot/workbench.test.ts` — executable type-level/unit checks if the workspace test runner is available; otherwise the same cases are verified through the production build.
- Modify: `apps/web/src/pages/Copilot.tsx` — replaces the agent-centric header with the event work header and changes the contextual drawer to five operational tabs.
- Modify: `apps/web/src/styles/global.css` — centres and limits the conversation reading measure, styles the operational header, and keeps mobile drawers full width.

### Task 1: Derive a stable event work summary

**Files:**
- Create: `apps/web/src/features/copilot/workbench.ts`
- Test: `apps/web/src/features/copilot/workbench.test.ts`

- [ ] **Step 1: Write the failing test for pending approvals**

```ts
import { describe, expect, it } from 'vitest';
import { deriveWorkbenchSummary } from './workbench';

it('uses a pending approval as the next action', () => {
  const summary = deriveWorkbenchSummary({
    title: 'Redis 集群 OOM 自愈',
    messages: [{ id: 'm1', role: 'assistant', content: '', createdAt: '', approvalRequest: { action: '扩容', required: 2, signed: 1, signers: [], decision: 'pending' } }],
  } as any);
  expect(summary.nextAction).toBe('等待 1 项审批');
  expect(summary.tone).toBe('warning');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- workbench.test.ts`

Expected: command is unavailable in the current workspace or fails because `deriveWorkbenchSummary` does not exist. Do not add a test framework only for this screen; record the unavailable runner and use the TypeScript build verification below.

- [ ] **Step 3: Add the pure summary helper**

```ts
export function deriveWorkbenchSummary(session?: Pick<ChatSession, 'title' | 'messages'>) {
  const messages = session?.messages ?? [];
  const pendingApprovals = messages.filter((m) => m.approvalRequest?.decision === 'pending').length;
  const linkedTasks = messages.filter((m) => m.linkedTaskId).length;
  const evidence = messages.reduce((sum, m) => sum + (m.citations?.length ?? 0), 0);
  return {
    title: session?.title || '新会话',
    pendingApprovals,
    linkedTasks,
    evidence,
    nextAction: pendingApprovals ? `等待 ${pendingApprovals} 项审批` : linkedTasks ? '查看关联任务执行状态' : '等待下一条指令',
    tone: pendingApprovals ? 'warning' as const : 'brand' as const,
  };
}
```

- [ ] **Step 4: Verify helper typing**

Run: `pnpm --filter web typecheck`

Expected: exit code 0.

### Task 2: Replace the header with the event work header

**Files:**
- Modify: `apps/web/src/pages/Copilot.tsx:485-680`
- Modify: `apps/web/src/styles/global.css:205-249`

- [ ] **Step 1: Add the failing visual acceptance checkpoint**

Open `/copilot` and verify the old header is agent-centric: it shows avatar, rating, SLA and tool counts before the current event and next action. This must be visibly true before replacing it.

- [ ] **Step 2: Import and calculate the summary**

```ts
import { deriveWorkbenchSummary } from '@/features/copilot/workbench';

const workbench = useMemo(() => deriveWorkbenchSummary(currentSession), [currentSession]);
```

- [ ] **Step 3: Replace the old agent metadata header**

Render a header with the session-list button, `workbench.title`, status/risk badges, `workbench.nextAction`, the existing investigate/execute controls, a context-drawer button and the existing more menu. Move model and agent identity out of this row; do not remove their controls from the composer.

- [ ] **Step 4: Centre the reading measure**

```css
.copilot-message-stream { width: min(100%, 980px); margin-inline: auto; }
.copilot-message-list { padding-inline: clamp(16px, 4vw, 56px); }
.copilot-work-header { max-width: 1280px; margin-inline: auto; }
```

- [ ] **Step 5: Verify desktop and responsive header behavior**

Run: `pnpm --filter web typecheck && pnpm --filter web build`

Expected: both commands exit 0. In the browser, confirm that the title and next action remain visible at desktop width and that secondary badges wrap at narrow width.

### Task 3: Turn the existing details drawer into an operational context drawer

**Files:**
- Modify: `apps/web/src/pages/Copilot.tsx:1140-1295`
- Modify: `apps/web/src/styles/global.css:214-230,307-371`

- [ ] **Step 1: Add the failing visual acceptance checkpoint**

Open the current context drawer and verify that it only has `会话概览` and `管理员运行`, while evidence, approval, task and audit data are buried in long sections.

- [ ] **Step 2: Expand the drawer tab type and triggers**

```ts
type ContextTab = 'overview' | 'evidence' | 'tasks' | 'approvals' | 'audit' | 'admin';
const [contextTab, setContextTab] = useState<ContextTab>('overview');
```

Use the existing `detailsOpen` state. Header and message actions must call a single `openContext(tab: ContextTab)` callback that closes `sessionsOpen`, sets the tab, and opens the right drawer.

- [ ] **Step 3: Render five business tabs and preserve the admin tab in More**

Render `概览`, `证据`, `任务`, `审批`, `审计` in the drawer’s primary tab strip. Keep `管理员运行` reachable from the existing More menu, but do not place it in the primary strip. Populate each tab from `currentSession.messages` and `sessionSignals`; use local empty states when a category is absent.

- [ ] **Step 4: Make drawer state mutually exclusive and keyboard-safe**

Keep the existing scrim and Escape handler. Every `openContext` call must close the sessions drawer. Every session-list trigger must close the context drawer. Maintain the existing `aria-expanded`, controls IDs, focus return refs and mobile bottom-sheet rules.

- [ ] **Step 5: Verify drawer transitions**

Run: `pnpm --filter web build`

Expected: exit code 0. Manually verify list → context, context → list, scrim close, Escape close, and a narrow viewport context drawer.

### Task 4: Connect message actions to the correct contextual tab

**Files:**
- Modify: `apps/web/src/pages/Copilot.tsx:690-790` and `MessageBubble` props/call sites

- [ ] **Step 1: Add the failing visual acceptance checkpoint**

On a message containing citations or a pending approval, verify that the only available detailed view is the old citation drawer/modal or an expanded message block.

- [ ] **Step 2: Pass operational context callbacks to messages**

Add callbacks `onOpenEvidence`, `onOpenTask`, `onOpenApproval` and `onOpenAudit` to `MessageBubble`. These call `openContext('evidence')`, `openContext('tasks')`, `openContext('approvals')` and `openContext('audit')` respectively.

- [ ] **Step 3: Use clear one-action links in existing message cards**

For a citation group show `查看证据`; for `approvalRequest` show `查看审批`; for `linkedTaskId` show `打开任务`; and for successful/failed tool calls show `查看审计`. Preserve existing approve, reject, retry, citation and task write-back operations unchanged.

- [ ] **Step 4: Verify the approval-to-task path**

Run: `pnpm --filter @de/web-api typecheck && pnpm --filter web typecheck`

Expected: exit code 0. In `/copilot`, complete the final approval, then confirm that task context opens, the task page receives the generated item, and the channel/audit streams refresh.

### Task 5: Refine the composer as the only bottom workbench

**Files:**
- Modify: `apps/web/src/pages/Copilot.tsx:792-1140`
- Modify: `apps/web/src/styles/global.css:250-304`

- [ ] **Step 1: Add the failing visual acceptance checkpoint**

Verify that session state is duplicated above and around the input area and that the composer does not clearly distinguish current mode from editor controls.

- [ ] **Step 2: Keep only actionable context above the editor**

Render one compact row containing current mode, agent/model selector, enabled tool count and attachments. Remove duplicate status text from this area; leave full event status in the work header.

- [ ] **Step 3: Preserve interaction contracts**

Do not change `onTextareaKey`, send, stop, attachment drop, model menu, tools menu, voice toggle, token estimate or closed/handoff disabled state. Keep the editor sticky within the conversation section rather than the viewport.

- [ ] **Step 4: Verify core interaction behavior**

Run: `pnpm --filter web typecheck && pnpm --filter web build && git diff --check`

Expected: all commands exit 0. Manually send a message, stop streaming, attach then remove a file chip, switch model, and confirm the composer remains usable while either drawer is open.

### Task 6: Final review and documentation update

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-copilot-conversation-workbench-design.md` only if implementation decisions differ from the approved design.

- [ ] **Step 1: Review against each accepted criterion**

Confirm the six acceptance criteria in the design document: no fixed sidebars, identifiable event header, on-demand drawers, message-to-drawer routing, cross-page task state, and preserved existing interactions.

- [ ] **Step 2: Run full verification**

Run: `pnpm --filter @de/web-api typecheck && pnpm --filter web typecheck && pnpm --filter web build && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 3: Commit only if explicitly requested**

Do not create a Git commit as part of this task because the workspace contains unrelated pending changes and the user has not requested a new commit.
