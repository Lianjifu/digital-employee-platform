# de-collab

| 项 | 值 |
|----|----|
| 端口 | **8101** |
| 模块 | collab · employee |
| 逻辑层 | L02 |

会话 / Copilot SSE / 任务 / 数字员工。

Copilot 模型调用经 `DE_CAP_URL`（默认 `http://127.0.0.1:8102`）转发到 de-cap `/api/model-invoke/stream`。

```bash
cd backend && make run-collab
# 需同时 make run-cap；本机私网模型在 Cap 侧设 DE_MODEL_ALLOW_PRIVATE=1
```
