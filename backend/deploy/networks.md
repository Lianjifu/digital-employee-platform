# 网络分区

| 网络 | 成员 | 说明 |
|------|------|------|
| `de_net` | gateway、de-sys/collab/cap/workflow、agent-runtime、rag、postgres、redis、… | 控制面与数据面 |
| `de_exec_net` | **仅** de-skill-runtime（+ de-collab/de-cap 为调执行面可双挂） | 沙箱；无 PG/Redis DSN |
| `de_obs_net` | 规划中；当前 obs 组件仍在 `de_net` | 可选隔离抓取 |

Compose：`deploy/compose.yml` → `networks.de_net` / `de_exec_net`。
