package server

import (
	"strings"

	"github.com/digital-employee-platform/backend/internal/store"
)

// ServiceMode selects which coarse-grained deployment unit this process owns.
// Logical modules (platform/policy/…) remain packages; one Listen port per mode.
type ServiceMode string

const (
	ModeAll      ServiceMode = "all"      // unit tests only (single-process full routes)
	ModeSys      ServiceMode = "sys"      // :8100 platform · ops（默认仍吸收 policy/audit）
	ModeCollab   ServiceMode = "collab"   // :8101 collab · employee
	ModeCap      ServiceMode = "cap"      // :8102 model · knowledge · memory · skill · channel
	ModeWorkflow ServiceMode = "workflow" // :8103 workflow HTTP
	ModePolicy   ServiceMode = "policy"   // :8104 access · zero-trust · evaluate · release-approvals
	ModeAudit    ServiceMode = "audit"    // :8105 audit-center · /v1/events
)

func ParseServiceMode(s string) ServiceMode {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "all":
		return ModeAll
	case "sys", "de-sys", "platform", "":
		return ModeSys
	case "collab", "de-collab":
		return ModeCollab
	case "cap", "de-cap", "capability":
		return ModeCap
	case "workflow", "de-workflow":
		return ModeWorkflow
	case "policy", "de-policy":
		return ModePolicy
	case "audit", "de-audit":
		return ModeAudit
	default:
		return ModeSys
	}
}

func (m ServiceMode) String() string {
	switch m {
	case ModeSys:
		return "de-sys"
	case ModeCollab:
		return "de-collab"
	case ModeCap:
		return "de-cap"
	case ModeWorkflow:
		return "de-workflow"
	case ModePolicy:
		return "de-policy"
	case ModeAudit:
		return "de-audit"
	case ModeAll:
		return "de-all"
	default:
		return "de-sys"
	}
}

func sysAbsorbsCrosscutting() bool {
	return store.AbsorbCrosscutting()
}

func (m ServiceMode) ownsOwner(owner ServiceMode) bool {
	if owner == m {
		return true
	}
	if m == ModeSys && sysAbsorbsCrosscutting() && (owner == ModePolicy || owner == ModeAudit) {
		return true
	}
	return false
}

// OwnsPath reports whether this deployment unit should handle the HTTP path.
func (m ServiceMode) OwnsPath(path string) bool {
	if m == ModeAll {
		return true
	}
	if path == "/healthz" || path == "/readyz" || path == "/metrics" {
		return true
	}
	// Connect-RPC: mount per mode (see mountConnectRPCForMode)
	if path == "/connect/" || strings.HasPrefix(path, "/connect/") {
		return m == ModeSys || m == ModeCollab || m == ModeCap || m == ModePolicy || m == ModeAudit
	}
	if strings.HasPrefix(path, "/de.") {
		return m.ownsOwner(connectOwner(path))
	}
	return m.ownsOwner(ownerForAPI(path))
}

// connectOwner maps Connect path prefix to owning mode.
func connectOwner(path string) ServiceMode {
	switch {
	case strings.HasPrefix(path, "/de.collab."), strings.HasPrefix(path, "/de.employee."):
		return ModeCollab
	case strings.HasPrefix(path, "/de.rag."), strings.HasPrefix(path, "/de.runtime."):
		return ModeCap
	case strings.HasPrefix(path, "/de.policy."):
		return ModePolicy
	case strings.HasPrefix(path, "/de.audit."):
		return ModeAudit
	case strings.HasPrefix(path, "/de.platform."):
		return ModeSys
	default:
		return ModeSys
	}
}

func ownerForAPI(path string) ServiceMode {
	switch {
	case matchPref(path,
		"/api/digital-employees", "/api/digital-employee-templates", "/api/digital-employee-template-adoptions",
		"/api/digital-employee-capability-catalog",
		"/api/tasks", "/api/agents",
		"/api/sessions", "/api/slash-commands", "/api/conversations", "/api/copilot", "/api/actions",
		"/api/share", "/api/attachments", "/api/internal/channel-sessions"):
		return ModeCollab

	case matchPref(path,
		"/api/workflows", "/api/workflow-templates", "/api/workflow-skills", "/api/workflow-runs"):
		return ModeWorkflow

	case matchPref(path,
		"/api/model-providers", "/api/model-routing", "/api/model-governance", "/api/model-audit",
		"/api/models", "/api/model", "/api/model-invoke",
		"/api/knowledge",
		"/api/skills", "/api/skill-artifacts", "/api/skill-integrations", "/api/mcp-connections", "/api/tools",
		"/api/memory",
		"/api/channel-control", "/api/channel-templates", "/api/channel-blacklist", "/api/channels",
		"/api/channel", "/api/internal/skill-catalog"):
		return ModeCap

	case matchPref(path,
		"/api/access", "/api/zero-trust", "/api/release-approvals", "/api/governance",
		"/v1/evaluate"):
		return ModePolicy

	case matchPref(path,
		"/api/audit", "/api/audit-center", "/api/audits",
		"/v1/events"):
		return ModeAudit

	case matchPref(path,
		"/api/auth", "/api/workspaces", "/api/workspace-switch-history",
		"/api/home", "/api/operations", "/api/billing", "/api/backups",
		"/api/notification-channels", "/api/tenant", "/api/api-keys", "/api/webhooks-config"):
		return ModeSys

	default:
		// Unknown /api/* → sys so new routes are visible; prefer explicit prefixes above.
		if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/v1/") {
			return ModeSys
		}
		return ModeSys
	}
}

func matchPref(path string, prefixes ...string) bool {
	for _, p := range prefixes {
		if path == p || strings.HasPrefix(path, p+"/") {
			return true
		}
	}
	return false
}
