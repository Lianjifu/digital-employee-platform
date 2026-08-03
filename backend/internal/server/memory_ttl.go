package server

import (
	"log"
	"time"
)

// StartMemoryMaintenance runs TTL expiry for short/working memory on an interval.
func (s *Server) StartMemoryMaintenance() {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		s.runMemoryTTLPass()
		for range ticker.C {
			s.runMemoryTTLPass()
		}
	}()
}

func (s *Server) runMemoryTTLPass() {
	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	changed := 0

	s.Store.Lock()
	for _, m := range s.Store.MemoryRecords {
		status := str(m["status"])
		if status != "active" && status != "pending_review" {
			continue
		}
		layer := str(m["layer"])
		if layer != "short_term" && layer != "working" {
			continue
		}
		expired := false
		if exp := str(m["expiresAt"]); exp != "" {
			if t, err := time.Parse(time.RFC3339, exp); err == nil && now.After(t) {
				expired = true
			} else if t, err := time.Parse(time.RFC3339Nano, exp); err == nil && now.After(t) {
				expired = true
			}
		} else {
			ws := str(m["workspaceId"])
			policy := s.memoryPolicyFor(ws)
			created := str(m["createdAt"])
			ct, err := time.Parse(time.RFC3339, created)
			if err != nil {
				ct, err = time.Parse(time.RFC3339Nano, created)
			}
			if err == nil {
				if layer == "short_term" {
					hours := int(toFloat(policy["shortTermTtlHours"]))
					if hours <= 0 {
						hours = 24
					}
					expired = now.After(ct.Add(time.Duration(hours) * time.Hour))
				} else {
					days := int(toFloat(policy["workingMemoryTtlDays"]))
					if days <= 0 {
						days = 30
					}
					expired = now.After(ct.Add(time.Duration(days) * 24 * time.Hour))
				}
			}
		}
		if expired {
			m["status"] = "expired"
			m["updatedAt"] = nowStr
			changed++
			s.appendMemoryAuditLocked(str(m["workspaceId"]), "系统", "TTL 自动失效", coalesce(str(m["title"]), str(m["id"])), "success", str(m["correlationId"]))
		}
	}
	if changed > 0 {
		for ws := range s.Store.MemoryPolicies {
			s.recountLongTermCapacityLocked(ws)
		}
	}
	s.Store.Unlock()

	if changed > 0 {
		log.Printf("memory TTL: expired %d records", changed)
		s.persistMemory()
	}
}

// RunMemoryTTLForTest exposes TTL pass for unit tests.
func (s *Server) RunMemoryTTLForTest() { s.runMemoryTTLPass() }
