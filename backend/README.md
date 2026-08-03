# Backend（粗粒度控制面 v4）

按 [docs/后端架构规划.md](../docs/后端架构规划.md) 与 [docs/后端微服务重构方案.md](../docs/后端微服务重构方案.md) 落地。

| 部署单元 | 端口 | 说明 |
|----------|------|------|
| **de-sys** | 8100 | platform · policy · audit · ops |
| **de-collab** | 8101 | collab · employee |
| **de-cap** | 8102 | model · knowledge · memory · skill · channel |
| **de-workflow** | 8103 | workflow HTTP + Temporal Worker |
| de-agent-runtime / de-rag / de-skill-runtime | 8091–8093 | FastAPI 执行面 |
| de-gateway | 8089 | Envoy 粗粒度路由 |
| de-core | 8080 | **过渡兼容壳**（ModeAll） |

模块路径：`github.com/digital-employee-platform/backend`。

## 快速开始

> macOS 若系统 Go ≤1.21，可在 `backend/.tools` 放置 Go 1.24+（Makefile 自动优先）。

```bash
cd backend && make compose-up   # PostgreSQL :5432 · Redis :6379
make run                         # de-core :8080（兼容）

# 粗粒度本机
make run-sys       # :8100
make run-collab    # :8101
make run-cap       # :8102
make run-workflow  # :8103

# 一键 Docker 粗粒度（含 gateway + FastAPI）
make compose-up-coarse

# Python 侧车（FastAPI）
make runtime   # :8091
make rag       # :8092
make skill     # :8093
```

环境变量见 `deploy/.env.example`。

### 前端联调

```env
VITE_USE_MOCK=false
VITE_API_BASE=http://127.0.0.1:8080
# 粗粒度网关：
# VITE_API_BASE=http://127.0.0.1:8089
```

| 邮箱前缀 | 角色 | 开发 token（`DE_BAN_MOCK_TOKEN=0`） |
|---------|------|-------------------------------------|
| `admin@` | admin | `mock-admin-token` |
| `audit@` | auditor | `mock-auditor-token` |
| 其他 | user | `mock-user-token` |

## 结构

```text
backend/
├── cmd/                # de-core · de-sys · de-collab · de-cap · de-workflow · (legacy policy/audit)
├── services/           # 一部署单元一目录（Dockerfile · SERVICE.md · FastAPI）
├── infra/ · obs/       # 基础服务与可观测目录
├── libs/hexkit/        # 六边形层标签
├── internal/           # apprun · server(ServiceMode) · store …
├── runtimes/           # 兼容入口 → services/de-*-runtime
├── deploy/             # compose · envoy.coarse.yaml · topology-split.md
└── Makefile
```

## 常用 Compose

| 命令 | 说明 |
|------|------|
| `make compose-up` | PG + Redis |
| `make compose-up-coarse` | **推荐**：sys/collab/cap/workflow + FastAPI + gateway:8089 |
| `make compose-up-apps` | 兼容：de-core + 侧车 + 可选 policy/audit 细端口 |
| `make compose-up-staging` | 硬化预发 |
| `make policy` / `audit` | 遗留细端口 :8094 / :8095 |

## 阶段状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| PR-A | 目录骨架 · ServiceMode · cmd 归位 | **已交付** |
| PR-B | Python → FastAPI | **已交付** |
| PR-C | de-sys + de-collab 切流 | **已交付** |
| PR-D | de-cap + de-workflow · coarse 默认不启 8094/8095 | **已交付** |

契约：[`api/contract-gap.md`](api/contract-gap.md) · 拓扑：[`deploy/topology-split.md`](deploy/topology-split.md)

## 测试

```bash
cd backend && make test
make test-python
make smoke              # 兼容壳 :8080
make smoke-coarse       # 需先 make compose-up-coarse
```

退役清单：[`services/de-core/RETIRE.md`](services/de-core/RETIRE.md) · 网络：[`deploy/networks.md`](deploy/networks.md)

## 关键环境变量

| 变量 | 说明 |
|------|------|
| `DE_DATABASE_URL` / `DE_REDIS_URL` | PG / Redis |
| `DE_SYS_ADDR` / `DE_COLLAB_ADDR` / `DE_CAP_ADDR` / `DE_WORKFLOW_ADDR` | 粗粒度监听 |
| `DE_SERVICE` | 覆盖 ServiceMode（`sys`/`collab`/`cap`/`workflow`/`all`） |
| `DE_POLICY_URL` | 写路径策略；coarse 下指向 de-sys:8100；空则本地 Engine |
| `DE_AUDIT_URL` | 遗留 de-audit；sys/core 默认本地 sink |
| `DE_AGENT_RUNTIME_URL` / `DE_RAG_URL` / `DE_SKILL_RUNTIME_URL` | 侧车 |
| `DE_LLM_*` | Runtime OpenAI 兼容上游 |
| `DE_SKILL_RUN_SECRET` | Skill RunToken HMAC |
