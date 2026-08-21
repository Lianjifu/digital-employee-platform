package store

// DefaultWorkspaceID is the stable shell workspace created on empty durable boot.
// Identity tokens and builtin skill install already assume this id.
const DefaultWorkspaceID = "w1"

// EnsureDefaultWorkspace ensures the stable default workspace shell (w1) exists.
// Unlike demo seed, it does not create ACME multi-workspace or sample business data.
// Returns true when w1 was created.
func (s *Store) EnsureDefaultWorkspace() bool {
	s.Lock()
	defer s.Unlock()
	return s.ensureDefaultWorkspaceLocked()
}

func (s *Store) ensureDefaultWorkspaceLocked() bool {
	for _, w := range s.Workspaces {
		if str(w["id"]) == DefaultWorkspaceID {
			s.ensureWorkspaceShellExtrasLocked(DefaultWorkspaceID)
			return false
		}
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
	s.Workspaces = append([]map[string]any{ws}, s.Workspaces...)
	s.ensureWorkspaceShellExtrasLocked(DefaultWorkspaceID)
	return true
}

func (s *Store) ensureWorkspaceShellExtrasLocked(wsID string) {
	if s.Members == nil {
		s.Members = map[string][]map[string]any{}
	}
	if len(s.Members[wsID]) == 0 {
		s.Members[wsID] = []map[string]any{
			{
				"id": "u1", "userId": "u1", "workspaceId": wsID,
				"name": "平台管理员", "email": "admin@local", "role": "admin",
				"title": "平台管理员", "mfa": false, "lastActive": "—",
			},
		}
	}
	if s.Quotas == nil {
		s.Quotas = map[string]map[string]any{}
	}
	if s.Quotas[wsID] == nil {
		s.Quotas[wsID] = map[string]any{
			"seats":       map[string]any{"used": 1, "limit": 50},
			"agents":      map[string]any{"used": 0, "limit": 20},
			"tokens":      map[string]any{"used": 0, "limit": 1_000_000},
			"concurrency": map[string]any{"used": 0, "limit": 10},
			"budgetUsd":   map[string]any{"used": 0, "limit": 5000},
		}
	}
}

// RebuildWorkspaceAccessGrants rebuilds in-memory ActorExtraWorkspaces from durable
// workspace owner / member rows so created workspaces remain visible after restart.
func (s *Store) RebuildWorkspaceAccessGrants() {
	s.Lock()
	defer s.Unlock()
	if s.ActorExtraWorkspaces == nil {
		s.ActorExtraWorkspaces = map[string][]string{}
	}
	grant := func(actorID, wsID string) {
		if actorID == "" || wsID == "" {
			return
		}
		cur := s.ActorExtraWorkspaces[actorID]
		for _, existing := range cur {
			if existing == wsID {
				return
			}
		}
		s.ActorExtraWorkspaces[actorID] = append(cur, wsID)
	}
	for _, w := range s.Workspaces {
		wsID := str(w["id"])
		grant(str(w["ownerId"]), wsID)
		for _, m := range s.Members[wsID] {
			uid := str(m["userId"])
			if uid == "" {
				uid = str(m["id"])
			}
			grant(uid, wsID)
		}
	}
}
