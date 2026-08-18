package store

import (
	"context"
	"testing"
)

func TestCollectionsForDomainExcludesForeign(t *testing.T) {
	collab := CollectionsForDomain(DomainCollab)
	for _, name := range collab {
		if CollectionDomain(name) != DomainCollab {
			t.Fatalf("collab owns %s", name)
		}
	}
	cap := CollectionsForDomain(DomainCap)
	seen := map[string]bool{}
	for _, name := range cap {
		seen[name] = true
		if CollectionDomain(name) != DomainCap {
			t.Fatalf("cap owns %s", name)
		}
	}
	if seen["sessions"] || seen["routing_policies"] == false {
		t.Fatalf("cap should have routing_policies and not sessions: %#v", seen)
	}
	if ShouldReplaceOnPersist("channel_inbound") {
		t.Fatal("channel_inbound must not full-replace after R2")
	}
}

func TestWriteGuardPanicsOnCrossDomainPersist(t *testing.T) {
	st := New()
	st.SetWriteDomain(DomainCollab)
	defer func() {
		if recover() == nil {
			t.Fatal("expected panic persisting skills from collab")
		}
	}()
	st.Persist("skills")
}

func TestPersistNowOnlyOwnedCollections(t *testing.T) {
	st := New()
	st.SetWriteDomain(DomainWorkflow)
	got := map[string]int{}
	st.SetPersistHook(func(_ context.Context, collection string, items []map[string]any) error {
		got[collection] = len(items)
		return nil
	})
	if err := st.PersistNow(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, ok := got["skills"]; ok {
		t.Fatalf("workflow must not persist skills: %#v", got)
	}
	if _, ok := got["workflows"]; !ok {
		t.Fatalf("workflow should persist workflows: %#v", got)
	}
}

func TestCanWriteAllByDefault(t *testing.T) {
	st := New()
	if !st.CanWrite("skills") || !st.CanWrite("sessions") {
		t.Fatal("DomainAll should write every collection")
	}
}
