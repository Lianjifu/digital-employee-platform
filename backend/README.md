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
| Models M0–M7 | 契约/租户隔离/Vault 凭据/真探活/路由门禁/审计预算/持久化指标 | **已交付** |
| Knowledge | 知识包/文档/来源/RAG/评测/治理；与 Mock 字段级对齐 | **已交付** |
| Skills P0–P3 | 商店货源、晋升上架、Registry 同步门禁、包导入、RunToken 试跑 | **已交付** |
| Memory P0–P3 | 状态契约、approve→草稿知识包、TTL/容量、会话/任务运行时写入 | **已交付** |
| 后续 | de-platform/collab、SPIRE SDS、真 runsc | 未完成 |

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
| `DE_VAULT_*` / `DE_REQUIRE_VAULT` | 模型凭据；staging/prod 建议开启 Require |
| `DE_MODEL_PROBE_TIMEOUT` | 探活超时秒数（默认 8） |
| `DE_MODEL_ALLOW_PRIVATE` | 允许探活/discover 访问内网（ollama） |
| `DE_MODEL_DISCOVER_FALLBACK` | 远端解析失败时回落静态目录（默认 1） |
| `DE_MODEL_BUDGET_ENFORCE` | Copilot 用量硬门禁（默认 0） |
| `DE_SKILL_RUN_SECRET` | Skill RunToken HMAC |
| `DE_SKILL_TEST_SIM` | skill-runtime 不可达时是否允许本地仿真（生产建议 `0`） |

### 模型服务（生产语义）

- 契约真相源：`frontend/packages/api/src/mock.ts`；实现：`internal/server/handlers_models.go` + `internal/modelprov/`
- 凭据：请求体 `credential`（兼容 `apiKey`）→ Vault；落库仅 `credentialRef` / `credentialMasked`
- 写路径校验 workspace + `model.write`；删除前 impact；路由 validate→ready→publish；failover 返回 `fromModelId`/`toModelId`
- 持久化：`model_providers` / `routing_policies` / `policy_versions` / `model_audit` / `model_budgets`
- 指标：`de_model_provider_probe_*`、`de_model_vault_errors_total`、`de_model_policy_publish_total`、`de_model_budget_denies_total`

### 知识 / 技能 / 记忆

| 域 | 关键实现 | 说明 |
|---|---|---|
| Knowledge | `handlers_knowledge.go` | 知识包草稿→发布门禁；文档软删；来源同步；RAG ingest/retrieve |
| Skills | `handlers_skills*.go` · `skill_package.go` | catalog/sync/publish；`.skill`/`.zip`/`.tgz` 导入；治理熔断与沙箱试跑 |
| Memory | `handlers_memory.go` · `memory_ttl.go` | overview/records/candidates/policy/audit；approve 创建草稿知识包；60s TTL；Copilot→短期、任务 completed/review→工作记忆 |

持久化集合另含：`memory_records` / `memory_candidates` / `memory_policies` / `memory_audits`、`skill_catalog` / `skill_extra`、`knowledge_extra`。
