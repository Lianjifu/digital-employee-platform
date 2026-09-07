# ADR-032 — VisualDiff 缓存与置信度

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §4 W4-D2](../../docs/W1-W7-改进方案-todo.md) 的"无 rasterize / compare 包"占位
- 关系：被 W4 排查手册 §visualdiff 引用

## 1. 上下文

W4-D2 之前，"前后截图对比" 完全在前端做 — 用 canvas 像素循环 + 全量 diff。后果：
- 浏览器卡顿，1920×1080 图差异 > 2M 像素
- 服务端无 diff 缓存，相同截图对每次重算
- 无审计 / 指标，无法知道谁对比过、对比多久

原始计划提的是 "rod + pixelmatch"。两个问题：
- rod / chromedp 是几百 MB 的 headless chromium 运行时，添加成本高
- pixelmatch 是纯 JS 库，需要在前端跑 —— 与服务端方案不匹配

## 2. 决策

**客户端截图 + 服务端 diff**。浏览器捕获两张 PNG（canvas.toDataURL / html2canvas），POST 到 `/api/visualdiff`，服务端纯 Go 解码 + 像素比较 + 高亮 + 缓存。

| 组件 | 角色 |
|---|---|
| `internal/visualdiff.Diff` | 解码两张 PNG → resize → 像素 walk → 返回 `Result` |
| `internal/visualdiff.SizesBucket` | 把像素数映射到 4 个桶（small/medium/large/huge） |
| `internal/visualdiff.EvictOlderThan` | 缓存 TTL 驱逐（DE_VISUALDIFF_RETENTION 默认 7 天） |
| `POST /api/visualdiff` | 接 `{before, after, threshold, highlight, tolerance, resizeWidth, resizeHeight}` |
| `GET /api/visualdiff/<key>.png` | 流式返回缓存的高亮 PNG |

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. rod 服务端截图 | 任意 URL 都能抓 | 几百 MB 运行时；CI 复杂 | ✗ |
| B. 前端纯 JS pixel diff | 服务端零代码 | 浏览器卡顿；无缓存；无指标 | ✗ |
| C. **客户端截图 + 服务端纯 Go diff（本文）** | 无重依赖；可缓存；可指标 | 客户端需自带截图能力 | ✓ |
| D. shell out ImageMagick | 成熟 | 需运行时安装 `compare` | ✗ |

缓存键：`SHA256(size|"<b>"|"<a>"|tolerance|threshold|highlight)`，前 8 字节哈希拼前缀防碰撞。键对应一个 `<key>.json`（结果摘要）+ 可选 `<key>.png`（高亮图）。

置信度（confidence）通过 `diffRatio`（不同像素 / 总像素）+ `tolerance`（每通道 Δ 阈值）双信号传达。客户端自己解释，不强加"置信度分数"。

## 3. 拒绝依赖

- **不引入 `github.com/anthonynsimon/bild` 或 `disintegration/imaging`**：标准库 `image/png` + 自己写 nearest-neighbor resize 足够
- **不引入 `github.com/fogleman/gg`**：画 diff 高亮只需要 Set + RGBA，不需要 2D 图形库
- **不引入 rod / chromedp**：见 §2 C 行

如未来需要更高质量的 resize，可加 `golang.org/x/image/draw`（标准扩展库）；不需要 license 审计。

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/visualdiff/visualdiff.go` | Diff / SizesBucket / 缓存读写 / TTL 驱逐 |
| `backend/internal/visualdiff/visualdiff_test.go` | 13 个单测（match / no-match / tolerance / highlight / cache / context / evict / size bucket / 边界） |
| `backend/internal/server/handlers_visualdiff.go` | POST + GET handler + janitor goroutine |
| `backend/internal/server/handlers_visualdiff_test.go` | 8 个集成测试（含 path traversal 拒绝） |
| `backend/internal/metrics/metrics.go` | `VisualDiffBuckets` (count + sumNS per size bucket) |
| `backend/internal/server/metrics.go` | scrape handler 输出 `de_visualdiff_seconds_sum{size}` + `de_visualdiff_total{size}` |

Env 旗标：
- `DE_VISUALDIFF_CACHE_DIR`（默认 `data/visual-diff`）
- `DE_VISUALDIFF_RETENTION`（默认 `168h` = 7 天）

## 5. 后续

- W4 排查手册补 visualdiff 段（current scope 是 heartbeat；visualdiff 后续补）
- W6-D2 Canvas 协作将复用 `SizesBucket` 给 canvas-snapshot 标 "tiny / medium / huge" 给调度器用
- W7 Session Sync 复用 cache key 做"上次有效截图 hash"，给跨设备回放

## 6. 回退

- `internal/visualdiff` 是独立包，删除不影响其它代码
- 2 个新路由 `/api/visualdiff*`，前缀不撞已有
- 缓存目录是 `data/visual-diff/`，可 `rm -rf` 一键清理
- janitor goroutine 在进程退出时自然死亡，无需清理逻辑