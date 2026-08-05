package server

import (
	"testing"

	"github.com/digital-employee-platform/backend/internal/store"
)

func TestRecordSkillInvocationUpdatesGovernance(t *testing.T) {
	st := store.New()
	st.EnsureDocxSkillReady()
	srv := New(st)

	srv.Store.Lock()
	var sk map[string]any
	for _, item := range srv.Store.Skills {
		if str(item["id"]) == "sk-docx" || str(item["name"]) == "docx" {
			sk = item
			break
		}
	}
	if sk == nil {
		srv.Store.Unlock()
		t.Fatal("docx skill missing")
	}
	ws := str(sk["workspaceId"])
	srv.recordSkillInvocationLocked(ws, sk, 120, true, "tester", "unit-test")
	srv.recordSkillInvocationLocked(ws, sk, 80, true, "tester", "unit-test")
	h := srv.ensureSkillHealthLocked(sk)
	calls := intFrom(h["calls24h"])
	if calls < 2 {
		srv.Store.Unlock()
		t.Fatalf("calls24h=%d", calls)
	}
	if str(h["updatedAt"]) == "尚未调用" {
		srv.Store.Unlock()
		t.Fatalf("updatedAt still 尚未调用")
	}
	if intFrom(h["p95Ms"]) < 120 {
		srv.Store.Unlock()
		t.Fatalf("p95Ms=%v", h["p95Ms"])
	}
	buckets := srv.skillTrendBucketsLocked(ws)
	total := 0
	for _, b := range buckets {
		total += intFrom(b["calls"])
	}
	srv.Store.Unlock()
	if total < 2 {
		t.Fatalf("trend calls=%d", total)
	}
}
