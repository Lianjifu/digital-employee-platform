# 数字员工平台

企业级 **岗位数字员工** 编排与治理控制台：把大模型、企业知识、技能/工具与工作流装配为可上岗的数字劳动力，在受控边界内完成协作、执行与审计。

**默认联调真实 API**（`VITE_USE_MOCK=false`，Vite 代理 → `de-gateway :8089`）。仅本地无后端时才开启 Mock。

配套文档：[`docs/数字员工平台-架构文档.md`](docs/数字员工平台-架构文档.md) · [`docs/数字员工平台-功能模块文档.md`](docs/数字员工平台-功能模块文档.md) · [`docs/后端架构规划.md`](docs/后端架构规划.md) · [`docs/视觉设计规范.md`](docs/视觉设计规范.md)

---

## 1. 产品背景

企业落地 AI Agent 常见卡在三点：**能力散落难装配、生产写操作不可控、结果难审计**。本平台以「数字员工」为劳动力单元，而不是以模型或工具市场为中心：

| 痛点 | 平台应对 |
|------|----------|
| 岗位能力难复制 | 数字员工全生命周期：岗位配置 → 能力装配 → 评测上岗 → 运行运营 |
| 生产变更高风险 | 研判 / 受控执行、人工审核、零信任持续验证、职责分离 |
| 知识与技能失控 | 模型 / 知识 / 技能 / 记忆 / 渠道分控制面，员工只引用已发布版本 |
| 成本与效果说不清 | 运营总览直播聚合任务与计量；无真实计量时诚实显示 `—` |
| 合规与追溯 | 审计中心、关联 ID、凭据掩码；目标对齐等保 3 / ISO 27001 |

产品主轴：

```text
数字员工（岗位劳动力）
  ├── 可信：身份、权限、策略、审核、审计
  ├── 协同：会话、任务、交接、人机分工
  └── 可度量：用量、产出、工作区隔离
```

---

## 2. 产品功能

### 2.1 已实现

| 能力 | 说明 |
|------|------|
| 运营总览 | SaaS 运营台（KPI / 需关注 / 投入产出 / 工作记录）；`/api/home/extra`、`/api/home/kpis`、`/api/operations/overview` 为 **live-aggregate**（员工·任务·会话同源） |
| 计量诚实性 | 成本仅在 `costMonth.source=usage-meters` 时展示；告警由复核/SLA/P0 **任务**衍生，不用演示 Billing / HomeAlerts |
| 专家协作 | 研判 / 受控执行、岗位改绑、结案与交接；乐观更新 + SSE 流式；GFM 可读渲染 |
| 会话治理 | `sessionMode` / `riskLevel` / handoff / closed；结案后拒绝写入；工具按模式过滤 |
| 人工审核 | 单人审核（发起人不可自批）；待审 → SSE `authorization` → 批准执行 |
| 任务中心 | 受控任务生命周期、复核与 SLA 风险入口 |
| 数字员工 | 岗位档案、能力装配、上岗门禁与运营视图 |
| 工作流程 | 模板 / 画布 / 版本；可发布为流程技能 |
| 能力五中心 | 模型接入与路由、知识资产与检索、技能商店与治理、三层记忆与晋升候选、渠道部署（飞书 / 钉钉 / 企微 / 个人微信） |
| 附件与分享 | `/api/attachments`；`/api/share` 与只读页 `/copilot/share/:token` |
| 七架构运行时 | Harness（Direct / ReAct / Plan-Exec）+ 反射 + 记忆溯源 + 自进化候选 |
| 技能产物 | 技能调用可产出可下载制品（含 docx 等） |
| 工作区与平台设置 | 工作区切换与配额环境；租户组织壳；访问控制 / 持续验证 / 审计中心 |
| 粗粒度后端 | de-sys / de-collab / de-cap / de-workflow + FastAPI 执行面，经 gateway `:8089` 切流 |
| 观测 | `/metrics`（`service` label）+ Prometheus/Grafana；Copilot 流式超时网关约 180s |

### 2.2 待实现

| 能力 | 说明 |
|------|------|
| 个人 vs 组织配置 | 五中心统一 `tenant / workspace / user` 作用域、组织批准目录、个人绑定与偏好（方案已定，未落地） |
| 持久化 UsageMeters / 计费闭环 | 首页成本依赖真实计量写入；目前无计量则诚实为空 |
| 双人 / 多人会签生产化 | 当前人工审核以单人路径为主；完整双签与 SoD 深链仍需加固 |
| 检索与记忆的生产调度 | 记忆 TTL / 日提炼、RAG 评测与图谱的调度器与持久索引 |
| 真沙箱执行 | 白名单技能可执行；目标 runsc / gVisor 全量隔离未交付 |
| LangGraph 全图编排 | 七架构已落地 Harness 主路径；全图编排与 SPIRE SDS 属后续 |
| Handler 物理迁包 | 六边形目录骨架已就位；handler 仍集中在 `internal/server` |
| 企业写操作全量实装 | 部分路径仍返回 `not_implemented` |
| CI 工作流入库 | `.github/workflows/` 当前不入库 |
| 跨工作区组织目录 | 技能 `visibilityScope=org` 等仍需按租户真正隔离与下发 |

---

## 3. 技术架构

### 3.1 分层

```text
┌─────────────────────────────────────────────────────────┐
│  控制台 frontend/web（React 18 + Vite + TanStack Query） │
└───────────────────────────┬─────────────────────────────┘
                            │ /api（Vite 代理）
┌───────────────────────────▼─────────────────────────────┐
│  de-gateway :8089（Envoy 粗粒度路由）                      │
└───┬──────────┬──────────┬──────────┬────────────────────┘
    │          │          │          │
 de-sys     de-collab   de-cap    de-workflow
 :8100       :8101      :8102      :8103
 platform    collab     model      workflow
 policy      employee   knowledge  + Temporal Worker
 audit/ops   会话治理   memory/skill/channel
    │          │          │
    └──────────┴──────────┴──► FastAPI 执行面 :8091–8093
                               agent-runtime / RAG / skill-runtime
```

| 层 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite 5、pnpm Workspace、TanStack Query、Zustand、React Flow |
| 控制面 | Go 1.24、Connect/Protobuf、PostgreSQL、Redis（ServiceMode 粗粒度进程） |
| 执行面 | Python FastAPI（agent-runtime / RAG / skill-runtime） |
| 网关 / 基建 | Envoy、Dex/Authentik、OPA、OpenSearch、Temporal、Vault、Milvus、Kafka |

### 3.2 部署单元

| 单元 | 端口 | 内含模块 |
|------|------|----------|
| **de-gateway** | 8089 | Envoy 粗粒度路由 |
| **de-sys** | 8100 | platform · policy · audit · ops |
| **de-collab** | 8101 | collab · employee · 会话治理 / 审批 / 附件 / 分享 |
| **de-cap** | 8102 | model · knowledge · memory · skill · channel |
| **de-workflow** | 8103 | workflow HTTP + Temporal Worker |
| de-agent-runtime / de-rag / de-skill-runtime | 8091–8093 | FastAPI |

方案：[`docs/后端微服务重构方案.md`](docs/后端微服务重构方案.md) · [`docs/后端架构规划.md`](docs/后端架构规划.md)

> 已退役：`de-core:8080`、细端口 `de-policy:8094` / `de-audit:8095`（能力并入 de-sys）。

### 3.3 仓库结构

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

### 3.4 关键边界（架构）

- 数据多为控制面内存 + PG 快照（`kv_documents`）；消息按 `conversationId` 分桶持久化。
- 专家协作在线回合：**本地消息时间线权威**；治理字段以 Session PATCH 为准。
- 能力五中心主隔离为 **工作区**（`workspaceId`）；尚未统一个人 / 组织配置面。
- 本机改 Go 后需 `go build -o backend/bin/de-*` 再重启栈（LaunchAgent 读 `backend/bin`）。

---

## 4. 功能模块

导航 IA 与侧栏一致：

```text
运营总览
协作：专家协作 → 任务中心
编排：数字员工 → 工作流程
能力：模型服务 → 知识中心 → 技能中心 → 记忆中心 → 消息渠道
账号菜单：工作区 · 平台设置（组织/身份/保留/集成/用量 + 访问控制/持续验证/审计）
```

| ID | 模块 | 路由 | 一句话 |
|----|------|------|--------|
| M01 | 运营总览 | `/home` | 直播 KPI、待办、投入产出与工作记录 |
| M02 | 专家协作 | `/copilot` | 与岗位数字员工协同；证据与审核 |
| M03 | 任务中心 | `/tasks` | 任务生命周期与人工治理 |
| M04 | 工作区 | `/workspaces` | 业务域空间与配额环境 |
| M05 | 数字员工 | `/agents` | 岗位配置 · 装配 · 上岗 · 运营 |
| M06 | 工作流程 | `/workflows` | 模板 · 画布 · 版本 · 发布技能 |
| M07 | 模型服务 | `/models` | 供应商 · 路由 · 治理 · 审计 |
| M08 | 知识中心 | `/knowledge` | 资产 · 加工 · 评测 · 图谱 · 引用 |
| M09 | 技能中心 | `/skills` | 清单 · 商店 · 集成 · 运行治理 |
| M10 | 记忆中心 | `/memory` | 三层记忆 · 候选 · 策略审计 |
| M11 | 消息渠道 | `/channels` | 接入 · 路由 · 健康 · 死信 · 审计 |
| M12 | 平台设置 | `/settings` | 租户与套餐；聚合三项治理 |
| M13 | 访问控制 | settings / 独立 | 授权 · 发布审批 · SoD |
| M14 | 持续验证 | settings / 独立 | 零信任策略与事件 |
| M15 | 审计中心 | settings / 独立 | 只读追溯与脱敏导出 |

控制型模块二级菜单顺序：`概览或资产 → 接入与配置 → 验证与发布 → 运行与处置 → 治理与审计`。

模块细则见 [`docs/数字员工平台-功能模块文档.md`](docs/数字员工平台-功能模块文档.md)。

---

## 5. 部署步骤

### 5.1 环境要求

| 依赖 | 版本 / 说明 |
|------|-------------|
| Docker 或 Colima | 拉起 PG / Redis 与 compose 拓扑 |
| Go | 1.24+（可用 `backend/.tools` 引导） |
| Node.js | 20+ |
| pnpm | 11+ |

### 5.2 后端（推荐 compose）

```bash
cd backend
make compose-up-coarse   # PG/Redis + 四 Go 进程 + FastAPI + gateway:8089
# 等价：make run
```

健康检查：`GET http://127.0.0.1:8089/healthz`  
详情：[`backend/README.md`](backend/README.md) · [`backend/deploy/topology-split.md`](backend/deploy/topology-split.md)

预发：

```bash
cd backend && make compose-up-staging
```

### 5.3 本机常驻联调（可选）

LaunchAgent `com.digital-employee.dev-stack` → [`scripts/dev-stack/run-stack.sh`](scripts/dev-stack/run-stack.sh)  
常用端口：collab `8101`、cap `8102`、gateway `8089`、vite `5173`。

修改 Go 代码后：

```bash
cd backend
go build -o bin/de-sys ./cmd/de-sys
go build -o bin/de-collab ./cmd/de-collab
go build -o bin/de-cap ./cmd/de-cap
go build -o bin/de-workflow ./cmd/de-workflow
launchctl kickstart -k "gui/$(id -u)/com.digital-employee.dev-stack"
```

### 5.4 前端

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

演示登录（密码任意非空）：

| 邮箱前缀 | 角色 | 说明 |
|---------|------|------|
| `admin@` | admin | 可见工作区全部会话 |
| `audit@` | auditor | 治理 / 审计视角 |
| 其他 | user | 仅本人 `ownerId` 会话 |

### 5.5 验证

```bash
cd frontend && pnpm --filter web typecheck && pnpm --filter web test
cd ../backend && make test && make test-python && make smoke
git diff --check
```
