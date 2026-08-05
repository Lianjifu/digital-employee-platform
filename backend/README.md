# Backend（粗粒度控制面）

按 [docs/后端架构规划.md](../docs/后端架构规划.md) 与 [docs/后端微服务重构方案.md](../docs/后端微服务重构方案.md) 落地。

| 部署单元 | 端口 | 说明 |
|----------|------|------|
| **de-gateway** | 8089 | Envoy |
| **de-sys** | 8100 | platform · policy · audit · ops |
| **de-collab** | 8101 | collab · employee · 会话治理 / 单人审核 / 附件 / 分享 |
| **de-cap** | 8102 | model · knowledge · memory · skill · channel |
| **de-workflow** | 8103 | workflow HTTP + Temporal Worker |
| FastAPI 执行面 | 8091–8093 | agent-runtime / rag / skill-runtime |

已退役：`de-core`、独立 `de-policy:8094`、独立 `de-audit:8095`。

## 快速开始

```bash
cd backend
make compose-up-coarse   # 或 make run
make smoke               # 经 :8089
```

本机单进程调试：

```bash
make run-sys       # :8100
make run-collab    # :8101
make run-cap       # :8102
make run-workflow  # :8103
make runtime && make rag && make skill
```

### 前端联调

```env
VITE_USE_MOCK=false
VITE_API_BASE=
# Vite 默认代理 → http://127.0.0.1:8089
```

| 邮箱前缀 | 角色 | token（`DE_BAN_MOCK_TOKEN=0`） |
|---------|------|--------------------------------|
| `admin@` | admin | `mock-admin-token` |
| `audit@` | auditor | `mock-auditor-token` |
| 其他 | user | `mock-user-token` |

## 结构

```text
backend/
├── cmd/                # de-sys · de-collab · de-cap · de-workflow
├── services/           # Dockerfile · SERVICE.md · FastAPI · 六边形骨架
├── infra/ · obs/
├── libs/hexkit/
├── internal/           # apprun · server(ServiceMode) · store …
├── runtimes/           # 测试辅助（非部署入口）
├── deploy/             # compose · envoy.coarse.yaml
└── Makefile
```

## Compose

| 命令 | 说明 |
|------|------|
| `make compose-up` | PG + Redis |
| `make compose-up-coarse` / `make run` | **主路径** |
| `make compose-up-staging` | coarse + Dex + OPA + OpenSearch + obs |

## 测试

```bash
make test && make test-python && make smoke
```

网络：[`deploy/networks.md`](deploy/networks.md) · 拓扑：[`deploy/topology-split.md`](deploy/topology-split.md)

## 专家协作（de-collab）要点

| 能力 | 路由 / 行为 |
|------|-------------|
| 会话 CRUD | `GET/POST/PATCH/DELETE /api/sessions`；非 admin 仅见本人 `ownerId` |
| 对话详情 | `GET /api/conversations/:id`（消息桶按 `conversationId`） |
| 流式回合 | `POST …/stream`；研判模式过滤写工具；结案/交接中拒绝写入 |
| 单人审核 | `POST /api/actions/:id/approve`（发起人不可自批）→ `execute` |
| 附件 | `POST/GET /api/attachments`（登录 + 工作区归属校验） |
| 分享 | `POST /api/share`；公开只读 `GET /api/share/:token` |
| 限流 / 安全 | 回合频控、内容安全、`clientMsgId` 幂等；网关 Copilot 超时约 180s |

## 关键环境变量

| 变量 | 说明 |
|------|------|
| `DE_DATABASE_URL` / `DE_REDIS_URL` | PG / Redis |
| `DE_SYS_ADDR` / `DE_COLLAB_ADDR` / `DE_CAP_ADDR` / `DE_WORKFLOW_ADDR` | 监听 |
| `DE_SERVICE` | `sys` / `collab` / `cap` / `workflow` |
| `DE_POLICY_URL` | collab/cap → `http://de-sys:8100`；sys 留空用本地 Engine |
| `DE_AGENT_RUNTIME_URL` / `DE_RAG_URL` / `DE_SKILL_RUNTIME_URL` | 侧车 |
| `DE_SKILL_RUN_SECRET` | RunToken HMAC |
