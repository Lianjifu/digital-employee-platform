# 契约缺口对照（Mock vs de-core）

真相源：`frontend/packages/api/src/mock.ts` + 页面 `useApiQuery` 路径。  
目标：`VITE_USE_MOCK=false` 时首屏 GET 非 404，关键写路径语义与 Mock 一致。

## P0（控制台主路径）— 已对齐

| FE / Mock | 状态 |
|-----------|------|
| `POST /api/auth/login` | OK |
| `GET /api/workspaces` 及子资源 | OK |
| `POST /api/workspaces` | OK（创建后并入 ActorExtraWorkspaces） |
| `POST /api/copilot/conversations/:id/stream` | OK（FE `useChat` 在 `VITE_USE_MOCK=false` 时接入 SSE） |
| `GET/PATCH /api/tenant/profile` | OK |
| `PATCH /api/notification-channels/:id` | OK |
| `POST /api/backups` | OK（申请备份） |
| `GET /api/access/governance` | OK |
| `GET /api/zero-trust/*` | OK |
| `GET /api/audit-center` | OK |
| `POST /api/home/alerts/:id/acknowledge` | OK（`/ack` 兼容） |
| `GET /api/digital-employees*` + lifecycle/release/configuration | OK（简化校验） |
| `POST /api/tasks/:id/transition` | OK（`stage`） |
| Models 控制面（providers/routing/governance/audit）字段级 | OK（M0–M7：credential 别名、discover 形状、租户隔离、impact、failover、ModelAudit、预算门禁开关） |
| `GET /api/channel-control/*` | OK |
| `GET /api/sessions`、`/api/conversations/*` | OK |

## P1（能力页）— 最小集已挂载

| FE / Mock | 状态 |
|-----------|------|
| Knowledge 首屏 GET 全集 | OK（种子/空数组） |
| `POST /api/knowledge/docs` + `reindex` → RAG `/v1/ingest` | OK（最小闭环） |
| Workflows `:id`/versions/draft/publish/run | OK（试跑可调 runtime/rag） |
| Skills catalog + governance overview + execute 审计 | OK |
| Memory expire/candidate/approve + refinement | OK |
| Settings notification-channels / api-keys / webhooks-config | OK |

## 仍属后续

- Agents 遗留运行时写路径（import/live calls/evaluations）
- Digital employee 配置边界的完整 Mock 校验规则
- SPIRE SDS / 真 runsc OCI / de-platform·collab 拆分
- 非 Models 域的字段级与 Mock 100% 一致（Models 已字段级对齐）

已推进：控制面持久化、生产禁密码登录、apps 镜像、OPA/OpenSearch、Authentik、观测基线、RunToken HMAC、SPIFFE、路径拆分网关、skill 隔离、**de-policy / de-audit 微服务**、**P3 staging**（`make compose-up-staging` + `.env.staging`）、写路径 `evaluateWrite`（release/employee/skill/workflow）、Copilot/审计失败指标与告警、数字员工配置/上岗门禁向 Mock 靠拢。

回归：`make test` 含 `TestPageSmokeGETs` / `TestEvaluateFailsIncompleteEmployee`。
