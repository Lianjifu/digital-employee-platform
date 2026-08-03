# 服务拆分与 mTLS（粗粒度 v4）

当前：`de-core` 兼容壳（ModeAll :8080）+ 可选粗粒度进程。

## 目标部署单元（一类一端口）

| 单元 | 端口 | 内含模块 |
|------|------|----------|
| de-gateway | 8089 | Envoy `envoy.coarse.yaml` |
| **de-sys** | **8100** | platform · policy · audit · ops |
| **de-collab** | **8101** | collab · employee |
| **de-cap** | **8102** | model · knowledge · memory · skill · channel |
| **de-workflow** | **8103** | workflow HTTP + Temporal Worker |
| de-agent-runtime | 8091 | FastAPI |
| de-rag | 8092 | FastAPI |
| de-skill-runtime | 8093 | FastAPI（`de_exec_net`） |

遗留细端口（可选 profile）：`de-policy:8094` · `de-audit:8095` —— 粗粒度模式下由 **de-sys** 吸收。

## 启动

```bash
cd backend
make compose-up-coarse   # PG/Redis + sys/collab/cap/workflow + FastAPI + gateway:8089
# 或本机：
make run-sys      # :8100
make run-collab   # :8101
make run-cap      # :8102
make run-workflow # :8103 HTTP（Worker 需 DE_TEMPORAL_HOST）
```

FE：`VITE_API_BASE=http://127.0.0.1:8089`（经 gateway）或继续用 `:8080` de-core。

## mTLS / SPIFFE 清单

- [x] 本地 CA + SPIFFE URI SAN：`make certs` / `make certs-rotate`
- [x] Envoy mTLS：`make compose-up-mtls`（`:8443`）
- [x] Envoy SPIFFE：`make compose-up-spiffe`（`:8444`）
- [x] 粗粒度网关：`make compose-up-coarse`（`:8089` → 8100–8103）
- [ ] SPIRE Workload API / SDS（生产）
- [x] de-skill-runtime 隔离网 + RunToken
- [x] Authentik / Kafka / Obs 等见 compose profiles

## 切流说明

- 各 Go 单元通过 `ServiceMode` 过滤路由；共享 PG KV 水合（多副本最终一致，强一致后续事件化）。
- `DE_POLICY_URL` 在 coarse 下指向 `http://de-sys:8100`（`/v1/evaluate`）；也可用 `DE_SERVICE` 覆盖模式。
- Envoy coarse 使用 **Docker 服务名**（`de-sys` 等），不再依赖 `host.docker.internal`。
- 目录：`services/de-*`（含六边形骨架）· `infra/*` · `obs/*` · `libs/hexkit`。
- 退役：`services/de-core/RETIRE.md`。
