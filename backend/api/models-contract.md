# 模型服务契约（M0 冻结）

真相源：`frontend/packages/api/src/mock.ts` + `frontend/packages/types`。  
实现：`internal/server/handlers_models.go`、`internal/modelprov/`。

## 枚举

| 实体 | 允许值 |
|------|--------|
| Provider.status | `draft` \| `standby` \| `active` \| `disabled` \| `offline` |
| Policy.status | `draft` \| `ready` \| `published` \| `superseded`（校验失败保持 `draft`） |
| Provider.tier | `official` \| `self_hosted` \| `connectable` |

## 凭据

- 请求：`credential`（兼容 `apiKey`）
- 落库：仅 `credentialRef`（`vault://model-providers/:id/credential`）+ `credentialMasked`
- staging/prod：`DE_REQUIRE_VAULT=1` 或 `DE_BAN_MOCK_TOKEN=1` 时拒绝无 Vault 写凭据

## 关键响应

- discover：`{ protocol, baseUrl, models:[{id,name}], fetchedAt }`
- test：`{ providerId, status:"healthy", providerStatus, verifiedAt, credentialResolved, latencyMs }`
- failover：`{ id, policyId, scope, status:"passed", fromModelId, toModelId, correlationId }`
- governance：含 `healthyShare`、`avgLatencyMs`、`regionDistribution`、`updatedAt`、`budgetRisk`

## 安全

- 读写权限：`model.read` / `model.write`
- `:id` 动作必须 `workspaceId` 匹配（跨租户 → 404）
- PATCH 白名单；禁止明文 credential 落库
- test/discover/failover 限流 30/min/workspace
- Probe SSRF：默认禁私网，`DE_MODEL_ALLOW_PRIVATE=1` 放行
