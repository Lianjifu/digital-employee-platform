package budget

import (
	"strings"
	"testing"
)

func cand(id string, content string, score float64, priority int) Candidate {
	return Candidate{ID: id, Title: id, Content: content, Score: score, Priority: priority, Source: "test"}
}

func TestSelectEmptyBudget(t *testing.T) {
	got, rep := Select([]Candidate{cand("a", "x", 1, 1)}, 0, 0.5)
	if got != nil {
		t.Fatalf("empty budget: %v", got)
	}
	if rep.Dropped != 1 {
		t.Fatalf("dropped=%d", rep.Dropped)
	}
}

func TestSelectEmptyCandidates(t *testing.T) {
	got, rep := Select(nil, 100, 0.5)
	if got != nil || rep.Dropped != 0 {
		t.Fatalf("empty cands: %v %+v", got, rep)
	}
}

func TestSelectPriorityFirst(t *testing.T) {
	cands := []Candidate{
		cand("low", "low priority", 1.0, 1),
		cand("crit", "critical", 0.5, 3),
		cand("med", "medium", 0.9, 2),
	}
	got, rep := Select(cands, 1000, 0.5)
	if len(got) != 3 {
		t.Fatalf("kept=%d", rep.Kept)
	}
	if got[0].ID != "crit" || got[1].ID != "med" || got[2].ID != "low" {
		t.Fatalf("priority order wrong: %+v", got)
	}
}

func TestSelectScoreBreaksPriorityTie(t *testing.T) {
	cands := []Candidate{
		cand("a", "alpha", 0.5, 2),
		cand("b", "beta", 0.9, 2),
	}
	got, _ := Select(cands, 1000, 0.5)
	if got[0].ID != "b" {
		t.Fatalf("score tie-break: %v", got)
	}
}

func TestSelectBudgetCutsAtLastFit(t *testing.T) {
	cands := []Candidate{
		cand("a", strings.Repeat("foo ", 50), 0.9, 1),
		cand("b", strings.Repeat("bar ", 50), 0.8, 1),
	}
	got, rep := Select(cands, 30, 0.5) // ~60 chars per item
	if len(got) < 1 {
		t.Fatal("at least 1 should fit")
	}
	_ = got
	if rep.Dropped+rep.Kept != 2 {
		t.Fatalf("kept+dropped must = total: %d %d", rep.Kept, rep.Dropped)
	}
}

func TestSelectTruncatesLongBody(t *testing.T) {
	body := strings.Repeat("这是一段长文本用于触发截断。", 50)
	cands := []Candidate{cand("a", body, 1.0, 3)}
	got, rep := Select(cands, 50, 0.5) // ~100 chars max
	if rep.TruncatedItems != 1 {
		t.Fatalf("expected 1 truncation, got %d", rep.TruncatedItems)
	}
	if !got[0].Truncated {
		t.Fatal("item should be marked truncated")
	}
}

func TestSelectTruncateAtParagraph(t *testing.T) {
	body := "第一段第一段第一段。\n\n第二段第二段第二段。\n\n第三段第三段第三段。"
	got := truncateAtParagraph(body, 15, 0.5) // ~30 runes, cuts after para 1
	if !strings.Contains(got, "第一段") {
		t.Fatalf("got %q", got)
	}
	if strings.Contains(got, "第三段") {
		t.Fatalf("must not include later paragraph: %q", got)
	}
	if !strings.HasSuffix(got, "…") {
		t.Fatalf("truncation marker missing: %q", got)
	}
}

func TestSelectTruncateShortBodyUnchanged(t *testing.T) {
	got := truncateAtParagraph("hello", 30, 0.5)
	if got != "hello" {
		t.Fatalf("short body should be unchanged: %q", got)
	}
}

func TestReportFields(t *testing.T) {
	cands := []Candidate{
		cand("a", "alpha content", 0.5, 1),
		cand("b", "beta content", 0.9, 1),
	}
	_, rep := Select(cands, 1000, 0.5)
	if rep.BudgetTokens != 1000 {
		t.Fatalf("budget echo: %d", rep.BudgetTokens)
	}
	if rep.UsedTokens <= 0 {
		t.Fatalf("used must be > 0: %d", rep.UsedTokens)
	}
}
