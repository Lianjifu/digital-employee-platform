# de-core 退役检查清单

1. FE / SDK 全部改用 gateway `http://127.0.0.1:8089`（或生产 Envoy）。
2. `make compose-up-coarse` 联调通过：sys/collab/cap/workflow + FastAPI。
3. 确认无进程依赖 `DE_CORE_URL` → `:8080`（policy/audit 遗留除外）。
4. staging 关闭 `apps` profile 中的 de-core；保留 coarse。
5. 删除 `cmd/de-core`、`services/de-core`，更新 README。
6. 可选：下线 `de-policy:8094` / `de-audit:8095`（已由 de-sys 吸收 `/v1/evaluate` 与 audit-center）。
