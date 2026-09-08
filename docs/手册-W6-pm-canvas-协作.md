# W6 协作手册 — PM SOP 计划 + Canvas 协作画布

> 状态：实施就绪
> 日期：2026-09-08
> 前置：ADR-034（PM SOP）+ ADR-035（Canvas）
> 关系：本手册是 W6 两项功能的用户 / 运维配套；不写 ADR 决策

## 1. PM SOP 计划引擎

### 1.1 何时用

PM SOP 是「项目管理模板引擎」：给定模板（agile-sprint / launch-checklist），渲染成 `Plan` + 一组 `Task`，再用事件流驱动 stage / plan 自动完成判定。

适用于：
- 重复执行的项目流程（每周迭代 / 上线回归 / 季度审计）
- 需要 task.* 事件可观察、可统计、可对账的场景

### 1.2 模板

| 模板 ID | 用途 | 典型 stage |
|---|---|---|
| `agile-sprint` | 两周迭代 | planning → in-progress → review → retrospective |
| `launch-checklist` | 上线前 checklist | pre-flight → staging → production → post-mortem |

新模板：`internal/pmsop/templates/<id>.json`，结构：

```json
{
  "id": "my-template",
  "title": "...",
  "stages": [{"name": "...", "tasks": [{"id": "...", "title": "...", "owner": "..."}]}],
  "completion": "all_tasks_done"
}
```

### 1.3 配置

| Env | 默认 | 说明 |
|---|---|---|
| `DE_PMSOP_AUTO_ADVANCE` | _待落地_（预留） | task.complete 是否自动推进 stage；目前 stage 完成判定写死按 `completion` 字段执行 |

### 1.4 路由

| 路由 | 用途 |
|---|---|
| `POST /api/pmsop/plans` | body: `{template, vars, owner}` → 渲染 + 落 plan + 派 task.* 事件 |
| `GET /api/pmsop/plans/<id>` | 取 plan + 当前 stage + 各 task 状态 |
| `POST /api/pmsop/plans/<id>/events` | body: `{type: task.start\|task.complete\|task.block\|task.unblock\|task.note, taskId, note?}` |

### 1.5 现象对照

| 现象 | 可能原因 | 怎么查 |
|---|---|---|
| `template not found` | 拼写错 / 没注册 | `ls internal/pmsop/templates/`；模板 id 必须完全匹配 |
| plan 创建后立刻 plan.completed | 模板 task 全是 optional / completion=always | 改 `completion` 字段或补 task.owner |
| task.complete 没推进 stage | `DE_PMSOP_AUTO_ADVANCE=false` 或 stage 还有未 done task | 看 metrics `de_pmsop_plan_total{action="task.complete"}` 是否 +1 |
| 指标 `de_pmsop_plan_total` 不涨 | 落 plan 后没 emit 任何事件 | `grep pmsop_store.go "Inc("` 确认调用点 |

### 1.6 端到端 smoke

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8089/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"x"}' | jq -r .data.token)

# 1) 创建 plan
PLAN=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"template":"agile-sprint","vars":{"sprint":"2026-Q3-w1"}}' \
  http://127.0.0.1:8089/api/pmsop/plans | jq -r .data.id)

# 2) 推进
TASK=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8089/api/pmsop/plans/$PLAN | jq -r '.data.tasks[0].id')

curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"task.start\",\"taskId\":\"$TASK\"}" \
  http://127.0.0.1:8089/api/pmsop/plans/$PLAN/events

# 3) 看指标
curl -sf http://127.0.0.1:8089/metrics | grep de_pmsop
```

### 1.7 已知边界

- **持久化** — 计划存在 `Store.KnowledgeExtra["pmsop_plans"]`；进程重启不丢
- **并发** — 同 plan 多事件按到达顺序串行处理；事件序号不严格
- **回滚** — `task.unblock` 可重置 `task.block`；但 stage 完成 / plan 完成不可回退（设计上 stage 一旦推进就不撤回）

---

## 2. Canvas 协作画布

### 2.1 何时用

Canvas 是「多人在一张白板上点 pin / 评论」的实时协作。适用于：
- 设计评审（UI 截图点 pin）
- 复盘会（流程图位置评论）
- 任何「左侧页面 / 右侧评论」的 UX 流程

### 2.2 角色 / 权限

| 角色 | 能做什么 |
|---|---|
| `user` | 看 + 评论（默认无 /canvas，需要 admin grant `access.read` 后才能进入；评论需 `canvas.comment`） |
| `admin` | 同 user + 创建 / 删除 board |
| `auditor` | 只读 + 评论（核查场景） |

侧栏入口：admin「编排」组 / auditor「核查」组；user 默认不见。

### 2.3 配置

| Env | 默认 | 说明 |
|---|---|---|
| `DE_CANVAS_COMMENT_TTL` | _空_（永不过期） | `72h` / `30m` 等 — 超过 TTL 的 resolved 评论被 janitor 删除；`action="expired"` 指标可见 |

presence 心跳周期由客户端代码写死 30s、SSE 断线重连 5s（`features/canvas/useCanvasBoard` 内），暂未抽 env flag。

### 2.4 路由

| 路由 | 用途 |
|---|---|
| `GET /api/canvas/boards` | 列出当前 workspace 所有 board |
| `POST /api/canvas/boards` | body: `{title}` 创建 board（admin） |
| `DELETE /api/canvas/boards/<id>` | 删 board + 评论 + presence（admin） |
| `GET /api/canvas/boards/<id>` | 取 board + 评论 + presence 快照 |
| `GET /api/canvas/boards/<id>/stream` | SSE 推 `snapshot / presence / comment / tick` |
| `GET /api/canvas/boards/<id>/comments` | 列出评论 |
| `POST /api/canvas/boards/<id>/comments` | body: `{x, y, text}` 创建评论（需 `canvas.comment`） |
| `PATCH /api/canvas/comments/<id>` | `{status: "resolved" \| "open", text?}` |
| `DELETE /api/canvas/comments/<id>` | 删评论 |

### 2.5 现象对照

| 现象 | 可能原因 | 怎么查 |
|---|---|---|
| `/canvas` 在侧栏不显示 | 当前角色 user / 没 admin grant `access.read` | 切 admin 账号看；或 admin 给当前 user 加 grant |
| 创建 board 返回 403 | 当前角色不是 admin | 切 admin 账号或检查 JWT role |
| SSE 流只收到 snapshot 不更新 | 后端 fanout 死 / workspace 不匹配 | 看 log `canvas broadcaster: publish`；检查 `X-Workspace-Id` header |
| 评论消失 | TTL 过期（`DE_CANVAS_COMMENT_TTL`） | 看 `de_canvas_comment_total{action="expired"}` |
| 多人看到不同评论 | 评论没存到 Store 而只是 fanout 缓存 | 刷新页面；落 Store 由 `internal/canvas.Store.SetComment` 处理 |
| 跨标签不同步 | `VITE_SESSION_SYNC_ENABLED=false` / 浏览器太老 | 看 `useSessionSync.ts` `isSessionSyncEnabled()`；Chromium ≥ 73 / Firefox ≥ 65 |

### 2.6 端到端 smoke

```bash
TOKEN_ADMIN=...
TOKEN_USER=...

# 1) admin 建 board
BOARD=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN_ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"design-review"}' \
  http://127.0.0.1:8089/api/canvas/boards | jq -r .data.id)

# 2) user 评论
curl -sf -X POST -H "Authorization: Bearer $TOKEN_USER" \
  -H 'Content-Type: application/json' \
  -d '{"x":0.3,"y":0.4,"text":"这里字号小"}' \
  http://127.0.0.1:8089/api/canvas/boards/$BOARD/comments

# 3) 看 SSE（带 timeout）
timeout 10 curl -N -H "Authorization: Bearer $TOKEN_USER" \
  http://127.0.0.1:8089/api/canvas/boards/$BOARD/stream
# → event: snapshot → event: presence → event: comment

# 4) 看指标
curl -sf http://127.0.0.1:8089/metrics | grep de_canvas
# → de_canvas_comment_total{action="created"} 1
```

### 2.7 已知边界

- **坐标归一** — `{x, y}` ∈ [0, 1]；前端 `normaliseCoordinate` 强制
- **评论长度** — `MAX_COMMENT_LENGTH = 1000` 字符；前端 composer 限制
- **board 删除** — 软删除不存在；硬删除会清掉整个历史（包括 resolved 评论）
- **跨 workspace** — 不支持；board 严格属于创建它的 workspace
- **进程重启** — board + 评论持久（Store）；presence 不持久（设计取舍；W4-D1 Heartbeat 配套）
- **审计** — 评论生命周期都写 audit；board 创建 / 删除也写

---

## 3. 故障排查矩阵

| 现象 | 段 | 怎么查 |
|---|---|---|
| PM 计划创建成功但 metrics 不涨 | §1 | `de_pmsop_plan_total{action="created"}`；查 `Inc("created")` 调用栈 |
| Canvas 评论 500 | §2 | 看 `internal/canvas/canvas.go` SetComment / PatchComment 入参校验 |
| Canvas SSE 立刻断 | §2 | nginx `proxy_buffering off` + `proxy_read_timeout 120s` |
| 评论过期太快 | §2 | `DE_CANVAS_COMMENT_TTL`；resolved 后才会被扫 |
| PM stage 卡住 | §1 | 同 stage 还有未 done 的 task；用 `task.complete` 而不是 `task.note` |