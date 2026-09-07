# ADR-028 — SQLite 双栈切换契约

- 状态：已接受
- 日期：2026-09-08
- 替代：[W1-W7-改进方案-todo.md §7 W7-D1](../../docs/W1-W7-改进方案-todo.md) 的"全栈 PG；无 sqlite driver 接入"
- 关系：与 `internal/infra/kv.go`（Postgres kv_documents）共享 schema contract；提供单文件嵌入式 demo / CI / 测试用持久层。

## 1. 上下文

控制面（Workspaces / Models / Knowledge / Skills / Memory / Channel…）当前两档：

| 档位 | 实现 | 触发 |
|---|---|---|
| In-memory（默认） | `store.Store` mutex-guarded maps + `SetPersistHook` 默认 nil | dev / 单元测试 |
| Postgres | `infra.KVStore.Upsert/UpsertMany/ReplaceCollection/List/Count` + `platform.kv_documents` 表 | prod / staging via `infra.OpenPostgres` |

候选方案：

| 方案 | 优 | 劣 |
|---|---|---|
| **保持 PG-only** | 统一栈 | CI / 演示需要起 PG，单文件 demo 失败 |
| **改 in-memory → boltdb / bbolt** | 单文件 | KV 语义与 PG 不对齐；新依赖 |
| **加 SQLite 双栈**（本文） | 单文件、纯 Go、无 CGO、与 PG schema 对齐 | 需要适配事务/锁 |

W7 要求："嵌入式单机演示"。CI 起 PG 太重；boltdb 与 PG schema 不可比（PG 用 `EXCLUDED.payload` upsert，boltdb 需手写）。SQLite + `modernc.org/sqlite`（纯 Go）成为最佳平衡。

## 2. 决策

新增 `internal/store/sqlite.go`：

| API | 角色 |
|---|---|
| `OpenSQLite(path) (*SQLiteHooks, error)` | 创建/打开单文件 db；PRAGMA `journal_mode=WAL`、`busy_timeout=5000`、`foreign_keys=on`；自动建表 |
| `(*SQLiteHooks).Persist(ctx, collection, items) error` | 与 `store.PersistFunc` 同形：shrink-heavy 走 `replaceCollection`，其余走 `upsertMany` |
| `(*SQLiteHooks).Delete(ctx, collection, ids) error` | 与 `store.DeleteFunc` 同形 |
| `(*SQLiteHooks).List(ctx, collection)` / `Count(ctx, collection)` | 测试与运维探针 |

Schema（与 PG `platform.kv_documents` 对齐）：

```sql
CREATE TABLE kv_documents (
    collection   TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT '',
    id           TEXT NOT NULL,
    payload      BLOB NOT NULL,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY(collection, workspace_id, id)
);
CREATE INDEX idx_kv_collection ON kv_documents(collection);
```

Env 切换：

| Env | 默认 | 行为 |
|---|---|---|
| `DE_STORE_BACKEND` | 空 | 空 → in-memory（不变） |
| `DE_STORE_BACKEND=sqlite` | n/a | 启用 SQLite；`OpenSQLite` 失败回退 in-memory（不 panic） |
| `DE_SQLITE_PATH` | `data/store.db` | 数据库文件路径；父目录自动 mkdir 0755 |

`server.New()` 内增加 `initSQLiteDurability()`：env 命中则 `store.SetPersistHook(h.Persist)` + 把 `*SQLiteHooks` 挂在 `Server.SQLite` 字段。

设计取舍：

| 选项 | 优 | 劣 | 选 |
|---|---|---|---|
| mattn/go-sqlite3 (CGO) | 性能最佳 | CGO；CI 镜像需要 gcc | ✗ |
| modernc.org/sqlite (pure Go) | 无 CGO；CI 即跑 | 较 mattn 慢 30% | ✓ |
| bbolt | 单文件 KV | schema 不可对齐 PG | ✗ |
| 全用 in-memory | 最简单 | 重启丢数据 | ✗（已默认） |

SQLite 路径不开新 goroutine 也不持久化到 PG；它就是 PG 路径在 demo/CI 场景的替代品。

## 3. 拒绝依赖

- **mattn/go-sqlite3**：避开 CGO + gcc 镜像体积
- **bbolt / badger**：与 PG schema 不可对齐
- **嵌入式 PG**：体积过大（libpq 几十 MB）

## 4. 实现

| 文件 | 角色 |
|---|---|
| `backend/internal/store/sqlite.go` | OpenSQLite / Persist / Delete / List / Count |
| `backend/internal/store/sqlite_test.go` | 10 个包测（含并发持久化 / reopen） |
| `backend/internal/server/server.go` | `SQLite *store.SQLiteHooks` 字段 + `initSQLiteDurability()` |
| `backend/internal/server/handlers_sqlite_test.go` | 3 个集成测（env 命中 / 默认 / 失败回退） |
| `backend/go.mod` | `+ modernc.org/sqlite v1.58.0` |

## 5. 后续

- W7-D2 WeChat 渠道：SQLite 也可持久化 channel_dlq（已是 DurableCollections）
- 多进程写：SQLite WAL 允许多 reader + 单 writer；如果未来需要多 writer，再加 application-level advisory lock
- 升级路径：若 W8 决定把 SQLite 作为正式 demo 档位，加 `litestream` / `rqlite` 复制

## 6. 回退

- `*store.SQLiteHooks` 字段为 nil 时与现行为一致
- env `DE_STORE_BACKEND=sqlite` 失败 → 静默回退 in-memory（记 `log.Printf`）
- `PersistSync` / `Persist` 行为不变：hook 为 nil 时 no-op
- `OpenSQLite` 用独立 `_ "modernc.org/sqlite"` 匿名导入；不导入 PG 包，纯 Go 二进制仍可跑