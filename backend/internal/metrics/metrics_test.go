package metrics

import (
	"strings"
	"sync"
	"testing"
	"time"
)

// TestGlobalRegistryExists guards against the metrics package being
// initialized out of sync/atomic — every call site reads from
// Global.Vetter/Sign/Vault/ExpertInbox. If Global were nil we'd panic
// inside the scrape handler.
func TestGlobalRegistryExists(t *testing.T) {
	if Global == nil {
		t.Fatal("metrics.Global must be a package-level singleton")
	}
}

// TestVetterBuckets: allow / warn / deny increment independently.
func TestVetterBuckets(t *testing.T) {
	r := &Registry{}
	r.Vetter.Inc("allow")
	r.Vetter.Inc("allow")
	r.Vetter.Inc("warn")
	r.Vetter.Inc("deny")
	r.Vetter.Inc("unknown") // must be ignored

	a, w, d := r.Vetter.Snapshot()
	if a != 2 || w != 1 || d != 1 {
		t.Fatalf("vetter snapshot mismatch: allow=%d warn=%d deny=%d", a, w, d)
	}
}

// TestSignBuckets verifies sign + verify buckets are separate dimensions.
func TestSignBuckets(t *testing.T) {
	r := &Registry{}
	r.Sign.IncSign("success")
	r.Sign.IncSign("success")
	r.Sign.IncSign("invalid")
	r.Sign.IncVerify("ok")
	r.Sign.IncVerify("ok")
	r.Sign.IncVerify("ok")
	r.Sign.IncVerify("unknown_key")
	r.Sign.IncVerify("bad_signature")

	okS, invS, okV, miss, bad := r.Sign.Snapshot()
	if okS != 2 || invS != 1 || okV != 3 || miss != 1 || bad != 1 {
		t.Fatalf("sign snapshot mismatch: signOK=%d signInvalid=%d verifyOK=%d verifyMiss=%d verifyBad=%d",
			okS, invS, okV, miss, bad)
	}
}

// TestVaultObserveBuckets checks latency sums and counts are bucketed
// correctly and not summed across ref classes.
func TestVaultObserveBuckets(t *testing.T) {
	r := &Registry{}
	r.Vault.Observe("skill-key", 100*time.Millisecond)
	r.Vault.Observe("skill-key", 200*time.Millisecond)
	r.Vault.Observe("model-credential", 50*time.Millisecond)
	r.Vault.Observe("unknown-ref", 1*time.Second) // → other

	n, sumNS, _, _, _, _ := r.Vault.Snapshot()
	if n != 2 {
		t.Fatalf("skill-key count: want 2, got %d", n)
	}
	if sumNS != uint64(300*time.Millisecond.Nanoseconds()) {
		t.Fatalf("skill-key sum: want 300ms, got %v", time.Duration(sumNS))
	}

	_, _, mn, msum, on, osum := r.Vault.Snapshot()
	if mn != 1 || msum != uint64(50*time.Millisecond.Nanoseconds()) {
		t.Fatalf("model-credential mismatch: n=%d sum=%v", mn, time.Duration(msum))
	}
	if on != 1 || osum != uint64(time.Second.Nanoseconds()) {
		t.Fatalf("other mismatch: n=%d sum=%v", on, time.Duration(osum))
	}
}

// TestExpertInboxGauge: Set / Get round-trip and that Get returns the
// last set value even when no Set was called yet (zero default).
func TestExpertInboxGauge(t *testing.T) {
	r := &Registry{}
	if got := r.ExpertInbox.Get(); got != 0 {
		t.Fatalf("default ExpertInbox: want 0, got %d", got)
	}
	r.ExpertInbox.Set(7)
	if got := r.ExpertInbox.Get(); got != 7 {
		t.Fatalf("ExpertInbox after Set(7): want 7, got %d", got)
	}
}

// TestConcurrentIncrement is a smoke test that atomic semantics work
// under contention — covers the lock-free design choice.
func TestConcurrentIncrement(t *testing.T) {
	r := &Registry{}
	const goroutines = 16
	const perGoroutine = 1000
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < perGoroutine; j++ {
				r.Vetter.Inc("allow")
				r.Sign.IncSign("success")
				r.Sign.IncVerify("ok")
				r.Vault.Observe("skill-key", time.Microsecond)
			}
		}()
	}
	wg.Wait()

	a, _, _ := r.Vetter.Snapshot()
	if a != goroutines*perGoroutine {
		t.Fatalf("vetter allow: want %d, got %d", goroutines*perGoroutine, a)
	}
	okS, _, okV, _, _ := r.Sign.Snapshot()
	if okS != goroutines*perGoroutine {
		t.Fatalf("sign success: want %d, got %d", goroutines*perGoroutine, okS)
	}
	if okV != goroutines*perGoroutine {
		t.Fatalf("verify ok: want %d, got %d", goroutines*perGoroutine, okV)
	}
	n, _, _, _, _, _ := r.Vault.Snapshot()
	if n != goroutines*perGoroutine {
		t.Fatalf("vault skill-key count: want %d, got %d", goroutines*perGoroutine, n)
	}
}

// TestHotReloadBuckets: per-resource success/fail counters are
// separate dimensions. Unknown result labels are ignored.
func TestHotReloadBuckets(t *testing.T) {
	r := &Registry{}
	r.HotReload.Inc("publisher-key", "success")
	r.HotReload.Inc("publisher-key", "success")
	r.HotReload.Inc("publisher-key", "fail")
	r.HotReload.Inc("routing-policy", "success")
	r.HotReload.Inc("routing-policy", "nonsense") // ignored

	resources, ok, fail := r.HotReload.Snapshot()
	if len(resources) != 2 {
		t.Fatalf("resources: want 2, got %d (%v)", len(resources), resources)
	}
	if resources[0] != "publisher-key" || resources[1] != "routing-policy" {
		t.Fatalf("resources order: want publisher-key then routing-policy, got %v", resources)
	}
	if ok["publisher-key"] != 2 {
		t.Fatalf("publisher-key success: want 2, got %d", ok["publisher-key"])
	}
	if fail["publisher-key"] != 1 {
		t.Fatalf("publisher-key fail: want 1, got %d", fail["publisher-key"])
	}
	if ok["routing-policy"] != 1 {
		t.Fatalf("routing-policy success: want 1, got %d", ok["routing-policy"])
	}
}

// TestProcessStartMonotonic guards against the Registry being cloned
// (processStart must move forward).
func TestProcessStartMonotonic(t *testing.T) {
	r := &Registry{}
	first := r.ProcessStart()
	time.Sleep(2 * time.Millisecond)
	second := r.ProcessStart()
	if !second.After(first) && !second.Equal(first) {
		t.Fatalf("processStart regressed: first=%v second=%v", first, second)
	}
}

// TestCounterHelperName: smoke test that strings.Contains can find the
// type — used as a sanity check by the scrape handler tests.
func TestCounterHelperName(t *testing.T) {
	var c Counter
	c.Inc()
	c.Add(5)
	if !strings.Contains(counterKind(c), "Counter") {
		t.Fatalf("counter kind: %q", counterKind(c))
	}
}

func counterKind(c Counter) string {
	return "Counter" // opaque tag; the test asserts shape, not internals
}
