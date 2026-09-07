package provenance

import (
	"strings"
	"testing"
)

func TestStampValid(t *testing.T) {
	p, err := Stamp(SourceChat, "u1", "alice", "conv-123", "hello", "")
	if err != nil {
		t.Fatalf("stamp: %v", err)
	}
	if p.Source != SourceChat {
		t.Fatalf("source=%s", p.Source)
	}
	if p.ContentSHA == "" {
		t.Fatal("sha must be set")
	}
	if !strings.HasPrefix(p.CreatedAt, "20") {
		t.Fatalf("createdAt not RFC3339: %s", p.CreatedAt)
	}
}

func TestStampInvalidSource(t *testing.T) {
	_, err := Stamp(Source("garbage"), "u1", "", "", "", "")
	if err == nil {
		t.Fatal("expected error on invalid source")
	}
}

func TestStampEmptyContent(t *testing.T) {
	p, err := Stamp(SourceAdmin, "u1", "alice", "", "", "")
	if err != nil {
		t.Fatalf("stamp: %v", err)
	}
	if p.ContentSHA != "" {
		t.Fatalf("empty content should hash to empty, got %s", p.ContentSHA)
	}
}

func TestStampLegacy(t *testing.T) {
	p := StampLegacy("legacy content")
	if p.Source != SourceMigration {
		t.Fatalf("legacy source: %s", p.Source)
	}
	if p.ActorID != "system" {
		t.Fatalf("legacy actor: %s", p.ActorID)
	}
	if !strings.Contains(p.Note, "migration") {
		t.Fatalf("legacy note: %s", p.Note)
	}
}

func TestValidate(t *testing.T) {
	p, _ := Stamp(SourceChat, "u", "", "", "x", "")
	if err := Validate(p); err != nil {
		t.Fatalf("validate: %v", err)
	}
	p.Source = Source("nope")
	if err := Validate(p); err == nil {
		t.Fatal("invalid source must fail validate")
	}
}

func TestEqual(t *testing.T) {
	a, _ := Stamp(SourceChat, "u", "", "r1", "x", "")
	b, _ := Stamp(SourceChat, "v", "", "r1", "x", "")
	if !Equal(a, b) {
		t.Fatal("same source/ref/sha must be equal")
	}
	c, _ := Stamp(SourceAdmin, "u", "", "r1", "x", "")
	if Equal(a, c) {
		t.Fatal("different source must be unequal")
	}
}

func TestFillDefaultsStampsMissing(t *testing.T) {
	records := []map[string]any{
		{"id": "a", "title": "t1", "content": "c1", "createdAt": "2026-01-01T00:00:00Z"},
		{"id": "b", "title": "t2", "content": "c2", "provenance": map[string]any{"source": "chat"}},
	}
	n := FillDefaults(records)
	if n != 1 {
		t.Fatalf("stamped %d, want 1", n)
	}
	if _, ok := records[0]["provenance"]; !ok {
		t.Fatal("first record should have provenance")
	}
	if _, ok := records[1]["provenance"]; !ok {
		t.Fatal("second record's provenance should still exist")
	}
	// CreatedAt was 2026-01-01; the stamp must preserve it.
	p := records[0]["provenance"].(Provenance)
	if !strings.HasPrefix(p.CreatedAt, "2026-01-01") {
		t.Fatalf("createdAt not preserved: %s", p.CreatedAt)
	}
}

func TestTopSources(t *testing.T) {
	records := []Provenance{
		{Source: SourceChat}, {Source: SourceChat}, {Source: SourceChat},
		{Source: SourceAdmin},
		{Source: SourceImport},
	}
	top := TopSources(records, 5)
	if len(top) != 3 {
		t.Fatalf("len=%d", len(top))
	}
	if top[0].Source != SourceChat || top[0].Count != 3 {
		t.Fatalf("top=%+v", top[0])
	}
}

func TestTopSourcesLimit(t *testing.T) {
	records := []Provenance{
		{Source: SourceChat},
		{Source: SourceAdmin},
		{Source: SourceImport},
	}
	top := TopSources(records, 2)
	if len(top) != 2 {
		t.Fatalf("len=%d", len(top))
	}
}

func TestValidSource(t *testing.T) {
	for _, s := range []Source{SourceChat, SourceAdmin, SourceImport, SourceSchedule, SourceSystem, SourceMigration} {
		if !validSource(s) {
			t.Errorf("must accept %s", s)
		}
	}
	if validSource(Source("garbage")) {
		t.Fatal("must reject unknown")
	}
}
