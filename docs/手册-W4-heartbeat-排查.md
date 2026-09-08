# W4 排查手册 — Heartbeat / 在线探测 + VisualDiff 视觉回归

> 状态：实施就绪
> 日期：2026-09-08
> 前置：W3-D3 Preview sandbox、ADR-031、ADR-032
> 关系：本手册是 ADR-031 + ADR-032 的运维配套；不写 ADR 决策

## 1. Heartbeat / 在线探测

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

## 2. VisualDiff 视觉回归

### 2.1 现象对照

| 现象 | 可能原因 | 怎么查 |
|---|---|---|
| 永远返回 `match=true` 但 UI 显示明显差异 | base64 解码失败 / PNG header 被截断 | `internal/visualdiff` 内置 `decodePNG` 返回 `ErrInvalidPNG`，先看 server log；前端 `visualdiff-api.ts` 会把 `ErrInvalidPNG` 转成 `{err:'invalid_png'}` |
| `diffRatio` 比预期高得多 | 两个 PNG 分辨率不一致但被强 reshape | 当前版本要求 caller 自带同分辨率；W6-P2 计划加 `resizeToMatch` |
| 缓存命中但 diffPNG 还是旧版 | `cacheKey` 没换 | `cacheKey = sha256(before || after || threshold || tolerance)`，任何参数变才会换 key；检查 threshold 控件是否触发 recompute |
| `de_visualdiff_total{size="huge"}` 暴涨 | 上传了 1080p+ 大图 | 看 `DE_VISUALDIFF_CACHE_DIR` 磁盘；`huge` 是 ≥ 1920×1080 |
| 文件锁 / janitor 写失败 | 多进程同时启动 sweep | 默认 1h 一次；`ErrCacheLocked` 写日志但不 panic，下次 sweep 重试 |

### 2.2 配置

| Env | 默认 | 说明 |
|---|---|---|
| `DE_VISUALDIFF_CACHE_DIR` | `data/visual-diff` | 高亮 PNG 落盘目录 |
| `DE_VISUALDIFF_RETENTION` | `168h`（7 天） | 缓存 TTL；janitor 每小时扫一次 |

合法值：任何 Go `time.ParseDuration` 能解析的字符串（如 `24h` / `30m`）。

### 2.3 端到端 smoke

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8089/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"x"}' | jq -r .data.token)

# 1) 上传 before + after (本地小图，base64)
B64=$(base64 -i tests/fixtures/visualdiff/before.png)
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"before\":\"$B64\",\"after\":\"$B64\",\"threshold\":0.1}" \
  http://127.0.0.1:8089/api/visualdiff | jq .data
# → { "match": true, "diffRatio": 0, "diffPixels": 0, "cacheKey": "..." }

# 2) 取高亮图
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8089/api/visualdiff/<cacheKey>.png -o /tmp/diff.png

# 3) 看指标
curl -sf http://127.0.0.1:8089/metrics | grep de_visualdiff
# → de_visualdiff_total{size="small"} N
# → de_visualdiff_seconds_sum{size="small"} ...
```

### 2.4 已知边界

- **必须同分辨率** — 当前版本要求两张图 `width × height` 一致；否则返回 400 `size_mismatch`。
- **大图慢** — `huge` bucket（≥ 1920×1080）单次 50–200ms；批量跑要串行。
- **进程重启即丢缓存** — 设计取舍；`cacheKey` 是 sha256，replay 即可重算。
- **多副本** — 当前是本地 fs 缓存；多实例部署会各自存一份。
- **高亮色** — 固定 `rgba(255,0,0,128)`；W6-P2 计划加色板。