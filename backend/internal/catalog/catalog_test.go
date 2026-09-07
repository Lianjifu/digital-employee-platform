package catalog

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
)

// fakeSource lets a test pin exactly which Options a Source returns
// for a given workspace, and optionally inject an error.
type fakeSource struct {
	kind    string
	byWS    map[string][]Option
	err     error
	calls   int
	lastWS  string
	lastCtx context.Context
}

func (f *fakeSource) Kind() string { return f.kind }
func (f *fakeSource) Fetch(ctx context.Context, ws string) ([]Option, error) {
	f.calls++
	f.lastWS = ws
	f.lastCtx = ctx
	if f.err != nil {
		return nil, f.err
	}
	opts := f.byWS[ws]
	out := make([]Option, 0, len(opts))
	for _, o := range opts {
		if o.Kind == "" {
			o.Kind = f.kind
		}
		out = append(out, o)
	}
	return out, nil
}

func TestAssembleMergesAcrossSourcesByKind(t *testing.T) {
	skillsA := &fakeSource{kind: KindSkill, byWS: map[string][]Option{
		"w1": {{Name: "loki-query"}, {Name: "cmdb-lookup"}},
	}}
	skillsB := &fakeSource{kind: KindSkill, byWS: map[string][]Option{
		"w1": {{Name: "cmdb-lookup"}, {Name: "trello"}}, // cmdb-lookup duplicates
	}}
	models := &fakeSource{kind: KindModel, byWS: map[string][]Option{
		"w1": {{Name: "gpt-4o"}, {Name: "claude-sonnet"}},
	}}

	reg := &Registry{Sources: []Source{skillsA, skillsB, models}}
	got, errs := reg.Assemble(context.Background(), "w1")
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}

	wantSkillOrder := []string{"loki-query", "cmdb-lookup", "trello"}
	gotSkillOrder := make([]string, 0, len(got[KindSkill]))
	for _, o := range got[KindSkill] {
		gotSkillOrder = append(gotSkillOrder, o.Name)
	}
	if !reflect.DeepEqual(gotSkillOrder, wantSkillOrder) {
		t.Fatalf("skill order: want %v, got %v", wantSkillOrder, gotSkillOrder)
	}

	wantModelOrder := []string{"gpt-4o", "claude-sonnet"}
	gotModelOrder := make([]string, 0, len(got[KindModel]))
	for _, o := range got[KindModel] {
		gotModelOrder = append(gotModelOrder, o.Name)
	}
	if !reflect.DeepEqual(gotModelOrder, wantModelOrder) {
		t.Fatalf("model order: want %v, got %v", wantModelOrder, gotModelOrder)
	}

	// Empty kinds must still be present as empty slices so callers
	// can range without nil checks.
	for _, k := range []string{KindTool, KindMCP, KindWorkflow, KindKnowledge, KindChannel} {
		if got[k] == nil {
			t.Fatalf("section[%q] must be non-nil empty slice", k)
		}
		if len(got[k]) != 0 {
			t.Fatalf("section[%q] should be empty, got %v", k, got[k])
		}
	}
}

func TestAssembleWorkspaceIsolationIsSourced(t *testing.T) {
	// Sources, not the registry, are responsible for workspace
	// filtering. The registry just dedupes. A misbehaving source that
	// leaks a different workspace's data will produce options that
	// include the leaked workspace's name verbatim — exactly the
	// behavior we want surfaced (the source's filter is broken).
	leaky := &fakeSource{kind: KindSkill, byWS: map[string][]Option{
		"w1": {{Name: "loki-query", Meta: "w1"}},
		"w2": {{Name: "cmdb-lookup", Meta: "w2"}},
	}}
	reg := &Registry{Sources: []Source{leaky}}
	_, _ = reg.Assemble(context.Background(), "w1")
	if leaky.lastWS != "w1" {
		t.Fatalf("expected ws=w1 to be passed to source, got %q", leaky.lastWS)
	}
	got, errs := reg.Assemble(context.Background(), "w1")
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	// Source returned only the w1 entries for ws="w1", so we expect
	// exactly one option. (The test source returns byWS[ws], not all.)
	if len(got[KindSkill]) != 1 || got[KindSkill][0].Name != "loki-query" {
		t.Fatalf("expected only w1 skill, got %v", got[KindSkill])
	}
}

func TestAssemblePassesContext(t *testing.T) {
	src := &fakeSource{kind: KindChannel, byWS: map[string][]Option{
		"w1": {{Name: "Web"}},
	}}
	ctx, cancel := context.WithCancel(context.Background())
	reg := &Registry{Sources: []Source{src}}
	if _, errs := reg.Assemble(ctx, "w1"); len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	if src.lastCtx != ctx {
		t.Fatalf("source did not receive the registry's context")
	}
	cancel()
	src2 := &fakeSource{kind: KindChannel, err: context.Canceled}
	reg2 := &Registry{Sources: []Source{src2}}
	_, errs := reg2.Assemble(ctx, "w1")
	if len(errs) == 0 || !errors.Is(errs[0], context.Canceled) {
		t.Fatalf("expected context.Canceled surfaced, got %v", errs)
	}
}

func TestAssembleFailOpenContinuesAfterError(t *testing.T) {
	bad := &fakeSource{kind: KindSkill, err: errors.New("peer down")}
	good := &fakeSource{kind: KindSkill, byWS: map[string][]Option{
		"w1": {{Name: "loki-query"}},
	}}
	reg := &Registry{FailOpen: true, Sources: []Source{bad, good}}
	got, errs := reg.Assemble(context.Background(), "w1")
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %v", errs)
	}
	if got[KindSkill][0].Name != "loki-query" {
		t.Fatalf("expected partial result, got %v", got[KindSkill])
	}
}

func TestAssembleFailClosedStopsOnError(t *testing.T) {
	bad := &fakeSource{kind: KindSkill, err: errors.New("peer down")}
	good := &fakeSource{kind: KindSkill, byWS: map[string][]Option{
		"w1": {{Name: "loki-query"}},
	}}
	reg := &Registry{FailOpen: false, Sources: []Source{bad, good}}
	got, errs := reg.Assemble(context.Background(), "w1")
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %v", errs)
	}
	// Should NOT have called good after bad failed.
	if good.calls != 0 {
		t.Fatalf("expected good source NOT to be called after fail-closed error, got calls=%d", good.calls)
	}
	// Section should still be non-nil so handlers don't panic on nil map.
	if got == nil {
		t.Fatal("expected non-nil Section even on fail-closed")
	}
}

func TestMergeOptionsDedupePreservesOrder(t *testing.T) {
	base := []Option{{Name: "a"}, {Name: "b"}}
	extra := []Option{{Name: "b"}, {Name: "c"}, {Name: ""}, {Name: "d"}}
	got := MergeOptions(base, extra)
	want := []string{"a", "b", "c", "d"}
	if len(got) != len(want) {
		t.Fatalf("expected %d entries, got %d", len(want), len(got))
	}
	for i, n := range want {
		if got[i].Name != n {
			t.Fatalf("[%d]: want %q, got %q", i, n, got[i].Name)
		}
	}
}

func TestMergeOptionsEmptyExtra(t *testing.T) {
	base := []Option{{Name: "a"}, {Name: "b"}}
	got := MergeOptions(base, nil)
	if !reflect.DeepEqual(got, base) {
		t.Fatalf("expected unchanged base, got %v", got)
	}
}

func TestStaticSourceRespectsContext(t *testing.T) {
	src := &StaticSource{K: KindChannel, Opts: []Option{{Name: "Web"}}}
	if _, err := src.Fetch(context.Background(), "w1"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := src.Fetch(ctx, "w1"); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestStaticSourceFillsKind(t *testing.T) {
	src := &StaticSource{K: KindChannel, Opts: []Option{{Name: "Web"}}}
	opts, err := src.Fetch(context.Background(), "w1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(opts) != 1 || opts[0].Kind != KindChannel {
		t.Fatalf("expected Kind=channel filled, got %+v", opts)
	}
}

func TestAssembleDropsEmptyNames(t *testing.T) {
	src := &fakeSource{kind: KindSkill, byWS: map[string][]Option{
		"w1": {{Name: "real"}, {Name: ""}, {Name: "  "}},
	}}
	reg := &Registry{Sources: []Source{src}}
	got, errs := reg.Assemble(context.Background(), "w1")
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	if len(got[KindSkill]) != 1 || got[KindSkill][0].Name != "real" {
		t.Fatalf("expected only 'real' option, got %v", got[KindSkill])
	}
}

func TestSortedNames(t *testing.T) {
	s := Section{
		KindChannel: []Option{{Name: "Web"}, {Name: "Email"}, {Name: "DingTalk"}},
	}
	got := SortedNames(s, KindChannel)
	want := []string{"DingTalk", "Email", "Web"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("SortedNames: want %v, got %v", want, got)
	}
	// Unknown kind returns empty slice, not nil.
	if SortedNames(s, "unknown") == nil {
		t.Fatal("SortedNames for unknown kind must return empty slice, not nil")
	}
	// Idempotent: same input twice produces same output.
	got2 := SortedNames(s, KindChannel)
	if !reflect.DeepEqual(got, got2) {
		t.Fatal("SortedNames must be deterministic")
	}
	// Section keys are case-insensitive per map semantics; verify the
	// helper handles the well-known constants.
	if strings.TrimSpace(strings.Join(SortedNames(s, KindChannel), ",")) != "DingTalk,Email,Web" {
		t.Fatalf("SortedNames joined mismatch")
	}
}