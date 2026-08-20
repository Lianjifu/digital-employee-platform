package store

// DefaultWorkspaceID is the stable shell workspace created on empty durable boot.
// Identity tokens and builtin skill install already assume this id.
const DefaultWorkspaceID = "w1"

// EnsureDefaultWorkspace creates a single default workspace when none exist.
// Unlike demo seed, it does not create ACME multi-workspace or sample business data.
// Returns true when a workspace was created.
func (s *Store) EnsureDefaultWorkspace() bool {
	s.Lock()
	defer s.Unlock()
	return s.ensureDefaultWorkspaceLocked()
}

func (s *Store) ensureDefaultWorkspaceLocked() bool {
	if len(s.Workspaces) > 0 {
		return false
	}
	tenantID := "tenant-acme"
	if s.TenantProfile != nil {
		if tid := str(s.TenantProfile["tenantId"]); tid != "" {
			tenantID = tid
		}
	}
	ws := map[string]any{
		"id":              DefaultWorkspaceID,
		"tenantId":        tenantID,
		"ownerId":         "u1",
		"status":          "active",
		"name":            "默认工作区",
		"region":          "cn-east-1",
		"plan":            "enterprise",
		"memberCount":     1,
		"complianceScore": 80,
		"createdAt":       now(),
	}
	s.Workspaces = []map[string]any{ws}
	if s.Members == nil {
		s.Members = map[string][]map[string]any{}
	}
	if len(s.Members[DefaultWorkspaceID]) == 0 {
		s.Members[DefaultWorkspaceID] = []map[string]any{
			{
				"id": "u1", "userId": "u1", "workspaceId": DefaultWorkspaceID,
				"name": "平台管理员", "email": "admin@local", "role": "admin",
				"title": "平台管理员", "mfa": false, "lastActive": "—",
			},
		}
	}
	if s.Quotas == nil {
		s.Quotas = map[string]map[string]any{}
	}
	if s.Quotas[DefaultWorkspaceID] == nil {
		s.Quotas[DefaultWorkspaceID] = map[string]any{
			"seats":       map[string]any{"used": 1, "limit": 50},
			"agents":      map[string]any{"used": 0, "limit": 20},
			"tokens":      map[string]any{"used": 0, "limit": 1_000_000},
			"concurrency": map[string]any{"used": 0, "limit": 10},
			"budgetUsd":   map[string]any{"used": 0, "limit": 5000},
		}
	}
	return true
}
