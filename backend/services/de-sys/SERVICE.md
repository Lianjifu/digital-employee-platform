# de-sys

| 项 | 值 |
|----|----|
| 端口 | **8100** |
| 模式 | `DE_SERVICE` / ModeSys |
| 模块 | platform · policy · audit · ops |
| 逻辑层 | L10 · L11 · L12 · L13 |

吸收原 `de-policy:8094` 的 `/v1/evaluate` 与审计中心写路径（本地 sink）。

```bash
cd backend && make run-sys
```
