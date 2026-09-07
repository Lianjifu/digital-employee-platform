package vault

import (
	"context"
	"testing"
)

func TestPutMapWritesAllEntries(t *testing.T) {
	c := NewFromEnv()
	entries := map[string]string{
		"vault://model-providers/a/credential": "sk-a",
		"vault://model-providers/b/credential": "sk-b",
		"vault://model-providers/c/credential": "sk-c",
	}
	if err := c.PutMap(context.Background(), entries); err != nil {
		t.Fatalf("PutMap: %v", err)
	}
	for ref, want := range entries {
		got, err := c.Resolve(context.Background(), ref)
		if err != nil {
			t.Fatalf("resolve %s: %v", ref, err)
		}
		if got != want {
			t.Fatalf("%s: got %q want %q", ref, got, want)
		}
	}
}

func TestPutMapEmptyIsNoop(t *testing.T) {
	c := NewFromEnv()
	if err := c.PutMap(context.Background(), nil); err != nil {
		t.Fatalf("nil map should be no-op: %v", err)
	}
	if err := c.PutMap(context.Background(), map[string]string{}); err != nil {
		t.Fatalf("empty map should be no-op: %v", err)
	}
}

func TestResolveMapReturnsMissing(t *testing.T) {
	c := NewFromEnv()
	_ = c.Put(context.Background(), "vault://present/key", "yes")
	got, missing, err := c.ResolveMap(context.Background(), []string{
		"vault://present/key",
		"vault://absent/one",
		"vault://absent/two",
	})
	if err != nil {
		t.Fatalf("ResolveMap: %v", err)
	}
	if got["vault://present/key"] != "yes" {
		t.Fatalf("expected present value, got %v", got)
	}
	if len(missing) != 2 {
		t.Fatalf("expected 2 missing, got %d (%v)", len(missing), missing)
	}
}

func TestResolveMapEmptyIsNoop(t *testing.T) {
	c := NewFromEnv()
	got, missing, err := c.ResolveMap(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 || len(missing) != 0 {
		t.Fatalf("expected empty results, got %v / %v", got, missing)
	}
}

func TestRedact(t *testing.T) {
	if Redact("") != "" {
		t.Fatal("empty string should redact to empty")
	}
	if Redact("ab") != "****" {
		t.Fatalf("short string should redact to ****, got %q", Redact("ab"))
	}
	if Redact("abcdefgh") != "ab****gh" {
		t.Fatalf("expected ab****ef, got %q", Redact("abcdefgh"))
	}
}