# de-audit（第二个拆出微服务）

## 职责

| 路径 | 行为 |
|------|------|
| `POST /v1/events` | 写入 PG + Redis Stream + 可选 Kafka/OpenSearch |
| `GET /v1/events?workspaceId=` | 合并 OpenSearch + PG 列表 |
| `GET /v1/events/by-correlation?id=` | 按 correlationId 查询 |
| `GET /api/audit-center` | JWT + `audit.read`，返回工作区审计 |
| `/api/audit-center/export` 等 | 回源代理到 de-core |

## 本地

```bash
cd backend && make compose-up
export DE_DATABASE_URL=postgres://de:de@127.0.0.1:5432/digital_employee?sslmode=disable
export DE_REDIS_URL=redis://127.0.0.1:6379/0
make de-audit                     # :8095

export DE_AUDIT_URL=http://127.0.0.1:8095
make run                       # de-core 审计 fanout → de-audit
```

Compose：

```bash
make compose-up-audit          # PG/Redis + de-audit
make compose-up-apps           # de-core 默认 DE_AUDIT_URL=http://de-audit:8095
make compose-up-split          # Envoy :8089 → de_audit :8095
```

## 探测

```bash
curl -s http://127.0.0.1:8095/healthz
curl -s -X POST http://127.0.0.1:8095/v1/events \
  -H 'content-type: application/json' \
  -d '{"id":"t1","workspaceId":"w1","actor":"admin","action":"probe","result":"success"}'
curl -s 'http://127.0.0.1:8095/v1/events?workspaceId=w1'
```
