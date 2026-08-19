# 服务拆分拓扑（粗粒度）

**主路径**：`make compose-up-coarse` → gateway `:8089` → `8100–8103` + FastAPI `8091–8093`。

| 单元 | 端口 | 内含模块 |
|------|------|----------|
| de-gateway | 8089 | Envoy `envoy.coarse.yaml` |
| de-sys | 8100 | platform · ops；**默认仍吸收** policy · audit |
| de-collab | 8101 | collab · employee |
| de-cap | 8102 | model · knowledge · memory · skill · channel |
| de-workflow | 8103 | workflow HTTP + Temporal Worker |
| de-policy（可选） | 8104 | access · zero-trust · `/v1/evaluate` · release-approvals |
| de-audit（可选） | 8105 | audit-center；读 `audit.events` |
| de-agent-runtime / de-rag / de-skill-runtime | 8091–8093 | FastAPI |

已退役：`de-core:8080`、旧细端口 `de-policy:8094` / `de-audit:8095`、`envoy.split.yaml`。

独立 policy/audit：`DE_CROSSCUTTING_SPLIT=1` 加在 de-sys 上，并 `make run-policy` / `make run-audit`。不上 16 微服务。gVisor / Milvus 仍是 cap 后续层，不阻塞本切片。

## 启动

```bash
cd backend && make compose-up-coarse
# FE Vite 默认代理 → :8089
```

## 切流说明

- `ServiceMode` 过滤路由；共享 PG KV 水合。
- collab/cap：`DE_POLICY_URL=http://de-sys:8100`（`/v1/evaluate`）；切开后可改 `http://de-policy:8104`。
- 审计写入：各进程本地 sink（PG / Redis / Kafka / OpenSearch）。独立 de-audit 读 `audit.events`，不另起会签引擎。
- Envoy 使用 Docker DNS：`de-sys` / `de-collab` / `de-cap` / `de-workflow`。
- 多活最小集：`DE_REPLICA_MODE=standby` 拒写；standby 优先 `DE_DATABASE_REPLICA_URL`；`pg_is_in_recovery()` 为真则强制 standby。可选 `make compose-up-replica` 起本机从库 `:5433`。不上 cn-east/south 双活 K8s。
