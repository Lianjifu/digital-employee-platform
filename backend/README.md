# Backend（de-core）

按 [docs/后端架构规划.md](../docs/后端架构规划.md) 落地的控制面。主进程 `de-core` 提供 HTTP `/api/*`；已拆出 `de-policy` / `de-audit` / `de-workflow`；Python 侧车承担 Runtime / RAG / Skill 沙箱。

模块路径：`github.com/digital-employee-platform/backend`（源码在 `backend/`，**不用** `go/` / `python/` 语言目录）。

## 快速开始

> macOS 若系统 Go ≤1.21，可在 `backend/.tools` 放置 Go 1.24+（Makefile 自动优先），或升级系统 Go。

```bash
cd backend && make compose-up   # PostgreSQL :5432 · Redis :6379
make run                         # de-core :8080

# 可选侧车
make runtime   # :8091  OpenAI 兼容：DE_LLM_BASE_URL / DE_LLM_API_KEY / DE_LLM_MODEL
make rag       # :8092  /v1/retrieve · /v1/ingest
make skill     # :8093  RunToken HMAC
```

环境变量见 `deploy/.env.example`。健康检查：`GET http://127.0.0.1:8080/healthz`

### 前端联调

仓库根目录前端**默认真实 API**：

```env
# frontend/web/.env.example
VITE_USE_MOCK=false
VITE_API_BASE=http://127.0.0.1:8080
```

仅无 Mock：`VITE_USE_MOCK=true`。

| 邮箱前缀 | 角色 | 开发 token（`DE_BAN_MOCK_TOKEN=0`） |
|---------|------|-------------------------------------|
| `admin@` | admin | `mock-admin-token` |
| `audit@` | auditor | `mock-auditor-token` |
| 其他 | user | `mock-user-token` |

密码任意非空。预发请用 `make compose-up-staging`（禁 Mock token、强制 OIDC）。

## 结构

```text
backend/
├── api/                # proto · contract-gap
├── cmd/                # de-core · de-policy · de-audit · de-workflow
├── internal/           # auth · store · server · depolicy · deaudit · deworkflow …
├── pkg/ · gen/         # E_* · Connect 生成物
├── runtimes/           # de_agent_runtime · de_rag · de_skill_runtime
├── deploy/             # compose · .env.staging · envoy · obs · de-* /
├── Dockerfile · Makefile · go.mod
└── .tools/             # 仅工具链，非源码
```

## 常用 Compose

| 命令 | 说明 |
|------|------|
| `make compose-up` | PG + Redis |
| `make compose-up-apps` | de-core + 侧车 + de-policy/de-audit |
| `make compose-up-staging` | 硬化预发：apps + Dex + OPA + OpenSearch + obs（`deploy/.env.staging`） |
| `make compose-up-oidc` / `opa` / `search` / `obs` | 单项 profile |
| `make policy` / `audit` / `de-workflow` | 本机进程 |

## 阶段状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| A–E 契约 | 控制台路径对齐 Mock 契约 | **首屏 GET + 关键写可用** |
| M1–M5 | PG/Redis、WorkspaceCtx、OIDC/Vault/Envoy、Connect、DLQ、metrics | **骨架已接线** |
| P0 联调 | Copilot SSE、工作区创建 | **已交付** |
| P1 写路径 | tenant profile、通知渠道、备份申请 | **已交付** |
| P2 执行面 | Runtime 适配、RAG ingest、Skill 审计、Workflow 活动 | **已交付** |
| P3 硬化 | staging、evaluateWrite 扩展、SSE/审计指标告警、DE 门禁 | **已交付** |
| 后续 | de-platform/collab、SPIRE SDS、真 runsc、字段级 100% Mock 对齐 | 未完成 |

契约缺口：[`api/contract-gap.md`](api/contract-gap.md)

## 测试

```bash
cd backend && make test
python3 runtimes/de_rag/test_vector.py
python3 runtimes/de_skill_runtime/test_runtoken.py
```

CI：`.github/workflows/backend-contract.yml`

## 关键环境变量

| 变量 | 说明 |
|------|------|
| `DE_DATABASE_URL` / `DE_REDIS_URL` | PG / Redis |
| `DE_BAN_MOCK_TOKEN` / `DE_FORCE_OIDC` | 禁 mock token / 强制 OIDC |
| `DE_POLICY_URL` / `DE_AUDIT_URL` | de-policy :8094 / de-audit :8095 |
| `DE_OPA_URL` / `DE_OPENSEARCH_URL` | 远程策略 / 审计检索 |
| `DE_AGENT_RUNTIME_URL` / `DE_RAG_URL` / `DE_SKILL_RUNTIME_URL` | 侧车 |
| `DE_LLM_*` | Runtime OpenAI 兼容上游 |
| `DE_SKILL_RUN_SECRET` | Skill RunToken HMAC |
