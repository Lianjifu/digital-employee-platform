package store

import (
	"context"
	"fmt"
	"log"
)

// PersistFunc writes a named collection snapshot to durable storage.
type PersistFunc func(ctx context.Context, collection string, items []map[string]any) error

// DeleteFunc removes documents by id from durable storage (any workspace_id).
type DeleteFunc func(ctx context.Context, collection string, ids []string) error

// replaceOnPersist collections still use full replace (single-writer / shrink-heavy).
// channel_inbound is a kernel table (R2) and grows; it must not replace the whole set.
var replaceOnPersist = map[string]bool{
	"channel_dlq":   true,
	"channel_audit": true,
}

// ShouldReplaceOnPersist reports collections that still need full-table replace (shrink-heavy).
func ShouldReplaceOnPersist(collection string) bool {
	return replaceOnPersist[collection]
}

// DurableCollections are hydrated/persisted via platform.kv_documents.
var DurableCollections = []string{
	"workspaces",
	"model_providers",
	"routing_policies",
	"policy_versions",
	"model_audit",
	"model_budgets",
	"model_secrets",
	"workflows",
	"workflow_runs",
	"employees",
	"backups",
	"tasks",
	"conversations",
	"messages",
	"sessions",
	"actions",
	"knowledge_docs",
	"knowledge_extra",
	"memory_candidates",
	"evolve_candidates",
	"memory_records",
	"memory_policies",
	"memory_audits",
	"channel_dlq",
	"channel_deploys",
	"delivery_policies",
	"delivery_policy_versions",
	"channel_templates",
	"channel_blacklist",
	"channel_audit",
	"channel_inbound",
	"context_snapshots",
	"release_approvals",
	"zt_policies",
	"access_grants",
	"access_reviews",
	"sod_rules",
	"temp_auths",
	"skills",
	"skill_catalog",
	"skill_health",
	"skill_integrations",
	"skill_extra",
	"workflow_skills",
}

// SetPersistHook registers durable snapshot writer (Postgres kv_documents).
func (s *Store) SetPersistHook(fn PersistFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.persistHook = fn
}

// SetDeleteHook registers durable document deleter.
func (s *Store) SetDeleteHook(fn DeleteFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleteHook = fn
}

// PersistDelete removes documents from durable storage asynchronously.
func (s *Store) PersistDelete(collection string, ids ...string) {
	if s.deleteHook == nil || len(ids) == 0 {
		return
	}
	clean := make([]string, 0, len(ids))
	seen := map[string]struct{}{}
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		clean = append(clean, id)
	}
	if len(clean) == 0 {
		return
	}
	go func() {
		if err := s.deleteHook(context.Background(), collection, clean); err != nil {
			log.Printf("persist-delete %s: %v", collection, err)
		}
	}()
}

// PersistCollection snapshots a collection asynchronously (caller should hold Lock or own slice).
func (s *Store) PersistCollection(collection string, items []map[string]any) {
	if !s.CanWrite(collection) {
		panic(fmt.Sprintf("store write-guard: domain %s cannot persist %s", s.WriteDomain(), collection))
	}
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
	if !s.CanWrite(collection) {
		panic(fmt.Sprintf("store write-guard: domain %s cannot persist %s", s.WriteDomain(), collection))
	}
	s.RLock()
	items := s.snapshotLocked(collection)
	s.RUnlock()
	if items == nil {
		return
	}
	s.PersistCollection(collection, items)
}

// PersistSync writes a collection through persistHook and waits (Replay / kernel tables).
func (s *Store) PersistSync(collection string) error {
	if !s.CanWrite(collection) {
		panic(fmt.Sprintf("store write-guard: domain %s cannot persist %s", s.WriteDomain(), collection))
	}
	if s.persistHook == nil {
		return nil
	}
	s.RLock()
	items := s.snapshotLocked(collection)
	s.RUnlock()
	if items == nil {
		return nil
	}
	return s.persistHook(context.Background(), collection, items)
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
	case "model_secrets":
		out := make([]map[string]any, 0, len(s.ModelSecrets))
		for ref, val := range s.ModelSecrets {
			out = append(out, map[string]any{"id": ref, "workspaceId": "*", "value": val})
		}
		return out
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
			if ws == "" {
				for _, sess := range s.Sessions {
					if str(sess["conversationId"]) == cid || str(sess["id"]) == cid {
						ws = str(sess["workspaceId"])
						break
					}
				}
			}
			out = append(out, map[string]any{
				"id": cid, "workspaceId": ws, "messages": msgs,
			})
		}
		return out
	case "sessions":
		return s.Sessions
	case "actions":
		out := make([]map[string]any, 0, len(s.Actions))
		for id, a := range s.Actions {
			cp := map[string]any{"id": id}
			for k, v := range a {
				cp[k] = v
			}
			if str(cp["id"]) == "" {
				cp["id"] = id
			}
			out = append(out, cp)
		}
		return out
	case "knowledge_docs":
		return s.KnowledgeDocs
	case "knowledge_extra":
		// Flatten map[string]any into a single document for kv snapshot.
		return []map[string]any{{"id": "knowledge_extra", "workspaceId": "*", "payload": s.KnowledgeExtra}}
	case "memory_candidates":
		return s.MemoryCands
	case "evolve_candidates":
		return s.EvolveCands
	case "memory_records":
		return s.MemoryRecords
	case "memory_policies":
		out := make([]map[string]any, 0, len(s.MemoryPolicies))
		for ws, p := range s.MemoryPolicies {
			cp := map[string]any{}
			for k, v := range p {
				cp[k] = v
			}
			if str(cp["workspaceId"]) == "" {
				cp["workspaceId"] = ws
			}
			out = append(out, cp)
		}
		return out
	case "memory_audits":
		return s.MemoryAudits
	case "channel_dlq":
		return s.ChannelDLQ
	case "channel_deploys":
		return s.ChannelDeploys
	case "delivery_policies":
		return s.DeliveryPolicies
	case "delivery_policy_versions":
		return s.DeliveryPolicyVersions
	case "channel_templates":
		return s.ChannelTemplates
	case "channel_blacklist":
		return s.ChannelBlacklist
	case "channel_audit":
		return s.ChannelAudit
	case "channel_inbound":
		return s.ChannelInbound
	case "context_snapshots":
		return s.ContextSnapshots
	case "release_approvals":
		return s.ReleaseApprovals
	case "zt_policies":
		return s.ZTPolicies
	case "access_grants":
		return s.AccessGrants
	case "access_reviews":
		return s.AccessReviews
	case "sod_rules":
		return s.SodRules
	case "temp_auths":
		return s.TempAuths
	case "skills":
		return s.Skills
	case "skill_catalog":
		return s.SkillCatalog
	case "skill_health":
		return s.SkillHealth
	case "skill_integrations":
		return s.SkillIntegrations
	case "skill_extra":
		return []map[string]any{{"id": "skill_extra", "workspaceId": "*", "payload": s.SkillExtra}}
	case "workflow_skills":
		return s.WorkflowSkills
	default:
		return nil
	}
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func dedupeMapsByID(items []map[string]any) []map[string]any {
	if len(items) == 0 {
		return items
	}
	byID := make(map[string]map[string]any, len(items))
	order := make([]string, 0, len(items))
	for _, item := range items {
		id := str(item["id"])
		if id == "" {
			continue
		}
		if _, exists := byID[id]; !exists {
			order = append(order, id)
		}
		byID[id] = item
	}
	out := make([]map[string]any, 0, len(order))
	for _, id := range order {
		out = append(out, byID[id])
	}
	return out
}

// PersistNow synchronously persists all durable collections (startup / tests).
func (s *Store) PersistNow(ctx context.Context) error {
	if s.persistHook == nil {
		return nil
	}
	s.RLock()
	defer s.RUnlock()
	for _, name := range CollectionsForDomain(s.writeDomain) {
		if !s.CanWrite(name) {
			continue
		}
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
	case "model_secrets":
		s.ModelSecrets = map[string]string{}
		for _, doc := range items {
			ref := str(doc["id"])
			val := str(doc["value"])
			if ref != "" && val != "" {
				s.ModelSecrets[ref] = val
			}
		}
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
	case "sessions":
		s.Sessions = items
	case "actions":
		s.Actions = map[string]map[string]any{}
		for _, a := range items {
			id := str(a["id"])
			if id == "" {
				continue
			}
			s.Actions[id] = a
		}
	case "knowledge_docs":
		s.KnowledgeDocs = items
	case "knowledge_extra":
		if len(items) > 0 {
			if payload, ok := items[0]["payload"].(map[string]any); ok && len(payload) > 0 {
				// Keep in-memory seed when durable snapshot is an empty shell.
				s.KnowledgeExtra = payload
			}
		}
	case "memory_candidates":
		s.MemoryCands = items
	case "evolve_candidates":
		s.EvolveCands = items
	case "memory_records":
		s.MemoryRecords = items
	case "memory_policies":
		s.MemoryPolicies = map[string]map[string]any{}
		for _, p := range items {
			ws := str(p["workspaceId"])
			if ws == "" {
				continue
			}
			s.MemoryPolicies[ws] = p
		}
	case "memory_audits":
		s.MemoryAudits = items
	case "channel_dlq":
		s.ChannelDLQ = items
	case "channel_deploys":
		s.ChannelDeploys = items
	case "delivery_policies":
		s.DeliveryPolicies = items
	case "delivery_policy_versions":
		s.DeliveryPolicyVersions = items
	case "channel_templates":
		s.ChannelTemplates = items
	case "channel_blacklist":
		s.ChannelBlacklist = items
	case "channel_audit":
		s.ChannelAudit = items
	case "channel_inbound":
		s.ChannelInbound = items
	case "context_snapshots":
		s.ContextSnapshots = items
	case "release_approvals":
		s.ReleaseApprovals = items
	case "zt_policies":
		s.ZTPolicies = items
	case "access_grants":
		s.AccessGrants = items
	case "access_reviews":
		s.AccessReviews = items
	case "sod_rules":
		s.SodRules = items
	case "temp_auths":
		s.TempAuths = items
	case "skills":
		s.Skills = dedupeMapsByID(items)
	case "skill_catalog":
		s.SkillCatalog = items
	case "skill_health":
		s.SkillHealth = dedupeMapsByID(items)
	case "skill_integrations":
		s.SkillIntegrations = items
	case "skill_extra":
		if len(items) > 0 {
			if payload, ok := items[0]["payload"].(map[string]any); ok && len(payload) > 0 {
				s.SkillExtra = payload
			}
		}
	case "workflow_skills":
		s.WorkflowSkills = items
	}
}
