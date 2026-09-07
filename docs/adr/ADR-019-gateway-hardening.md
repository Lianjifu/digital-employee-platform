# ADR-019 · Gateway 硬墙策略

- **状态**：已采纳（Accepted）
- **日期**：2026-09-08
- **阶段**：近端 · W1-D3 P0 #2
- **关联**：[W1-W7 todo](../W1-W7-改进方案-todo.md) §1 W1-D3 · commit `fcee0c7`、`e0d3edc` · `internal/gateway/artifact_gateway.go`

## 背景

`/api/skill-artifacts/*` 是把后端生成 / 用户上传的 `.docx`、`.pptx`、`.xlsx`、`.pdf`、图片等产物返回给前端的通道。审计发现现状：

- **没有 size cap**：`http.ServeFile` 直出整文件，攻击者可以挂一个大文件然后让下载端替他们跑流量 / 充磁盘。
- **没有 MIME 白名单**：fallback `application/octet-stream` 接受任意扩展名，`.exe` / `.sh` / `.html` 都能直接下；与 `Content-Disposition: attachment` 一起仍可诱导用户保存恶意文件。
- **没有 auth 检查**：这条路由被 `requireAuth` 中间件 carve-out 成「无需登录」，任何拿到 URL 的人都能下；同时也没有 audit 行。
- **path traversal 已有但弱**：`filepath.Base` 直接对已 URL 解码后的字符串取名，等于 `../../etc/passwd` → `"passwd"`，看起来通过但 stat 落在 `root/passwd` 而非穿越出去。攻击者拿到的不是 400 而是 404，反而暴露「你猜对了文件名」侧信道。

## 决策

引入 `internal/gateway` 包，作为 **唯一** 的 skill artifact 闸门。所有 `/api/skill-artifacts/*` handler 在做任何文件 I/O / MIME 判定前必须先调用 `ValidateArtifactRequest`。

### 1. 闸门检查顺序（拒绝即短路、写完 HTTP 响应、写出 audit 行）

1. **空 / 纯空白名** → 400 `E_BAD_REQUEST`
2. **URL 解码 → 显式 traversal 检测**：`strings.ContainsAny(decoded, "/\\") || strings.Contains(decoded, "..")` → 400。**这一步必须在 `filepath.Base` 之前**，否则 `Base("../../etc/passwd")` 会把攻击向量压平成 `"passwd"`，stat 落到 `root/passwd`，泄漏为 404。
3. **`filepath.Base` + `filepath.Clean` + `HasPrefix(cleaned, root+sep)`**：canonical 化后再次确认未逃出 root。
4. **扩展名白名单**（`.docx`/`.pptx`/`.xlsx`/`.pdf`/`.png`/`.jpg`/`.jpeg`）→ 不在表里 → 415 `E_UNSUPPORTED_MEDIA_TYPE`。**白名单判断在 `os.Stat` 之前**，避免 404 vs 415 区分让攻击者探出哪些扩展名实际有文件。
5. **`os.Stat` + IsDir**：找不到或目录 → 404 `E_NOT_FOUND`。
6. **size cap**：超过 `MaxBytes` → 413 `E_PAYLOAD_TOO_LARGE`。
7. **auth**：`RequireAuth && actor == ""` → 401 `E_UNAUTHORIZED`。**放在所有文件校验之后**，避免攻击者用 401 响应时间差来探测文件存在性 / 文件大小。
8. **audit 行**：每一条成功 / 拒绝都写 `AppendAudit(ws, actor, "skill 产物下载", name, "success" / "denied", reason)`。

### 2. 解耦：`IdentityProvider` + `AuditFunc`

闸门包不依赖 `internal/auth` / `internal/store`：

```go
type IdentityProvider interface {
    ActorName() string
    WorkspaceID() string
}
type AuditFunc func(workspaceID, actor, action, target, result, reason string)
```

server 侧提供：
- `s.identityAdapter(r)`：把 `*auth.Identity` 包成 `IdentityProvider`，workspace 回退到 `s.workspaceID(r)`。
- `s.appendAuditFn()`：把 `store.AppendAudit` 适配成 `AuditFunc`，空 workspace 回退到 `"w1"`。

这让闸门可以用 stub 单测，server 改动量最小化。

### 3. 环境变量

| Env | 默认 | 行为 |
|---|---|---|
| `DE_ARTIFACT_MAX_BYTES` | `104857600`（100 MB） | 单文件大小上限。docx/pptx/xlsx/pdf 普遍 < 50 MB，调小可进一步缩暴露面。 |
| `DE_ARTIFACT_REQUIRE_AUTH` | `true` | 关闭后 artifact 可匿名下载；仅建议 dev / staging / 演示环境使用。 |

### 4. 中间件改造

`requireAuth` 中 `/api/skill-artifacts/*` 的 carve-out 从「跳过身份验证」改成「解析身份但不强制」：若 `Authorization` 头存在则 parse + 注入 context（生产环境仍拦截 `mock-*` / mock headers），不存在则放行但 actor 为空，由闸门的 `RequireAuth` 决定是否 401。

这条修改让 audit 行能持续记录「谁」下了产物，同时不破坏已有 FE 用 `credentials: 'same-origin'` 调用的行为。

### 5. 测试矩阵

12 个单测 + 7 个集成测试覆盖：

| 测试 | 验证 |
|---|---|
| `TestValidateAcceptsAllowed` | 合法 `.docx` → ok + audit success |
| `TestValidateRejectsTraversalRaw` | `../../etc/passwd` → 400 |
| `TestValidateRejectsTraversalAfterDecode` | `%2e%2e%2fpasswd` 解码后被 traversal 检测命中 → 400 |
| `TestValidateRejectsDisallowedExt` | `.exe` → 415 |
| `TestValidateRejectsOversize` | 大于 `MaxBytes` → 413 |
| `TestValidateRejectsMissingAuth` | 无 identity + `RequireAuth=true` → 401 |
| `TestValidateRejectsEmptyName` | 空白名 → 400 |
| `TestValidateEmitsAuditOnDenied` | 拒绝路径写 denied 行 |
| `TestValidateRejectsDirectory` | 目录路径 → 404 |
| `TestValidateRejectsBadExtEvenWhenMissing` | 缺文件 + 坏扩展 → 415（锁定 ext 先于 stat） |
| `TestValidateAuditsDefaultWorkspaceWhenMissing` | 空 ws 回退 `"w1"` |
| 集成：bad ext / oversize / traversal / missing auth / happy / preview / slide / auth-disabled | 端到端 3 个 handler 都过闸门 |

## 不在范围内

- iframe sandbox：artifact 当前已是 `Content-Disposition: attachment` 强制下载，无 iframe 场景。
- Rate limiting：独立 W4 / W6 任务。
- 跨 workspace 隔离：artifact 落盘已按 workspace 分目录，但 handler 没校验；记入 W3。
- Vault 凭据下载：独立 W2-D2。
- 真正的 SSRF 防御：artifact 路径不发起对外 HTTP，但 `fetchSkillArtifactFromRuntime` 走 runtime URL，存在 SSRF（先记 W2-D2 / W3-D3）。

## 回退

handler 改造是 additive：闸门在原路径判定之前，原 path-clean 逻辑保留作为 defense-in-depth。逐 handler revert 安全。

## 后续

- ADR-018（Skill Vetter 接入策略）：vetter 已经联通，下次 todo 批次写出。
- ADR-020（Workspace Publisher Key）：W2-D1 的草图定稿。
- ADR-021（Vault 接入）：W2-D2 决策点。

## Commit

1. `feat(gateway): artifact policy + validation seam` — `fcee0c7`
2. `chore(server): route skill-artifact handlers through gateway` — `e0d3edc`