package server

import (
	"net/http"
	"time"
)

// opsOverviewLive aggregates real control-plane counters (not static seed alone).
func (s *Server) opsOverviewLive(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()

	activeDE, pendingDE := 0, 0
	for _, e := range s.Store.Employees {
		if str(e["workspaceId"]) != ws {
			continue
		}
		switch str(e["lifecycle"]) {
		case "active", "published":
			activeDE++
		case "pending_approval", "draft":
			pendingDE++
		}
	}
	openTasks, riskTasks := 0, 0
	for _, t := range s.Store.Tasks {
		if str(t["workspaceId"]) != ws {
			continue
		}
		st := str(t["status"])
		if st != "completed" && st != "archived" {
			openTasks++
		}
		if sla, ok := t["sla"].(map[string]any); ok && str(sla["risk"]) != "none" && str(sla["risk"]) != "" {
			riskTasks++
		}
	}
	dlq := 0
	for _, d := range s.Store.ChannelDLQ {
		if str(d["workspaceId"]) == ws || str(d["workspaceId"]) == "" {
			dlq++
		}
	}
	usageUnits := 0
	for _, u := range s.Store.UsageMeters {
		if str(u["workspaceId"]) == ws {
			usageUnits += toInt(u["units"])
		}
	}
	pendingApprovals := 0
	for _, a := range s.Store.ReleaseApprovals {
		if str(a["workspaceId"]) == ws && str(a["status"]) == "pending" {
			pendingApprovals++
		}
	}
	pendingBackups := 0
	for _, b := range s.Store.Backups {
		if str(b["workspaceId"]) == ws && str(b["status"]) == "pending_approval" {
			pendingBackups++
		}
	}

	return map[string]any{
		"workspaceId": ws,
		"generatedAt": time.Now().UTC().Format(time.RFC3339),
		"source":      "live-aggregate",
		"digitalEmployees": map[string]any{"active": activeDE, "pending": pendingDE},
		"tasks":            map[string]any{"open": openTasks, "risk": riskTasks},
		"channels":         map[string]any{"deadLetters": dlq},
		"governance":       map[string]any{"pendingApprovals": pendingApprovals, "pendingBackups": pendingBackups},
		"usage":            map[string]any{"recentUnits": usageUnits},
		"health": map[string]any{
			"postgres": s.PG != nil,
			"redis":    s.Cache != nil && s.Cache.Available(),
		},
	}, nil
}

func (s *Server) homeKPIsLive(r *http.Request) (any, error) {
	ov, err := s.opsOverviewLive(r)
	if err != nil {
		return nil, err
	}
	m := ov.(map[string]any)
	de := m["digitalEmployees"].(map[string]any)
	tasks := m["tasks"].(map[string]any)
	return map[string]any{
		"activeDigitalEmployees": de["active"],
		"openTasks":              tasks["open"],
		"riskTasks":              tasks["risk"],
		"pendingApprovals":       m["governance"].(map[string]any)["pendingApprovals"],
		"deadLetters":            m["channels"].(map[string]any)["deadLetters"],
		"generatedAt":            m["generatedAt"],
		"source":                 "live-aggregate",
	}, nil
}
