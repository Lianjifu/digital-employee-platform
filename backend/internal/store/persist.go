package store

import (
	"context"
	"log"
)

// PersistFunc writes a named collection snapshot to durable storage.
type PersistFunc func(ctx context.Context, collection string, items []map[string]any) error

// DurableCollections are hydrated/persisted via platform.kv_documents.
var DurableCollections = []string{
	"workspaces",
	"model_providers",
	"routing_policies",
	"policy_versions",
	"model_audit",
	"model_budgets",
	"workflows",
	"workflow_runs",
	"employees",
	"backups",
	"tasks",
	"conversations",
	"messages",
	"knowledge_docs",
	"memory_candidates",
	"memory_records",
	"channel_dlq",
	"channel_deploys",
	"release_approvals",
}

// SetPersistHook registers durable snapshot writer (Postgres kv_documents).
func (s *Store) SetPersistHook(fn PersistFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.persistHook = fn
}

// PersistCollection snapshots a collection asynchronously (caller should hold Lock or own slice).
func (s *Store) PersistCollection(collection string, items []map[string]any) {
	if s.persistHook == nil {
		return
	}
	cp := make([]map[string]any, len(items))
	copy(cp, items)
	go func() {
		if err := s.persistHook(context.Background(), collection, cp); err != nil {
			log.Printf("persist %s: %v", collection, err)
		}
	}()
}

// Persist snapshots a named durable collection (safe to call without holding Lock).
func (s *Store) Persist(collection string) {
	s.RLock()
	items := s.snapshotLocked(collection)
	s.RUnlock()
	if items == nil {
		return
	}
	s.PersistCollection(collection, items)
}

func (s *Store) snapshotLocked(collection string) []map[string]any {
	switch collection {
	case "workspaces":
		return s.Workspaces
	case "model_providers":
		return s.ModelProviders
	case "routing_policies":
		return s.RoutingPolicies
	case "policy_versions":
		return s.PolicyVersions
	case "model_audit":
		return s.ModelAudit
	case "model_budgets":
		return s.ModelBudgets
	case "workflows":
		return s.Workflows
	case "workflow_runs":
		return s.WorkflowRuns
	case "employees":
		return s.Employees
	case "backups":
		return s.Backups
	case "tasks":
		return s.Tasks
	case "conversations":
		return s.Conversations
	case "messages":
		out := make([]map[string]any, 0, len(s.Messages))
		for cid, msgs := range s.Messages {
			ws := ""
			for _, c := range s.Conversations {
				if str(c["id"]) == cid {
					ws = str(c["workspaceId"])
					break
				}
			}
			out = append(out, map[string]any{
				"id": cid, "workspaceId": ws, "messages": msgs,
			})
		}
		return out
	case "knowledge_docs":
		return s.KnowledgeDocs
	case "memory_candidates":
		return s.MemoryCands
	case "memory_records":
		return s.MemoryRecords
	case "channel_dlq":
		return s.ChannelDLQ
	case "channel_deploys":
		return s.ChannelDeploys
	case "release_approvals":
		return s.ReleaseApprovals
	default:
		return nil
	}
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

// PersistNow synchronously persists all durable collections (startup / tests).
func (s *Store) PersistNow(ctx context.Context) error {
	if s.persistHook == nil {
		return nil
	}
	s.RLock()
	defer s.RUnlock()
	for _, name := range DurableCollections {
		items := s.snapshotLocked(name)
		if items == nil {
			continue
		}
		if err := s.persistHook(ctx, name, items); err != nil {
			return err
		}
	}
	return nil
}

// HydrateFrom replaces in-memory state when durable store has rows.
func (s *Store) HydrateFrom(collection string, items []map[string]any) {
	if len(items) == 0 {
		return
	}
	s.Lock()
	defer s.Unlock()
	switch collection {
	case "workspaces":
		s.Workspaces = items
	case "model_providers":
		s.ModelProviders = items
	case "routing_policies":
		s.RoutingPolicies = items
	case "policy_versions":
		s.PolicyVersions = items
	case "model_audit":
		s.ModelAudit = items
	case "model_budgets":
		s.ModelBudgets = items
	case "workflows":
		s.Workflows = items
	case "workflow_runs":
		s.WorkflowRuns = items
	case "employees":
		s.Employees = items
	case "backups":
		s.Backups = items
	case "tasks":
		s.Tasks = items
	case "conversations":
		s.Conversations = items
	case "messages":
		s.Messages = map[string][]map[string]any{}
		for _, doc := range items {
			cid := str(doc["id"])
			if cid == "" {
				continue
			}
			if arr, ok := doc["messages"].([]any); ok {
				msgs := make([]map[string]any, 0, len(arr))
				for _, x := range arr {
					if m, ok := x.(map[string]any); ok {
						msgs = append(msgs, m)
					}
				}
				s.Messages[cid] = msgs
			} else if arr, ok := doc["messages"].([]map[string]any); ok {
				s.Messages[cid] = arr
			}
		}
	case "knowledge_docs":
		s.KnowledgeDocs = items
	case "memory_candidates":
		s.MemoryCands = items
	case "memory_records":
		s.MemoryRecords = items
	case "channel_dlq":
		s.ChannelDLQ = items
	case "channel_deploys":
		s.ChannelDeploys = items
	case "release_approvals":
		s.ReleaseApprovals = items
	}
}
