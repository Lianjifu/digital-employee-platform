# de-policy（首个拆出微服务）

## 职责

| 路径 | 行为 |
|------|------|
| `POST /v1/evaluate` | 写路径 SoD / baseline（可再连 `DE_OPA_URL`） |
| `POST /api/zero-trust/evaluate` | 零信任评估（本服务决策） |
| `/api/access/*`、`/api/zero-trust/*`、`/api/governance*` | 业务数据仍在 de-core，**反向代理** |

## 本地

```bash
# 终端 1
cd backend && make run          # :8080

# 终端 2
export DE_CORE_URL=http://127.0.0.1:8080
make de-policy                     # :8094

# 终端 3 — de-core 走远程策略
export DE_POLICY_URL=http://127.0.0.1:8094
make run
```

或 Compose：

```bash
make compose-up-policy          # 仅 de-policy（需已有 de-core 或改 DE_CORE_URL）
make compose-up-apps            # de-core 默认 DE_POLICY_URL=http://de-policy:8094
make compose-up-split           # Envoy :8089 → de_policy cluster :8094
```

## 探测

```bash
curl -s http://127.0.0.1:8094/healthz
curl -s -X POST http://127.0.0.1:8094/v1/evaluate \
  -H 'content-type: application/json' \
  -d '{"actorRole":"admin","action":"publish","submitterId":"u1","approverId":"u1","resource":"workflow"}'
```
