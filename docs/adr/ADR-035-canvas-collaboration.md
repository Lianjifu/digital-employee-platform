# ADR-035 — Canvas 协作后端（无 CRDT，纯 SSE + 注释）

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §6 W6-D2](../../docs/W1-W7-改进方案-todo.md) 的"无 realtime 包"
- 关系：依赖 `internal/heartbeat.Tracker` 的 SSE fan-out 模式（ADR-031）；与 W6-D1 PM SOP 共享 audit 行；前端 FE-6 PM Canvas 通过该 API 实现 presence + comment。

## 1. 上下文

PM Canvas 需要多用户在同一画布上协作：能创建画布、加 comment、看到当前谁在同一个画布上。

候选方案：

| 方案 | 优 | 劣 |
|---|---|---|
| **Yjs + 自托管 WS hub** | 真 CRDT；离线编辑 | 引入 y-crdt/y-protocols；CI 难跑 |
| **WebSocket 自研二进制协议** | 标准 realtime | 仍需处理 reconnect / presence / 二进制协议 |
| **SSE + 注释事件**（本文） | 无外部依赖；复用 heartbeat 模式 | 没有 CRDT，多端同时编辑可能冲突 |

W6 之前 FE-6 是 ⚪ 未做；要求是「先打通 presence + comment 流」，不强求 CRDT 协同编辑（评论是 append-mostly，本身冲突极少）。后续若需要真正的协同编辑再升级。

## 2. 决策

新增 `internal/canvas/` 包 + `internal/server/handlers_canvas.go`：

| 组件 | 角色 |
|---|---|
| `Store` | boards + comments + presence map；线程安全（sync.RWMutex） |
| `Broadcaster` | per-board 订阅者集合；drop-on-slow-consumer 模式（同 heartbeat） |
| `Board` / `Comment` / `Presence` | JSON-friendly 数据结构 |

API：

| 路由 | 方法 | 权限 |
|---|---|---|
| `/api/canvas/boards` | POST | `access.write` |
| `/api/canvas/boards` | GET | `access.read` |
| `/api/canvas/boards/{id}` | GET | `access.read` |
| `/api/canvas/boards/{id}` | DELETE | `access.write` |
| `/api/canvas/boards/{id}/comments` | POST | **`canvas.comment`** |
| `/api/canvas/comments/{id}` | PATCH | `canvas.comment` |
| `/api/canvas/comments/{id}` | DELETE | `canvas.comment` |
| `/api/canvas/boards/{id}/presence` | POST | `access.read` |
| `/api/canvas/boards/{id}/stream` | GET (SSE) | `access.read` |

SSE 事件：`snapshot`（连接建立即发） / `presence` / `comment` / `tick`（每 10s 心跳）。

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. Yjs + 自托管 WS | 真 CRDT | y-protocols / 复杂 reconnect 逻辑 | ✗ |
| B. WebSocket 自研 | 真全双工 | 协议设计 + 重连 + presence | ✗ |
| C. SSE + 注释事件（本文） | 无外部依赖；可测；CI 绿 | 评论 append-only，无 true CRDT | ✓ |

C 路线把"评论 + presence + 流式更新"打通，对当前 PM Canvas 用例已足够（评论是天然 append-mostly；presence 主要用于显示头像）。

权限：新增 `canvas.comment` 权限（todo 9.4）。admin 角色默认包含；user/auditor 角色暂未授予（评论视为管理动作）。

持久化：每分钟 janitor sweep + 每次写操作触发 `KnowledgeExtra["canvas_boards"]` 与 `KnowledgeExtra["canvas_comments"]` 重新 dump。snapshot 由现有 `s.Store.Persist("knowledge_extra")` 接管。

## 3. 拒绝依赖

- **不引入 Yjs / y-protocols / WebSocket 库**：避免 CGO + 二进制协议
- **不引入时序数据库**：评论按 createdAt 排序 + 内存 map
- **不在 CRDT 上做投入**：当前用例不要求真正协同编辑

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/canvas/canvas.go` | Store + Board + Comment + Broadcaster |
| `backend/internal/canvas/canvas_test.go` | 13 包测 |
| `backend/internal/server/handlers_canvas.go` | 9 个 HTTP handler + janitor |
| `backend/internal/server/handlers_canvas_test.go` | 10 集成测（含 SSE snapshot） |
| `backend/internal/metrics/metrics.go` | `CanvasBuckets` |
| `backend/internal/server/metrics.go` | `de_canvas_comment_total{action}` |
| `backend/internal/auth/jwt.go` | admin 角色加 `canvas.comment` |

指标：

| 指标 | 含义 |
|---|---|
| `de_canvas_comment_total{action="created"}` | 评论创建数 |
| `de_canvas_comment_total{action="edited"}` | 评论编辑数 |
| `de_canvas_comment_total{action="resolved"}` | 评论置为 resolved 数 |
| `de_canvas_comment_total{action="deleted"}` | 评论删除数 |
| `de_canvas_clients_online{workspace}` | 已有，FE 复用（W4-D1） |

## 5. 后续

- W7-D1 SQLite：canvas 也可改 SQLite 持久化
- 真 CRDT：未来若 PM Canvas 要支持"光标 / 选区"实时同步，再升级到 Yjs
- 实时权限收敛：把 `canvas.comment` 列入 user 角色（评论是 PM Canvas 核心交互）
- presence 二级缓存：tracker 已经存 workspace presence，board presence 可以再叠加

## 6. 回退

- `internal/canvas/` 是独立包，删除 import 即可
- 9 个路由 + `Canvas` + `CanvasBroadcaster` 字段均为 additive
- admin 角色加 `canvas.comment` 是 additive（删去不破坏现有 admin 用例）
- 默认 `auth.Has(...)` 命中失败即返回 403，对未启用 canvas 的部署完全无感