# de-gateway

Envoy 粗粒度入口：`deploy/envoy/envoy.coarse.yaml`。

| 项 | 值 |
|----|----|
| 监听 | **8089**（compose `envoy-coarse`） |
| Upstream | de-sys:8100 · de-collab:8101 · de-cap:8102 · de-workflow:8103（Docker DNS） |

```bash
make compose-up-coarse
# FE: VITE_API_BASE=http://127.0.0.1:8089
```

mTLS / SPIFFE 另见 `envoy.mtls.yaml` / `envoy.spiffe.yaml`（8443/8444）。
