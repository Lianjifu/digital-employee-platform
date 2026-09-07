# ADR-021 · Vault 接入策略（dev / staging / prod 三段）

- **状态**：已采纳（Accepted）
- **日期**：2026-09-08
- **阶段**：近端 · W2-D2 P0 #3
- **关联**：[W1-W7 todo](../W1-W7-改进方案-todo.md) §2 W2-D2 · commit `217924c` · `internal/skills/signing/keystore.go` · `internal/vault/client.go`

## 背景

`internal/vault/client.go` 已实现 `Put/Resolve/Delete/Redact` 与 stub fallback（`Put` 同时写入内存 stub 与远端 Vault），但有两个真实缺口：

1. **skill 签名私钥**仍在 `data/skill-keys/dev-keypair.json` 落盘。即便服务端只是把公钥注册到 trust store、实际签名发生在 `cmd/sign-skill` CLI，prod 节点上一旦这台机器出镜像，磁盘上的私钥就泄漏。
2. **model provider 凭据**目前只能用 `Put`/`Resolve` 逐条操作。批量轮换 / 多 provider 同时下发时只能循环，错误聚合与「哪几条缺失」都要手工写。

## 决策

### 1. `SignerResolver` 接口 — signing key 的唯一接入面

```go
type SignerResolver interface {
    Signer(keyID string) (*Ed25519Signer, error)
    TrustedKey(keyID string) (TrustedKey, error)
    BackedByVault() bool
}
```

两个实现：

| 实现 | 何时用 | 后端存储 | `BackedByVault()` |
|---|---|---|---|
| `DevKeyStore` | demo / development / 单机测试 | `data/skill-keys/dev-keypair.json`（自动 provisioning） | `false` |
| `VaultKeyStore` | staging / production | HashiCorp Vault KV v2，路径 `vault:skill-keys/<keyID>` | `true` |

dev 路径下 disk 上仍然有私钥，仅限 `demo/development`。CI / staging / prod 不会进入这段代码。

### 2. Vault ref 命名

私钥：`vault:skill-keys/<keyID>`（与 `vault.Client.kvPath` 已支持的 `vault:` 前缀对齐）。
值：base64(64-byte Ed25519 private seed)。

示例：
```
vault put secret/skill-keys/ed25519:abcdef0123456789 value="$(cat priv.b64)"
```

### 3. 启动期选择

`Server.bootstrapSkillSigning()`：原逻辑不变，自动 provisioning dev keypair 并把公钥注册到 trust store。

`Server.bootstrapVaultSkillSigning()`（新增）：仅当
- `DE_VAULT_ADDR` 非空（`Vault.Enabled()` true）
- `DE_SKILL_KEYSTORE=vault`

才把 `SkillSigner` 切换成 `VaultKeyStore`，并立刻用 `DE_VAULT_KEYSTORE_PROBE`（默认 `ed25519:probe`）做一次 probe lookup 失败即回退到 dev。**这是 fail-fast** — 让 Vault 地址错配在启动时炸出来而不是第一次签名才炸。

prod 节点不设 `DE_SKILL_KEYSTORE=vault` 就仍是 dev path，会在 CI 上显式 fail。

### 4. Batch API：`PutMap` / `ResolveMap`

```go
func (c *Client) PutMap(ctx context.Context, entries map[string]string) error
func (c *Client) ResolveMap(ctx context.Context, refs []string) (map[string]string, []string, error)
```

- `PutMap` 顺序写，第一条错误被记住并继续 — 一个坏 ref 不阻塞其余。返回的是第一个 error，便于上层 abort 但保留已经写进去的事实。
- `ResolveMap` 返回 `(resolved, missing, err)`。`missing` 让上层决定 prompt 重输 / 重试 / 回退默认。`err` 仅在 client nil 等不可恢复错误时非空。

适用场景：批量轮换 `vault://model-providers/<id>/credential`、批量发现哪些 model provider 还没配 key。

### 5. 行为兼容

| 旧调用 | 新调用 | 说明 |
|---|---|---|
| `DevKeyStore.Signer() *Ed25519Signer` | `DevKeyStore.Signer(keyID string) (*Ed25519Signer, error)` | keyID 空时返回 dev 自己的；不空且不匹配 → 错误 |
| `DevKeyStore.TrustedKey() TrustedKey` | `DevKeyStore.TrustedKey(keyID string) (TrustedKey, error)` | 同上 |
| `vault.Client.Put(ref, value)` | 不变 | 单条仍然工作 |
| `vault.Client.Resolve(ref)` | 不变 | 单条仍然工作 |

3 个 caller 更新：
- `cmd/sign-skill/main.go`：先 `signer, err := dev.Signer("")` 拿一次，后续用本地变量。
- `handlers_workspaces_publisher.go:333`：忽略 error（dev key 总是存在）。
- `handlers_skills_package.go:377`：忽略 error。

## 测试矩阵

新增 11 个测试：

| 测试 | 验证 |
|---|---|
| `TestVaultKeyStoreNilFetcherRejected` | NewVaultKeyStore(nil) 报错 |
| `TestVaultKeyStoreSignerResolvesAndCaches` | 第一次 fetcher 调 1 次，第二次命中缓存 |
| `TestVaultKeyStoreSignerMissingReturnsError` | ref 不存在 → 带前缀错误 |
| `TestVaultKeyStoreSignerEmptyKeyID` | 空 keyID → 错误 |
| `TestVaultKeyStoreSignerMalformedBase64` | base64 损坏 → 错误 |
| `TestVaultKeyStoreSignerWrongKeyLength` | 长度不对 → 错误 |
| `TestVaultKeyStoreSignerAcceptsFullVaultRef` | 已经带 `vault:` 前缀的 ref 不重复拼 |
| `TestVaultKeyStoreTrustedKeyReturnsPublicHalf` | TrustedKey 拿到正确长度的公钥 |
| `TestVaultKeyStorePutKeyRoundtrip` | PutKey → Resolve 拿回 base64 一致 |
| `TestVaultKeyStoreBackedByVaultTrue` | 接口断言 dev vs vault 行为差异 |
| `vault/client_test.go`：PutMap / ResolveMap / Redact | 4 个 batch 测试 |

## 不在范围内

- 私钥 KMS 自动轮换：Vault 里只是密文存储；rotation 策略由 Vault 自己管。
- 多 workspace 私钥：当前 `VaultKeyStore` 不知道 workspace 概念，ref 自带命名空间 `skill-keys/<keyID>`。
- Vault token 自动续签：仍由运维手动 `DE_VAULT_TOKEN` rotate。
- API token cache：plan W3 HotReload 一并做。

## 回退

- 把 `DE_SKILL_KEYSTORE` 留空即回退到 dev 路径。
- `Server.SkillSigner` 为 nil 时 caller 应 panic — 但目前 server 不主动签名，所以不会触达。

## 后续

- `cmd/sign-skill` 加 `--keystore=dev|vault` flag 让运维签名新 skill 时直接走 Vault。
- `cmd/sign-skill-pack` 同样改造。
- Model provider 凭据轮换 admin endpoint 改造为用 `PutMap`。