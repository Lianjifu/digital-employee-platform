package citation

import (
	"strings"
	"testing"
	"time"
)

func TestBuildEmpty(t *testing.T) {
	if got := Build(nil, time.Now()); got != nil {
		t.Fatalf("expected nil, got %v", got)
	}
}

func TestBuildDropsEmptyDocID(t *testing.T) {
	got := Build([]Hit{{DocID: "", Score: 0.9}}, time.Now())
	if len(got) != 0 {
		t.Fatalf("expected empty slice for empty doc id, got %v", got)
	}
}

func TestBuildDedupeByQuoteHash(t *testing.T) {
	hits := []Hit{
		{DocID: "a", Score: 0.9, Snippet: "年假申请流程"},
		{DocID: "a", Score: 0.8, Snippet: "年假申请流程"},
		{DocID: "a", Score: 0.7, Snippet: "年假申请流程"},
	}
	cites := Build(hits, time.Now())
	if len(cites) != 1 {
		t.Fatalf("expected 1 deduped citation, got %d", len(cites))
	}
}

func TestBuildTierOrdering(t *testing.T) {
	hits := []Hit{
		{DocID: "review-1", Tier: TierReview, Score: 0.99, Snippet: "待审核文档"},
		{DocID: "pub-1", Tier: TierPublished, Score: 0.5, Snippet: "已发布文档"},
		{DocID: "ws-1", Tier: TierWorkspace, Score: 0.95, Snippet: "工作区文档"},
	}
	cites := Build(hits, time.Now())
	if len(cites) != 3 {
		t.Fatalf("expected 3, got %d", len(cites))
	}
	if cites[0].DocID != "pub-1" || cites[1].DocID != "review-1" || cites[2].DocID != "ws-1" {
		t.Fatalf("tier order wrong: %+v", cites)
	}
}

func TestBuildScoreWithinSameTier(t *testing.T) {
	hits := []Hit{
		{DocID: "a", Tier: TierPublished, Score: 0.5, Snippet: "低分"},
		{DocID: "b", Tier: TierPublished, Score: 0.9, Snippet: "高分"},
	}
	cites := Build(hits, time.Now())
	if cites[0].DocID != "b" || cites[1].DocID != "a" {
		t.Fatalf("score order wrong: %+v", cites)
	}
}

func TestBuildCapsAtMax(t *testing.T) {
	hits := make([]Hit, 0, Max+5)
	for i := 0; i < Max+5; i++ {
		hits = append(hits, Hit{DocID: "d" + string(rune('A'+i)), Tier: TierPublished, Score: float64(Max-i), Snippet: "x"})
	}
	cites := Build(hits, time.Now())
	if len(cites) != Max {
		t.Fatalf("expected cap at %d, got %d", Max, len(cites))
	}
}

func TestExtractQuoteSplitsAtSentenceEnd(t *testing.T) {
	s := "年假申请流程与差旅报销标准。请假需提前三个工作日提交。"
	q, start, end := extractQuote(s)
	if start != 0 || end == 0 {
		t.Fatalf("offsets: %d %d", start, end)
	}
	if !strings.HasSuffix(q, "。") {
		t.Fatalf("quote should end at sentence boundary, got %q", q)
	}
}

func TestExtractQuoteEmpty(t *testing.T) {
	q, s, e := extractQuote("")
	if q != "" || s != 0 || e != 0 {
		t.Fatalf("empty: %q %d %d", q, s, e)
	}
}

func TestExtractQuoteCapsLong(t *testing.T) {
	long := strings.Repeat("测", 500)
	q, _, end := extractQuote(long)
	if end > 240 {
		t.Fatalf("expected cap at ≤240, got %d", end)
	}
	if len([]rune(q)) == 0 {
		t.Fatal("expected non-empty quote")
	}
}

func TestQuoteHashStable(t *testing.T) {
	a := QuoteHash("年假申请流程")
	b := QuoteHash("年假申请流程")
	if a != b {
		t.Fatalf("hashes must be stable: %s vs %s", a, b)
	}
	if len(a) != 40 {
		t.Fatalf("sha1 hex = 40 chars, got %d", len(a))
	}
}

func TestQuoteHashCaseInsensitive(t *testing.T) {
	a := QuoteHash("Hello World")
	b := QuoteHash("hello world")
	if a != b {
		t.Fatalf("hashes must be case-insensitive: %s vs %s", a, b)
	}
}

func TestQuoteHashEmpty(t *testing.T) {
	if QuoteHash("") != "" || QuoteHash("   ") != "" {
		t.Fatalf("empty/whitespace must hash to empty")
	}
}

func TestBuildIncludesEvalRunID(t *testing.T) {
	hits := []Hit{
		{DocID: "a", Tier: TierPublished, Score: 0.9, Snippet: "通过评测的文档", EvalRunID: "kev-abc"},
	}
	cites := Build(hits, time.Now())
	if cites[0].EvalRunID != "kev-abc" {
		t.Fatalf("eval run id not propagated: %+v", cites[0])
	}
}

func TestBuildIncludesRetrievedAt(t *testing.T) {
	now := time.Date(2026, 9, 7, 10, 0, 0, 0, time.UTC)
	hits := []Hit{{DocID: "a", Tier: TierPublished, Score: 0.9, Snippet: "x"}}
	cites := Build(hits, now)
	if !cites[0].RetrievedAt.Equal(now) {
		t.Fatalf("retrievedAt = %v want %v", cites[0].RetrievedAt, now)
	}
}

func TestBuildDefaultTier(t *testing.T) {
	hits := []Hit{{DocID: "a", Score: 0.9, Snippet: "no tier"}} // empty tier
	cites := Build(hits, time.Now())
	if cites[0].Tier != TierReview {
		t.Fatalf("default tier must be review, got %s", cites[0].Tier)
	}
}
