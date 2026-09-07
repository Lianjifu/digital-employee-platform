// Package agentos provides the SubAgent dispatch primitive used by the
// multi-agent turn path. It owns:
//
//   - bounded concurrency (configurable via Engine.MaxConc)
//   - per-task timeout (Engine.DefaultTimeout; overridable per Task)
//   - panic recovery that converts a panic into a structured "failed" result
//   - parent-ctx cancellation propagation
//   - optional duration metric hook (set Engine.OnMetric to forward to
//     Prometheus / OpenTelemetry / etc.)
//
// The package is deliberately storage-/network-agnostic; the caller wires
// its own Fn. ADR-022.
package agentos

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"
)

// Result is the normalized outcome of one sub-task. Status values:
//
//   - "success"   : Fn returned without error and did not surface a refusal
//   - "refused"   : Fn reported a hard-no refusal (HardNoRefusal set)
//   - "timed_out" : Engine.DefaultTimeout or Task.Budget elapsed
//   - "failed"    : Fn returned an error or panicked (Reason set)
type Result struct {
	ID            string
	Status        string
	Text          string
	Reason        string
	HardNoRefusal string
	Duration      time.Duration
	StartedAt     time.Time
}

// Task is one unit of work the Engine runs.
type Task struct {
	ID string
	// Fn is the actual work. It receives a derived ctx that is the parent
	// ctx truncated by min(parent-deadline, Task.Budget if set,
	// Engine.DefaultTimeout). Fn must NOT panic; if it does, the engine
	// catches and reports "failed/panic_recovered".
	Fn func(ctx context.Context) Result
	// Budget, when > 0, overrides Engine.DefaultTimeout for this task.
	Budget time.Duration
}

// Engine runs Tasks with bounded concurrency + per-task timeout.
//
// OnMetric, when non-nil, receives the wall-clock duration of every task
// (success, refused, timed_out, failed). Used to feed Prometheus without
// the agentos package needing a metrics dependency.
type Engine struct {
	MaxConc         int
	DefaultTimeout  time.Duration
	OnMetric        func(duration time.Duration, status string)
}

// Run executes the slice and returns a Result slice in the same order as
// tasks. The function is safe to call from one goroutine at a time per
// Engine; reuse the Engine across requests by giving each request its own
// derived context.
func (e *Engine) Run(ctx context.Context, tasks []Task) []Result {
	results := make([]Result, len(tasks))
	if len(tasks) == 0 {
		return results
	}
	maxConc := e.MaxConc
	if maxConc <= 0 {
		maxConc = 4
	}
	defaultTimeout := e.DefaultTimeout
	if defaultTimeout <= 0 {
		defaultTimeout = 30 * time.Second
	}
	if e.MaxConc > len(tasks) {
		maxConc = len(tasks)
	}
	sem := make(chan struct{}, maxConc)
	var wg sync.WaitGroup
	for i := range tasks {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				results[i] = Result{
					ID:       tasks[i].ID,
					Status:   "timed_out",
					Reason:   ctx.Err().Error(),
					Duration: 0,
				}
				return
			}
			defer func() { <-sem }()

			budget := tasks[i].Budget
			if budget <= 0 {
				budget = defaultTimeout
			}
			tctx, cancel := context.WithTimeout(ctx, budget)
			defer cancel()

			start := time.Now()
			res := safeInvoke(tctx, tasks[i])
			res.ID = tasks[i].ID
			if res.StartedAt.IsZero() {
				res.StartedAt = start
			}
			res.Duration = time.Since(start)
			results[i] = res
			if e.OnMetric != nil {
				e.OnMetric(res.Duration, res.Status)
			}
		}()
	}
	wg.Wait()
	return results
}

// safeInvoke runs fn with a panic recovery and timeout reporting.
func safeInvoke(ctx context.Context, t Task) (r Result) {
	defer func() {
		if rec := recover(); rec != nil {
			r = Result{
				Status: "failed",
				Reason: fmt.Sprintf("panic_recovered: %v", rec),
			}
		}
	}()
	if err := ctx.Err(); err != nil {
		return Result{
			Status: "timed_out",
			Reason: err.Error(),
		}
	}
	r = t.Fn(ctx)
	if r.Status == "" {
		r.Status = "success"
	}
	return r
}

// MaxConcurrencyDefault is the default cap when neither Engine.MaxConc
// nor the env flag is set.
const MaxConcurrencyDefault = 4

// DefaultTimeoutDefault is the per-task cap when neither Engine.DefaultTimeout
// nor Task.Budget is set.
const DefaultTimeoutDefault = 30 * time.Second

// SortedIDs returns the IDs in deterministic order. Useful for emitting
// completion events in stable sequence.
func SortedIDs(results []Result) []string {
	ids := make([]string, 0, len(results))
	for _, r := range results {
		ids = append(ids, r.ID)
	}
	sort.Strings(ids)
	return ids
}