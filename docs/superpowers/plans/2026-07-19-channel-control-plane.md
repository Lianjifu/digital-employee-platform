# 渠道控制面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将渠道页升级为具备权限、工作区隔离、版本化投递路由、失败处置与审计证据的 Mock 渠道控制面。

**Architecture:** 领域状态集中在 Mock API；渠道部署、投递策略版本、模板/目标治理、失败队列和审计通过强类型 API 暴露。页面仅持有瞬时抽屉与筛选状态，以 API 查询为事实源。

**Tech Stack:** React、TypeScript、TanStack Query、Vitest、现有共享组件。

---

### Task 1: P0 渠道领域契约与安全边界

**Files:**
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] 写渠道读写权限、工作区隔离、只写凭据引用、已发布策略引用保护的失败测试。
- [ ] 实现 `ChannelDeployment`、`DeliveryPolicyDraft`、`DeliveryPolicyVersion` 与 `ChannelAuditEvent` 类型及 `/api/channel-control/*` API。
- [ ] 运行 `pnpm --filter @de/web-api test -- control-plane.mock.test.ts`。

### Task 2: P0/P1 路由版本与投递失败治理

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/packages/api/src/control-plane.mock.test.ts`

- [ ] 写草稿校验、发布、回滚、失败重试/死信及脱敏投递记录的失败测试。
- [ ] 实现策略状态机和失败处置 API，所有操作写入渠道审计。
- [ ] 运行 API 测试。

### Task 3: P0/P1 页面迁移

**Files:**
- Modify: `frontend/web/src/App.tsx`
- Modify: `frontend/web/src/pages/Channels.tsx`
- Create: `frontend/web/src/features/channels/channel-ui.ts`
- Create: `frontend/web/src/features/channels/channel-ui.test.ts`

- [ ] 写纯 UI 状态/权限禁用测试并验证红灯。
- [ ] 将页面迁移到“渠道接入、投递路由、模板与目标、运行健康、失败处置、渠道审计”工作区。
- [ ] 移除路由、模板、黑名单的本地事实源；使用受权限保护 API 和操作反馈。
- [ ] 运行 web 测试和类型检查。

### Task 4: P2 治理增强与完整验证

**Files:**
- Modify: `frontend/packages/api/src/mock.ts`
- Modify: `frontend/web/src/pages/Channels.tsx`

- [ ] 添加策略模拟、canary 演练和容量风险摘要。
- [ ] 执行 `pnpm --filter @de/web-api test && pnpm --filter web test && pnpm --filter web build && git diff --check`。
