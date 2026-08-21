# 数字工作伙伴平台

企业级 **岗位数字工作伙伴** 编排与治理控制台：把大模型、企业知识、技能/工具与工作流，装配为可上岗的数字工作伙伴，在受控边界内完成协作、执行与审计。

> **安全零信任，驱动先进生产力**  
> 持续验证守住身份、权限、数据与执行边界；以能力复用与用量治理，让每一次协同可托付、可度量。

冷启动即带 **办公开箱**（知识 × 技能 × 流程 + `de-office` 办公助手）：制度问答、会议纪要、周报、假勤等场景无需先手工灌库。

| | |
|:--|:--|
| **默认联调** | 真实 API（`VITE_USE_MOCK=false`）→ Vite 代理 `de-gateway :8089` |
| **纯前端演示** | `cd frontend/web && npm run dev:demo` |
| **合规目标** | 等保 3 / ISO 27001 |

---

## 目录

- [产品主轴](#产品主轴)
- [品牌能力支柱](#品牌能力支柱)
- [快速开始](#快速开始)
- [控制台一览](#控制台一览)
- [能力地图](#能力地图)
- [办公开箱](#办公开箱)
- [能力供给（五中心）](#能力供给五中心)
- [功能模块](#功能模块)
- [技术架构](#技术架构)
- [本地部署](#本地部署)
- [验证与常见问题](#验证与常见问题)
- [文档索引](#文档索引)
- [路线图](#路线图)

---

## 产品主轴

一切能力围绕 **一位数字工作伙伴** 运转：先装配可信身份，再进入人机协同，最后沉淀可度量结果。模型 / 知识 / 技能 / 记忆 / 渠道是 **供给**，不是主叙事。

<p align="center">
  <img src="./docs/images/brand/partner-axis.png" alt="数字工作伙伴图" width="100%" />
</p>

| 我们是 | 我们不是 |
|--------|----------|
| 以「谁在岗、能否托付、如何协同」为中心的运营控制面 | 模型广场、Prompt 玩具或裸跑 Agent 控制台 |
| 岗位级工作伙伴：有职责、有边界、有版本、有证据 | 一次性对话机器人 |
| 能力分控制面治理，伙伴只引用已发布版本 | 把模型 / 知识 / 技能堆在同一页里任选即用 |

价值流转：

```text
能力接入（含办公开箱预置） → 装配上岗 → 受控协同（研判 / 执行 / 审核 / 流程） → 运营复盘与审计
```

---

## 品牌能力支柱

企业把大模型推进生产时，常见困境是 **装不起来、管不住、说不清**。三支柱即产品回答：

<p align="center">
  <img src="./docs/images/brand/brand-pillars.png" alt="三大品牌能力支柱" width="100%" />
</p>

| 支柱 | 一句话 | 用户感知 |
|------|--------|----------|
| **安全零信任** | 敢托付 | 「他凭什么能做这件事，出事能否说清」 |
| **先进生产力** | 愿协作 | 「像靠谱同事一样并肩，而不是裸模型」 |
| **成本新范式** | 花得明白 | 「花了多少、换回什么，没有数就不假装有数」 |

---

## 快速开始

本机联调（**monolith** + 真实网关）最短路径：

```bash
# 1) Docker Postgres 16（勿用 Homebrew 抢 5432）
bash scripts/dev-stack/ensure-docker-postgres.sh

# 2) 控制面
cd backend && make compose-up-monolith
curl -sS http://127.0.0.1:8089/healthz

# 3) 前端
cd ../frontend && pnpm install && pnpm --filter web dev
# 打开 http://127.0.0.1:5173 ，用 admin@… 登录（密码任意非空）
```

建议验收：

1. **工作伙伴** → 可见 `de-office` 办公助手  
2. **工作流程 → 流程模板** → 默认「办公通用」；可切「个人创建」  
3. **知识 / 技能中心** → 办公知识包 published；岗位包 `office` 已安装  
4. **专家协作** → 选用办公助手做一次制度问答或纪要类对话  

改 Go 后：`cd backend && make build`，再 `launchctl kickstart -k "gui/$(id -u)/com.digital-employee.dev-stack"`。完整部署见 [本地部署](#本地部署)。

---

## 控制台一览

本地联调（`:5173` → 网关 `:8089`）界面示意（产品截图 2.0）：

| 运营总览 | 专家协作 |
|:-------:|:-------:|
| <img src="./docs/images/product/ops-home.png" alt="运营总览" width="100%" /> | <img src="./docs/images/product/copilot.png" alt="专家协作" width="100%" /> |
| 在岗 KPI、工作伙伴与工作记录直播聚合 | 与在岗伙伴流式协同；问答 / 方案 / 执行 |

| 工作伙伴 | 工作流程 |
|:-------:|:-------:|
| <img src="./docs/images/product/partners.png" alt="工作伙伴" width="100%" /> | <img src="./docs/images/product/workflows.png" alt="工作流程" width="100%" /> |
| 专家目录、上岗状态与进入对话 | 办公开箱流程编排（如 `wf.office.expense_precheck`） |

| 技能中心 |
|:-------:|
| <img src="./docs/images/product/skills.png" alt="技能中心" width="100%" /> |
| 启用清单 / 技能商店 / 平台工具；含办公相关技能 |

原图：[`docs/images/product/`](docs/images/product/)。

---

## 能力地图

从上岗到信任治理，形成可运营的智能协同闭环：

<p align="center">
  <img src="./docs/images/brand/capability-map.png" alt="能力地图" width="100%" />
</p>

| 阶段 | 用户在做什么 | 成熟度摘要 |
|------|--------------|------------|
| **装配上岗** | 定义岗位、绑定能力、评测后上岗 | 控制面可用；含出厂 `de-office` |
| **人机协同** | 与在岗伙伴对话、处置、交接 | 单人审核与 SSE 流式已通 |
| **任务与流程** | 沉淀为任务或确定性流程 | 办公开箱/部门/个人模板；流程技能可发布 |
| **能力供给** | 准备已发布资产 | 五中心控制面可用 |
| **运营度量** | 看在岗、待办、成本与产出 | live-aggregate；无数则显示 `—` |
| **信任治理** | 管权限、策略、证据 | 治理面可用 |

---

## 办公开箱

面向「入职第一天就能干活」：制度问答、会议纪要、周报、文档审阅、假勤出差、报销自查、会议预约、IT 求助、通知拟稿、待办跟催等。部门审批剧目（入职/权限/合同等）仍在内置库中，**不作为办公默认主路径**。

| 入口 | 体验 |
|------|------|
| **工作流程 → 流程模板** | 「平台内置 / 个人创建」；默认筛 **办公通用**；「全部」平铺分页；卡片展示配套知识/技能 |
| **工作伙伴** | 出厂 **办公助手** `de-office` |
| **知识中心** | `kp.office.*` 六包冷启动 published |
| **技能中心** | 岗位包 `office` 对各工作区 `autoInstall` |

| 层 | 源码 | 冷启动 |
|----|------|--------|
| 知识 | `backend/builtin/knowledge/office/` | `EnsureBuiltinKnowledgeReady` |
| 技能 | `office`（`builtin/skills/manifest.json`） | `EnsureBuiltinSkillsReady` |
| 流程 | `wf.office.*` + 部门 Certified + 高级库 | `EnsureBuiltinWorkflowsReady`（不覆盖 `wft-user-*`） |
| 场景三联 | `backend/builtin/scenarios/office/` | 模板卡片标签来源 |
| 伙伴 | `de-office` | 与通用伙伴 ensure 同路径 |

细则：[`docs/环境与数据模式.md`](docs/环境与数据模式.md)。

---

## 能力供给（五中心）

能力分控制面治理；伙伴 **只引用已发布版本**。

<p align="center">
  <img src="./docs/images/brand/five-centers.png" alt="能力供给（五中心）" width="100%" />
</p>

| 中心 | 要点 |
|------|------|
| **模型服务** | 供应商、路由发布/回滚、治理演练、审计 |
| **知识中心** | 资产与知识包、加工检索、图谱与引用；含办公开箱知识 |
| **技能中心** | 清单/商店/MCP、岗位包（`office` / `general`）、流程技能、运行治理 |
| **记忆中心** | 短时 / 工作 / 长期；向知识中心输送候选（需审核） |
| **消息渠道** | 飞书 / 钉钉 / 企微 / 个人微信；投递、健康、死信、审计 |

概念图：[`docs/images/brand/`](docs/images/brand/)。

---

## 功能模块

侧栏按用户工作顺序组织；底层 Agent **不作**一级入口。细则见 [`docs/数字工作伙伴平台-功能模块文档.md`](docs/数字工作伙伴平台-功能模块文档.md)。

```text
运营总览
协作：专家协作 → 任务中心
编排：数字工作伙伴 → 工作流程
能力：模型 → 知识 → 技能 → 记忆 → 渠道
账号：工作区 · 平台设置（访问控制 / 持续验证 / 审计中心）
```

| ID | 模块 | 路由 | 一句话 |
|----|------|------|--------|
| M01 | 运营总览 | `/home` | 直播 KPI、需关注、投入产出、工作记录 |
| M02 | 专家协作 | `/copilot` | 与在岗伙伴会话；研判/执行、审核、交接 |
| M03 | 任务中心 | `/tasks` | 任务生命周期、复核与 SLA |
| M04 | 工作区 | `/workspaces` | 业务域隔离、环境与配额 |
| M05 | 数字工作伙伴 | `/partners` | 岗位装配与上岗；含 `de-office` |
| M06 | 工作流程 | `/workflows` | 办公开箱/部门/个人模板；画布与发布 |
| M07–M11 | 五中心 | `/models` … `/channels` | 已发布资产供给 |
| M12–M15 | 设置与治理 | `/settings` 等 | 组织壳、授权、零信任、审计 |

典型闭环：能力接入 → 装配上岗 → 受控协同 → 运营复盘 / 审计。办公快捷路径：流程模板（办公通用）或直接与 `de-office` 对话。

---

## 技术架构

**控制面管可信与编排，执行面跑推理与工具，网关统一入口。** 默认 monolith：`de-app:8100` + `de-skill-runtime:8093` + `de-gateway:8089`。

详细方案：[`docs/数字工作伙伴平台-架构文档.md`](docs/数字工作伙伴平台-架构文档.md) · [`docs/后端架构规划.md`](docs/后端架构规划.md) · [`backend/deploy/topology-split.md`](backend/deploy/topology-split.md)

### 原则与分层

| 原则 | 含义 |
|------|------|
| 粗粒度部署 | 本地默认 monolith；coarse 四进程可对照 |
| 双栈分工 | Go 控制面；Python 执行面（Agent / RAG / Skill） |
| 网关统一入口 | 浏览器只认 `:8089` |
| 工作区硬隔离 | `x-workspace-id`；跨工作区引用拒绝 |
| 可观测默认开 | `/metrics` + 可选 Prometheus / Grafana |

```text
┌─ L0 控制台  frontend/web (React · Vite · TanStack Query) ─┐
└────────────────────────┬──────────────────────────────────┘
                         │ /api → Vite 代理
┌────────────────────────▼──────────────────────────────────┐
│  de-gateway :8089                                          │
└───────────┬──────────────────────────────┬─────────────────┘
            │ monolith                     │ coarse
            ▼                              ▼
     de-app:8100                    de-sys / collab / cap / workflow
            │
            └──► de-skill-runtime :8093（必须）
```

| 层 | 技术 |
|----|------|
| 前端 | React 18、TypeScript、Vite 5、pnpm、Zustand、React Flow |
| 控制面 | Go 1.24、PostgreSQL、Redis、Connect/Protobuf |
| 执行面 | Python FastAPI（Harness / RAG / Skill） |
| 基建 | Envoy；可选 Dex、OPA、Temporal、Milvus、Vault 等 |

### 仓库结构

```text
digital-employee-platform/
├── frontend/web + packages/   # 控制台
├── backend/
│   ├── cmd/ · internal/       # de-app 等
│   ├── builtin/               # 出厂知识 / 技能 / 流程 / 场景
│   └── deploy/                # compose · envoy
├── scripts/dev-stack/         # LaunchAgent 联调
└── docs/                      # 架构 · 模块 · 环境 · 视觉
```

| 已成立 | 仍在路上 |
|--------|----------|
| monolith 默认 + 真实网关联调 | 组织/个人作用域统一 |
| 工作区隔离与直播运营聚合 | 真 gVisor 沙箱、Temporal/Milvus 生产化 |
| 办公开箱 + PilotDeck 工具链 | Handler 六边形物理迁包 |

---

## 本地部署

两条路径：**Compose**（首次推荐）与 **LaunchAgent**（日常改代码）。均经网关 `:8089`。细则：[`backend/README.md`](backend/README.md) · [`docs/环境与数据模式.md`](docs/环境与数据模式.md)。

### 环境要求

| 依赖 | 说明 |
|------|------|
| Docker / Colima | **唯一**提供 PG / Redis；禁止 Homebrew Postgres 占 5432 |
| Go 1.24+ | 可用 `backend/.tools` |
| Node 20+ · pnpm 11+ | 前端 |
| macOS（可选） | LaunchAgent 常驻 |

```bash
bash scripts/dev-stack/ensure-docker-postgres.sh
# 或 cd backend && make infra-env
```

### 端口

| 服务 | 端口 |
|------|------|
| de-gateway | **8089** |
| de-app（monolith） | 8100 |
| de-skill-runtime | 8093 |
| Vite | 5173 |
| de-workflow（可选） | 8103 |
| coarse sys/collab/cap | 8100–8102 |

### Compose

```bash
cd backend
make compose-up-monolith    # 推荐
# make compose-up-coarse    # 四进程对照
# make compose-up-staging   # 预发拓扑
curl -sS http://127.0.0.1:8089/healthz
```

### LaunchAgent

栈读 `backend/bin/de-*`。改 Go 必须重编再重启：

```bash
cd backend && make build
launchctl kickstart -k "gui/$(id -u)/com.digital-employee.dev-stack"
```

脚本：[`scripts/dev-stack/run-stack.sh`](scripts/dev-stack/run-stack.sh)（默认 `DE_STACK=monolith`，`DE_ENV=development`）。

### 前端与登录

```bash
cd frontend && pnpm install && pnpm --filter web dev
```

```env
# frontend/web/.env.local
VITE_USE_MOCK=false
VITE_API_BASE=
```

| 邮箱前缀 | 角色 | 说明 |
|---------|------|------|
| `admin@` | admin | 全量写权限；上架/上岗可自批 |
| `audit@` | auditor | 治理 / 审计只读 |
| 其他 | user | 协作与任务；写操作须管理员审批 |

默认 `DE_BAN_MOCK_TOKEN=1` 禁止 `mock-*-token`；需 mock 身份时设 `DE_ALLOW_DEMO_TOKEN=1`。业务按 `x-workspace-id` 隔离。

---

## 验证与常见问题

```bash
cd frontend && pnpm --filter web typecheck && pnpm --filter web test
cd ../backend && make test && make test-python && make smoke-monolith
```

| 现象 | 处理 |
|------|------|
| 运营总览仍见演示金额 | `make build` + kickstart；强刷；确认未打到旧进程 |
| 前端像 Mock | `VITE_USE_MOCK=false`，代理指向 `:8089` |
| ACME 演示与真实数据混杂 | `backend/scripts/purge-demo-seed-ids.sql` 后重启 |
| 数据像空库 / 版本不对 | 确认 `127.0.0.1:5432` 为 Docker `de-postgres` 16.x |
| 办公模板 / 知识包缺失 | `make build` 并重启，确认 `EnsureBuiltin*` |
| Go 改了不生效 | 未写入 `backend/bin` 或未重启栈 |
| `E_IDENTITY_MOCK_FORBIDDEN` | `DE_ALLOW_DEMO_TOKEN=1` 或真实登录 |
| `healthz` 失败 | 先起 PG/Redis 与 gateway |

---

## 文档索引

| 文档 | 用途 |
|------|------|
| [`docs/环境与数据模式.md`](docs/环境与数据模式.md) | `DE_ENV`、Postgres、硬删除、岗位包、办公开箱 |
| [`docs/数字工作伙伴平台-功能模块文档.md`](docs/数字工作伙伴平台-功能模块文档.md) | 模块 Tab / 路由 / 成熟度 |
| [`docs/数字工作伙伴平台-架构文档.md`](docs/数字工作伙伴平台-架构文档.md) | L0 / L1 / L2 |
| [`docs/后端架构规划.md`](docs/后端架构规划.md) · [`docs/后端微服务重构方案.md`](docs/后端微服务重构方案.md) | 后端演进 |
| [`backend/deploy/topology-split.md`](backend/deploy/topology-split.md) | 部署拓扑 |
| [`backend/README.md`](backend/README.md) | 控制面命令与 `builtin/` |
| [`docs/视觉设计规范.md`](docs/视觉设计规范.md) | UI 规范 |

---

## 路线图

| 方向 | 说明 |
|------|------|
| 个人 / 组织 / 工作区作用域 | 五中心统一目录与个人绑定 |
| 计量与价值闭环 | 持久 UsageMeters、预算与 ROI |
| 审核与会签 | 多人会签、SoD 与发布审批深链 |
| 记忆与检索生产化 | TTL/日提炼、持久索引与评测流水线 |
| 执行隔离 | 目标 gVisor / runsc 全量沙箱 |
| 工程硬化 | 企业写路径实装、handler 迁包、CI 入库 |
