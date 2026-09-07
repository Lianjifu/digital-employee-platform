# W4-D1 排查手册 — Heartbeat / 在线探测

> 状态：实施就绪
> 日期：2026-09-08
> 前置：W3-D3 Preview sandbox、ADR-031
> 关系：本手册是 ADR-031 的运维配套；不写 ADR 决策

## 1. 现象对照

| 现象 | 可能原因 | 怎么查 |
|---|---|---|
| `de_canvas_clients_online` 始终 0 | Tracker 没收到 Touch | 看 server log `skill signing: ...` 之后有没有 `heartbeat` 相关 panic；`curl /api/online` 是否返回 `[]` |
| SSE 客户端断流 | 反向代理 / CDN 中断了 `text/event-stream` | 浏览器 DevTools → Network → 看 event-stream 是否停在 `ping`；检查 nginx `proxy_buffering off` + `proxy_read_timeout` ≥ 120s |
| `de_heartbeat_lag_seconds` 持续 > 60s | 客户端断开后 90s 内被驱逐前的窗口 | 检查 front-end 是否在 keepalive；用 `curl /api/heartbeat` 看看服务端自报 lag |
| `lagSeconds` 一直 0 | Touch 频繁到秒级以下 | 正常 —— 高频在线场景下 lag 接近 0 |
| 多人登录但 online 只有 1 | 中间件顺序错 / requireAuth 提前返回 | 看 `internal/server/server.go:251` 是否 `requireAuth → withHeartbeat` |

## 2. 配置

| Env | 默认 | 说明 |
|---|---|---|
| `DE_HEARTBEAT_INTERVAL` | `30s` | sweep 周期 + SSE ping 周期 |
| `DE_HEARTBEAT_STALE` | `90s`（3 × Interval） | presence stale 阈值 |

合法值：任何 Go `time.ParseDuration` 能解析的字符串（如 `45s` / `2m` / `1500ms`）。

## 3. 端到端 smoke

```bash
# 1) 触发一次 Touch（任何 authed 请求）
TOKEN=$(curl -sf -X POST http://127.0.0.1:8089/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"x"}' | jq -r .data.token)

curl -sf -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: w1" \
  http://127.0.0.1:8089/api/skills > /dev/null

# 2) 立刻看 presence
curl -sf -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: w1" \
  http://127.0.0.1:8089/api/online | jq .data
# → { "workspaceId": "w1", "count": 1, "online": [{"identityId": "u1", ...}] }

# 3) probe
curl -sf -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: w1" \
  http://127.0.0.1:8089/api/heartbeat | jq .data
# → { "ok": true, "lagSeconds": <≈0>, "now": "2026-09-08T..." }

# 4) SSE 流（带 timeout）
timeout 5 curl -N -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: w1" \
  http://127.0.0.1:8089/api/online/stream
# → 看到 "event: snapshot" → "event: ping"（每 30s）
```

## 4. 已知边界

- **进程重启即丢 presence** — 设计取舍（ADR-031 §2）。需要持久 presence 用 W7 Session Sync。
- **多设备聚合** — `(ws, identity)` 单条记录；W6-D2 Canvas 才分设备。
- **跨 workspace 查询** — 不支持；`?workspace=other` 被忽略。
- **Stale 期间** — 用户最后一次请求到驱逐之间最长 `StaleAfter`（默认 90s），期间仍会显示在线。
- **SSE 在 nginx 后** — 必须 `proxy_buffering off` + `proxy_read_timeout 120s`，否则 60s 默认超时。