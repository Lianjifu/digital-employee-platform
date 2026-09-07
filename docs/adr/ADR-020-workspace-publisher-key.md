# ADR-020 · Workspace Publisher Key 信任链

- **状态**：已采纳（Accepted）
- **日期**：2026-09-08
- **阶段**：近端 · W2-D1（已完成）+ W2-D2 收尾
- **关联**：[W1-W7 todo](../W1-W7-改进方案-todo.md) §2 W2-D1 / W2-D2 · commit `9ecc607` · `internal/skills/parse_sidecar.go` · `handlers_workspaces_publisher*.go` · `cmd/sign-skill-pack`

## 背景

W1-D2 落地了「全局 trust store」模型：`data/skill-keys/trusted-publishers.json` 列出所有允许签 skill 的公钥。但每个 workspace 在生产上应该有自己的 publisher 身份：

- 不同工作区想独立审计「谁签了这个 skill」
- workspace admin 走查时，签名能直接对应到具体工作区，而不是全局 pool
- workspace 撤销 / 轮换自己 publisher key 时不能牵连其它工作区

需要分清四个层次的 key，并定义验签时的查找顺序。

## 决策

### 1. 四层信任 + 一层 dev fallback

```
[ per-workspace active key ]   ← 最高优先，最新签的包走这里
[ per-workspace rotated key ]  ← grace 期，旧 key 签的包仍可验
[ global trusted-publishers ]  ← 平台官方 / 第三方 publisher
[ dev auto-provisioned key ]   ← 仅 demo / development；prod 应 fail
```

按这个顺序查找 KeyID。匹配到哪一层就在哪一层的 `TrustedKey.Source` 字段标记 `workspace:<ws>:active` / `workspace:<ws>:rotated` / `global` / `dev-auto`。

### 2. 数据模型

#### `WorkspacePublisherKey`（存储在 `store.WorkspacePublisherKeys`）

```go
type WorkspacePublisherKey struct {
    WorkspaceID  string
    KeyID        string    // ed25519:<hex>
    PublicKey    string    // base64(32 bytes)
    Status       string    // "active" | "rotated" | "revoked"
    CreatedAt    time.Time
    RotatedAt    *time.Time
    RevokedAt    *time.Time
    CreatedBy    string    // actor ID
    Notes        string    // 可选理由
}
```

每个 workspace 同时最多 1 个 active + N 个 rotated。revoked 不参与验签（强制从 trust 中剔除）。

#### 私钥 — 由 workspace admin 持有，不入服务端

POST `/api/workspaces/<ws>/publisher-key` 生成时 **一次性返回私钥**（base64），服务端不持久化。私钥管理是 workspace admin 的责任 — 可放本地、Vault、密码管理器。

prod 环境下配合 W2-D2 的 `signing.VaultKeyStore`，workspace admin 可以让 server 在签 skill pack 时主动从 Vault 拉取：

```
DE_VAULT_ADDR + DE_SKILL_KEYSTORE=vault
vault:skill-keys/<keyID>  ← base64(64-byte Ed25519 private seed)
```

### 3. 端点

| 角色 | 端点 | 行为 |
|---|---|---|
| Workspace admin | `POST /api/workspaces/<ws>/publisher-key` | 首次为工作区生成 publisher keypair（私钥一次性返回） |
| Workspace admin | `POST /api/workspaces/<ws>/publisher-key/rotate` | 轮换：旧 active → rotated，新 active 生成。旧 key 签过的包仍可在 rotated 集合里验证 |
| Workspace admin | `DELETE /api/workspaces/<ws>/publisher-key` | 撤销：active 标 revoked，旧 rotated 可保留也可一并 revoke |
| Workspace admin | `GET /api/workspaces/<ws>/publisher-key` | 查询当前 active + rotated 历史 + 各自的 createdAt / 数量 |
| Workspace admin | `POST /api/workspaces/<ws>/publisher-key/sign-skill` | （可选）服务端代签：vault 取私钥 → 写 skill signature → 返回 |
| Server | `resolvePublisherKey(workspaceID, keyID)` | 验签时按 KeyID 在 workspace active / rotated / global / dev-auto 顺序查找 |

### 4. Sidecar 解析

skill pack manifest 引用 publisher：

```json
{
  "publishers": {
    "ed25519:abc...": {
      "keyId": "ed25519:abc...",
      "publicKey": "...",
      "name": "acme-workspace",
      "workspaceId": "w-acme",
      "addedBy": "admin@acme.com",
      "addedAt": "2026-09-08T..."
    }
  },
  "skillSignatures": {
    "docx-generator": {
      "keyId": "ed25519:abc...",
      "signature": "..."
    }
  }
}
```

`internal/skills/parse_sidecar.go` 把 publishers 段 parse 成 `map[KeyID]TrustedKey` 并 merge 进 trust store 的查找链。verify 时 trust store 直接 lookup 即可。

### 5. 验签查找顺序（lock-in）

```go
func resolvePublisherKey(workspaceID, keyID string) (TrustedKey, Source, error) {
    // 1. workspace active
    if tk, ok := store.WorkspacePublisherKeys[workspaceID+":"+keyID]; ok && tk.Status == "active" {
        return tk, SourceWorkspaceActive, nil
    }
    // 2. workspace rotated
    if tk, ok := store.WorkspacePublisherKeys[workspaceID+":"+keyID]; ok && tk.Status == "rotated" {
        return tk, SourceWorkspaceRotated, nil
    }
    // 3. global trust
    if tk, ok := trustStore.Lookup(keyID); ok {
        return tk, SourceGlobal, nil
    }
    // 4. dev-auto fallback (only if demo/dev mode)
    if mode.AutoProvisionsSkillKeys() {
        if devKey != nil && devKey.KeyID == keyID {
            return devKey.TrustedKey, SourceDevAuto, nil
        }
    }
    return TrustedKey{}, "", ErrUnknownKey
}
```

Source 写到 audit 行让运维一眼能区分。SourceDevAuto 在 prod mode 下必须 fail，绝不 silent。

### 6. env flags

| Env | 默认 | 行为 |
|---|---|---|
| `DE_TRUSTED_PUBLISHERS_PATH` | `data/skill-keys/trusted-publishers.json` | global trust store 路径 |
| `DE_DEV_KEYPAIR_PATH` | `data/skill-keys/dev-keypair.json` | dev fallback 路径 |
| `DE_SKILL_KEYSTORE` | （unset） | 见 ADR-021：`vault` 时启用 VaultKeyStore |
| `DE_VAULT_KEYSTORE_PROBE` | `ed25519:probe` | 启动期 vault probe keyID |

### 7. 与 Vault 接入的边界

W2-D2（Vault 接入）关心 **私钥从哪里取**（disk vs Vault）。
ADR-020 关心 **签出来的 key 归谁 / 在哪一层信任链上被承认**。

两者通过 `SignerResolver` 接口解耦：
- W2-D1 实现按 workspaceID 选 active / rotated → 包成 `SigningRequest{WorkspaceID, KeyID}` → 走 `SignerResolver.Signer(keyID)` 拿到签名器
- Vault 与否由 W2-D2 决定私钥怎么取

## 测试矩阵

W2-D1 落地时已带 22 个测试，涵盖：
- generate / rotate / revoke 状态机
- 端点 RBAC（workspace admin vs 普通成员）
- 验签查找顺序（active 优先于 rotated，rotated 优先于 global）
- dev-auto fallback 在 prod mode 下不触发
- sidecar 解析 publisher 段进 trust store

## 不在范围内

- 多签 / 阈值签（M-of-N publisher 共识）：W2-D1 是单一 publisher，需要时进 W2-D3 之后。
- 自动轮换：当前靠 admin 主动 POST `/rotate`，可加 cron 后续 W6。
- Cross-workspace publisher 共享：跨工作区复用 key 走 global trust store，不进 workspace 段。

## 回退

- 单工作区撤销 publisher key 不会影响其它工作区（隔离在 `WorkspacePublisherKeys[wsID+":"+keyID]`）。
- dev-auto fallback 删 `data/skill-keys/dev-keypair.json` 即不启用。

## 后续

- 加 `permissions.publisher_key.rotate` 权限让 audit-only 用户不能误转（横切 §9.4）。
- 加 `de_skill_sign_total{result}` 指标（横切 §9.3）—— 本批次一起出。
- 在 `cmd/sign-skill-pack` 加 `--vault` 模式让 server 不必返私钥也能签。