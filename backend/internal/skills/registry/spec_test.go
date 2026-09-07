package registry

import (
	"errors"
	"strings"
	"testing"
)

func TestRegisterAndLookup(t *testing.T) {
	r := NewRegistry()
	err := r.Register(Spec{Key: "skill:pptx", Name: "pptx", Lifecycle: LifecycleStable, Approval: ApprovalAuto})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	s, err := r.Lookup("skill:pptx")
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if s.Name != "pptx" {
		t.Fatalf("name=%s", s.Name)
	}
}

func TestRegisterEmptyKey(t *testing.T) {
	r := NewRegistry()
	if err := r.Register(Spec{Name: "x"}); err == nil {
		t.Fatal("expected error on empty key")
	}
}

func TestRegisterEmptyName(t *testing.T) {
	r := NewRegistry()
	if err := r.Register(Spec{Key: "skill:x"}); err == nil {
		t.Fatal("expected error on empty name")
	}
}

func TestRegisterReplaces(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:a", Name: "v1"})
	r.Register(Spec{Key: "skill:a", Name: "v2", Version: "2.0"})
	s, _ := r.Lookup("skill:a")
	if s.Name != "v2" || s.Version != "2.0" {
		t.Fatalf("replacement failed: %+v", s)
	}
}

func TestLookupMissing(t *testing.T) {
	r := NewRegistry()
	_, err := r.Lookup("skill:missing")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestAllSortedByKey(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:zzz", Name: "z"})
	r.Register(Spec{Key: "skill:aaa", Name: "a"})
	all := r.All()
	if all[0].Key != "skill:aaa" || all[1].Key != "skill:zzz" {
		t.Fatalf("not sorted: %+v", all)
	}
}

func TestByLifecycle(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:a", Name: "a", Lifecycle: LifecycleStable})
	r.Register(Spec{Key: "skill:b", Name: "b", Lifecycle: LifecycleBeta})
	r.Register(Spec{Key: "skill:c", Name: "c", Lifecycle: LifecycleBeta})
	got := r.ByLifecycle(LifecycleBeta)
	if len(got) != 2 {
		t.Fatalf("want 2 beta, got %d", len(got))
	}
}

func TestByTagDedup(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:a", Name: "a", Tags: []string{"hr", "policy"}})
	r.Register(Spec{Key: "skill:b", Name: "b", Tags: []string{"HR"}}) // different case
	r.Register(Spec{Key: "skill:c", Name: "c", Tags: []string{"ops"}})
	got := r.ByTag("HR")
	if len(got) != 2 {
		t.Fatalf("case-insensitive tag dedup: got %d", len(got))
	}
}

func TestCallableDraftBlocked(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:d", Name: "d", Lifecycle: LifecycleDraft})
	s, _ := r.Lookup("skill:d")
	if err := r.Callable(s, true, true); !errors.Is(err, ErrLifecycleBlocked) {
		t.Fatalf("draft must be blocked, got %v", err)
	}
}

func TestCallableBetaAllowed(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:b", Name: "b", Lifecycle: LifecycleBeta})
	s, _ := r.Lookup("skill:b")
	if err := r.Callable(s, false, false); !errors.Is(err, ErrLifecycleBlocked) {
		t.Fatalf("beta without flag blocked, got %v", err)
	}
	if err := r.Callable(s, true, false); err != nil {
		t.Fatalf("beta with allowBeta: %v", err)
	}
}

func TestCallableDeprecated(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:dp", Name: "dp", Lifecycle: LifecycleDeprecated})
	s, _ := r.Lookup("skill:dp")
	if err := r.Callable(s, true, false); !errors.Is(err, ErrLifecycleBlocked) {
		t.Fatalf("deprecated blocked by default, got %v", err)
	}
	if err := r.Callable(s, true, true); err != nil {
		t.Fatalf("deprecated with flag allowed: %v", err)
	}
}

func TestCallableForbidden(t *testing.T) {
	r := NewRegistry()
	r.Register(Spec{Key: "skill:f", Name: "f", Approval: ApprovalForbidden})
	s, _ := r.Lookup("skill:f")
	err := r.Callable(s, true, true)
	if err == nil || !strings.Contains(err.Error(), "forbidden") {
		t.Fatalf("forbidden must always error, got %v", err)
	}
}

func TestAppendUnique(t *testing.T) {
	got := appendUnique([]string{"a", "b"}, "a")
	if len(got) != 2 {
		t.Fatalf("appendUnique must dedup, got %v", got)
	}
	got = appendUnique([]string{"a"}, "b")
	if len(got) != 2 || got[1] != "b" {
		t.Fatalf("appendUnique append: %v", got)
	}
}
