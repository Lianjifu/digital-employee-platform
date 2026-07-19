# Knowledge Engineering Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the knowledge module into a governed knowledge-engineering center that publishes reusable, versioned knowledge packages to agents and workflow retrieval nodes.

**Architecture:** Keep React page state query-driven through the existing API facade. Extend the shared knowledge domain with immutable package versions, ingestion/index jobs, retrieval evaluations, a provenance-backed graph, and consumer bindings; the Mock handler remains the single writable domain source for local verification.

**Tech Stack:** React 18, TypeScript, TanStack Query, Lucide, Vite, Vitest, local Mock API.

---

### Task 1: Define knowledge-engineering domain contracts (P0/P1/P2)

**Files:**
- Modify: `frontend/packages/types/src/index.ts`
- Test: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] Add `KnowledgePackage`, `KnowledgePackageVersion`, `KnowledgeProcessingJob`, `KnowledgeRetrievalProfile`, `KnowledgeEvaluation`, `KnowledgeGraphEntity`, `KnowledgeGraphRelation`, and `KnowledgeConsumerBinding` interfaces. Use explicit lifecycle unions rather than string fields.
- [ ] Add a failing Mock test that requests `/api/knowledge/packages`, publishes a package version, and verifies a version-pinned workflow binding.
- [ ] Run `../../web/node_modules/.bin/vitest run src/control-plane.mock.test.ts` in `frontend/packages/api`; expected result before the handler change is a failed package route assertion.

### Task 2: Implement authoritative Mock knowledge state and mutations (P0/P1/P2)

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] Add in-memory package/version, job, evaluation, graph, and binding records adjacent to the existing knowledge records.
- [ ] Implement package create, publish, version rollback, processing job start, evaluation run, graph entity/relation query, and consumer binding routes. Reject a binding to non-published versions and log every state-changing action with `appendKnowledgeAudit`.
- [ ] Add tests for the accepted package publish path, blocked draft binding path, evaluation output, and graph provenance fields.
- [ ] Run the focused Vitest command; expected result: all knowledge and pre-existing control-plane tests pass.

### Task 3: Build P0 assets, processing, and reference-management surfaces

**Files:**
- Modify: `frontend/web/src/pages/Knowledge.tsx`
- Modify: `frontend/web/src/styles/global.css`

- [ ] Replace the four workspace labels with `知识资产`, `接入与加工`, `检索与评测`, `图谱与关联`, `引用治理`.
- [ ] Render published-package cards in the assets workspace with version, security scope, quality state, and consumers. Provide an action modal that creates a package and an approval-confirmed publish action.
- [ ] Render ingestion/indexing jobs with chunk strategy (`structured`, `semantic`, `fixed`, `table`), index version, failures, and retry action.
- [ ] Render binding rows grouped by agent/workflow with fixed-version status and deep-link context. Keep secondary content in the existing Drawer/Modal pattern rather than introducing permanent sidebars.
- [ ] Run `./node_modules/.bin/tsc --noEmit` in `frontend/web`; expected result: no TypeScript errors.

### Task 4: Add P1 retrieval evaluation and graph exploration

**Files:**
- Modify: `frontend/web/src/pages/Knowledge.tsx`
- Modify: `frontend/web/src/styles/global.css`

- [ ] Add a retrieval profile selector and an evaluation-run card showing Recall@K, MRR, nDCG, citation accuracy, P95 latency, and baseline delta.
- [ ] Add a graph relation explorer that shows entities, relation type, confidence, and source document/version. Selecting an item opens its provenance in the existing contextual Drawer.
- [ ] Use a restrained enterprise SaaS style: dense tables, neutral panel surfaces, indigo only for primary/reusable states, and semantic warning/error states.
- [ ] Re-run TypeScript validation.

### Task 5: Integrate agent/workflow consumers and finish verification

**Files:**
- Modify: `frontend/web/src/pages/Agents.tsx`
- Modify: `frontend/web/src/pages/Workflows.tsx`
- Modify: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] Replace hard-coded selectable knowledge names with published package records in the agent configuration flow.
- [ ] Add package/version and no-result policy fields to the workflow retrieval-node configuration, using the same published package route.
- [ ] Add a Mock test demonstrating an agent and a workflow binding to different published package versions.
- [ ] Run TypeScript, focused Vitest, `node_modules/.bin/vite build`, and `git diff --check`.
