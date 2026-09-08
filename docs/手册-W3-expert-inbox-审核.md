# W3-ExpertInbox 审核手册

> 面向 ops / 业务审核员。ExpertInbox 是「automation 处理不了、上交人工」的
> 统一收件箱。本手册说明条目怎么来、怎么审、什么时候清。

## 1. 它是什么

W3-D1 把 `ExpertInbox` 从 metric stub 升级成真实数据表。每条记录承载：

| 字段 | 含义 |
|---|---|
| `id` | `inbox-<seq>`，自动生成 |
| `workspaceId` | 多租户隔离；只允许同 workspace 的 reviewer 看到 |
| `title` | 简短的标题（≤ 200 字符） |
| `source` | `copilot` / `skill` / `channel` / `manual` / `escalate` |
| `severity` | `info` / `warn` / `block` |
| `status` | `pending` → `approved` / `rejected` / `dismissed` |
| `createdAt` / `createdBy` | 何时何人生成 |
| `reviewedAt` / `reviewer` / `decision` / `note` | 审核结果 |
| `payload` | 不透明 JSON（来源各异） |

来源列表见 ADR-023 §2.5。当前 W3-D1 仅暴露手动 `POST` 入口；自动 ingestion
等 W6-D1。

## 2. 端点

| 方法 | 路径 | 作用 | 权限 |
|---|---|---|---|
| GET | `/api/expert-inbox[?status=pending]` | 列当前 workspace 的条目，可按 status 过滤 | `access.write` |
| POST | `/api/expert-inbox` | 手动注入条目（ops / 测试用） | `access.write` |
| POST | `/api/expert-inbox/<id>/review` | 审核一条：`{decision: approve\|reject\|dismiss, note: "..."}` | `access.write` |

调用方须带 `Authorization: Bearer ...` + `X-Workspace-Id: <ws>`。返回
结构包在 `{ok, data, error}` 信封里。

## 3. 审核流程

1. **拉清单**：`GET /api/expert-inbox?status=pending`。返回 `{items, pending, total, filter, now}`。
2. **看条目**：前端列表组件按 severity 排序（block > warn > info）。点击打开 payload 详情。
3. **做决定**：
   - **approve**：保留并继续（例如放行客服回复模板）。
   - **reject**：否决并回退发起方。
   - **dismiss**：标记为已处理但不修改数据（典型场景：误报、重复）。
4. **加 note**：≤ 1024 字符。任何后续审计 / 回溯都看这一行。
5. **持久化**：每次审核都触发 `expert_inbox` 集合持久化（PG / kv_documents）。

> ⚠️ 已 resolved（approved / rejected / dismissed）的条目**不能再次被审**。
> 如要修改，**请开新条目**并在原条目加 note 引到新条目。

## 4. 跨 workspace 行为

- `GET /api/expert-inbox`：只返回 `workspaceId == caller.workspace` 的条目。
- `POST /api/expert-inbox/<id>/review`：lookup 时同时校验 id + workspaceId；
  任一不匹配返回 **404**（不是 403，避免泄露 ID 存在性）。

这是有意为之，与 `access_grants` / `access_reviews` 一致。

## 5. 权限

- 当前所有 inbox 端点统一要求 `access.write`。
- 没有 `expert_inbox.review` 这种细粒度权限；将来业务侧需要「普通员工
  可看但只有管理员可批」时再加（见 ADR-023 §4）。
- `mock-user-token`（user role）会被 403 拦截；`mock-admin-token`（admin role）通过。

## 6. 监控

| 指标 | 含义 | 何时不健康 |
|---|---|---|
| `de_expert_inbox_pending{service}` | 当前 workspace 待审条目数 | 持续 > 20 = ops 漏看 |

Gauge 值 = 「上一次 list / create 调用所在 workspace」的 pending 计数。
要看精确值，调 `GET /api/audit-center?filter=expert_inbox` 或
`GET /api/expert-inbox`。

## 7. 保留期

| 状态 | 保留期 | 何时清理 |
|---|---|---|
| pending | 30 天 | 超期未审 → 触发 alert，ops 决定补审 / 关闭 |
| approved / rejected | 90 天 | 走 `internal/janitor` 清理（W4-D1 接入） |
| dismissed | 30 天 | 同上 |

清理 job 未上线前，ops 可手动清：

```sql
DELETE FROM kv_documents
WHERE collection = 'expert_inbox'
  AND data->>'status' IN ('approved','rejected','dismissed')
  AND (data->>'reviewedAt')::timestamptz < now() - interval '90 days';
```

## 8. 常见故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| 403 on list | caller 没有 `access.write` | 提升角色或换 admin token |
| 404 on review | id 跨 workspace 或不存在 | 调 list 确认 ID + workspace |
| 400 on review | 已 resolved | 开新条目 |
| 400 on review `未知 decision` | decision 拼错 | 只用 `approve` / `reject` / `dismiss` |
| 仪表盘 gauge 一直是 0 | 当前进程没收到 list 调用 | 触发一次 list，或 ping `/api/expert-inbox` |

## 9. 审计

每次 review 写一条：

```
action: "审核 ExpertInbox 项"
target: <item-id>
actor: <reviewer-name>
result: success
reason: <decision>:<newStatus> reviewer=<name>
```

每次 create 写一条：

```
action: "创建 ExpertInbox 项"
target: <item-id>
actor: <caller-name>
result: success
reason: <source>:<severity>
```

通过 `GET /api/audit-center?filter=expert_inbox` 拉取。
