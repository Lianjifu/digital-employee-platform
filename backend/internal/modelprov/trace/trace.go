// Package trace captures structured per-invocation traces for the model
// service. Replaces the prior lack of tracing: a 500/429/timeout from an
// upstream provider used to leave the audit log with only "provider X
// failed" — no model id, no latency, no token counts, no error class.
//
// Trace stores events keyed by trace_id and exports aggregates
// (success rate, p50/p95 latency, error class counts) that the metrics
// endpoint exposes for SLO dashboards.
package trace

import (
	"sort"
	"strings"
	"sync"
	"time"
)

// Status of one trace event.
type Status string

const (
	StatusOK       Status = "ok"
	StatusFallback Status = "fallback"
	StatusError    Status = "error"
	StatusTimeout  Status = "timeout"
	Status429      Status = "rate_limited"
)

// Event is one model invocation record.
type Event struct {
	TraceID      string    `json:"traceId"`
	WorkspaceID  string    `json:"workspaceId"`
	TurnID       string    `json:"turnId"`
	ModelID      string    `json:"modelId"`
	ProviderID   string    `json:"providerId"`
	Level        string    `json:"level"`        // P0..P3
	Source       string    `json:"source"`       // provider | routing | env
	Status       Status    `json:"status"`
	ErrorClass   string    `json:"errorClass,omitempty"`
	ErrorMessage string    `json:"errorMessage,omitempty"`
	StartedAt    time.Time `json:"startedAt"`
	EndedAt      time.Time `json:"endedAt"`
	LatencyMs    int64     `json:"latencyMs"`
	InputTokens  int       `json:"inputTokens,omitempty"`
	OutputTokens int       `json:"outputTokens,omitempty"`
}

// Aggregates is the rollup over recent events.
type Aggregates struct {
	Window         string  `json:"window"`
	SampleSize     int     `json:"sampleSize"`
	SuccessRate    float64 `json:"successRate"`
	P50LatencyMs   float64 `json:"p50LatencyMs"`
	P95LatencyMs   float64 `json:"p95LatencyMs"`
	MeanLatencyMs  float64 `json:"meanLatencyMs"`
	ByStatus       map[string]int `json:"byStatus"`
	ByErrorClass   map[string]int `json:"byErrorClass"`
	TokensInTotal  int     `json:"tokensInTotal"`
	TokensOutTotal int     `json:"tokensOutTotal"`
}

// Recorder is the in-memory trace recorder. Thread-safe.
type Recorder struct {
	mu     sync.RWMutex
	events []Event
	max    int
}

// NewRecorder returns a recorder with the given cap (oldest evicted first).
func NewRecorder(max int) *Recorder {
	if max <= 0 {
		max = 5000
	}
	return &Recorder{max: max}
}

// Append stores an event. Trims oldest when over cap.
func (r *Recorder) Append(e Event) {
	if e.TraceID == "" {
		return
	}
	if e.EndedAt.IsZero() {
		e.EndedAt = time.Now().UTC()
	}
	if e.StartedAt.IsZero() {
		e.StartedAt = e.EndedAt
	}
	if e.LatencyMs == 0 && !e.EndedAt.IsZero() && !e.StartedAt.IsZero() {
		e.LatencyMs = e.EndedAt.Sub(e.StartedAt).Milliseconds()
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
	if len(r.events) > r.max {
		drop := len(r.events) - r.max
		r.events = r.events[drop:]
	}
}

// Recent returns the most recent n events (n<=0 returns all).
func (r *Recorder) Recent(n int) []Event {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if n <= 0 || n > len(r.events) {
		out := make([]Event, len(r.events))
		copy(out, r.events)
		return out
	}
	out := make([]Event, n)
	copy(out, r.events[len(r.events)-n:])
	return out
}

// AggregatesWindow computes rollups for events in the given window.
// window="all" rolls up everything; otherwise interpreted as a duration
// string ("5m", "1h"); falls back to "1h" on parse error.
func (r *Recorder) AggregatesWindow(window string) Aggregates {
	r.mu.RLock()
	defer r.mu.RUnlock()
	cutoff := time.Time{}
	if window != "" && window != "all" {
		if d, err := time.ParseDuration(window); err == nil {
			cutoff = time.Now().UTC().Add(-d)
		}
	}
	var evs []Event
	for _, e := range r.events {
		if cutoff.IsZero() || !e.StartedAt.Before(cutoff) {
			evs = append(evs, e)
		}
	}
	return rollup(evs, window)
}

func rollup(evs []Event, window string) Aggregates {
	if len(evs) == 0 {
		return Aggregates{Window: window, ByStatus: map[string]int{}, ByErrorClass: map[string]int{}}
	}
	latencies := make([]float64, 0, len(evs))
	byStatus := map[string]int{}
	byErr := map[string]int{}
	ok := 0
	var sumLat float64
	tokensIn, tokensOut := 0, 0
	for _, e := range evs {
		latencies = append(latencies, float64(e.LatencyMs))
		sumLat += float64(e.LatencyMs)
		byStatus[string(e.Status)]++
		if e.Status == StatusOK || e.Status == StatusFallback {
			ok++
		}
		if e.ErrorClass != "" {
			byErr[e.ErrorClass]++
		}
		tokensIn += e.InputTokens
		tokensOut += e.OutputTokens
	}
	sort.Float64s(latencies)
	p50 := percentile(latencies, 0.50)
	p95 := percentile(latencies, 0.95)
	return Aggregates{
		Window:         window,
		SampleSize:     len(evs),
		SuccessRate:    float64(ok) / float64(len(evs)),
		P50LatencyMs:   p50,
		P95LatencyMs:   p95,
		MeanLatencyMs:  sumLat / float64(len(evs)),
		ByStatus:       byStatus,
		ByErrorClass:   byErr,
		TokensInTotal:  tokensIn,
		TokensOutTotal: tokensOut,
	}
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(float64(len(sorted)-1) * p)
	return sorted[idx]
}

// ClassifyError maps a Go error message to a coarse error class used in
// Aggregates.ByErrorClass. Stable strings so dashboards can group.
func ClassifyError(msg string) string {
	m := strings.ToLower(msg)
	switch {
	case strings.Contains(m, "timeout") || strings.Contains(m, "deadline exceeded"):
		return "timeout"
	case strings.Contains(m, "429") || strings.Contains(m, "rate limit") || strings.Contains(m, "too many requests"):
		return "rate_limited"
	case strings.Contains(m, "401") || strings.Contains(m, "unauthorized"):
		return "auth"
	case strings.Contains(m, "404") || strings.Contains(m, "not found"):
		return "not_found"
	case strings.Contains(m, "500") || strings.Contains(m, "502") || strings.Contains(m, "503") || strings.Contains(m, "504") || strings.Contains(m, "internal"):
		return "upstream_5xx"
	case strings.Contains(m, "no usable chat model"):
		return "no_model"
	}
	return "other"
}
