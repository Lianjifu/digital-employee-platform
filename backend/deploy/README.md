# 本地基础设施（Docker）

PostgreSQL 与 Redis **仅通过 Docker Compose** 提供，不在本机直接安装服务进程。

## 前置

- macOS：`brew install colima docker docker-compose`，首次需拉取 ~275MB Colima 磁盘镜像
- 或已安装 Docker Desktop / 其他 Docker Engine
- 若 Docker Hub 超时，在 Colima VM 内配置 registry mirror（如 `docker.m.daocloud.io`）后 `systemctl restart docker`

## 启动

```bash
cd backend
make compose-up          # 自动启动 Colima（若需要）并拉起 PG + Redis
make compose-ps          # 查看状态
make compose-logs        # 查看日志
make compose-down        # 停止并移除容器（数据卷默认保留）
```

| 服务 | 容器名 | 主机端口 | 账号 |
|------|--------|----------|------|
| PostgreSQL 16 | `de-postgres` | `5432` | `de` / `de`，库 `digital_employee` |
| Redis 7 | `de-redis` | `6379` | 无密码 |

Schema 初始化：`deploy/migrations/*.sql` 挂载到 Postgres 的 `/docker-entrypoint-initdb.d`（**仅数据卷首次创建时执行**）。

## 控制面环境变量

```bash
export DE_DATABASE_URL=postgres://de:de@127.0.0.1:5432/digital_employee?sslmode=disable
export DE_REDIS_URL=redis://127.0.0.1:6379/0
make run
```

`GET /readyz` 会报告 `postgres` / `redis` 连通性。

控制面关键集合（workspaces / model_providers / workflows / employees / backups / tasks）会写入 `platform.kv_documents`，重启后 hydrate；审计中心优先读 `audit.events`。

## 可选 profile

```bash
make compose-up-full       # + Vault(:8200) + Envoy(:8088)
make compose-up-coarse     # ★ 主路径：sys/collab/cap/workflow + FastAPI + gateway:8089
make compose-up-temporal   # + Temporal(:7233)
make compose-up-oidc       # + Dex OIDC(:5556)
make compose-up-authentik  # + Authentik(:9000)
make compose-up-kafka      # + Redpanda(:19092)
make compose-up-mtls       # + Envoy mTLS(:8443)
make compose-up-spiffe     # + Envoy SPIFFE mTLS(:8444)
make compose-up-milvus     # + Milvus
make compose-up-opa        # + OPA(:8181)
make compose-up-search     # + OpenSearch(:9200)
make compose-up-obs        # + Prometheus(:9090) + Grafana(:3000)
make compose-up-staging    # coarse + oidc + opa + search + obs
```

| 变量 | 说明 |
|------|------|
| `DE_OIDC_ISSUER=http://127.0.0.1:5556/dex` 等 | Dex：`CLIENT_ID=de-core` / `SECRET=de-core-secret` / `AUTH_PATH=/auth`；账号 `admin@acme.com` / `password` |
| Authentik issuer | `http://127.0.0.1:9000/application/o/de/`（discovery 自动解析端点） |
| `DE_VAULT_ADDR` / `DE_VAULT_TOKEN` | KV v2 Put/Resolve；供应商 test 会 Resolve `credentialRef` |
| `DE_TEMPORAL_HOST` | Temporal SDK 提交试运行；需 `make worker` |
| `DE_KAFKA_BROKERS=127.0.0.1:19092` | 审计双写 Kafka topic `de.audit.v1`（仍写 Redis Stream） |
| `DE_MILVUS_URI=http://127.0.0.1:19530` | Docker Milvus（`make compose-up-milvus`）；未设置则 RAG 用内存向量 |
| `DE_OPA_URL=http://127.0.0.1:8181` | 远程 OPA evaluate；失败回退内嵌 baseline |
| `DE_OPENSEARCH_URL=http://127.0.0.1:9200` | 审计写入/查询 OpenSearch |
| `DE_POLICY_URL=http://127.0.0.1:8100` | collab/cap 调 de-sys `/v1/evaluate`；sys 留空；切开后可改 `:8104` |
| `DE_SKILL_RUN_SECRET` | 控制面与 de-skill-runtime 共享的 RunToken HMAC 密钥 |
| `DE_BAN_MOCK_TOKEN=1` | 生产/预发禁用 `mock-*-token` |
| `DE_FORCE_OIDC=1` | 拒绝密码登录，仅 OIDC |

### Staging（硬化预发）

```bash
make compose-up-staging   # coarse + Dex + OPA + OpenSearch + obs
# 默认加载 deploy/.env.staging：BAN_MOCK=1 FORCE_OIDC=1
```

### Authentik / 可观测

```bash
make compose-up-authentik   # :9000，见 deploy/authentik/README.md
make compose-up-obs         # Prometheus :9090，Grafana :3000（抓取 :8100–8103/metrics）
```

### SPIFFE / 沙箱

```bash
make certs && make certs-rotate
make compose-up-spiffe            # https://127.0.0.1:8444
# de-skill-runtime：de_exec_net + seccomp；见 topology-split.md
```

Proto / Connect：`make buf-generate` → `gen/`（`/de.*.Service/*`）。  
mTLS：`make certs` 生成本地 CA；客户端证书 `deploy/certs/client.{crt,key}`。

### Milvus（RAG）

```bash
make compose-up-milvus
pip install -r services/de-rag/requirements-milvus.txt
export DE_MILVUS_URI=http://127.0.0.1:19530
make rag   # :8092，healthz 中 backend=milvus
```

容器：`de-milvus`（19530/9091）、`de-milvus-etcd`、`de-milvus-minio`（内网）。Milvus 较吃内存，Colima/Docker 建议 ≥6–8GB。

### 应用进程（profile `coarse`）

```bash
make compose-up-coarse
# gateway:8089  sys:8100  collab:8101  cap:8102  workflow:8103
# FastAPI: 8091 / 8092 / 8093
```

生产建议：`DE_BAN_MOCK_TOKEN=1` 或 `DE_FORCE_OIDC=1`。