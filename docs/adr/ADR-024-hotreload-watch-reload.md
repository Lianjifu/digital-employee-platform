# ADR-024 — HotReload watch + reload 安全语义

> 状态：草案
> 日期：2026-09-08
> 前置：W3-D2 实施完成（`backend/internal/hotreload/`）。

## 1. Context

W3-D2 提供「配置改了不用重启」的能力。设计目标：

1. **可靠**：mtime 轮询（默认 5s）+ SIGHUP 强触发，覆盖容器 / fsnotify 失效场景。
2. **安全**：解析失败 / 应用失败 **不替换** 已生效的值，进程不崩。
3. **可观察**：`de_hotreload_reload_total{resource,result}` 计数 + 可调
   `LastError(name)` 暴露给 ops。

## 2. 决策

### 2.1 双触发源

- **mtime 轮询**：每 `interval`（默认 5s，可调）走一遍注册列表，比对
  `os.Stat().ModTime()` 与缓存值；变了就 reload。轮询解决两个真实
  场景：(a) vi / sed in-place 编辑，fsnotify 容易丢事件；(b) 容器内
  bind-mount 跨 inode 的写，fsnotify 行为不可预测。
- **SIGHUP**：运维触发 `kill -HUP <pid>` 立刻强制 reload。CI / 容器
  默认 `WithDisableSignal(true)`，因为没有 controlling terminal。

### 2.2 失败语义

```
   file change
        │
        ▼
   os.ReadFile  ──err──▶ record(err) ─▶ metric fail ─▶ keep old value
        │
        ▼ ok
   Parse(bytes) ──err──▶ record(err) ─▶ metric fail ─▶ keep old value
        │
        ▼ ok
   Apply(value) ──err──▶ record(err) ─▶ metric fail ─▶ keep old value
        │
        ▼ ok
   record(ok)   ─▶ metric success ─▶ publish new value
```

任何一环失败：
- `lastValue` **保持上一次成功的值**。
- `lastErr` 记录最近一次错误（`LastError(name)` 暴露）。
- `lastMtime` 仍前进，否则同一坏文件会无限重试；前进之后 ops 修文件
  mtime 自然超过，会再次触发。

### 2.3 first poll = "known good state"

`Run` 启动后 **第一次 poll 就会 reload** 所有存在且非空的资源文件。这
是有意为之 — 让系统处于「已知状态」，避免「启动后第一个错误其实是
配置从一开始就没生效」的尴尬。如果调用方不希望这个行为，注册空
path + 占位 Apply 来抑制；或者用 `scanAll` 之前清空文件再启动。

### 2.4 指标

`de_hotreload_reload_total{service,resource,result}`，result ∈
`{success, fail}`。resource 是 `Resource.Name` 字段，由调用方提供
（典型值：`publisher-key` / `routing-policy` / `channel-templates`）。

scrape handler 只 publish 已有 success/fail 的 resource，零行代表这
个进程还没 reload 过任何资源（与「自上次启动以来没改过」对齐）。

### 2.5 与 env 旗标的关系

| Env | 默认 | 行为 |
|---|---|---|
| `DE_HOTRELOAD_INTERVAL_MS` | `5000` | 轮询间隔。设为 0 关闭轮询（仅 SIGHUP）。 |
| `DE_HOTRELOAD_DISABLE_SIGNAL` | `false` | 设为 true 关闭 SIGHUP（容器 / CI）。 |

env 旗标本身在 W3-D2 不强制读取 — 由调用方决定是否把 env 接到
`WithInterval` / `WithDisableSignal`。这是有意的：hotreload 包不依赖
`os.Getenv`，保持纯库语义。

## 3. 接口

```go
type Parser[T any] func(path string, data []byte) (T, error)
type Apply[T any]  func(path string, v T) error
type Resource[T any] struct { Name, Path string; Parse Parser[T]; Apply Apply[T] }

w := hotreload.New(resources, hotreload.WithInterval(5*time.Second))
go w.Run(ctx)               // blocks until ctx is canceled
err := w.LastError("name")  // last parse/apply error or nil
v, ok := w.LastValue("name")// most recent successful parsed value
w.ScanNow()                 // force reload without waiting for tick
```

泛型让调用方把任何可配置结构（struct / int / map）丢进去，不需要反
序列化再编码。

## 4. 已知 trade-off

| 项 | 取舍 |
|---|---|
| 轮询 vs fsnotify | 选轮询（更可靠，多 1 个 timer）。容器化场景下 fsnotify 容易丢事件。 |
| 同步阻塞式 Apply | Apply 阻塞在 Run goroutine 里。设计前提：Apply 是 in-memory 状态写入，< 100ms。 |
| 不接 env 直接读 | 由调用方决定怎么读 env；hotreload 包保持纯库语义。 |
| Parse 不重试 | 一次失败即放弃当前值；调用方决定是否在 Apply 内部做退避。 |

## 5. 未来工作

| 项 | 何时 |
|---|---|
| 全局统一启动器（拉 env + 启动所有 watcher） | W4-D1 Heartbeat 时 |
| 热重载 channel templates / model providers | 跟随对应模块 |
| fsnotify 作为可选 backend | 当 fsnotify 的事件丢失问题可解决时 |

## 6. 回滚

`internal/hotreload/` 是新增包，没有调用方时删除即可。当前没有调用
方；待 W4 起接 publisher-key / routing-policy 时再启用。
