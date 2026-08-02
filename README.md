# 数字员工平台

企业级数字员工控制台与控制面后端。前端为 React 控制台；后端为 Go 控制面 `de-core`（及 de-policy / de-audit / de-workflow）与 Python Runtime / RAG / Skill 侧车。

**默认联调真实 API**（`VITE_USE_MOCK=false`）。仅本地无后端时才开启 Mock。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite 5、pnpm Workspace、TanStack Query、Zustand、React Flow |
| 控制面 | Go 1.24、Connect/Protobuf、PostgreSQL、Redis |
| 侧车 | Python（agent-runtime / RAG / skill-runtime） |
| 可选基建 | Dex/Authentik OIDC、OPA、OpenSearch、Temporal、Vault、Envoy、Milvus、Kafka |

## 目录结构

```text
digital-employee-platform/
├── frontend/
│   ├── web/                 # React 控制台
│   └── packages/
│       ├── api/             # API Client（可选 Mock）
│       ├── types/ · ui/ · utils/ · hooks/
├── backend/
│   ├── cmd/                 # de-core · de-policy · de-audit · de-workflow
│   ├── internal/ · api/ · pkg/ · gen/
│   ├── runtimes/            # de_agent_runtime · de_rag · de_skill_runtime
│   └── deploy/              # compose · envoy · obs · staging env
└── docs/                    # 架构规划 / 功能规格 / 视觉规范
```

## 快速开始

### 1. 后端

要求：Docker（或 Colima）、Go 1.24+（可用 `backend/.tools` 引导）。

```bash
cd backend
make compose-up    # PostgreSQL :5432 · Redis :6379
make run           # de-core :8080
# 可选侧车
make runtime       # :8091
make rag           # :8092
make skill         # :8093
```

健康检查：`GET http://127.0.0.1:8080/healthz`  
详情见 [`backend/README.md`](backend/README.md)。

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
VITE_API_BASE=http://127.0.0.1:8080
```

使用 Vite 代理时可置空 `VITE_API_BASE=`（`vite.config.ts` 将 `/api` 转到 `127.0.0.1:8080`）。

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
pnpm --filter @de/web-api test   # Mock 适配器单测（可选）

# 后端
cd backend
make test
```

## 已实现能力（摘要）

| 区域 | 说明 |
|---|---|
| 控制台页面 | 运营总览、专家协作、任务、工作区、数字员工、工作流、模型/知识/技能/记忆/渠道、平台设置与治理 |
| 契约联调 | P0/P1 首屏 GET + 关键写路径对齐 de-core；见 [`backend/api/contract-gap.md`](backend/api/contract-gap.md) |
| Copilot | `VITE_USE_MOCK=false` 时走 `/api/copilot/.../stream` SSE（policy→employee→rag→runtime→meter） |
| 策略 / 审计 | 内嵌 baseline + 可选 OPA；de-policy / de-audit 进程；Audit Center 优先 `DE_AUDIT_URL` |
| 执行面 | Runtime OpenAI 兼容适配、RAG ingest、Skill RunToken、Workflow 试跑活动 |
| 观测 | `/metrics` + Prometheus/Grafana；含 Copilot SSE / 审计 fanout 告警 |

## 信息架构

```text
运营总览
协作：专家协作 → 任务中心
编排：数字员工 → 工作流程
能力：模型 · 知识 · 技能 · 记忆 · 渠道
账号：工作区 · 平台设置（访问控制 / 持续验证 / 审计中心）
```

视觉规范：[`docs/视觉设计规范.md`](./docs/视觉设计规范.md)  
后端架构：[`docs/后端架构规划.md`](./docs/后端架构规划.md)

## 角色边界

| 角色 | 能力 |
|---|---|
| 普通用户 | 协作、任务、已授权数字员工与能力页 |
| 管理员 | 另含模型、渠道、工作区、治理与平台设置 |
| 审计用户 | 持续验证与审计中心只读 |

## 当前边界

- 前端默认打真实 de-core；`mock.ts` 仅作可选离线与单测。
- 数据多为控制面内存 + PG 快照（`kv_documents`），非完整关系型业务库。
- LangGraph 全图编排、真 gVisor runsc、SPIRE SDS、de-platform / de-collab 拆分仍属后续。

## 验证提交

```bash
cd frontend && pnpm --filter web typecheck && pnpm --filter web test
cd ../backend && make test
git diff --check
```
