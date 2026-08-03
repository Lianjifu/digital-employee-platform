# 数字员工平台

企业级数字员工控制台与控制面后端。前端为 React 控制台；后端为 **粗粒度 Go 控制面**（de-sys / de-collab / de-cap / de-workflow）与 **FastAPI** 执行面（agent-runtime / RAG / skill-runtime）。`de-core:8080` 仍可作为过渡兼容壳。

**默认联调真实 API**（`VITE_USE_MOCK=false`）。仅本地无后端时才开启 Mock。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite 5、pnpm Workspace、TanStack Query、Zustand、React Flow |
| 控制面 | Go 1.24、Connect/Protobuf、PostgreSQL、Redis（ServiceMode 粗粒度进程） |
| 执行面 | Python FastAPI（agent-runtime / RAG / skill-runtime） |
| 网关 / 基建 | Envoy、Dex/Authentik、OPA、OpenSearch、Temporal、Vault、Milvus、Kafka |

## 后端部署单元（一类一端口）

| 单元 | 端口 | 内含模块 |
|------|------|----------|
| **de-sys** | 8100 | platform · policy · audit · ops |
| **de-collab** | 8101 | collab · employee |
| **de-cap** | 8102 | model · knowledge · memory · skill · channel |
| **de-workflow** | 8103 | workflow HTTP + Temporal Worker |
| de-agent-runtime / de-rag / de-skill-runtime | 8091–8093 | FastAPI |
| de-gateway | 8089 | Envoy 粗粒度路由 |
| de-core | 8080 | 过渡兼容壳（ModeAll） |

方案：[`docs/后端微服务重构方案.md`](docs/后端微服务重构方案.md) · 架构：[`docs/后端架构规划.md`](docs/后端架构规划.md)

## 目录结构

```text
digital-employee-platform/
├── frontend/
│   ├── web/                 # React 控制台
│   └── packages/            # api · types · ui · utils · hooks
├── backend/
│   ├── cmd/                 # de-sys · de-collab · de-cap · de-workflow · de-core …
│   ├── services/            # 一部署单元一目录（Dockerfile · SERVICE.md · FastAPI）
│   ├── infra/ · obs/        # 基础服务与可观测目录
│   ├── internal/            # apprun · server(ServiceMode) · store …
│   ├── runtimes/            # 兼容入口 → services/de-*-runtime
│   └── deploy/              # compose · envoy.coarse.yaml · topology-split
└── docs/                    # 架构规划 / 微服务重构方案 / 功能规格 / 视觉规范
```

## 快速开始

### 1. 后端

要求：Docker（或 Colima）、Go 1.24+（可用 `backend/.tools` 引导）。

```bash
cd backend
make compose-up          # PostgreSQL :5432 · Redis :6379

# 推荐：粗粒度四进程 + FastAPI + gateway
make compose-up-coarse   # :8089 → 8100–8103 + 8091–8093

# 或兼容壳单进程
make run                 # de-core :8080
make runtime && make rag && make skill
```

| 入口 | URL |
|------|-----|
| 粗粒度网关 | `http://127.0.0.1:8089` |
| 兼容壳 | `http://127.0.0.1:8080/healthz` |

详情见 [`backend/README.md`](backend/README.md) · 拓扑 [`backend/deploy/topology-split.md`](backend/deploy/topology-split.md)。

预发硬化栈：

```bash
cd backend && make compose-up-staging   # apps + Dex + OPA + OpenSearch + obs
```

### 2. 前端

要求：Node.js 20+、pnpm 11+。

```bash
cd frontend
pnpm install
pnpm --filter web dev
```

默认访问：<http://localhost:5173>

环境见 [`frontend/web/.env.example`](frontend/web/.env.example)：

```env
VITE_USE_MOCK=false
VITE_API_BASE=
# 粗粒度网关直连示例：
# VITE_API_DIRECT=true
# VITE_API_BASE=http://127.0.0.1:8089
```

开发态默认走同源 `/api`（Vite 代理到 `127.0.0.1:8080`）。需浏览器直连后端时设 `VITE_API_DIRECT=true` 并填写 `VITE_API_BASE`。

演示登录（密码任意非空）：

| 邮箱前缀 | 角色 |
|---------|------|
| `admin@` | admin |
| `audit@` | auditor |
| 其他 | user |

## 常用命令

```bash
# 前端
cd frontend
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web test
pnpm --filter @de/web-api test

# 后端
cd backend
make test
make test-python
make smoke              # BASE 默认 :8080
make smoke-coarse       # 经 gateway :8089（需先 compose-up-coarse）
```

## 已实现能力（摘要）

| 区域 | 说明 |
|---|---|
| 控制台页面 | 运营总览、专家协作、任务、工作区、数字员工、工作流、模型/知识/技能/记忆/渠道、平台设置与治理 |
| 契约联调 | 首屏 GET + 关键写路径；见 [`backend/api/contract-gap.md`](backend/api/contract-gap.md) |
| Copilot | `/api/copilot/.../stream` SSE；回合写入短期记忆 |
| 模型 / 知识 / 技能 / 记忆 / 渠道 | 控制面已对齐 Mock 契约（详见各中心交付说明） |
| 粗粒度切流 | ServiceMode + `compose-up-coarse`；policy evaluate 并入 de-sys；Python→FastAPI |
| 策略 / 审计 | 内嵌 baseline + 可选 OPA；遗留细端口 8094/8095 可选 |
| 观测 | `/metrics`（含 `service` label）+ Prometheus/Grafana |

## 信息架构

```text
运营总览
协作：专家协作 → 任务中心
编排：数字员工 → 工作流程
能力：模型 · 知识 · 技能 · 记忆 · 渠道
账号：工作区 · 平台设置（访问控制 / 持续验证 / 审计中心）
```

视觉规范：[`docs/视觉设计规范.md`](./docs/视觉设计规范.md)

## 角色边界

| 角色 | 能力 |
|---|---|
| 普通用户 | 协作、任务、已授权数字员工与能力页 |
| 管理员 | 另含模型、渠道、工作区、治理与平台设置 |
| 审计用户 | 持续验证与审计中心只读 |

## 当前边界

- 前端默认可打真实 API；`mock.ts` 仅作可选离线与单测。
- 数据多为控制面内存 + PG 快照（`kv_documents`），非完整关系型业务库。
- 记忆审核通过仅创建**草稿知识包**，正式发布仍走知识中心门禁。
- `.github/workflows/` 已加入 `.gitignore`，CI 草稿不入库。
- 六边形目录骨架已就位；handler 仍集中在 `internal/server`，物理迁包与 `de-core` 退役见 [`backend/services/de-core/RETIRE.md`](backend/services/de-core/RETIRE.md)。
- LangGraph 全图编排、真 gVisor runsc、SPIRE SDS 仍属后续。

## 验证提交

```bash
cd frontend && pnpm --filter web typecheck && pnpm --filter web test
cd ../backend && make test && make test-python
git diff --check
```
