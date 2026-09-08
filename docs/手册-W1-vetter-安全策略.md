# W1 安全策略手册 — Skill Vetter + 用户面对白名单

> 状态：实施就绪
> 日期：2026-09-08
> 前置：W1-D1（Vetter 联通）、W1-D2（Skill 签名）、W1-D3（Gateway 硬墙）
> 关系：本手册是 Skill 安全三件套的运维 + 用户配套；不写 ADR 决策（ADR-018 / 019）

## 1. 三道防线

| 防线 | 触发 | 失败时 | 落点 |
|---|---|---|---|
| **Vetter**（模式匹配） | builtin / 导入 skill 时跑 | SevBlock 命中 → 拒绝安装；SevWarn 命中 → 仅日志 | `internal/skills/vetter/` |
| **Signer**（ed25519 签名） | builtin 启动 / 第三方 skill 加载 | 缺签名 / 验签失败 → 401-style 拒 | `internal/skills/signing/` |
| **Gateway**（产物下载闸门） | `/api/skill-artifacts/*` 任意请求 | path traversal / oversize / 扩展名 / 缺 auth → 400/413/415/401 | `internal/gateway/` |

三道防线各自独立：**Vetter 不依赖签名**，**Gateway 不依赖 Vetter**。

## 2. Vetter 模式匹配

### 2.1 决策树

```
skill 内容 → patterns × 每行 → findings[] → 决策
  ├─ 任何 SevBlock 命中 → verdict = deny
  ├─ 仅 SevWarn 命中    → verdict = warn
  └─ 0 命中              → verdict = allow
```

### 2.2 模式分类（5 大类）

| 类别 | 触发示例 | 严重度 | 文件 |
|---|---|---|---|
| **credential** | `~/.aws/credentials`、`cat .env`、`PRIVATE KEY` | SevBlock | `patterns_credential.go` |
| **egress** | `curl http://` / `wget` / PowerShell `iwr` / `iex` | SevBlock | `patterns_egress.go` |
| **destructive** | `rm -rf /`、`mkfs`、`dd if=`、`shred` | SevBlock | `patterns_destructive.go` |
| **escalation** | `sudo`、`chmod 777`、`chown root` | SevBlock | `patterns_escalation.go` |
| **persistence** | `crontab -e`、`systemctl enable`、boot script | SevBlock | `patterns_persistence.go` |

所有当前规则都是 SevBlock → 命中即 deny。SevWarn 预留作未来扩展。

### 2.3 配置

| Env | 默认 | 说明 |
|---|---|---|
| `DE_SKILL_VETTER` | `enabled` | `enabled` / `warn_only` / `disabled`（`off` / `false` / `0` 也算 disabled） |

```bash
# CI 强校验
DE_SKILL_VETTER=enabled

# 开发 / 测试期间看到日志但不拦截
DE_SKILL_VETTER=warn_only

# 完全关闭（仅 prod 紧急熔断用；不建议）
DE_SKILL_VETTER=disabled
```

### 2.4 override 权限

admin 持有 `skill.vet.override` 权限可在 deny 路径下强制放行（仅 builtin 路径，第三方导入仍走强制 deny）：

```go
// internal/server/handlers_skills_package.go
overrideVet := auth.Has(id, "skill.vet.override")
if report.Decision == vetter.Deny {
    summary := vetterSummary(meta.Name, report)
    if overrideVet {
        s.Store.AppendAudit(ws, id.Name, "skill 内容审查", meta.Name, "override", "admin override via skill.vet.override: "+summary)
        break
    }
    return nil, apperr.BadReq(apperr.SkillVetDenied, "imported skill blocked by vetter: "+summary)
}
```

audit 行 `result=override` 区别于正常 `denied`，事后追溯可识别「管理员强行放行」事件。

### 2.5 用户面对白名单（false-positive 抑制）

某些规则是「模式 = 危险命令名」，例如 `sudo` 在合法的 ops skill 里出现是正常的。`internal/skills/vetter/vetter.go` 支持 `.vetter-allow.json`：

```json
{
  "patterns": ["sudo-as-user", "privilege-escalation"],
  "reason": "ops skill — intentional privilege use",
  "ticket": "OPS-1234"
}
```

放在 **skill 包根目录**，vetter 会自动读并抑制白名单内的模式。但 **credential 类规则（aws-credential、aws-credentials-file、private-key、$AWS_SECRET 等）永远不会被抑制**——这是有意的，因为凭据泄漏一次就够出事故。

## 3. Signer 签名校验

详见 [手册-W2-skill签名与vault.md §1–§3](../手册-W2-skill签名与vault.md)。要点：
- 信任链 = `DE_TRUSTED_PUBLISHERS_PATH`（pub key set）+ 每个 workspace 的 `publisher-key`（rotate 用 `publisher_key.rotate`）
- Dev keypair 仅当 `DE_BAN_DEV_KEYPAIR=false` 时被信任；prod 应 `true` 拒收
- 签名失败 / 未知 key / 验签失败 全部走 `de_skill_sign_total{result}` 指标

## 4. Gateway 硬墙

详见 [手册-W2-skill签名与vault.md §4](../手册-W2-skill签名与vault.md) (vault 段) 与 ADR-019。

`/api/skill-artifacts/<name>` 三 handler 共用一个 `gateway.ValidateArtifactRequest`：

| 维度 | 默认 | env flag |
|---|---|---|
| size cap | 100 MB | `DE_ARTIFACT_MAX_BYTES` |
| 扩展名白名单 | docx/pptx/xlsx/pdf/png/jpg | （hardcoded） |
| require auth | true | `DE_ARTIFACT_REQUIRE_AUTH=false` 关闭 |

## 5. 端到端 smoke

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8089/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"x"}' | jq -r .data.token)

# 1) 看 vetter 是否启用
curl -sf http://127.0.0.1:8089/metrics | grep de_skill_vetter_total
# → de_skill_vetter_total{verdict="allow"} N
# → de_skill_vetter_total{verdict="warn"}  N
# → de_skill_vetter_total{verdict="deny"}  N

# 2) 试装一个含 curl 的 skill（应被 deny）
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @tests/fixtures/skills/evil-with-curl.json \
  http://127.0.0.1:8089/api/skills/import
# → 400 SkillVetDenied + finding 列表

# 3) admin override（持有 skill.vet.override）
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @tests/fixtures/skills/evil-with-curl.json \
  http://127.0.0.1:8089/api/skills/import
# → 200 OK；audit 行 result=override
```

## 6. 现象对照

| 现象 | 可能原因 | 怎么查 |
|---|---|---|
| 装 skill 报 `SkillVetDenied` 但脚本看起来无害 | vetter 误报 | 看 error message 列出的 finding；加 `.vetter-allow.json` 白名单（仅 ops 类规则） |
| audit 出现 `result=override` 但没人 override | 别人越权；查 actor 字段 | `grep result=override` 找具体行 |
| `de_skill_sign_total{result="bad_signature"}` 飙升 | 有人改了 builtin 内容 | 重新 sign-skill 验证；pubkey 信任链是否被改 |
| 装 builtin skill 启动 401 | signer 验证失败 / 信任链丢 | 看 `internal/skills/signing/` log；`DE_TRUSTED_PUBLISHERS_PATH` 路径 |
| `/api/skill-artifacts/*` 全 401 | `DE_ARTIFACT_REQUIRE_AUTH=true` 但 caller 无 auth | 给 caller 加 token 或临时设 env=false |
| `/api/skill-artifacts/*` 全 415 | 扩展名不在白名单 | 看 `internal/gateway/artifact_gateway.go` `DefaultArtifactPolicy().AllowExt` |
| `de_skill_vetter_total` 一直是 0 | 没跑过 vetter；要么 vetter 被关要么没 skill | `DE_SKILL_VETTER=enabled` + 试装一个 skill |

## 7. 已知边界

- **vetter 不解析语法** — 纯 regex；写错 `curl` 命令名（拼成 `cur l`）会漏报
- **多行字符串** — 每个 pattern 默认按行匹配；不跨行
- **二进制** — 仅当 skill package 文本编码；不在 vetter 范围
- **白名单粒度** — `.vetter-allow.json` 在 skill 包根目录；多 skill 共享需各自放
- **override 仅 builtin** — 第三方 `import` 路径强制 deny，没有 override 通道（设计取舍：第三方是用户上传的代码，权限应受更严约束）
- **审计保留期** — 默认内存 5 分钟一刷；持久化依赖 PG / SQLite（看 store 配置）

## 8. 排查清单

```bash
# A. vetter 是否生效？
curl -sf http://127.0.0.1:8089/metrics | grep de_skill_vetter_total

# B. 信任链是否完整？
DE_TRUSTED_PUBLISHERS_PATH=/path/to/pubs.json \
  ./cmd/verify-skill -path tests/fixtures/skills/good.zip

# C. gateway 闸门是否放行？
curl -i -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8089/api/skill-artifacts/report.docx

# D. override 是否被记录？
sqlite3 /tmp/test.db 'SELECT * FROM audit WHERE action="skill 内容审查" AND result="override";'
```

## 9. 相关路由 / 文件

| 文件 | 用途 |
|---|---|
| `internal/skills/vetter/` | 5 类 pattern + Decision / Severity / Verdict |
| `internal/skills/signing/` | ed25519 signer + 信任链 + vault 接入 |
| `internal/gateway/artifact_gateway.go` | 产物下载闸门 |
| `internal/server/handlers_skills_package.go` | 第三方导入 + vetter 入口 |
| `internal/server/builtin_skills.go:357` | `vetterMode()` 读 env |
| `internal/server/skill_vetter_integration_test.go` | 集成测试（override / warn_only / enabled） |