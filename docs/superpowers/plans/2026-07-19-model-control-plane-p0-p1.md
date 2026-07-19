# 模型控制面 P0/P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在前端与 Mock API 中交付可测试的模型控制面最小治理闭环，消除当前 Provider、路由、凭据与审计的 P0/P1 风险。

**Architecture:** 将模型领域状态集中在 Mock API：受管 Provider、模型配置、路由策略草稿/版本和结构化审计由 API 维护，`Models.tsx` 仅保留瞬时 UI 状态。路由策略引用模型 ID，并经校验、发布和回滚形成不可变版本；Provider 删除先进行影响分析并受到引用保护。

**Tech Stack:** React、TypeScript、TanStack Query、Vitest、现有 `@de/web-*` 包。

---

### Task 1: 定义模型控制面领域契约

**Files:**
- Modify: `frontend/packages/types/src/index.ts`
- Test: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] **Step 1: 写出 Provider 凭据引用与路由版本的失败测试**

```ts
expect(provider.credentialRef).toMatch(/^vault:\/\/model-providers\//);
expect(published.version).toBe(1);
expect(published.snapshot.primaryModelId).toBeDefined();
```

- [ ] **Step 2: 运行聚焦测试并确认因缺少契约/API 而失败**

Run: `pnpm --filter @de/web-api test -- control-plane.mock.test.ts`

- [ ] **Step 3: 添加 `ModelProfile`、`ModelProvider`、`RoutingPolicyDraft`、`RoutingPolicyVersion`、`ProviderImpact` 与 `ModelAuditEvent` 类型**

路由目标使用稳定的模型 ID；Provider 只暴露凭据引用和掩码信息，不添加 API Key 字段。

- [ ] **Step 4: 重新运行聚焦测试**

Run: `pnpm --filter @de/web-api test -- control-plane.mock.test.ts`

### Task 2: 实现受保护的 Provider 接入、验证与退役

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] **Step 1: 写出失败测试**

```ts
await expect(mockHandler(`/api/model-providers/${referenced.id}`, { method: 'DELETE', body: { reason: 'retire' } }))
  .rejects.toThrow('E_PROVIDER_IN_USE');
const impact = await mockHandler(`/api/model-providers/${referenced.id}/impact`, { method: 'GET' });
expect(impact.deletionAllowed).toBe(false);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @de/web-api test -- control-plane.mock.test.ts`

- [ ] **Step 3: 实现 Provider CRUD、write-only `credential` 输入、连通性测试、停用与影响分析**

写操作校验 `model.write` 与 `workspaceId`，审计成功和失败结果；已发布路由引用时拒绝删除。

- [ ] **Step 4: 运行聚焦测试**

Run: `pnpm --filter @de/web-api test -- control-plane.mock.test.ts`

### Task 3: 实现路由草稿、校验、发布与回滚

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] **Step 1: 写出失败测试**

```ts
await expect(mockHandler(`/api/model-routing/policies/${policy.id}/publish`, { method: 'POST', body: { reason: 'release' } }))
  .rejects.toThrow('E_POLICY_NOT_READY');
const validation = await mockHandler(`/api/model-routing/policies/${policy.id}/validate`, { method: 'POST' });
expect(validation.status).toBe('ready');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @de/web-api test -- control-plane.mock.test.ts`

- [ ] **Step 3: 实现草稿校验、不可变发布版本、回滚和隔离故障演练**

校验模型状态、地域/出境、预算与无环降级链；发布与回滚必须保留版本快照并写入审计。

- [ ] **Step 4: 运行聚焦测试**

Run: `pnpm --filter @de/web-api test -- control-plane.mock.test.ts`

### Task 4: 以 API 事实源重构模型页面

**Files:**
- Modify: `frontend/web/src/App.tsx`
- Modify: `frontend/web/src/pages/Models.tsx`
- Create: `frontend/web/src/features/models/model-ui.ts`
- Create: `frontend/web/src/features/models/model-ui.test.ts`

- [ ] **Step 1: 写 UI 辅助函数失败测试**

```ts
expect(toProviderAction('delete', { deletionAllowed: false })).toEqual({ disabled: true, tone: 'danger' });
expect(toPolicyStatus('ready')).toBe('待发布');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter web test -- model-ui.test.ts`

- [ ] **Step 3: 添加模型权限路由守卫，替换本地路由/审计副本，并实现接入、路由、治理、审计四个工作区**

页面通过新 API 查询和 mutation 工作；凭据输入仅传入接入请求且成功后清空；删除先展示影响分析；路由编辑使用受管模型下拉选项、校验和发布确认。

- [ ] **Step 4: 运行 UI 测试与类型检查**

Run: `pnpm --filter web test -- model-ui.test.ts && pnpm --filter web typecheck`

### Task 5: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 运行 API 与 UI 测试**

Run: `pnpm --filter @de/web-api test && pnpm --filter web test`

- [ ] **Step 2: 构建和静态差异检查**

Run: `pnpm --filter web build && git diff --check`

