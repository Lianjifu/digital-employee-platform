# ADR-026 — SelfImproving 反馈回路与写入边界

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §5 W5-D1](../../docs/W1-W7-改进方案-todo.md) 的"无 `internal/selfimproving/`"
- 关系：依赖 `internal/modelprov/trace.Recorder`（trace W7-M4 之前）；写入路径复用 `internal/server/handlers_knowledge.go` 的 doc/pipeline；与 W5-D2 Multimodal 共用"先把异构信号标准化再决策"模式。

## 1. 上下文

W5 之前，模型调用失败/超时只能落在 audit log 的「provider X failed」一行。owner 无法回答：

- 这段时间**反复**失败的是哪个 provider？
- 高延迟是 modelprov 自身还是 prompt 太大？
- 自动跑出来的失败模式能不能直接写进知识库，下次复用？

需要一个**反馈回路**：trace → 聚类 → 建议 SOP → 写回 knowledge。

约束：

- Recorder 现状只暴露 `Recent(n)` 和 `AggregatesWindow(window)`，没有 per-TraceID 查询
- knowledge 写入要走现有的「indexing → ready」异步流水线（不能直接 publish）
- 自动写入必须可审计、可拒收，避免低质量 SOP 污染知识库

## 2. 决策

新增 `internal/selfimproving/` 包 + `internal/server/handlers_selfimproving.go`，并挂载 `POST /api/selfimproving/sop`。

| 组件 | 角色 |
|---|---|
| `selfimproving.Engine` | 纯函数式，包裹 `*trace.Recorder`；不触碰网络 / fs / store |
| `Generate(opts) → SOP` | 拉 Recent(N)，按 (ProviderID, ErrorClass) / (ProviderID, Level) 聚类，返回 SOP + Verdict + Reason |
| `SOP.Markdown` | 结构化模板：采样 / 触发模式 / 建议步骤 / 元数据 |
| `Verdict ∈ {created, merged, rejected}` | 决策由 classify() 给出：patterns > error rate > latency |
| `Reason ∈ {sample_too_small, no_anomaly_detected, error_rate_elevated, latency_elevated, recurring_errors}` | 解释 verdict 由来，便于 dashboard 分桶 |

API：

```
POST /api/selfimproving/sop
Body: { workspaceId?, window?, titleHint?, write? }
200: { verdict, reason, title, markdown, tags, sampleSize, summary, patterns, [write, docId, packageId] }
```

`write=true` 时，若 `verdict=created` 且调用方有 `knowledge.write`，handler 通过 `submitSOPKnowledgeDoc()` 把 SOP 落到 draft package 的 indexing 队列；audit 行写"self-improving 写入 SOP"。

错误码：

| 触发 | HTTP |
|---|---|
| 无 token | 401（现有 `requireAuth`） |
| `workspaceId` 与 token 不一致 | 403 |
| `sample_size < MinSample` | **200** + `verdict=rejected reason=sample_too_small`（便于 dashboard 计数） |
| 生成过程 panic / 包外错误 | 500（不应该发生） |

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. 直接调用 LLM 总结 trace | 灵活 | 引入 LLM 依赖；不可测；CI 难绿 | ✗ |
| B. 规则 + 模板（本文） | 纯函数；可单测；CI 绿；写入边界清楚 | 模式识别能力有限 | ✓ |

C（本文）路线不引入 LLM，把"trace 标准化 → 模板渲染 → 知识回写"全部用规则实现；未来若需更智能的总结，单独建 `internal/selfimproving/llm.go` 包，加 `DE_SELFIMPROVING_LLM` 开关。

## 3. 拒绝依赖

- **不引入 LLM 客户端**：避免把"反馈回路"变成"二次模型调用"，更难审计
- **不直接 publish**：SOP 必须先入 indexing/ready，由 owner 决定发布
- **不绕过 knowledge.write 权限**：写入即创建知识资产
- **不在 trace.Recorder 上加 per-TraceID 查询**：保持现有接口最小

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/selfimproving/selfimproving.go` | Engine + Verdict + Reason + Pattern + 模板渲染 |
| `backend/internal/selfimproving/selfimproving_test.go` | 11 个单测（阈值 / workspace 过滤 / 模板结构 / 默认值） |
| `backend/internal/server/handlers_selfimproving.go` | `POST /api/selfimproving/sop` + `submitSOPKnowledgeDoc` |
| `backend/internal/server/handlers_selfimproving_test.go` | 7 个集成测试（创建 / 拒绝 / 样本不足 / 写回知识 / 权限 / 工作区冲突） |
| `backend/internal/metrics/metrics.go` | `SelfImprovingBuckets`（created/merged/rejected 三计数） |
| `backend/internal/server/metrics.go` | `/metrics` 暴露 `de_selfimproving_sop_total{verdict}` |

阈值：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `MinSample` | 3 | 至少 3 条 trace 才考虑生成 |
| `ErrorRateReject` | 0.9 | success_rate < 90% 即 `error_rate_elevated` |
| `P95LatencyMs` | 4000 ms | p95 > 4s 即 `latency_elevated` |
| `RecurringErrorThreshold` | 2 | 同一 ProviderID+ErrorClass 出现 ≥2 次形成模式 |

## 5. 后续

- W6-D1 PM SOP 复用 `internal/pmsop/` 模板 DSL，但「生成」路径继续走 selfimproving
- W6-D2 Canvas 协作：用户对 SOP 加 comment 即触发 Re-classify
- 真实 LLM 总结作为 env-gated 可选 provider（与 W5-D2 multimodal 同模式）
- 知识图谱边：`SOP → Pattern → Trace Event` 三段关系写入 graphRelations

## 6. 回退

- `internal/selfimproving/` 是独立包，删除 import 即可
- 路由 `case path == "/api/selfimproving/sop"` 单独一段
- 默认未调用 = 无影响；调用 `write=true` 才触碰知识库
- `metrics.Global.SelfImproving` 新字段是 additive
- Recorder 接口未变