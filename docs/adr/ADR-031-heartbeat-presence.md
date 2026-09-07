# ADR-031 — Heartbeat / 在线探测（active probe + SSE 推送）

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §4 W4-D1](../../docs/W1-W7-改进方案-todo.md) 的"无 `internal/heartbeat/` 包"占位
- 关系：被 W6-D2 (Canvas 协作) 与 W7-FE-9 (Session Sync) 引用做 presence 输入

## 1. 上下文

W4-D1 之前，前端**完全不知道**其他成员是否在线。后果：
- "团队仪表盘"显示的是静态用户名列表，不带绿点 / 时间戳
- 多人协作（未来的 W6 Canvas / W7 Session Sync）无法做"@在线用户"或占用提示
- 没有 SLA 信号：如果一个值班用户长时间无心跳，没人能告警

需求：
- 一个 active probe 端点，前端 30s 轮询一次，确认连接 + 服务端在跑
- 一个 presence 查询端点，给"在线 N 人 / 他们是谁"列表
- 一个 SSE 流，让"在线指示器"无需轮询也能更新
- 一个 Prometheus 指标 `de_heartbeat_lag_seconds`，给告警用

## 2. 决策

新增 `internal/heartbeat/` 包 + Server 端挂载：

| 组件 | 角色 |
|---|---|
| `Tracker` | 进程内 `(workspaceID, identityID) → Presence` map + SSE 订阅 hub |
| `Touch(wsID, idID, channel)` | 记录一个活跃请求；返回是否首次进入 |
| `Sweep()` | 周期驱逐 `LastSeen < now - StaleAfter` 的条目；返回驱逐数 |
| `Online(wsID)` / `OnlineCount(wsID)` | 过滤掉 stale 后返回 sorted list / count |
| `LagSinceLastTouch()` | 全局最新心跳的 wall-clock lag（秒）；给 metric 用 |
| `Snapshot()` | `map[workspaceID]count` 给 metric 用 |
| `Subscribe(wsID)` | 返回带缓冲的 SSE channel；slow consumer drop 事件 |

设计要点：

- **入口：auth 中间件 `withHeartbeat`**。每个通过 `requireAuth` 的请求自动 `Touch`，无需业务代码主动调用 —— 不会漏、不会被绕过。
- **活跃定义**：`LastSeen >= now - StaleAfter`。默认 `StaleAfter = 3 × Interval`（90s），所以 1 个 missed beat 不会把人标离线。
- **多设备 = 单条记录**：presence 按 `(workspace, identity)` 聚合；多设备用户的"最后活跃"取最新，不区分设备。设备级 presence 留给 W7 Session Sync。
- **SSE 防慢消费者**：channel 缓冲默认 16；满了直接 drop，下一 tick 重新发 snapshot。文档明确"slow consumer ≠ writer stall"。
- **不写持久化**：presence 是内存态，重启即丢。需要持久化请用 W7 的 session_sync 体系（未来）。
- **workspace 隔离**：`Online(wsID)` / SSE 流都只放当前 workspace 的事件；恶意 `?workspace=other` 不接受（直接用 ctx 里的 ws）。
- **指标**：
  - `de_heartbeat_lag_seconds`（gauge）— `LagSinceLastTouch().Seconds()`
  - `de_canvas_clients_online{workspace}`（gauge）— `Snapshot()` 各 ws count

## 3. 取舍

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. 不做 | 零代码 | 没有 presence / 无 SLA 信号 | ✗ |
| B. 主动轮询每个用户（client 每 5s POST `/heartbeat`） | 简单 | 浪费带宽；client 不在线时记 false offline | ✗ |
| C. **Auth-middleware 旁路 Touch + SSE（本文）** | 入口单一；client 啥都不用做；SSE 实时 | 依赖 auth 中间件（已在 W1 全覆盖） | ✓ |

W6-D2 Canvas 协作未来会复用同一个 Tracker；W7 Session Sync 也会读 `LagSinceLastTouch()` 给 sync skew 兜底。

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/heartbeat/heartbeat.go` | Tracker + Presence + Event + Config |
| `backend/internal/heartbeat/heartbeat_test.go` | 16 个单测（Touch / Sweep / Online / Subscribe / Lag / Snapshot / 并发 / 配置） |
| `backend/internal/server/handlers_heartbeat.go` | `withHeartbeat` 中间件 + 3 个 handler（probe / list / stream） |
| `backend/internal/server/handlers_heartbeat_test.go` | 5 个 HTTP 集成测试 |
| `backend/internal/server/server.go` | `Heartbeat` 字段 + `New()` 初始化 + 启动 sweeper goroutine + `withHeartbeat` 接入中间件链（顺序：cors → metrics → requireAuth → withHeartbeat → mux） |
| `backend/internal/server/metrics.go` | 发布 `de_heartbeat_lag_seconds` + `de_canvas_clients_online{workspace}` |

Env 旗标：
- `DE_HEARTBEAT_INTERVAL`（默认 `30s`）— 同时是 sweep 周期 + SSE ping 周期
- `DE_HEARTBEAT_STALE`（默认 `90s = 3 × Interval`）— presence stale 阈值

## 5. 后续

- W4-D2 VisualDiff 落地时复用 `LagSinceLastTouch()` 给"无活跃用户时禁用刷新"提示
- W6-D2 Canvas 在此基础上叠加 deviceId + cursor 维度（per-canvas presence）
- W7 Session Sync 把 `de_canvas_clients_online{workspace}` 当 SLA 输入

## 6. 回退

- 中间件 `withHeartbeat` 是 additive（仅旁路 Touch），可独立删除
- 3 个新路由都是新前缀 `/api/heartbeat*`，不会撞已有
- Tracker 字段加在 Server struct 末尾，新增无破坏
- 进程重启即丢 presence —— 这正是设计取舍，不是 bug