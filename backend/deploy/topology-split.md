# 服务拆分与 mTLS（M5 目标拓扑）

当前：`de-core` 单体 + Docker PG/Redis（+ 可选 Envoy/Vault/Temporal）。

目标拆分（对齐架构 §5）：

| 单元 | 职责 | 入口 |
|------|------|------|
| de-gateway (Envoy) | TLS / 限流 / `/api` vs `/agent` | 公网唯一入口 |
| de-platform | 工作区 / 成员 / 配额 | mTLS 内网 |
| de-policy | OPA / SoD / 零信任 | mTLS |
| de-audit | 审计写入 / 检索 | mTLS + Kafka |
| de-collab | 协作会话 / SSE | mTLS |
| de-employee | 数字员工生命周期 | mTLS |
| de-workflow | Temporal Worker | 内网 |
| de-agent-runtime / rag / de-skill-runtime | 执行面 | skill 节点无控制面 DSN |

## mTLS / SPIFFE 清单

- [x] 本地 CA + SPIFFE URI SAN：`make certs` / `make certs-rotate`（TTL=1d）
- [x] Envoy mTLS 入口：`make compose-up-mtls`（`:8443`）
- [x] Envoy SPIFFE 校验：`make compose-up-spiffe`（`:8444`，见 `deploy/spiffe/`）
- [x] 路径拆分网关骨架：`make compose-up-split`（`:8089`，命名 cluster 仍指 de-core）
- [ ] SPIRE Workload API / SDS 动态 SVID（生产签发）
- [x] de-skill-runtime：独立 `de_exec_net` + seccomp/cap_drop + HMAC RunToken
- [x] skill 隔离探测（`DE_SKILL_REQUIRE_ISOLATION=1`）；真 `runsc` OCI 需宿主机安装 gVisor
- [x] Authentik Compose + OIDC discovery（`deploy/authentik/`）
- [x] 审计 Topic：Redis Stream + 可选 Kafka（`DE_KAFKA_BROKERS`）

### 拆分落地顺序

1. Envoy `envoy.split.yaml` 已按前缀分流到命名 cluster  
2. **de-policy 已独立**：`make de-policy` / `make compose-up-policy`（`:8094`）；Envoy `de_policy` → `:8094`  
3. de-core 经 `DE_POLICY_URL` 调用 `POST /v1/evaluate`（失败回退本地/OPA）  
4. **de-audit 已独立**：`make de-audit` / `make compose-up-audit`（`:8095`）；Envoy `de_audit` → `:8095`  
5. de-core 经 `DE_AUDIT_URL` fanout 写入；审计中心可走远程列表  
6. 下一刀：de-platform / de-collab；SPIFFE → SPIRE SDS

## 等保 / 多活（签字项）

- [x] 身份：生产禁 mock-token（`DE_BAN_MOCK_TOKEN=1`）
- [x] 备份双签 + 恢复演练（`/api/backups/:id/{approve,restore-drill}`）
- [x] 跨工作区访问 403 用例
- [x] 受限数据出境拒绝用例
- [x] SLO：`/readyz`、`/metrics` + `make compose-up-obs`（Prometheus/Grafana 基线告警）
