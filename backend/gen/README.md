# Generated Connect / Protobuf

Source IDL: [`../api/proto`](../api/proto)

Regenerate (from `backend/`):

```bash
make buf-generate
```

Requires `buf`, `protoc-gen-go`, `protoc-gen-connect-go` on `PATH` (Makefile installs the plugins via `go install` when missing).

Committed outputs:

- `de/*/v1/*.pb.go`
- `de/*/v1/*connect/*.connect.go`

`de-app`（monolith）或 `de-sys` / `de-collab` / `de-cap`（coarse）按 ServiceMode 挂载 handlers，路径为 `/de.*.Service/*` 与 `/connect/de.*.Service/*`。
