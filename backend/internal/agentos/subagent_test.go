package agentos

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestEngineEmpty(t *testing.T) {
	e := &Engine{}
	got := e.Run(context.Background(), nil)
	if len(got) != 0 {
		t.Fatalf("want 0 results, got %d", len(got))
	}
}

func TestEngineSuccess(t *testing.T) {
	e := &Engine{MaxConc: 2, DefaultTimeout: 1 * time.Second}
	tasks := []Task{
		{ID: "a", Fn: func(ctx context.Context) Result { return Result{Text: "alpha"} }},
		{ID: "b", Fn: func(ctx context.Context) Result { return Result{Text: "beta"} }},
		{ID: "c", Fn: func(ctx context.Context) Result { return Result{Text: "gamma"} }},
	}
	got := e.Run(context.Background(), tasks)
	if len(got) != 3 {
		t.Fatalf("len: %d", len(got))
	}
	for i, want := range []string{"alpha", "beta", "gamma"} {
		if got[i].ID != tasks[i].ID || got[i].Text != want || got[i].Status != "success" {
			t.Fatalf("idx %d: %+v", i, got[i])
		}
		if got[i].Duration <= 0 {
			t.Fatalf("idx %d: duration not recorded", i)
		}
	}
}

func TestEngineOrderPreserved(t *testing.T) {
	e := &Engine{MaxConc: 1, DefaultTimeout: 1 * time.Second}
	tasks := []Task{
		{ID: "a", Fn: func(ctx context.Context) Result { time.Sleep(5 * time.Millisecond); return Result{Text: "A"} }},
		{ID: "b", Fn: func(ctx context.Context) Result { return Result{Text: "B"} }},
		{ID: "c", Fn: func(ctx context.Context) Result { return Result{Text: "C"} }},
	}
	got := e.Run(context.Background(), tasks)
	for i, want := range []string{"A", "B", "C"} {
		if got[i].Text != want {
			t.Fatalf("idx %d: %s", i, got[i].Text)
		}
	}
}

func TestEngineBoundedConcurrency(t *testing.T) {
	e := &Engine{MaxConc: 2, DefaultTimeout: 1 * time.Second}
	var inFlight atomic.Int32
	var peak atomic.Int32
	tasks := make([]Task, 10)
	for i := range tasks {
		i := i
		tasks[i] = Task{ID: string(rune('a' + i)), Fn: func(ctx context.Context) Result {
			cur := inFlight.Add(1)
			for {
				p := peak.Load()
				if cur <= p || peak.CompareAndSwap(p, cur) {
					break
				}
			}
			time.Sleep(20 * time.Millisecond)
			inFlight.Add(-1)
			return Result{Text: "ok"}
		}}
	}
	e.Run(context.Background(), tasks)
	if peak.Load() > int32(e.MaxConc) {
		t.Fatalf("peak concurrency %d > cap %d", peak.Load(), e.MaxConc)
	}
	if peak.Load() < 2 {
		t.Fatalf("peak concurrency %d should be at least 2 with 10 tasks", peak.Load())
	}
}

func TestEnginePanicRecovered(t *testing.T) {
	e := &Engine{MaxConc: 1, DefaultTimeout: 1 * time.Second}
	got := e.Run(context.Background(), []Task{
		{ID: "boom", Fn: func(ctx context.Context) Result { panic("kaboom") }},
	})
	if got[0].Status != "failed" {
		t.Fatalf("want failed, got %s", got[0].Status)
	}
	if got[0].Reason == "" || got[0].Reason[:17] != "panic_recovered: " {
		t.Fatalf("reason: %s", got[0].Reason)
	}
}

func TestEngineTimeout(t *testing.T) {
	e := &Engine{MaxConc: 1, DefaultTimeout: 30 * time.Millisecond}
	got := e.Run(context.Background(), []Task{
		{ID: "slow", Fn: func(ctx context.Context) Result {
			select {
			case <-ctx.Done():
				return Result{Status: "timed_out", Reason: ctx.Err().Error()}
			case <-time.After(200 * time.Millisecond):
				return Result{Text: "should not reach"}
			}
		}},
	})
	if got[0].Status != "timed_out" {
		t.Fatalf("want timed_out, got %s reason=%s", got[0].Status, got[0].Reason)
	}
}

func TestEngineTaskBudgetOverride(t *testing.T) {
	e := &Engine{MaxConc: 1, DefaultTimeout: 500 * time.Millisecond}
	got := e.Run(context.Background(), []Task{
		{ID: "fast", Budget: 30 * time.Millisecond, Fn: func(ctx context.Context) Result {
			select {
			case <-ctx.Done():
				return Result{Status: "timed_out", Reason: ctx.Err().Error()}
			case <-time.After(200 * time.Millisecond):
				return Result{Text: "should not reach"}
			}
		}},
	})
	if got[0].Status != "timed_out" {
		t.Fatalf("want timed_out from per-task budget, got %s", got[0].Status)
	}
}

func TestEngineParentCtxCancellation(t *testing.T) {
	e := &Engine{MaxConc: 1, DefaultTimeout: 5 * time.Second}
	ctx, cancel := context.WithCancel(context.Background())
	got := make([]Result, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		r := e.Run(ctx, []Task{
			// Use tasks that block on ctx so the outcome is deterministic
			// regardless of goroutine scheduling order — previously this
			// test relied on time.Sleep which made it flaky when the
			// runtime scheduled task a to start before ctx was cancelled
			// OR after, producing 50/50 results.
			{ID: "a", Fn: func(ctx context.Context) Result {
				select {
				case <-time.After(100 * time.Millisecond):
					return Result{Text: "A"}
				case <-ctx.Done():
					return Result{Status: "timed_out", Reason: ctx.Err().Error()}
				}
			}},
			{ID: "b", Fn: func(ctx context.Context) Result {
				select {
				case <-time.After(100 * time.Millisecond):
					return Result{Text: "B"}
				case <-ctx.Done():
					return Result{Status: "timed_out", Reason: ctx.Err().Error()}
				}
			}},
		})
		mu.Lock()
		got = r
		mu.Unlock()
	}()
	// Cancel after 20ms — task a may have started or not; either way both
	// tasks are now under a cancelled context and must finish with
	// timed_out (the previous version expected a=success b=timed_out which
	// was racy because task a's sleep ignored ctx).
	time.Sleep(20 * time.Millisecond)
	cancel()
	wg.Wait()
	mu.Lock()
	defer mu.Unlock()
	if len(got) != 2 {
		t.Fatalf("len: %d", len(got))
	}
	for _, r := range got {
		if r.Status != "timed_out" {
			t.Fatalf("task %s: status=%q reason=%q; want timed_out for both", r.ID, r.Status, r.Reason)
		}
	}
}

func TestEngineOnMetric(t *testing.T) {
	var calls atomic.Int32
	e := &Engine{MaxConc: 1, DefaultTimeout: 1 * time.Second, OnMetric: func(d time.Duration, status string) {
		calls.Add(1)
	}}
	e.Run(context.Background(), []Task{
		{ID: "a", Fn: func(ctx context.Context) Result { return Result{Text: "x"} }},
		{ID: "b", Fn: func(ctx context.Context) Result { return Result{Status: "refused", HardNoRefusal: "policy"} }},
	})
	if calls.Load() != 2 {
		t.Fatalf("metric calls: %d", calls.Load())
	}
}

func TestEngineFnReturnsError(t *testing.T) {
	e := &Engine{MaxConc: 1, DefaultTimeout: 1 * time.Second}
	got := e.Run(context.Background(), []Task{
		{ID: "err", Fn: func(ctx context.Context) Result {
			return Result{Status: "failed", Reason: errors.New("boom").Error()}
		}},
	})
	if got[0].Status != "failed" || got[0].Reason != "boom" {
		t.Fatalf("got %+v", got[0])
	}
}

func TestSortedIDs(t *testing.T) {
	got := SortedIDs([]Result{{ID: "c"}, {ID: "a"}, {ID: "b"}})
	want := []string{"a", "b", "c"}
	for i, w := range want {
		if got[i] != w {
			t.Fatalf("idx %d: %s", i, got[i])
		}
	}
}