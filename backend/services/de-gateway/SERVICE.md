# de-gateway

Envoy 入口，按 profile 选择路由配置。

| Profile | 配置 | Upstream |
|---------|------|----------|
| **monolith**（默认） | `envoy.monolith.yaml` | de-app:8100 |
| **coarse** | `envoy.coarse.yaml` | de-sys:8100 · de-collab:8101 · de-cap:8102 · de-workflow:8103 |

| 项 | 值 |
|----|----|
| 监听 | **8089** |
| 本机 dev | `scripts/dev-stack/gateway-proxy-monolith.py` 或 `gateway-proxy.py` |

```bash
make compose-up-monolith   # 或 make run
# FE: VITE_API_BASE=http://127.0.0.1:8089
make compose-up-coarse     # 四进程
```

mTLS / SPIFFE 另见 `envoy.mtls.yaml` / `envoy.spiffe.yaml`（8443/8444）。
