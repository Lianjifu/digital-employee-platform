# 模型控制面设计说明

**状态：** 已确认，待实施  
**范围：** `frontend` 前端与现有 Mock API；不接入真实后端服务。

## 1. 定位

模型模块是企业级数字员工平台的模型控制面：根据工作区策略，把业务请求路由到已经准入、可用、成本受控并满足地域约束的模型能力。

它不是会话中的模型选择器、Provider 清单、Prompt 编辑器、Agent/Skill/Workflow 编排器，也不是生产级的密钥、权限、合规或结算服务。

## 2. 目标与非目标

### 目标

- 让 Provider、模型、路由、运行治理与审计都通过 Mock API 形成可刷新、可测试的一致交互闭环。
- 以路由策略版本替代可直接覆盖的配置：支持草稿、校验、发布、查看历史、回滚与故障切换演练。
- 保留模型页的单主面板布局；顶层呈现风险摘要与主要操作，详情在右侧 Drawer 中按需展开。
- 对所有 Mock 规则明确标注“演示语义”，不把前端校验表述为实际 KMS、RBAC/ABAC 或合规执行。

### 非目标

- 不保存或传输真实 API Key，不接入 KMS/Vault。
- 不实现真实登录态、租户鉴权、审批流、计费结算、限流执行或跨境合规证明。
- 不新增模型训练、微调、评测数据集生产管理。
- 不承担会话模型切换、业务提示词编辑、Agent/Skill/Workflow 编排。

## 3. 职责边界

| 本模块负责 | 其他模块负责 |
| --- | --- |
| Provider、模型能力标签、地域、状态与引用关系 | Copilot 会话级模型选择与消息交互 |
| 路由草稿、校验、发布版本、回滚与演练 | Agent、Skill、Workflow 业务资产与编排 |
| Mock 配额、成本、速率、地域、降级链约束 | 真实密钥、权限、结算与合规执行 |
| 配置与演练的结构化审计 | 训练、微调与评测数据生产 |

跨模块仅以模型/路由的已发布版本和引用摘要连接；不得让模型页重复承载工作流发布、Agent 权限或会话操作。

## 4. 架构与数据流

`Models.tsx` 只管理瞬时 UI 状态（当前抽屉、筛选、确认框），不持有 Provider、路由、版本或审计的本地业务副本。TanStack Query 从 Mock API 查询视图数据；每个变更通过 `useApiMutation` 调用 Mock API，Mock API 校验状态机、写入审计事件并返回结果，mutation 成功后使查询失效并重新渲染。

```text
主面板 / 右侧抽屉
  -> useApiMutation
  -> Mock API 领域状态与规则
  -> 结构化审计事件
  -> invalidateQueries
  -> 基于同一 API 的刷新视图
```

前端一级功能固定为“接入、路由、治理、审计”四个域：

- **接入**（`features/models/ProviderDirectory`）：Provider 目录、模型能力、连通性、停用与删除影响分析。
- **路由**（`features/models/RoutingPolicy`）：路由草稿、校验结果、发布、版本历史和回滚。
- **治理**（`features/models/GovernanceOverview`）：健康度、配额、成本、地域和切换演练摘要。
- **审计**（`features/models/ModelAuditDrawer`）：按操作、结果和关联版本筛选的审计详情。

`Models.tsx` 只承担以上四个领域视图与通用 Drawer/Modal/ConfirmDialog 的组合。审计既是独立一级功能，也接收前三个领域的成功与失败事件。

## 5. 领域模型与 Mock API 契约

现有 `Provider` 与 `ModelRoute` 类型扩展为显式的模型治理实体，避免 `any` 和页面专用结构。

- `ModelProfile`：`id`、`providerId`、`name`、`region`、`capabilities`、`status`、`contextWindow`、`inputPrice`、`outputPrice`。
- `ProviderImpact`：`providerId`、`routeReferences`、`deletionAllowed`、`blockedReason`。
- `RoutingPolicyDraft`：`id`、`level`、`primaryModelId`、`fallbackModelIds`、`dataScope`、`egressAllowed`、`budgetLimitUsd`、`status`、`validationIssues`。
- `RoutingPolicyVersion`：`id`、`policyId`、`version`、`snapshot`、`publishedAt`、`publishedBy`、`rollbackOf`。
- `ModelGovernanceSnapshot`：健康、成本、Token、速率、预算、地域分布与更新时间。
- `ModelAuditEvent`：`id`、`time`、`actor`、`action`、`target`、`result`、`reason`、`policyVersion`、`correlationId`。

最低 Mock API 集合：

- `GET /api/model-providers`、`POST /api/model-providers`、`PATCH /api/model-providers/:id`。
- `GET /api/model-providers/:id/impact`、`POST /api/model-providers/:id/test`、`POST /api/model-providers/:id/disable`、`DELETE /api/model-providers/:id`。
- `GET /api/model-routing/policies`、`POST /api/model-routing/policies`、`PATCH /api/model-routing/policies/:id/draft`、`POST /api/model-routing/policies/:id/validate`。
- `POST /api/model-routing/policies/:id/publish`、`GET /api/model-routing/policies/:id/versions`、`POST /api/model-routing/policies/:id/rollback`。
- `GET /api/model-governance/overview`、`POST /api/model-routing/failover-tests`、`GET /api/model-audit`。

Mock API 的错误使用稳定错误码和中文展示文案，例如 `E_PROVIDER_IN_USE`、`E_MODEL_UNAVAILABLE`、`E_EGRESS_BLOCKED`、`E_BUDGET_EXCEEDED`、`E_FALLBACK_INVALID`。每个成功或失败的变更、校验和演练必须写入 `ModelAuditEvent`。

## 6. 路由策略状态机

```text
draft --validate(通过)--> ready --publish--> published
draft --validate(拒绝)--> draft
ready --edit--> draft
published --rollback--> superseded
历史 published --rollback--> published（创建新版本，不改写历史）
```

校验应拒绝：主/降级模型不存在或不可用；Provider 已停用；地域与 `egressAllowed` 冲突；成本预算超限；降级链重复、指向主模型或不存在；无可用降级模型时尝试发布要求高可用的等级。拒绝后草稿和表单输入保留，页面显示原因，不显示“已发布”。

删除 Provider 前必须先请求影响分析；任何已被已发布路由引用的 Provider 都返回 `E_PROVIDER_IN_USE`，前端仅允许停用或跳转到引用路由，不能删除。

## 7. 页面与交互

- 单一主面板使用“接入、路由、治理、审计”四个顶层工作区；顶部显示可用 Provider、已发布路由、预算风险和异常数。
- **接入** 工作区提供 Provider 横向选择器或目录卡片；新增、编辑、连通性和影响分析在 Drawer 内完成。
- **路由** 工作区展示已发布版本；行点击打开策略 Drawer，Drawer 内分为“草稿”“校验”“版本”页签。
- **治理** 工作区呈现健康、成本、速率、地域和切换演练摘要；完整指标在 Drawer 中展开。
- **审计** 工作区提供结构化审计列表与筛选 Drawer，删除硬编码日志，统一展示接入、路由、治理动作的成功和失败记录。
- 批准发布、回滚和停用使用 ConfirmDialog；确认信息包含目标、影响、版本和 Mock 语义提醒。
- 任何可点击元素使用 `button` 或可访问的控件；表格外层允许小屏横向滚动；关键正文最小字号为 12px。

## 8. 测试与验收

Mock API 测试至少覆盖：

1. 创建 Provider、连通性测试和审计写入。
2. 已发布路由引用 Provider 时的影响分析和删除拒绝。
3. 路由草稿因不可用模型、地域冲突、预算超限或无效降级链而被拒绝，并保留草稿。
4. 通过校验的草稿发布为新版本；回滚创建新版本且历史快照不变。
5. 故障切换演练返回受控结果并写入可筛选审计。

UI 测试至少覆盖：路由校验失败反馈、发布后刷新、Provider 删除阻断、版本回滚确认与审计 Drawer 筛选。验收命令为聚焦 Vitest、`pnpm --filter web typecheck`、`pnpm --filter web build` 和 `git diff --check`；所有命令通过后才能宣称完成。

## 9. 风险声明

本设计中的密钥提示、用户身份、地域、预算、限流和审计均是 Mock 交互契约；它们仅验证前端体验和调用边界，不能作为生产安全或合规能力的证明。真实服务接入时必须由服务端从认证上下文取得租户与操作者、执行授权与策略，并将密钥托管在 KMS/Vault。
