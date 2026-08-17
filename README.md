# 数字员工平台

企业级数字员工控制台与控制面后端。前端为 React 控制台；后端为 **粗粒度 Go 控制面**（de-sys / de-collab / de-cap / de-workflow）与 **FastAPI** 执行面（agent-runtime / RAG / skill-runtime），经 **de-gateway :8089** 统一入口。

**默认联调真实 API**（`VITE_USE_MOCK=false`，Vite 代理 → `:8089`）。仅本地无后端时才开启 Mock。

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
| **de-gateway** | 8089 | Envoy 粗粒度路由 |
| **de-sys** | 8100 | platform · policy · audit · ops |
| **de-collab** | 8101 | collab · employee · 会话治理 / 审批 / 附件 / 分享 |
| **de-cap** | 8102 | model · knowledge · memory · skill · channel |
| **de-workflow** | 8103 | workflow HTTP + Temporal Worker |
| de-agent-runtime / de-rag / de-skill-runtime | 8091–8093 | FastAPI |

方案：[`docs/后端微服务重构方案.md`](docs/后端微服务重构方案.md) · 架构：[`docs/后端架构规划.md`](docs/后端架构规划.md)

> 已退役：`de-core:8080`、细端口 `de-policy:8094` / `de-audit:8095`（能力并入 de-sys）。

## 目录结构

```text
digital-employee-platform/
├── frontend/
│   ├── web/                 # React 控制台
│   └── packages/            # api · types · ui · utils · hooks
├── backend/
│   ├── cmd/                 # de-sys · de-collab · de-cap · de-workflow
│   ├── services/            # 一部署单元一目录（Dockerfile · SERVICE.md · FastAPI）
│   ├── infra/ · obs/        # 基础服务与可观测目录
│   ├── internal/            # apprun · server(ServiceMode) · store …
│   ├── runtimes/            # 测试辅助（向量 / RunToken 单测）
│   └── deploy/              # compose · envoy.coarse.yaml · topology-split
├── scripts/dev-stack/       # 本机 LaunchAgent 粗粒度联调栈
└── docs/
```

## 快速开始

### 1. 后端

要求：Docker（或 Colima）、Go 1.24+（可用 `backend/.tools` 引导）。

```bash
cd backend
make compose-up-coarse   # PG/Redis + 四 Go 进程 + FastAPI + gateway:8089
# 等价：make run
```

健康检查：`GET http://127.0.0.1:8089/healthz`  
详情：[`backend/README.md`](backend/README.md) · [`backend/deploy/topology-split.md`](backend/deploy/topology-split.md)

本机常驻联调（可选）：LaunchAgent `com.digital-employee.dev-stack` → [`scripts/dev-stack/run-stack.sh`](scripts/dev-stack/run-stack.sh)（collab `8101`、cap `8102`、gateway `8089`、vite `5173`）。

预发：

```bash
cd backend && make compose-up-staging
```

### 2. 前端

要求：Node.js 20+、pnpm 11+。

```bash
cd frontend
pnpm install
pnpm --filter web dev
```

默认访问：<http://localhost:5173>  
开发态同源 `/api` 由 Vite 代理到 `http://127.0.0.1:8089`。

```env
VITE_USE_MOCK=false
VITE_API_BASE=
# 直连：VITE_API_DIRECT=true  VITE_API_BASE=http://127.0.0.1:8089
```

演示登录（密码任意非空）：`admin@` / `audit@` / 其他。

| 邮箱前缀 | 角色 | 说明 |
|---------|------|------|
| `admin@` | admin | 可见工作区全部会话 |
| `audit@` | auditor | 治理 / 审计视角 |
| 其他 | user | 仅本人 `ownerId` 会话 |

## 常用命令

```bash
cd frontend && pnpm --filter web typecheck && pnpm --filter web test
cd ../backend && make test && make test-python && make smoke
```

## 已实现能力（摘要）

| 区域 | 说明 |
|---|---|
| 控制台 | 运营、协作、任务、员工、工作流、模型/知识/技能/记忆/渠道、治理 |
| 运营总览 | SaaS 运营台：KPI / 需关注 / 投入产出 / 工作记录；`GET /api/home/extra`、`/api/home/kpis`、`/api/operations/overview` 为 **live-aggregate**（员工·任务·会话同源） |
| 首页计量诚实性 | 成本仅在 `costMonth.source=usage-meters` 时展示；无计量显示 `—`；告警由复核/SLA/P0 **任务**衍生，不用 HomeAlerts / Billing 演示种子 |
| 专家协作 | 研判 / 受控执行（`setCollaborationMode` 乐观更新 + PATCH，失败回滚）、岗位专家改绑、结案与交接；发送乐观追加与 SSE 流式；GFM 表格可读渲染 |
| 会话治理 | `sessionMode` / `riskLevel` / handoff / closed；结案后拒绝写入；工具按模式过滤 |
| 人工审核 | **单人人工审核**（发起人不可自批）；待审 → SSE `authorization` → 批准执行 |
| 附件 / 分享 | `/api/attachments` 上传下载（登录 + 工作区校验）；`/api/share` 与只读页 `/copilot/share/:token` |
| 会话历史 | `/api/sessions` 权威列表；在线回合本地消息权威（typing/streaming/本地超前时跳过陈旧 conversation 回写）；空闲后 `mergeConversationMessages` 对齐服务端终态 |
| 七架构运行时 | Harness（Direct / ReAct / Plan-Exec）+ 反射 + 记忆溯源 + 自进化候选 |
| 技能产物 | 技能调用可产出可下载制品（含 docx 等） |
| 粗粒度切流 | ServiceMode + gateway；policy evaluate / 审计在 de-sys |
| 审计 / 持续验证 | 审计中心与零信任页与控制台壳层对齐；授权与临时授权可读处置 |
| 飞书渠道 | App ID/Secret→Vault；verify=tenant_access_token+bot/v3/info；Webhook `/api/channel/feishu/events/{id}` |
| 钉钉渠道 | Client ID/Secret；verify=oauth2/accessToken；默认 Stream；可选 HTTP Webhook |
| 企微渠道 | 自建应用 CorpId/Secret/AgentId + 回调加解密；或智能机器人 WebSocket |
| 个人微信 | ilink Token；verify=getUpdates；出站需 context_token；长轮询侧车 |
| 执行面 | FastAPI Runtime / RAG / Skill（隔离网） |
| 观测 | `/metrics`（`service` label）+ Prometheus/Grafana；Copilot 流式超时网关约 180s |

## 当前边界

- 数据多为控制面内存 + PG 快照（`kv_documents`）；消息按 `conversationId` 分桶持久化。
- 专家协作在线回合：**本地消息时间线权威**；治理字段（mode/risk/handoff）以 Session PATCH 为准，消息 hydrate 不得覆盖。
- **能力五中心**（模型 / 知识 / 技能 / 记忆 / 渠道）主隔离为 **工作区**（`workspaceId`）；记忆有 `scope=user|team|workspace|agent` 标签，技能商店有 `visibilityScope`，**尚未**统一「个人配置 vs 组织配置」产品面。
- 运营总览空工作区会显示真实 0 / `—`；有种子任务的工作区「需关注」来自任务状态，不是演示告警文案。
- 本机联调改 Go 后需 `go build -o backend/bin/de-*` 再重启栈（LaunchAgent 读 `backend/bin`，勿只编到 `/tmp`）。
- 六边形目录骨架已就位；handler 仍集中在 `internal/server`（物理迁包后续）。
- `.github/workflows/` 不入库。
- LangGraph 全图、真 runsc、SPIRE SDS 仍属后续。
- 企业写操作部分路径仍返回 `not_implemented`；白名单技能可真执行。

## 验证提交

```bash
cd frontend && pnpm --filter web typecheck && pnpm --filter web test
cd ../backend && make test && make test-python
git diff --check
```
