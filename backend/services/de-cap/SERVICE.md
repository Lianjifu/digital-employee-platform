# de-cap

| 项 | 值 |
|----|----|
| 端口 | **8102** |
| 模块 | model · knowledge · memory · skill · channel |
| 逻辑层 | L04–L07 · L09 |

能力控制面（非执行）。执行面见 de-agent-runtime / de-rag / de-skill-runtime。

对外模型调用：`POST /api/model-invoke`、`POST /api/model-invoke/stream`（凭据 Vault / `model_secrets`）。

```bash
cd backend && make run-cap
# 内网/Ollama：DE_MODEL_ALLOW_PRIVATE=1
```
