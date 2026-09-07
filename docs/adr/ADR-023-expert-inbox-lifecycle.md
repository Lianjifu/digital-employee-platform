# ADR-023 — ExpertInbox 数据生命周期

> 状态：草案
> 日期：2026-09-08
> 前置：W3-D1 实施完成（`backend/internal/server/handlers_expert_inbox.go`）。

## 1. Context

W3-D1 把 `ExpertInbox` 从 metric stub 升级成真实的列表 / 审核端点。每条
记录的状态机是 `pending → approved | rejected | dismissed`，且每个
workspace 独立计数。本 ADR 锁定数据保留与清理的契约，避免在 7 周计划
之外的隐式行为。

## 2. 决策

### 2.1 状态机

```
              approve                 reject                 dismiss
   pending ───────────▶ approved ───────────▶ (terminal) ───────────▶ (terminal)
            (audited)        (audited)              (audited)

   ※ 已 resolved（approved / rejected / dismissed）的条目不能再次被审。
```

- 任何 transition 都写一条 `审核 ExpertInbox 项` 的 audit 行，包含
  reviewer 名字 + decision + 新 status。
- 重审会被 400 拒绝（`E_EXPERT_INBOX_INVALID`），强制 ops 开新条目。

### 2.2 保留期

| 状态 | 保留期 | 理由 |
|---|---|---|
| `pending` | 30 天 | 超期未审需要告警，避免堆积 |
| `approved` | 90 天 | 用于审计 + 回溯决策 |
| `rejected` | 90 天 | 同上 |
| `dismissed` | 30 天 | 仅作短时压制记录，避免噪音 |

清理通过定期 job 执行（`internal/janitor`，待 W4-D1 一并接入）。本期
不实现 cron，由 ops 用 psql / 内存 dump 手动清理。

### 2.3 Workspace 隔离

`ExpertInbox` 写入时强制 `workspaceId = caller.workspace`。读 + 审都
按 workspace 过滤；跨 workspace 用 404（不是 403，避免泄露 ID 存在性）。
这与 `access_grants / access_reviews` 一致。

### 2.4 权限

- `list` + `create` + `review`：要求 `access.write`（与
  `completeReview` 对齐，避免引入新的 permission code）。
- audit row 永远记录 reviewer name + ID，便于事后追责。
- 没有专门的 `expert_inbox.review` permission；权限表 9.4 中保留给未来
  业务侧审批人使用。

### 2.5 真实 ingestion 推迟到 W6

本期只暴露了 `POST /api/expert-inbox` 作为 ops 手动注入入口。真正从
copilot turn / skill run / channel webhook 来的自动 ingestion 在 W6-D1
（PM SOP）一并落地，避免 copilot 流提前绑定 inbox。

## 3. 度量

- `de_expert_inbox_pending` gauge：当前 workspace 的 pending 计数。
  - 每次 list / create 时刷新。
  - 不做总数聚合，因为 pending 是 workspace-scoped 的。
  - 多 workspace 并发时，gauge 值是「最后一次 list 调用所在 workspace」
    的快照；这是已知 trade-off，运维侧通过 `/api/audit-center?filter=expert_inbox`
    取精确值。

## 4. 与未来工作的接口

| 项 | 何时落地 | 备注 |
|---|---|---|
| 自动 ingestion（copilot / skill / channel） | W6-D1 PM SOP | ADR-022 / 026 一并 |
| 实时推送（SSE） | W6-D2 Canvas presence | presence channel 可顺带 |
| 清理 cron | W4-D1 Heartbeat job | 复用 janitor 框架 |
| 业务侧审批权限 `expert_inbox.review` | 当业务侧需要「普通员工可看但只有管理员可批」时 | 当前统一用 access.write 即可 |

## 5. 回滚

- Store 字段 `ExpertInbox []map[string]any` 是新字段，移除即可回滚。
- Routes 在 `server.go` 集中在 W3-D1 段，一次 revert 即可。
- 保留 audit row 与 metric stub 不动（无破坏性）。
