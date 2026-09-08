package store

import (
	"context"
	"testing"
)

func TestStoreCloseNilSafe(t *testing.T) {
	var s *Store
	if err := s.Close(); err != nil {
		t.Fatalf("Close on nil receiver must return nil, got %v", err)
	}
}

func TestStoreCloseIdempotent(t *testing.T) {
	s := New()
	if err := s.Close(); err != nil {
		t.Fatalf("first Close returned %v, want nil", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("second Close returned %v, want nil (idempotent)", err)
	}
	// And a third, for good measure.
	if err := s.Close(); err != nil {
		t.Fatalf("third Close returned %v, want nil (idempotent)", err)
	}
}

func TestStoreCloseDrainsHooks(t *testing.T) {
	s := New()
	persistCalled := false
	auditCalled := false
	deleteCalled := false

	s.SetPersistHook(func(_ context.Context, _ string, _ []map[string]any) error {
		persistCalled = true
		return nil
	})
	s.SetDeleteHook(func(_ context.Context, _ string, _ []string) error {
		deleteCalled = true
		return nil
	})
	s.SetAuditHook(func(_ map[string]any) {
		auditCalled = true
	})

	if err := s.Close(); err != nil {
		t.Fatalf("Close returned %v, want nil", err)
	}

	// After Close, hook fields are nil-ed out. Subsequent mutations that
	// would have invoked the hooks must instead short-circuit cleanly.
	s.AppendAudit("w1", "actor", "action", "target", "result", "reason")
	if auditCalled {
		t.Fatal("audit hook fired after Close — should be drained")
	}

	s.PersistCollection("workspaces", s.Workspaces)
	if persistCalled {
		t.Fatal("persist hook fired after Close — should be drained")
	}

	s.PersistDelete("workspaces", "w1")
	if deleteCalled {
		t.Fatal("delete hook fired after Close — should be drained")
	}

	// And the internal fields really are nil.
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.auditHook != nil {
		t.Fatal("auditHook not nil after Close")
	}
	if s.persistHook != nil {
		t.Fatal("persistHook not nil after Close")
	}
	if s.deleteHook != nil {
		t.Fatal("deleteHook not nil after Close")
	}
}