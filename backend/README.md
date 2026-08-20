# Backend（控制面）

按 [docs/后端架构规划.md](../docs/后端架构规划.md) 与 [docs/后端微服务重构方案.md](../docs/后端微服务重构方案.md) 落地。

**本地默认**：**monolith**（`de-app:8100` + `de-skill:8093` + `de-gateway:8089`）。coarse 四进程保留用于规模化对照。

环境与数据模式（`DE_ENV`、seed、硬删除、岗位包）见 [docs/环境与数据模式.md](../docs/环境与数据模式.md)。

| 部署单元 | 端口 | 说明 |
|----------|------|------|
| **de-gateway** | 8089 | Envoy / dev proxy |
| **de-app** | 8100 | **monolith（默认）**：sys + collab + cap |
| **de-sys** | 8100 | platform · policy · audit · ops（coarse 模式） |
| **de-collab** | 8101 | collab · employee（coarse 模式） |
| **de-cap** | 8102 | model · knowledge · memory · skill · channel（coarse 模式） |
| **de-workflow** | 8103 | workflow HTTP + Temporal Worker（可选） |
| de-skill-runtime | 8093 | 技能沙箱（必须） |
| FastAPI 侧车 | 8091–8092 | agent / rag（coarse 或按需；monolith 默认不启 agent） |

已退役：`de-core`、独立 `de-policy:8094`、独立 `de-audit:8095`。

## 快速开始

```bash
cd backend
make compose-up-monolith   # 或 make run（方案 A 默认）
make smoke-monolith        # 经 :8089 验收
```

粗粒度四进程（规模化）：

```bash
make compose-up-coarse
make smoke-coarse
```

本机单进程调试：

```bash
make run-app       # :8100 monolith · DE_ENV=development
make run-demo      # 内存 ACME seed，不写 PG
make run-sys       # :8100 sys only
make run-collab    # :8101
make run-cap       # :8102
make run-workflow  # :8103
make skill         # :8093 沙箱
```

### 前端联调

```env
VITE_USE_MOCK=false
VITE_API_BASE=
# Vite 默认代理 → http://127.0.0.1:8089
```

| 邮箱前缀 | 角色 | token（需 `DE_BAN_MOCK_TOKEN=0` 或 `DE_ALLOW_DEMO_TOKEN=1`） |
|---------|------|--------------------------------|
| `admin@` | admin | `mock-admin-token`（上架/上岗可自批） |
| `audit@` | auditor | `mock-auditor-token` |
| 其他 | user | `mock-user-token`（写操作须管理员审批） |

LaunchAgent 默认 `DE_BAN_MOCK_TOKEN=1`，禁止上述 mock token。

## 结构

```text
backend/
├── cmd/                # de-app · de-sys · de-collab · de-cap · de-workflow
├── services/           # Dockerfile · SERVICE.md · FastAPI · 六边形骨架
├── infra/ · obs/
├── libs/hexkit/
├── internal/           # apprun · runtimeenv · server · store …
├── scripts/            # purge-demo-seed-ids.sql 等
├── runtimes/           # 测试辅助（非部署入口）
├── deploy/             # compose · envoy.coarse.yaml
└── Makefile
```

## Compose

| 命令 | 说明 |
|------|------|
| `make compose-up` | PG + Redis |
| `make compose-up-monolith` / `make run` | **主路径（方案 A）** |
| `make compose-up-coarse` | 四进程 coarse |
| `make compose-up-staging` | coarse + Dex + OPA + OpenSearch + obs |

## 测试

```bash
make test && make test-python && make smoke-monolith
```

网络：[`deploy/networks.md`](deploy/networks.md) · 拓扑：[`deploy/topology-split.md`](deploy/topology-split.md)

## 持久化与硬删除

| 模式 | 行为 |
|------|------|
| `DE_ENV=demo` | 内存 store，不 Persist |
| `development`+ | PG hydrate；Upsert 写回；**硬删必须 `PersistDelete(Sync)`** |

会话 / 消息 / 快照在 kernel 表（`collab.*`）；删除会话需 Sync 删 sessions + conversations + messages + context_snapshots。知识文档、模型供应商、渠道部署、技能卸载、岗位包替换旧 id 等同理。残留 ACME seed：

```bash
psql "$DE_DATABASE_URL" -f scripts/purge-demo-seed-ids.sql
```

## 技能岗位包

| API | 说明 |
|-----|------|
| `GET /api/skills/packs` | 岗位包列表 + 当前工作区 `installed*` + `platformTools` |
| `POST /api/skills/apply-pack/:id` | 安装到当前工作区；`heavy-optin` 须审批单 |
| 冷启动 | `EnsureBuiltinSkillsReady` 为**各工作区**装通用包 |

平台工具（`knowledge.retrieve` 等）为 Harness 内置，不经岗位包安装。

## 专家协作（de-collab）要点

| 能力 | 路由 / 行为 |
|------|-------------|
| 会话 CRUD | `GET/POST/PATCH/DELETE /api/sessions`；非 admin 仅见本人 `ownerId`；DELETE 同步 PersistDelete |
| 对话详情 | `GET /api/conversations/:id`（消息桶按 `conversationId`） |
| 流式回合 | `POST …/stream`；研判模式过滤写工具；结案/交接中拒绝写入 |
| 模式切换 | `PATCH /api/sessions/:id` 写 `sessionMode`；前端乐观更新，失败回滚 |
| 单人审核 | `POST /api/actions/:id/approve`（发起人不可自批）→ `execute` |
| 附件 | `POST/GET /api/attachments`（登录 + 工作区归属校验） |
| 分享 | `POST /api/share`；公开只读 `GET /api/share/:token` |
| 限流 / 安全 | 回合频控、内容安全、`clientMsgId` 幂等；网关 Copilot 超时约 180s |

## 关键环境变量

| 变量 | 说明 |
|------|------|
| `DE_ENV` | `demo` \| `development`（默认）\| `staging` \| `production` |
| `DE_BAN_MOCK_TOKEN` / `DE_BAN_DEMO_TOKEN` | 禁止 mock token；**不**触发双人审批 |
| `DE_ALLOW_DEMO_TOKEN` | `development` 下显式允许演示 token |
| `DE_DATABASE_URL` / `DE_REDIS_URL` | PG / Redis |
| `DE_SYS_ADDR` / `DE_COLLAB_ADDR` / `DE_CAP_ADDR` / `DE_WORKFLOW_ADDR` / `DE_POLICY_ADDR` / `DE_AUDIT_ADDR` | 监听 |
| `DE_SERVICE` | `sys` / `collab` / `cap` / `workflow`；可选 `policy` / `audit` |
| `DE_POLICY_URL` | collab/cap → `http://de-sys:8100`；切开后可改 `http://127.0.0.1:8104`；sys 留空用本地 Engine |
| `DE_CROSSCUTTING_SPLIT` | `1` 时 de-sys 不再吸收 policy/audit 路由与集合 |
| `DE_DATABASE_REPLICA_URL` | `DE_REPLICA_MODE=standby` 时连从库；未设则仍用 `DE_DATABASE_URL`。本机：`make compose-up-replica` → `:5433` |
| `DE_AGENT_RUNTIME_URL` / `DE_RAG_URL` / `DE_SKILL_RUNTIME_URL` | 侧车 |
| `DE_RUNTIME_MODE` | `local`（默认，进程内 Harness）或 `remote`（`POST /v1/run`） |
| `DE_RUNTIME_FAILOVER_LOCAL` | 非生产时 remote 失败可回落 local；生产忽略 |
| `DE_SKILL_TEST_SIM` | 开发默认开；生产强制关闭 |
| `DE_SKILL_RUN_SECRET` | RunToken HMAC |
| `DE_TEMPORAL_HOST` | 非空则流程试运行走 Temporal；未配置则本地 `de-workflow` |
| `DE_TEMPORAL_FAIL_CLOSED` | `1` 强制不可达不回落；生产/staging 默认 fail-closed |
| `DE_MODEL_BUDGET_ENFORCE` | 用量硬门禁；生产默认开，设 `0` 可关 |
| `DE_REPLICA_MODE` | `active`（默认）或 `standby`（拒写，`E_REPLICA_STANDBY`） |
| `DE_INSTANCE_ID` | 实例标识；默认主机名 |
| `DE_EVAL_RECALL_MIN` | 生产知识评测召回门禁，默认 `0.7` |
| `DE_EVAL_SCORE_MIN` | 生产上岗评测分门禁，默认 `80` |
| `DE_ENSURE_GENERAL` | `1` 时非 demo 也可补通用员工 |
