# 网络分区

| 网络 | 成员 | 说明 |
|------|------|------|
| `de_net` | gateway、**de-app**（monolith）或 de-sys/collab/cap/workflow（coarse）、agent-runtime、rag、postgres、redis、… | 控制面与数据面 |
| `de_exec_net` | **de-skill-runtime**；monolith 下 de-app 双挂；coarse 下 de-collab/de-cap 双挂 | 沙箱；无 PG/Redis DSN |
| `de_obs_net` | 规划中；当前 obs 组件仍在 `de_net` | 可选隔离抓取 |

Compose：`deploy/compose.yml` → `networks.de_net` / `de_exec_net`。
