# 模型控制面 P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升模型控制面在查询失败、异步变更、键盘操作和窄屏场景下的企业 SaaS 可用性。

**Architecture:** 保持 `Models.tsx` 为控制器，提取纯 UI 状态函数和领域视图组件。页面从 TanStack Query 获取异步状态，统一显示加载、失败和变更反馈；不改变模型 Mock API 或 P0/P1 安全语义。

**Tech Stack:** React、TypeScript、TanStack Query、Vitest、现有共享 Drawer/ConfirmDialog/Toast。

---

### Task 1: 建立 UI 状态映射测试

**Files:**
- Modify: `frontend/web/src/features/models/model-ui.test.ts`
- Modify: `frontend/web/src/features/models/model-ui.ts`

- [ ] **Step 1: 写失败测试**

```ts
expect(modelQueryState({ isLoading: false, isError: true, data: [] })).toEqual({ kind: 'error', label: '模型控制面数据读取失败' });
expect(modelQueryState({ isLoading: false, isError: false, data: [] })).toEqual({ kind: 'empty', label: '暂无模型控制面数据' });
```

- [ ] **Step 2: 运行红灯测试**

Run: `pnpm --filter web test -- model-ui.test.ts`

- [ ] **Step 3: 实现纯状态映射函数**

根据 loading/error/data 长度返回 `loading`、`error`、`empty`、`ready`，供四个工作区复用。

- [ ] **Step 4: 运行绿灯测试**

Run: `pnpm --filter web test -- model-ui.test.ts`

### Task 2: 添加模型页异步与操作反馈

**Files:**
- Modify: `frontend/web/src/pages/Models.tsx`
- Test: `frontend/web/src/features/models/model-ui.test.ts`

- [ ] **Step 1: 使用已通过的状态函数渲染加载、失败与空状态**

在接入、路由、审计三个数据域显示明确状态和重试操作；不把请求错误误表示为空数据。

- [ ] **Step 2: 为 mutation 统一接入成功/失败 Toast**

对 Provider 接入、验证、停用、删除、草稿保存、校验、发布、回滚和演练显示结果；失败文本优先显示 API 错误。

- [ ] **Step 3: 补齐可访问语义与窄屏限制**

tablist 使用 `aria-controls`；Provider 卡片添加可见焦点；表格维持水平滚动；Drawer 内操作按钮说明只读原因。

- [ ] **Step 4: 运行 web 测试与类型检查**

Run: `pnpm --filter web test -- model-ui.test.ts && pnpm --filter web typecheck`

### Task 3: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 执行完整验证**

Run: `pnpm --filter @de/web-api test && pnpm --filter web test && pnpm --filter web build && git diff --check`
