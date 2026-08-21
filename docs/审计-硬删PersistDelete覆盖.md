# 审计表：DELETE 路由 × PersistDelete 覆盖

> **日期**：2026-08-21  
> **用途**：近端 §2 企业写路径 · S2.1  
> **关联单测**：`backend/internal/server/hard_delete_persist_test.go` · 会话删除相关 `m3_copilot_test.go`

图例：

| 状态 | 含义 |
|------|------|
| OK | 已 `PersistDelete` / `PersistDeleteSync` / `durableDeleteSync` |
| SOFT | 产品语义为软删（如 status=revoked），持久化为 Upsert |
| GAP | 内存删除但未 PersistDelete，重启可能回潮 |
| N/A | 非资源删除（取消分享等） |

## 覆盖矩阵

| HTTP | 资源 | 集合 / 存储 | 状态 | 备注 |
|------|------|-------------|------|------|
| `DELETE /api/sessions/:id` | 会话 | `sessions` + `conversations` + `messages` + `context_snapshots`（+ 关联 memory） | **OK** | `PersistDeleteSync`；见 `handlers_contract.go` |
| `DELETE /api/conversations/:id` | 对话 | 同上 | **OK** | |
| `DELETE /api/knowledge/doc/:id` | 知识文档 | `knowledge_docs` + blob 文件 | **OK** | `durableDeleteSync` + `os.Remove` |
| `POST /api/knowledge/docs/delete` | 知识批量删 | `knowledge_docs` | **OK** | 同上 |
| `DELETE /api/model-providers/:id` | 模型供应商 | `model_providers` + `model_secrets` | **OK** | Sync + Vault Delete |
| `DELETE /api/channel-control/deployments/:id` | 渠道部署 | `channel_deploys` | **OK** | `durableDeleteSync`；被引用则 Conflict |
| `POST /api/skills/:id/uninstall` | 技能卸载 | `skills` + `skill_health` | **OK** | `PersistDelete`；见 hard_delete 单测 |
| 岗位包替换 / builtin 归一 | 技能目录 | `skill_catalog` / `skills` / `skill_health` | **OK** | `builtin_skills.go` |
| `DELETE /api/memory/records/:id` | 记忆 | `memory_records` | **SOFT** | 置 `revoked` + `persistMemory`；若产品要硬删须改语义并 Sync |
| `DELETE /api/workflow-templates/:id` | 个人流程模板 | `workflow_templates`（`WorkflowTpls`） | **OK** | 已入 DurableCollections + `durableDeleteSync`；仅 `origin=personal` |
| `DELETE /api/sessions/:id/share` | 取消分享 | 分享令牌 | **N/A** | 非主实体硬删 |
| 环缓冲裁剪 | snapshots / channel_inbound | 对应集合 | **查** | 挤出 id 须 PersistDelete（见环境文档） |

## 缺口与跟进

| ID | 问题 | 建议 | 优先级 |
|----|------|------|--------|
| G1 | 记忆删除为软删 | 产品确认：保留 SOFT，或提供 `?hard=1` admin 硬删 | P2 |
| G2 | 知识相关 extra（chunks/citation）仅内存过滤 | 确认 KnowledgeExtra Persist 是否覆盖子集合 | P1 |
| G3 | 环缓冲挤出路径 | 代码审 `context_snapshots` / `channel_inbound` 裁剪 | P1 |
| G4 | 工作区删除 | 若支持删工作区，须级联 PersistDelete 子资源 | P2 |

## 回归命令

```bash
cd backend
DE_RAG_URL=http://127.0.0.1:1 go test ./internal/server/ -count=1 -run 'HardDelete|Session.*Delete|Knowledge.*Delete|Memory'
```
