# ADR-022 — SubAgent 调度与并发合并

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §2 W2-D3](../../docs/W1-W7-改进方案-todo.md) 的"`internal/agentos/subagent.go` 仅 stub"
- 关系：被 `internal/server/copilot_multi.go` 的 `dispatchParticipants` 复用；为 `mergeParticipantOpinions` 提供上游（相同切片顺序）。

## 1. 上下文

多 Agent 委派路径原本用 `golang.org/x/sync/errgroup.Go` + 手写 defer-recover 直接 `dispatchParticipants`。问题：

| 维度 | 现状 | 风险 |
|---|---|---|
| 并发上限 | 无（每个 specialist 一个 goroutine） | workspace 里如果 10 个 active specialist，一次性 10 个并发 LLM 调用 → 触发上游限流 / 拖慢首 token |
| 单任务超时 | 复用外层 ctx | specialist 卡死会拖慢整个 multi-agent turn |
| Panic 恢复 | 在 `dispatchParticipants` 内手写 | 复制 panic-recovery 逻辑到处散落；测试 panic 注入只能手写 |
| 指标 | 无 | 没有 `de_subagent_run_seconds`，运营看不到哪环节慢 |
| Env flag | 无 | 没有 `DE_SUBAGENT_MAX_CONCURRENCY`，只能硬编码 |
| ADR | 无 | W2-D3 在 todo 里是 ⚪ |

候选方案：

| 方案 | 优 | 劣 |
|---|---|---|
| 维持 errgroup 直写 | 改 0 行 | 上面 5 项全部不解决 |
| 抽 `internal/agentos` 包（本文） | 收敛并发/超时/恢复/指标；可单测 | 多 1 个包，1 个 env 旗标 |
| 引入 ants / tunny 协程池 | 更通用 | W2-D3 范围有限；新依赖 |

W2-D3 的真实价值是「真实的多 Agent 调度」 — 即「bounded + timeout + 指标」。本文采用方案 2。

## 2. 决策

新增 `internal/agentos/subagent.go`：

| 组件 | 角色 |
|---|---|
| `Engine{MaxConc, DefaultTimeout, OnMetric}` | 单实例、跨请求复用（每次请求 new ctx） |
| `Engine.Run(ctx, tasks)` | semaphore + per-task `context.WithTimeout(ctx, min(parent-deadline, Budget, DefaultTimeout))`；顺序保持；defer-recover 把 panic 转成 `Result{Status:"failed",Reason:"panic_recovered: ..."}`；父 ctx 取消自动传播 |
| `Result{ID,Status,Text,Reason,HardNoRefusal,Duration,StartedAt}` | 平台无关；服务器把它映回 `participantTurnResult` |
| `SortedIDs([]Result)` | 测试 / 调试辅助 |
| 常量 `MaxConcurrencyDefault=4`、`DefaultTimeoutDefault=30s` | 默认值；env 可覆盖 |

调用点：`internal/server/copilot_multi.go::dispatchParticipants` 改为构造 `[]agentos.Task`，`s.SubAgent.Run(ctx, tasks)` 后映回 `[]participantTurnResult`。`mergeParticipantOpinions` 保持原实现（在 `session_panel.go`），因为它已经是简单的线性拼接。

Env / metric：

| Env / 指标 | 默认 / 含义 |
|---|---|
| `DE_SUBAGENT_MAX_CONCURRENCY` | `4`（env 未设则用 `MaxConcurrencyDefault`） |
| `de_subagent_run_seconds_sum / _count` | Prometheus counter (sum + count) |
| `de_subagent_run_avg_seconds` | gauge (sum/count 派生) |
| `de_subagent_run_total{status}` | per-status counter |

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. 维持 errgroup | 改 0 行 | 无并发上限 / 无超时 / 无指标 | ✗ |
| B. errgroup + semaphore wrapper | 单文件改造 | panic-recovery 仍散落；不可测 | ✗ |
| C. 抽 `agentos` 包（本文） | 收敛 / 可测 / 指标 | 1 个新包 | ✓ |

`agentos` 不依赖 `metrics` 包 — `OnMetric` 是回调，调用方（`server`）把它接到 `metrics.Global.SubAgent.Observe(...)`。这是单向依赖，不破坏分层。

## 3. 拒绝依赖

- **ants / tunny 协程池**：当前不需要 worker 池的语义（请求-响应），semaphore 足够
- **prometheus/client_golang**：平台里现成的 scrape handler 用 counter atomic；不进 subagent 包
- **opentelemetry**：未来 trace 时再接；现在 OnMetric 是回调，留出扩展点

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/agentos/subagent.go` | Engine + Task + Result + Run |
| `backend/internal/agentos/subagent_test.go` | 11 个测试（空 / 成功 / 顺序 / 并发上限 / panic / 超时 / 任务级预算 / 父 ctx 取消 / OnMetric / Fn 返回 error / SortedIDs） |
| `backend/internal/metrics/metrics.go` | `SubAgentBuckets{Observe,Snapshot}` + `Global.SubAgent` 字段 |
| `backend/internal/server/server.go` | `Server.SubAgent *agentos.Engine` 字段；`buildSubAgentEngine()` 从 env 读；`OnMetric` 接 `metrics.Global.SubAgent.Observe` |
| `backend/internal/server/copilot_multi.go` | `dispatchParticipants` 改用 `agentos.Engine`；保留 panic 事件向 Emit 通道透传 |
| `backend/internal/server/metrics.go` | scrape 输出 `de_subagent_run_seconds_{sum,count}` + `de_subagent_run_avg_seconds` + `de_subagent_run_total{status}` |

## 5. 后续

- **per-task timeout 自适应**：根据 specialist 历史 P95 调整
- **优先队列**：spec 决定 participant 顺序（紧急 > 普通）
- **可取消**：暴露 `Engine.Cancel(participantID)`，让 supervisor 在 partial-result 已足够时提前取消剩余 participants
- **trace span**：每个 task 接 OpenTelemetry span（OnMetric 不够时再加 callback）

## 6. 回退

- `internal/agentos/` 是新包；删除 import 即可
- `dispatchParticipants` 内部实现变更；外部行为不变（同样的 `participantTurnResult` 切片、相同顺序、相同 panic 事件）
- `metrics.Global.SubAgent` 字段新增；现有 9 个桶字段不变
- `de_subagent_run_*` 指标新增；现有指标不删