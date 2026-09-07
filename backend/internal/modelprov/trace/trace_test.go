package trace

import (
	"strings"
	"testing"
	"time"
)

func TestAppendAssignsTimes(t *testing.T) {
	r := NewRecorder(10)
	now := time.Now().UTC()
	r.Append(Event{TraceID: "t1", ModelID: "m1", ProviderID: "p1", StartedAt: now, EndedAt: now.Add(100 * time.Millisecond)})
	got := r.Recent(1)
	if len(got) != 1 {
		t.Fatalf("want 1, got %d", len(got))
	}
	if got[0].LatencyMs != 100 {
		t.Fatalf("latency = %d, want 100", got[0].LatencyMs)
	}
}

func TestRecorderCap(t *testing.T) {
	r := NewRecorder(3)
	for i := 0; i < 5; i++ {
		r.Append(Event{TraceID: "t" + string(rune('A'+i)), StartedAt: time.Now(), EndedAt: time.Now()})
	}
	got := r.Recent(0)
	if len(got) != 3 {
		t.Fatalf("cap=3, got %d", len(got))
	}
	if got[0].TraceID != "tC" || got[2].TraceID != "tE" {
		t.Fatalf("eviction wrong: %+v", got)
	}
}

func TestAppendSkipsEmptyTraceID(t *testing.T) {
	r := NewRecorder(10)
	r.Append(Event{ModelID: "x"})
	if got := r.Recent(0); len(got) != 0 {
		t.Fatalf("empty trace id must be skipped")
	}
}

func TestAggregatesEmpty(t *testing.T) {
	r := NewRecorder(10)
	agg := r.AggregatesWindow("all")
	if agg.SampleSize != 0 {
		t.Fatalf("empty: sample=%d", agg.SampleSize)
	}
	if agg.ByStatus == nil {
		t.Fatal("ByStatus must be initialized")
	}
}

func TestAggregatesSuccessRate(t *testing.T) {
	r := NewRecorder(10)
	now := time.Now().UTC()
	r.Append(Event{TraceID: "t1", StartedAt: now, EndedAt: now.Add(50 * time.Millisecond), Status: StatusOK})
	r.Append(Event{TraceID: "t2", StartedAt: now, EndedAt: now.Add(100 * time.Millisecond), Status: StatusFallback})
	r.Append(Event{TraceID: "t3", StartedAt: now, EndedAt: now.Add(200 * time.Millisecond), Status: StatusError})
	r.Append(Event{TraceID: "t4", StartedAt: now, EndedAt: now.Add(300 * time.Millisecond), Status: StatusTimeout})
	agg := r.AggregatesWindow("all")
	if agg.SampleSize != 4 {
		t.Fatalf("sample=%d", agg.SampleSize)
	}
	if agg.SuccessRate != 0.5 {
		t.Fatalf("success rate = %v, want 0.5 (ok + fallback / 4)", agg.SuccessRate)
	}
	if agg.ByStatus["ok"] != 1 || agg.ByStatus["error"] != 1 || agg.ByStatus["timeout"] != 1 || agg.ByStatus["fallback"] != 1 {
		t.Fatalf("byStatus: %+v", agg.ByStatus)
	}
	if agg.P50LatencyMs != 100 || agg.P95LatencyMs != 200 {
		t.Fatalf("latencies: p50=%v p95=%v", agg.P50LatencyMs, agg.P95LatencyMs)
	}
	if agg.MeanLatencyMs != 162.5 {
		t.Fatalf("mean = %v want 162.5", agg.MeanLatencyMs)
	}
}

func TestAggregatesTokens(t *testing.T) {
	r := NewRecorder(10)
	now := time.Now().UTC()
	r.Append(Event{TraceID: "t1", StartedAt: now, EndedAt: now.Add(time.Millisecond), Status: StatusOK, InputTokens: 100, OutputTokens: 50})
	r.Append(Event{TraceID: "t2", StartedAt: now, EndedAt: now.Add(time.Millisecond), Status: StatusOK, InputTokens: 200, OutputTokens: 80})
	agg := r.AggregatesWindow("all")
	if agg.TokensInTotal != 300 || agg.TokensOutTotal != 130 {
		t.Fatalf("tokens: in=%d out=%d", agg.TokensInTotal, agg.TokensOutTotal)
	}
}

func TestAggregatesWindowFilters(t *testing.T) {
	r := NewRecorder(10)
	old := time.Now().UTC().Add(-2 * time.Hour)
	r.Append(Event{TraceID: "old", StartedAt: old, EndedAt: old, Status: StatusOK})
	now := time.Now().UTC()
	r.Append(Event{TraceID: "new", StartedAt: now, EndedAt: now, Status: StatusOK})
	agg := r.AggregatesWindow("1h")
	if agg.SampleSize != 1 {
		t.Fatalf("window filter: sample=%d", agg.SampleSize)
	}
}

func TestClassifyError(t *testing.T) {
	cases := map[string]string{
		"deadline exceeded":               "timeout",
		"i/o timeout":                     "timeout",
		"429 too many requests":           "rate_limited",
		"unauthorized":                    "auth",
		"502 bad gateway":                 "upstream_5xx",
		"no usable chat model in workspace": "no_model",
		"random failure":                  "other",
	}
	for in, want := range cases {
		if got := ClassifyError(in); got != want {
			t.Errorf("ClassifyError(%q)=%q want %q", in, got, want)
		}
	}
}

func TestPercentile(t *testing.T) {
	if p := percentile([]float64{1, 2, 3, 4, 5}, 0.5); p != 3 {
		t.Fatalf("p50 of 5 values = %v, want 3", p)
	}
	if p := percentile([]float64{}, 0.95); p != 0 {
		t.Fatalf("empty: %v", p)
	}
}

func TestRecentLimit(t *testing.T) {
	r := NewRecorder(10)
	for i := 0; i < 5; i++ {
		r.Append(Event{TraceID: "t" + string(rune('A'+i)), StartedAt: time.Now(), EndedAt: time.Now()})
	}
	got := r.Recent(2)
	if len(got) != 2 {
		t.Fatalf("len=%d", len(got))
	}
}

func TestContainsAndIndexOf(t *testing.T) {
	if !strings.Contains("hello world", "world") {
		t.Fatal("string contains ok")
	}
	if strings.Contains("hello", "xyz") {
		t.Fatal("must not contain")
	}
}
