# ADR-029 — WeChat 渠道：双形态 + ilink sidecar

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §7 W7-D2](../../docs/W1-W7-改进方案-todo.md) 的"仅飞书 / 企业微信 / 钉钉 entrypoint"
- 关系：与 `internal/channel/adapter.go` 的 `KindWeixin` 常量对齐；通道控制流 (`internal/server/handlers_channels.go`) 已假定 `weixin` 包存在但未实现 — 本 ADR 同时记录补齐与渠道协议。

## 1. 上下文

`channel.Kind` 已经枚举 `KindWeixin`；`channel/mock.go` 也注册了 mock。但 `internal/weixin/` 一直缺失，导致 `go build ./internal/server/` 在 `handlers_channels.go` 引用 `weixin.Credentials/ParseCredentials/NewClient/MaskToken` 处直接编译失败（或绕过 mock）。

候选方案：

| 方案 | 优 | 劣 |
|---|---|---|
| **A. 公众号 Open API only** | 官方；合规 | 个人号 / 私域运营不可用 |
| **B. 个人号 ilink sidecar only** | 个人号可用；私域运营 | 需要外部 sidecar 进程 |
| **C. 双形态（本文）** | 同时支持公众号与个人号；Credentials 自描述 mode | 需要维护两套发送/校验 |

实际业务场景里**个人号（ilink 私域）+ 公众号（合规客服）**都会用到。ADR-026/034 已经把"双形态"作为推荐做法。

## 2. 决策

新增 `internal/weixin/`：

| 组件 | 角色 |
|---|---|
| `Credentials` | 一个 struct 同时承载 ilink（`Token/BaseURL/AccountID/AllowFrom/RouteTag`）与公众号（`AppID/AppSecret/CallbackToken/EncodingAESKey/APIBaseURL`）字段；`Mode` 自动检测 |
| `ModePersonal` (ilink) | `Token + BaseURL`；`Probe` → `POST {baseUrl}/ilink/bot/getupdates`（`Authorization: Bearer {token}`，body `{}`）；`SendText` → `POST {baseUrl}/ilink/bot/sendmsg`（JSON `{token, to, content, ctx}`） |
| `ModeOfficial` (公众号) | `AppID + AppSecret`；`Probe` → `GET /cgi-bin/token?appid=…&secret=…`；`SendText` → `POST /cgi-bin/message/custom/send` |
| `HasCallback()` | 当 `CallbackToken` 非空且 `EncodingAESKey` 正好 43 字符时启用公众号回调加解密（SHA1 sort + AES-CBC） |
| `VerifySignature/EncryptCallback/DecryptCallback/ParseEncryptedCallback/ReplyText` | 公众号消息加解密协议 |

`Client.HTTP *http.Client` 暴露给测试注入（`srv.WeixinHTTP = ws.Client()`）。

`SendText` 签名：

```go
func (c *Client) SendText(ctx context.Context, cred Credentials,
    toUser, content, contextToken, _ string) error
```

最后两个参数（`contextToken` = ilink fetch ctx；最后位置 = OA 暂时不用）匹配 `internal/server/handlers_channels.go:1348` 的调用。

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. OA-only | 合规 | 个人号客户不可用 | ✗ |
| B. ilink-only | 私域 | 公众号客户不可用 | ✗ |
| C. 双形态（本文） | 自描述 mode；字段合一 | 两个 protocol 都要测 | ✓ |

`channel.KindWeixin` 不在 `Adapter` 接口里实现 `Adapter` 接口（飞书/企微/钉钉走 Adapter；微信直接走 `weixin.NewClient()` + `s.WeixinHTTP`）—— 是因为 ilink 不需要 SSE；公众号回调是 webhook，跟 Adapter 的 Poll 模式不匹配。

## 3. 拒绝依赖

- **不上 wechaty / padlocal**：这些都是桌面扫码 bridge，跟平台 SaaS 部署不兼容
- **不上 wework/wxwork 替代**：那已经是 `wecom` 路径
- **不暴露 ilink token 给前端**：通过 Vault / credentialsRef 间接调用（`handlers_channels.go:872-876`）

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/weixin/client.go` | Credentials / Mode / Personal / Official / 回调加解密 |
| `backend/internal/weixin/client_test.go` | 22 个测试（probe / send / OA 加密回环 / signature） |
| `backend/internal/server/handlers_channels.go` | 既存，已假定 `weixin.NewClient()/ParseCredentials/MaskToken` —— 现在能编译 |
| `backend/internal/server/handlers_channels_enterprise_test.go` | 既存端到端测试（ilink 模拟） |

## 5. 后续

- **个人号风控**：ilink 协议本身违反微信 ToS（个人号不允许自动化）；仅供 demo / 内部测试
- **公众号客服消息**：升级路径是迁移到 `custom_service/msg` 接口（不限制 48h 窗口）
- **频率限制**：ilink 侧 sidecar 通常自带 per-account 限流；平台层可加 token bucket（独立 ADR）
- **多账号**：Credentials 已经包含 `AccountID` 字段；session_routing 可基于此分流

## 6. 回退

- `internal/weixin/` 是新包；删除 import 即可
- 字段都是 optional，不破坏现有 mock
- `SendText` 旧签名 `(cred, to, text) error` 没了 —— 但代码库从未调用过该旧签名（之前编译就失败）
- `Client.HTTP` 是新增字段；nil 走默认 12s 超时