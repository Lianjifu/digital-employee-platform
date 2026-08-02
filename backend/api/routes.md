# API 路由清单（对齐 Mock）

响应信封：`{ "ok": true, "data": ... }` / `{ "ok": false, "error": { "code", "message" } }`。

认证：`Authorization: Bearer <token>`；工作区：`x-workspace-id`。

## 地基 / 治理

| Method | Path |
|--------|------|
| POST | `/api/auth/login` |
| GET/POST | `/api/workspaces` |
| GET | `/api/workspaces/:id/{members,quota,…}` |
| GET | `/api/access/governance` |
| GET/PATCH | `/api/zero-trust/*` |
| GET | `/api/audit-center` |

## 数字员工 / 任务

| Method | Path |
|--------|------|
| GET/POST | `/api/digital-employees` |
| GET | `/api/digital-employees/overview` |
| POST | `/api/digital-employees/:id/{lifecycle,release,evaluate,configuration,…}` |
| GET/POST | `/api/tasks`、`/api/tasks/:id/transition` |

## 模型 / 渠道（Mock 命名）

| Method | Path |
|--------|------|
| GET/POST | `/api/model-providers` |
| POST | `/api/model-providers/discover-models` → `{ models:[{id,name}], source, suggestedProtocol, … }`（真实拉取） |
| POST | `/api/model-providers/test-connection` → `{ status:healthy, latencyMs }`（接入前探活，不落库） |
| GET | `/api/model-providers/:id/impact` |
| POST | `/api/model-providers/:id/{test,disable}` |
| PATCH/DELETE | `/api/model-providers/:id` |
| GET/POST | `/api/model-routing/policies` |
| PATCH | `/api/model-routing/policies/:id/draft` |
| POST | `/api/model-routing/policies/:id/{validate,publish,rollback}` |
| GET | `/api/model-routing/policies/:id/versions` |
| POST | `/api/model-routing/failover-tests` → `{ fromModelId, toModelId, correlationId, status }` |
| GET | `/api/model-governance/overview`、`/api/model-audit` |
| GET/POST | `/api/channel-control/deployments`、`policies` |
| GET | `/api/channel-control/overview`、`dead-letters`、`audit` |

模型错误码：`E_PROVIDER_*`、`E_POLICY_*`、`E_BUDGET_EXCEEDED`、`E_EGRESS_BLOCKED`、`E_RATE_LIMITED` 等（见 `pkg/errors`）。

## 协作

| Method | Path |
|--------|------|
| GET | `/api/sessions`、`/api/slash-commands` |
| GET/POST | `/api/conversations`、`/api/conversations/:id`、`…/stream` |
| GET/POST | `/api/copilot/conversations`、`/api/copilot/conversations/:id`、`…/messages`、`…/stream`（SSE；Connect：`/connect/de.collab.v1.CollabService/*`） |

## 能力页最小集

| Method | Path |
|--------|------|
| GET | `/api/knowledge/{docs,packages,sources,governance,…}` |
| GET/POST | `/api/workflows`、`/api/workflows/:id/{draft,publish,run,versions}` |
| GET | `/api/skills`、`/api/skills/catalog`、`/api/skills/governance/overview` |
| GET/POST | `/api/memory/*` |
| GET | `/api/billing`、`/api/backups`、`/api/notification-channels`、`/api/api-keys`、`/api/webhooks-config` |
| POST | `/api/backups`、`/api/backups/:id/{approve,reject,restore-drill}`（双签 / 恢复演练） |
| GET | `/api/operations/overview`、`/api/home/kpis`（live-aggregate） |
| GET | `/metrics`（Prometheus 文本；OTel 桥后续） |

拆分与 mTLS 目标见 [`deploy/topology-split.md`](../deploy/topology-split.md)。  
详见 [`contract-gap.md`](contract-gap.md)。
