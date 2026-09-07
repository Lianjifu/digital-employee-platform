// Package policy implements skill permission inheritance and authorization.
//
// The 4-level hierarchy is:
//
//   workspace (root)
//     └── roles     (e.g. "hr.admin", "viewer", "finance.lead")
//           └── digital_employees (a DE inherits all role grants)
//                 └── skills (each skill declares RequiredPerms)
//
// A caller is authorized to invoke a skill when:
//
//   1. The caller is in the workspace.
//   2. The caller holds every permission listed in the skill's RequiredPerms
//      via either a direct grant or an inherited grant from a parent role
//      or a digital employee the caller is acting as.
//   3. The skill's RiskClass is allowed for the caller's risk level
//      (low|medium|high).
//   4. SoD (separation of duties) holds if the spec declares ApprovalSOD:
//      the submitter cannot also be the approver.
//
// This package is pure: it takes a Caller and a Spec and returns a Decision.
// The Server layer wires the actual actor and audit log.
package policy

import (
	"errors"
	"sort"
	"strings"
)

// Risk is the caller's risk level for this turn.
type Risk string

const (
	RiskLow    Risk = "low"
	RiskMedium Risk = "medium"
	RiskHigh   Risk = "high"
)

// Subject is the principal making the call.
type Subject struct {
	ID             string
	WorkspaceID    string
	Roles          []string // role IDs the subject directly holds
	EmployeeIDs    []string // digital employees the subject can act as
	Perms          []string // permissions directly granted
}

// EmployeeGrant is the set of permissions a digital employee inherits.
type EmployeeGrant struct {
	EmployeeID string
	Perms      []string
}

// RoleGrant is the set of permissions a role inherits.
type RoleGrant struct {
	Role   string
	Perms  []string
	Scopes []string // optional workspace scopes
}

// Catalog carries the inherited permission grants for one workspace.
type Catalog struct {
	WorkspaceID string
	Roles       []RoleGrant
	Employees   []EmployeeGrant
}

// Decision is the result of Authorize.
type Decision struct {
	Allowed        bool
	Reason         string
	MissingPerms   []string
	RequiresSoD    bool
	ForbiddenRisk  bool
}

// Authorize checks that caller may invoke skill in workspace.
//
// The four checks run in order; the first failure short-circuits. Each
// failure reason is structured so the audit log can render a user-facing
// explanation.
func Authorize(caller Subject, workspaceID string, skillPerms []string, skillRisk, callRisk string, sodSubmitter, sodApprover string) Decision {
	if strings.TrimSpace(workspaceID) == "" || caller.WorkspaceID != workspaceID {
		return Decision{Allowed: false, Reason: "workspace mismatch"}
	}
	missing := missingPerms(caller, skillPerms)
	if len(missing) > 0 {
		return Decision{Allowed: false, Reason: "missing permissions", MissingPerms: missing}
	}
	if !riskAllowed(Risk(skillRisk), Risk(callRisk)) {
		return Decision{Allowed: false, Reason: "risk exceeds allowed", ForbiddenRisk: true}
	}
	if strings.TrimSpace(sodSubmitter) != "" && sodSubmitter == sodApprover {
		return Decision{Allowed: false, Reason: "separation of duties violated"}
	}
	return Decision{Allowed: true}
}

// AuthorizeWithCatalog extends Authorize with role/employee grant inheritance.
//
// The effective permissions of the caller = direct perms ∪ role perms (for
// each role in catalog matching caller's Roles) ∪ employee perms (for each
// employee in caller's EmployeeIDs that matches catalog.Employees).
func AuthorizeWithCatalog(caller Subject, cat Catalog, skillPerms []string, skillRisk, callRisk string, sodSubmitter, sodApprover string) Decision {
	if strings.TrimSpace(cat.WorkspaceID) == "" || cat.WorkspaceID != caller.WorkspaceID {
		return Decision{Allowed: false, Reason: "workspace mismatch"}
	}
	effective := effectivePerms(caller, cat)
	missing := missingPermsFromSet(effective, skillPerms)
	if len(missing) > 0 {
		return Decision{Allowed: false, Reason: "missing permissions", MissingPerms: missing}
	}
	if !riskAllowed(Risk(skillRisk), Risk(callRisk)) {
		return Decision{Allowed: false, Reason: "risk exceeds allowed", ForbiddenRisk: true}
	}
	if strings.TrimSpace(sodSubmitter) != "" && sodSubmitter == sodApprover {
		return Decision{Allowed: false, Reason: "separation of duties violated"}
	}
	return Decision{Allowed: true}
}

func missingPerms(s Subject, want []string) []string {
	return missingPermsFromSet(s.Perms, want)
}

func missingPermsFromSet(have []string, want []string) []string {
	haveSet := make(map[string]bool, len(have))
	for _, h := range have {
		haveSet[strings.ToLower(strings.TrimSpace(h))] = true
	}
	var missing []string
	for _, w := range want {
		w = strings.ToLower(strings.TrimSpace(w))
		if w == "" {
			continue
		}
		if !haveSet[w] {
			missing = append(missing, w)
		}
	}
	sort.Strings(missing)
	return missing
}

func effectivePerms(caller Subject, cat Catalog) []string {
	seen := map[string]bool{}
	add := func(perms []string) {
		for _, p := range perms {
			p = strings.ToLower(strings.TrimSpace(p))
			if p == "" {
				continue
			}
			seen[p] = true
		}
	}
	add(caller.Perms)
	for _, role := range caller.Roles {
		for _, rg := range cat.Roles {
			if strings.EqualFold(rg.Role, role) {
				add(rg.Perms)
			}
		}
	}
	for _, de := range caller.EmployeeIDs {
		for _, eg := range cat.Employees {
			if eg.EmployeeID == de {
				add(eg.Perms)
			}
		}
	}
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// riskAllowed: skill risk must be ≤ caller's risk ceiling for that class.
//   exec/destructive require caller's risk ∈ {high}
//   network/secret require caller's risk ∈ {medium, high}
//   local_io/read_only always allowed
func riskAllowed(skillRisk, callRisk Risk) bool {
	sr := strings.ToLower(strings.TrimSpace(string(skillRisk)))
	cr := strings.ToLower(strings.TrimSpace(string(callRisk)))
	switch sr {
	case "read_only", "read-only", "readonly":
		return true
	case "local_io", "local-io":
		return true
	case "network":
		return cr == "medium" || cr == "high"
	case "secrets":
		return cr == "medium" || cr == "high"
	case "exec":
		return cr == "high"
	case "destructive":
		return cr == "high"
	}
	// Unknown skill risk: allow (default-open for benign skills).
	return true
}

// ValidateCatalog checks structural invariants of a Catalog. Returns
// ErrEmptyWorkspaceID or ErrDuplicateRole when invalid.
var (
	ErrEmptyWorkspaceID = errors.New("policy: workspace id required")
	ErrDuplicateRole    = errors.New("policy: duplicate role")
)

func ValidateCatalog(cat Catalog) error {
	if strings.TrimSpace(cat.WorkspaceID) == "" {
		return ErrEmptyWorkspaceID
	}
	seen := map[string]bool{}
	for _, rg := range cat.Roles {
		k := strings.ToLower(strings.TrimSpace(rg.Role))
		if k == "" {
			continue
		}
		if seen[k] {
			return ErrDuplicateRole
		}
		seen[k] = true
	}
	return nil
}
