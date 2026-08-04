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

`de-sys` / `de-collab` / `de-cap` mount these handlers at `/de.*.Service/*` and `/connect/de.*.Service/*`（按 ServiceMode）。
