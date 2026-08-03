# de-workflow

| 项 | 值 |
|----|----|
| HTTP | **8103** |
| Worker | Temporal queue `de-workflow` |
| 逻辑层 | L08 |

`DE_WORKFLOW_HTTP=1`（默认）启 HTTP；`DE_TEMPORAL_HOST` 非空启 Worker；`DE_WORKFLOW_WORKER=0` 可关 Worker。

```bash
cd backend && make run-workflow
```
