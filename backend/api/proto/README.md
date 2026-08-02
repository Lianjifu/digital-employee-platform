# Connect-RPC / Protobuf IDL

服务定义位于 `de/{platform,policy,audit,collab,employee,runtime,rag}/v1`。

```bash
cd backend && make buf-generate
```

已生成并挂载：

| 路径 | 说明 |
|------|------|
| `/de.*.Service/*` | 正式 Connect（Protobuf / Connect-JSON） |
| `/connect/de.*.Service/*` | 遗留 `{ok,data}` JSON 信封（兼容早期联调） |

生成物见 [`gen/`](../../gen)。