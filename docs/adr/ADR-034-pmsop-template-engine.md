# ADR-034 — PM SOP 模板引擎与状态机

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §6 W6-D1](../../docs/W1-W7-改进方案-todo.md) 的"无 `internal/pmsop/`"
- 关系：与 `internal/selfimproving` (ADR-026) 共用 SOP 思路但范围不同 — selfimproving 是「trace → 一次性反馈文档」，pmsop 是「模板 → 可寻址的运行时实例」。W6-D2 Canvas 协作将在 Plan 上挂 comment。

## 1. 上下文

PM（项目管理）需要可重复的工作流模板 + 状态机：

- 一个模板描述「应该做哪些阶段、每个阶段哪些任务」
- 用户从模板渲染出一个可寻址的 plan（绑 workspace / owner）
- 任务要能 start / complete / block / unblock / note
- 阶段和 plan 状态要自动联动（all done → stage completed → all stages completed → plan completed）

约束：

- 不能引入新的持久层；plan 必须落在已有的 `Store.KnowledgeExtra` 体系
- 不能引入 DSL parser；模板在 Go 代码中以 struct 形式定义，HTTP 层用 JSON 交互
- 状态机的合法性由引擎强制，handler 不应重复规则

## 2. 决策

新增 `internal/pmsop/` 包 + `internal/server/handlers_pmsop.go`，挂载五个路由：

| 路由 | 方法 | 角色 |
|---|---|---|
| `/api/pmsop/templates` | GET | 列出内置模板 |
| `/api/pmsop/plans` | POST | 从 templateId 渲染一个新 plan |
| `/api/pmsop/plans` | GET | 列出当前 workspace 的 plan |
| `/api/pmsop/plans/{id}` | GET | 单 plan 详情 |
| `/api/pmsop/plans/{id}/events` | POST | 应用 task.* 事件 |

引擎接口：

```go
type Engine struct{ ... }
func New() *Engine                                     // 加载 DefaultTemplates
func (e *Engine) Register(t Template)                 // 注册/替换
func (e *Engine) Templates() []Template               // 列出
func (e *Engine) Template(id string) (Template, bool)
func (e *Engine) Render(tplID, planID, ws, owner, now) (Plan, error)
func (e *Engine) Apply(plan Plan, ev Event) (Plan, error)
```

事件类型：`task.start`、`task.complete`、`task.block`、`task.unblock`、`task.note`。

持久化：plan JSON 存在 `Store.KnowledgeExtra["pmsop_plans"]`，与 knowledge docs / SOPs 同层级；audit 行写"创建 PM 计划" / "PM 计划事件 ..."。

指标：`de_pmsop_plan_total{action}` 暴露 created + 5 个事件动作。

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. 真 DSL（YAML / 自定义） | 灵活 | 解析器 + 校验代码量大；CI 难跑 | ✗ |
| B. Go struct + JSON tag（本文） | 简单；类型安全；模板即代码 | 模板需重新部署才能改 | ✓ |
| C. DB 表 | runtime 可改 | 新增迁移；与现有 KnowledgeExtra 双轨 | ✗ |

B 路线把"模板即代码"做到最简：新增模板 = 改 `DefaultTemplates()` + PR review。runtime 配置留给"基于现有模板创建 plan"。

## 3. 拒绝依赖

- **不引入 YAML/TOML 解析**：模板就是 struct
- **不引入工作流引擎**（Temporal / Cadence 等）：scope 过大
- **不存储 stage/task 自定义 schema**：固定的 5 个事件类型覆盖 PM 日常

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/pmsop/pmsop.go` | Engine + Template/Plan + 状态机 + 默认模板（agile-sprint / launch-checklist） |
| `backend/internal/pmsop/pmsop_test.go` | 12 包测（注册 / 渲染 / 事件 / 状态自动推进 / 非法转移） |
| `backend/internal/server/handlers_pmsop.go` | 5 个 HTTP handler |
| `backend/internal/server/handlers_pmsop_test.go` | 8 集成测 |
| `backend/internal/metrics/metrics.go` | `PMSopBuckets` |
| `backend/internal/server/metrics.go` | `/metrics` 输出 `de_pmsop_plan_total{action}` |

状态机规则：

| 当前 task 状态 | start | complete | block | unblock | note |
|---|---|---|---|---|---|
| pending | → in_progress | 拒绝 | → blocked | 拒绝 | 保留 |
| in_progress | 拒绝 | → done | → blocked | 拒绝 | 保留 |
| blocked | 拒绝 | 拒绝 | 拒绝 | → pending | 保留 |
| done | 拒绝 | 拒绝 | 拒绝 | 拒绝 | 保留 |

## 5. 后续

- W6-D2 Canvas：plan 上的 comment 走相同的事件总线
- W7-D1 SQLite：plan 也可选择存 SQLite 而非 KnowledgeExtra
- 自定义模板：admin 写 Go plugin，运维期 hot reload
- 时间线视图：从 `startedAt` / `completedAt` 渲染甘特图

## 6. 回退

- `internal/pmsop/` 是独立包，删除 import 即可
- 5 个路由注册在单独一段 switch，删除无副作用
- `PMSop` 字段是 Server 末尾 additive 字段
- `KnowledgeExtra["pmsop_plans"]` key 独立，未来可改持久层