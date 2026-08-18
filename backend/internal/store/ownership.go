package store

import "strings"

// Domain is the coarse-grained write owner for durable collections (R1.2 / R3).
type Domain string

const (
	DomainAll      Domain = "all"
	DomainSys      Domain = "sys"
	DomainCollab   Domain = "collab"
	DomainCap      Domain = "cap"
	DomainWorkflow Domain = "workflow"
)

// KernelCollections are promoted off kv_documents into typed PG tables (R2).
var KernelCollections = []string{
	"sessions",
	"messages",
	"context_snapshots",
	"channel_inbound",
}

var collectionDomain = map[string]Domain{
	"workspaces":        DomainSys,
	"backups":           DomainSys,
	"release_approvals": DomainSys,

	"sessions":          DomainCollab,
	"conversations":     DomainCollab,
	"messages":          DomainCollab,
	"context_snapshots": DomainCollab,
	"tasks":             DomainCollab,
	"actions":           DomainCollab,
	"employees":         DomainCollab,

	"model_providers":          DomainCap,
	"routing_policies":         DomainCap,
	"policy_versions":          DomainCap,
	"model_audit":              DomainCap,
	"model_budgets":            DomainCap,
	"model_secrets":            DomainCap,
	"knowledge_docs":           DomainCap,
	"knowledge_extra":          DomainCap,
	"memory_candidates":        DomainCap,
	"evolve_candidates":        DomainCap,
	"memory_records":           DomainCap,
	"memory_policies":          DomainCap,
	"memory_audits":            DomainCap,
	"skills":                   DomainCap,
	"skill_catalog":            DomainCap,
	"skill_health":             DomainCap,
	"skill_integrations":       DomainCap,
	"skill_extra":              DomainCap,
	"channel_dlq":              DomainCap,
	"channel_deploys":          DomainCap,
	"delivery_policies":        DomainCap,
	"delivery_policy_versions": DomainCap,
	"channel_templates":        DomainCap,
	"channel_blacklist":        DomainCap,
	"channel_audit":            DomainCap,
	"channel_inbound":          DomainCap,

	"workflows":       DomainWorkflow,
	"workflow_runs":   DomainWorkflow,
	"workflow_skills": DomainWorkflow,
}

// DomainFromMode maps ServiceMode / process name to a write domain.
func DomainFromMode(mode string) Domain {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "sys", "de-sys", "platform":
		return DomainSys
	case "collab", "de-collab":
		return DomainCollab
	case "cap", "de-cap", "capability":
		return DomainCap
	case "workflow", "de-workflow":
		return DomainWorkflow
	default:
		return DomainAll
	}
}

// CollectionDomain returns the unique writer for a durable collection.
func CollectionDomain(collection string) Domain {
	if d, ok := collectionDomain[collection]; ok {
		return d
	}
	return DomainAll
}

// IsKernelCollection reports collections dual-written to typed PG tables.
func IsKernelCollection(collection string) bool {
	for _, name := range KernelCollections {
		if name == collection {
			return true
		}
	}
	return false
}

// CollectionsForDomain is the hydrate/persist set for a process.
func CollectionsForDomain(d Domain) []string {
	if d == "" || d == DomainAll {
		return append([]string{}, DurableCollections...)
	}
	out := make([]string, 0, 16)
	for _, name := range DurableCollections {
		if CollectionDomain(name) == d {
			out = append(out, name)
		}
	}
	return out
}

// SeedCollection is the kv count probe used to decide first-boot persist.
func SeedCollection(d Domain) string {
	switch d {
	case DomainCollab:
		return "sessions"
	case DomainCap:
		return "skills"
	case DomainWorkflow:
		return "workflows"
	default:
		return "workspaces"
	}
}

func (s *Store) SetWriteDomain(d Domain) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.writeDomain = d
}

func (s *Store) WriteDomain() Domain {
	// Set once at process boot; lock-free so callers already holding Store.Lock can check.
	if s.writeDomain == "" {
		return DomainAll
	}
	return s.writeDomain
}

func (s *Store) CanWrite(collection string) bool {
	d := s.WriteDomain()
	if d == "" || d == DomainAll {
		return true
	}
	owner := CollectionDomain(collection)
	return owner == DomainAll || owner == d
}

// DropUnowned clears in-memory slices this process is not allowed to write (R1.2).
func (s *Store) DropUnowned(d Domain) {
	if d == "" || d == DomainAll {
		return
	}
	s.Lock()
	defer s.Unlock()
	if d != DomainSys {
		s.Workspaces = nil
		s.Backups = nil
		s.ReleaseApprovals = nil
	}
	if d != DomainCollab {
		s.Sessions = nil
		s.Conversations = nil
		s.Messages = map[string][]map[string]any{}
		s.ContextSnapshots = nil
		s.Tasks = nil
		s.Actions = map[string]map[string]any{}
		s.Employees = nil
	}
	if d != DomainCap {
		s.ModelProviders = nil
		s.RoutingPolicies = nil
		s.PolicyVersions = nil
		s.ModelAudit = nil
		s.ModelBudgets = nil
		s.ModelSecrets = map[string]string{}
		s.KnowledgeDocs = nil
		s.KnowledgeExtra = map[string]any{}
		s.MemoryCands = nil
		s.EvolveCands = nil
		s.MemoryRecords = nil
		s.MemoryPolicies = map[string]map[string]any{}
		s.MemoryAudits = nil
		s.Skills = nil
		s.SkillCatalog = nil
		s.SkillHealth = nil
		s.SkillIntegrations = nil
		s.SkillExtra = map[string]any{}
		s.ChannelDLQ = nil
		s.ChannelDeploys = nil
		s.DeliveryPolicies = nil
		s.DeliveryPolicyVersions = nil
		s.ChannelTemplates = nil
		s.ChannelBlacklist = nil
		s.ChannelAudit = nil
		s.ChannelInbound = nil
	}
	if d != DomainWorkflow {
		s.Workflows = nil
		s.WorkflowRuns = nil
		s.WorkflowSkills = nil
	}
}
