# Workspace Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tenant-scoped workspace control plane with operational controls, governance and audit behavior in the frontend and Mock API.

**Architecture:** Keep the existing `/workspaces` route, but move business state into a typed workspace domain in `packages/api`. A global workspace context supplies every query key and request header; Mock API validates membership, permission and target scope before every workspace operation.

**Tech Stack:** React, TypeScript, Zustand, TanStack Query, Vitest, Vite, local Mock API.

---

### Task 1: Establish workspace domain contracts and request context (P0)

**Files:**
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/packages/api/src/index.ts`
- Modify: `frontend/web/src/stores/workspaceStore.ts`
- Modify: `frontend/web/src/services/query.ts`
- Test: `frontend/packages/api/src/workspace-control.mock.test.ts`

- [ ] Define tenant, workspace lifecycle, environment, membership, binding, policy, quota, governance event and audit event types.
- [ ] Add an API-client context provider that supplies `x-workspace-id` and includes that scope in every TanStack Query key.
- [ ] Extend the workspace store with `currentWorkspaceId`, `setCurrentWorkspace`, and a stable `scopeKey`.
- [ ] Write a test that asserts a workspace header reaches Mock API and a query key differs after scope selection.
- [ ] Run `pnpm --filter @de/web-api test -- workspace-control.mock.test.ts`.

### Task 2: Build scoped workspace Mock API and audit backbone (P0)

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/packages/api/src/control-plane.mock.test.ts`
- Test: `frontend/packages/api/src/workspace-control.mock.test.ts`

- [ ] Introduce `workspaceContext`, `requireWorkspacePermission`, and `appendWorkspaceAudit` helpers based on authenticated user, workspace membership and explicit permissions.
- [ ] Replace unguarded `/api/workspaces/:id/*` reads with tenant- and membership-scoped handlers.
- [ ] Implement `POST /api/workspaces`, lifecycle actions, `/members`, `/bindings`, `/audit` and `/impact` endpoints.
- [ ] Test cross-workspace read/write denial, read-only denial, lifecycle audit creation and unsafe lifecycle impact blocking.
- [ ] Run the complete API test suite.

### Task 3: Rebuild the workspace page as a control-plane shell (P0)

**Files:**
- Modify: `frontend/web/src/pages/Workspaces.tsx`
- Create: `frontend/web/src/features/workspaces/workspace-ui.ts`
- Create: `frontend/web/src/features/workspaces/workspace-ui.test.ts`
- Modify: `frontend/web/src/layouts/AppLayout.tsx`
- Modify: `frontend/web/src/styles/global.css`

- [ ] Replace local `activeWs` state with global workspace context and align the topbar selector with the page selector.
- [ ] Replace the old five tabs with Overview, Members & Access, Resource Directory, Environment & Release, Strategy & Compliance, Quota & Cost, Runtime Governance, Audit, and Settings.
- [ ] Connect Create Workspace, lifecycle and audit flows to mutations; show no data when permission checks reject access.
- [ ] Test tab labels, lifecycle action eligibility and derived resource-impact actions.
- [ ] Run `pnpm --filter web test -- workspace-ui.test.ts` and `pnpm --filter web typecheck`.

### Task 4: Implement members, resource bindings and lifecycle actions (P0)

**Files:**
- Modify: `frontend/web/src/pages/Workspaces.tsx`
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/packages/api/src/workspace-control.mock.test.ts`

- [ ] Implement member invite, role change, removal, temporary grant and access-review actions.
- [ ] Implement Agent, workflow, knowledge, skill, model and channel bindings, including environment scope and dependency impact.
- [ ] Implement freeze, archive and ownership-transfer confirmation flows that require a reason and respect returned impact.
- [ ] Verify each mutation invalidates scoped query data and generates an audit record.

### Task 5: Implement environment and release governance (P1)

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/web/src/pages/Workspaces.tsx`
- Modify: `frontend/packages/api/src/workspace-control.mock.test.ts`

- [ ] Add environments with promotion gates, approval state, canary percentage and rollback action.
- [ ] Add release history and environment readiness view.
- [ ] Test that production promotion requires approval and rollback creates an audit event.

### Task 6: Implement policies, compliance, quotas and cost (P1)

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/web/src/pages/Workspaces.tsx`
- Modify: `frontend/packages/api/src/workspace-control.mock.test.ts`

- [ ] Add workspace data-classification, region, egress, tool allowlist, approval and retention policy fields.
- [ ] Add policy exception request/decision flow and compliance evidence records.
- [ ] Add seat, agent, concurrency, token and budget quota fields with threshold alerts and cost aggregates.
- [ ] Test that restricted egress and quota overrun block affected workspace actions.

### Task 7: Implement runtime governance and advanced collaboration (P2)

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/web/src/pages/Workspaces.tsx`
- Modify: `frontend/packages/api/src/workspace-control.mock.test.ts`

- [ ] Add pause, handoff, emergency stop and incident review actions for workspace runtime governance.
- [ ] Add controlled template sharing, migration request and time-bound external collaborator access.
- [ ] Add governance score, audit export payload and workspace report endpoint.
- [ ] Test time-bound access expiry, cross-workspace sharing approval and report audit evidence.

### Task 8: Regression verification and handoff

**Files:**
- Modify: `frontend/web/src/pages/Knowledge.tsx` only if retaining the outstanding title change in the final commit.

- [ ] Run `pnpm --filter @de/web-api test`.
- [ ] Run `pnpm --filter web test`.
- [ ] Run `pnpm --filter web typecheck` and `pnpm --filter web build`.
- [ ] Run `git diff --check` and manually verify `/workspaces` under admin and read-only sessions.
- [ ] Commit implementation changes with a scope-specific message.
