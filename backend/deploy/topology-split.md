# 服务拆分拓扑（粗粒度）

**主路径**：`make compose-up-coarse` → gateway `:8089` → `8100–8103` + FastAPI `8091–8093`。

| 单元 | 端口 | 内含模块 |
|------|------|----------|
| de-gateway | 8089 | Envoy `envoy.coarse.yaml` |
| de-sys | 8100 | platform · policy · audit · ops |
| de-collab | 8101 | collab · employee |
| de-cap | 8102 | model · knowledge · memory · skill · channel |
| de-workflow | 8103 | workflow HTTP + Temporal Worker |
| de-agent-runtime / de-rag / de-skill-runtime | 8091–8093 | FastAPI |

已退役：`de-core:8080`、`de-policy:8094`、`de-audit:8095`、`envoy.split.yaml`。

## 启动

```bash
cd backend && make compose-up-coarse
# FE Vite 默认代理 → :8089
```

## 切流说明

- `ServiceMode` 过滤路由；共享 PG KV 水合。
- collab/cap：`DE_POLICY_URL=http://de-sys:8100`（`/v1/evaluate`）。
- 审计写入：各进程本地 sink（PG / Redis / Kafka / OpenSearch），无远程 de-audit。
- Envoy 使用 Docker DNS：`de-sys` / `de-collab` / `de-cap` / `de-workflow`。
