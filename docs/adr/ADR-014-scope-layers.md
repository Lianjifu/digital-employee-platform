# ADR-014 · 作用域三层（组织 / 工作区 / 个人）

- **状态**：草案（Proposed）
- **日期**：2026-08-21
- **阶段**：近端 · 对齐生产写路径 §1
- **关联**：[实施方案-对齐生产写路径.md](../实施方案-对齐生产写路径.md) · [ADR-013](./ADR-013-agent-os-kernel.md)

## 背景

控制面已强制 `workspaceId`（`x-workspace-id`）与租户壳，但五中心资产多为「仅工作区」视角：

- 缺少统一的 **组织目录**（租户级可见/默认策略）与 **个人绑定**（默认伙伴、个人启用）。
- 技能岗位包已按工作区返回 `installed`；知识/模型/记忆/渠道的「组织发布 → 工作区启用 → 个人偏好」未同构。
- 默认工作区 `w1` 壳与用户自建工作区并存，JWT 过滤易与真实成员列表错位。

需要冻结三层作用域模型，避免各中心各自发明 `scope` 字段。

## 决策

### 1. 三层作用域

| 层 | 标识 | 含义 | 写权限 | 读权限 |
|----|------|------|--------|--------|
| **组织** | `tenantId` | 租户级目录与默认策略 | tenant admin | 租户内（可再按角色收窄） |
| **工作区** | `workspaceId` | 业务域启用、配额、发布落点 | workspace owner / admin | 工作区成员 |
| **个人** | `actorId`（+ 当前 `workspaceId`） | 个人启用、默认伙伴、个人模板 | 本人 | 本人（admin 可审计） |

所有业务请求仍须携带并服务端校验 `tenantId` + `workspaceId`（个人层不能单独成立）。

### 2. 核心对象

```text
CatalogEntry {
  id, tenantId,
  scope: "org" | "workspace",
  workspaceId?,          // scope=workspace 时必填
  assetType,             // model_route | knowledge_package | skill | memory_policy | channel | workflow_template | …
  assetId, version,
  status: draft|published|deprecated,
  visibility
}

WorkspaceEnable {
  workspaceId, catalogEntryId | assetRef,
  enabled, enabledAt, enabledBy
}

PersonalBinding {
  actorId, workspaceId,
  assetRef,              // 指向已启用且已发布资产
  isDefault?, prefs?
}
```

### 3. 解析规则（读路径）

有效集合 =  

1. 组织 `published` 目录中对该租户可见的条目  
2. ∩ 当前工作区 `WorkspaceEnable.enabled=true`（组织强制启用策略可跳过显式 enable，须在 Catalog 标注 `orgForced`）  
3. ∪ 个人 Binding（仅影响默认选中 / 个人模板，**不能**让个人看见未启用资产）

**冲突**：组织 `deny` / `deprecated` > 工作区启用 > 个人绑定。个人不可覆盖组织拒绝。

### 4. 写路径

| 动作 | 门禁 |
|------|------|
| 组织目录发布 | admin +（staging/prod）审批 |
| 工作区启用 | workspace 写权限 |
| 个人绑定 | 登录用户；仅本人 |
| 伙伴装配 | 只能引用「解析规则」下有效且 **published** 的版本 |

### 5. API 草案（路径可微调，语义冻结）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/catalog` | `?scope=&assetType=` 合并视图，带 `bindingState` |
| POST | `/api/catalog` | 组织/工作区登记（按角色） |
| POST | `/api/workspaces/:id/enables` | 启用/停用 |
| GET/PUT/DELETE | `/api/bindings/me` | 当前用户在当前工作区的个人绑定 |

错误码：沿用 `E_WORKSPACE_SCOPE`；新增 `E_CATALOG_NOT_ENABLED`、`E_BINDING_FORBIDDEN`（实现时写入 `pkg/errors`）。

### 6. 迁移

1. 存量仅工作区资产 → `CatalogEntry.scope=workspace` + 隐式 `WorkspaceEnable`。  
2. `EnsureBuiltin*` 出厂包：登记为组织或工作区目录（办公开箱默认 **工作区 published + auto enable**）。  
3. 默认工作区策略：保证每租户有且仅有一个 `isDefault` 工作区；废弃硬编码 JWT `w1–w4` 滤空逻辑。

## 后果

### 正面

- 五中心与伙伴装配共用同一启用语义。  
- 个人模板 / 默认伙伴与组织治理解耦。

### 负面 / 跟进

- 前端列表与 TanStack Query key 必须含 `workspaceId`（及可选 `scope`）。  
- 需一轮 API 兼容期：旧「仅 workspace 列表」响应增加字段而非改破坏性形状。

## 非目标（本 ADR 不做）

- 跨租户联邦目录。  
- 将个人记忆自动升为组织知识（仍走审核，见 ADR-013 K6）。

## 验收

- [ ] 跨工作区：未 Enable 的 published 组织资产不可被装配/检索。  
- [ ] 个人 Binding 仅改变本人默认选中。  
- [ ] 组织下架 → 工作区 Enable 失效 → 装配返回明确错误码。  
- [ ] 契约测试覆盖 list 合并与 deny 优先级。
