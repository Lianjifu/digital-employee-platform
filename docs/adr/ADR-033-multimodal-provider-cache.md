# ADR-033 — Multimodal 提取 provider 抽象与缓存

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §5 W5-D2](../../docs/W1-W7-改进方案-todo.md) 的"`attach` 接口有，但后端未做 OCR / ASR"
- 关系：被 FE-2（mic / 拍照）和 W7（session sync）复用做"用户上传的多模态内容如何变成模型可消费的文本"

## 1. 上下文

W5-D2 之前，`POST /api/attachments/upload` 把任意文件存盘后只回 `id + size + mime`，模型完全看不到内容。要让模型"看图 / 听音"，必须把上传文件先用 OCR / ASR 转成文本，再喂进 system prompt。

需求：
- 一个统一的多模态提取接口，未来接 Tesseract / Whisper / 第三方 API 都用同一调用面
- 缓存：同一张图重复上传 / 同一段录音 retry 不能每次重算（OCR/ASR 都是分钟级延迟）
- 测试 / CI 可跑：不能每次都依赖外部二进制

## 2. 决策

新增 `internal/multimodal/` 包 + Server 端挂载：

| 组件 | 角色 |
|---|---|
| `Provider` 接口 | `Name() / Kind() / Available() / Extract(ctx, bytes, mime) → Extraction` |
| `Registry` | 注册 + 派发 + 缓存；并发安全（sync.RWMutex） |
| `Kind` 枚举 | `ocr` / `asr` / `image-caption`（narrow list；新增走 ADR） |
| `Extraction` | `Text + Segments + Meta + Provider + Cached + LatencyMS` |
| 内置 `ocrStubProvider` / `asrStubProvider` | DE_MULTIMODAL_OCR=stub / DE_MULTIMODAL_ASR=stub 启用；CI 必备 |

API：`POST /api/multimodal/extract` 接 `multipart/form-data { file, kind }`，返回 JSON envelope。

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| A. 直接调 Tesseract 二进制 | 成熟 | 进程内阻塞；缺二进制整个 API 挂；CGO 难做 | ✗ |
| B. 接第三方云 API（GPT-4V / Whisper API） | 无二进制依赖 | 成本；数据出域；缺 key 全挂 | ✗ |
| C. **Provider 接口 + Stub 默认（本文）** | 接口稳定；CI 绿；真实 provider 后插 | 真实 OCR/ASR 仍需独立工作 | ✓ |

C 路线把"接口契约 / 缓存 / 派发 / stub"全部落地，真实 provider 是后续 env-gated 注册的填空题。

缓存键：`SHA256(provider + "|" + kind + "|" + mime + "|" + SHA256(input)[:])`。
不同 MIME 即便内容相同也 miss — 因为 OCR/ASR 不会"跨格式"复用结果。

错误码：

| 错误 | HTTP |
|---|---|
| `ErrNoProvider{Kind}` | 501 Not Implemented — 配置缺 |
| `ErrProviderUnavailable{Provider, Kind}` | 503 — Provider 注册了但 `Available()==false` |
| 提取本身失败 | 400 — 调用方可读 err.Error() |

## 3. 拒绝依赖

- **不引入 Tesseract / Whisper / CGO**：避免运行时重依赖
- **不引入 gRPC 客户端 SDK**：提取在同进程
- **不写 PNG/HTTP 库**：直接用 multipart 上传 + standard library

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/multimodal/multimodal.go` | Registry + Provider + Extraction + 缓存 |
| `backend/internal/multimodal/multimodal_test.go` | 11 个单测（注册 / 派发 / 缓存 / MIME 区分 / TTL / MimeForExt） |
| `backend/internal/server/handlers_multimodal.go` | `POST /api/multimodal/extract` + stub OCR/ASR provider + janitor |
| `backend/internal/server/handlers_multimodal_test.go` | 5 个集成测试（含缓存命中） |
| `backend/internal/server/server.go` | `Multimodal *multimodal.Registry` 字段；`initMultimodal()` 在 New() 末尾执行 |

Env 旗标：
- `DE_MULTIMODAL_OCR`（默认空）— `stub` 注册 ocrStubProvider
- `DE_MULTIMODAL_ASR`（默认空）— `stub` 注册 asrStubProvider
- `DE_MULTIMODAL_CACHE_DIR`（默认空 = 不缓存）

## 5. 后续

- W5-D1 SelfImproving 将复用 `Registry` 把"用户反馈 → 改写 SOP"流程里的截图先 OCR 再喂模型
- W7 Session Sync 把"用户上一次发的截图"hash 进 sync 状态
- 真实 provider（Tesseract / Whisper / 第三方）作为独立包新增，main 在 init 时根据 env 注册
- 未来加 `image-caption`（CLIP / BLIP）也走同一接口

## 6. 回退

- `internal/multimodal/` 是独立包
- `Multimodal` 字段在 Server struct 末尾，新增无破坏
- 默认无 env flag = 无 provider 注册 = `POST` 返回 501 = 不破坏现有调用方
- 删除 `initMultimodal()` 调用 + `Multimodal` 字段即可完全回滚