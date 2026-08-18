package server

import (
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/pkg/contract"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

const (
	sessionModeInvestigate = contract.SessionModeInvestigate
	sessionModeExecute     = contract.SessionModeExecute
)

func normalizeSessionMode(v string) string {
	return contract.ParseSessionMode(v)
}

func normalizeRiskLevelSession(v string) string {
	return contract.ParseRiskLevel(v)
}

func sessionHandoffActive(sess map[string]any) bool {
	if sess == nil {
		return false
	}
	if h, ok := sess["handoff"].(map[string]any); ok {
		return boolFrom(h["active"])
	}
	return boolFrom(sess["handoffActive"])
}

func findSessionForStreamLocked(sessions []map[string]any, ws, rawID, cid string) map[string]any {
	for _, sess := range sessions {
		if str(sess["workspaceId"]) != ws {
			continue
		}
		if str(sess["id"]) == rawID || str(sess["conversationId"]) == cid || str(sess["id"]) == cid {
			return sess
		}
	}
	return nil
}

// assertSessionWritableLocked rejects stream when closed or handed off.
func assertSessionWritableLocked(sess map[string]any) error {
	if sess == nil {
		return nil
	}
	st := str(sess["status"])
	if st == "closed" {
		return apperr.Forbidden(apperr.SessionClosed, "会话已结案，仅可查看")
	}
	if sessionHandoffActive(sess) {
		owner := ""
		if h, ok := sess["handoff"].(map[string]any); ok {
			owner = coalesce(str(h["ownerName"]), str(h["ownerId"]))
		}
		msg := "会话处于人工交接中，写操作已暂停"
		if owner != "" {
			msg += "（接管人：" + owner + "）"
		}
		return apperr.Forbidden(apperr.SessionHandoff, msg)
	}
	return nil
}

func applySessionGovernancePatch(sess map[string]any, body map[string]any, actor *auth.Identity, now string) {
	if v, ok := body["sessionMode"]; ok {
		mode := normalizeSessionMode(str(v))
		sess["sessionMode"] = mode
	}
	if v, ok := body["riskLevel"]; ok {
		sess["riskLevel"] = normalizeRiskLevelSession(str(v))
	}
	if v, ok := body["handoff"]; ok {
		if m, ok := v.(map[string]any); ok {
			active := boolFrom(m["active"])
			h := map[string]any{
				"active":    active,
				"ownerId":   str(m["ownerId"]),
				"ownerName": coalesce(str(m["ownerName"]), str(m["owner"])),
				"note":      str(m["note"]),
			}
			if active {
				h["at"] = coalesce(str(m["at"]), now)
			}
			sess["handoff"] = h
		}
	}
	if v, ok := body["handoffActive"]; ok {
		active := boolFrom(v)
		h, _ := sess["handoff"].(map[string]any)
		if h == nil {
			h = map[string]any{}
		}
		h["active"] = active
		if active {
			h["ownerName"] = coalesce(str(body["handoffOwner"]), coalesce(str(h["ownerName"]), "值班负责人"))
			h["at"] = now
		}
		sess["handoff"] = h
	}
	if v, ok := body["status"]; ok {
		st := strings.TrimSpace(str(v))
		if st == "done" {
			st = "closed"
		}
		switch st {
		case "active", "archived", "closed":
			prev := str(sess["status"])
			sess["status"] = st
			if st == "closed" && prev != "closed" {
				sess["closedAt"] = now
				if actor != nil {
					sess["closedBy"] = actor.ID
					sess["closedByName"] = actor.Name
				}
				if summary := strings.TrimSpace(str(body["closeSummary"])); summary != "" {
					sess["closeSummary"] = summary
				}
			}
		}
	}
	if v, ok := body["closeSummary"]; ok {
		if t := strings.TrimSpace(str(v)); t != "" {
			sess["closeSummary"] = t
		}
	}
}

func filterRegistryBySessionMode(reg []registeredTool, mode string) []registeredTool {
	mode = normalizeSessionMode(mode)
	if mode == sessionModeExecute {
		return reg
	}
	out := make([]registeredTool, 0, len(reg))
	for _, t := range reg {
		if t.RequiresApproval || t.Mode == toolModeApproval {
			t.Enabled = false
		}
		// investigate: keep builtins + recommend/execute non-approval skills
		if t.Kind == "skill" && t.RequiresApproval {
			continue
		}
		out = append(out, t)
	}
	return out
}

func defaultGovernanceOnCreate(session map[string]any) {
	if str(session["sessionMode"]) == "" {
		session["sessionMode"] = sessionModeInvestigate
	}
	if str(session["riskLevel"]) == "" {
		session["riskLevel"] = "medium"
	}
	if session["handoff"] == nil {
		session["handoff"] = map[string]any{"active": false}
	}
}

func governanceAuditDetail(sess map[string]any) string {
	return "mode=" + coalesce(str(sess["sessionMode"]), sessionModeInvestigate) +
		" risk=" + coalesce(str(sess["riskLevel"]), "medium") +
		" status=" + coalesce(str(sess["status"]), "active")
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
