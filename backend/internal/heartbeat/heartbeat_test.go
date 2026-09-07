package heartbeat

import (
	"context"
	"sync"
	"testing"
	"time"
)

func cfgFast() Config {
	return Config{
		Interval:      20 * time.Millisecond,
		SweepEvery:    20 * time.Millisecond,
		StaleAfter:    60 * time.Millisecond,
		ChannelBuffer: 4,
	}
}

func TestTouchCreatesAndOnlineReturns(t *testing.T) {
	tr := New(cfgFast(), nil)
	if !tr.Touch("w1", "u1", "web") {
		t.Fatal("first Touch should return created=true")
	}
	tr.Touch("w1", "u2", "web")
	tr.Touch("w2", "u3", "web") // different workspace

	if got := tr.OnlineCount("w1"); got != 2 {
		t.Fatalf("w1 online: want 2, got %d", got)
	}
	if got := tr.OnlineCount("w2"); got != 1 {
		t.Fatalf("w2 online: want 1, got %d", got)
	}
	if got := tr.OnlineCount("w3"); got != 0 {
		t.Fatalf("w3 online: want 0, got %d", got)
	}
}

func TestOnlineSortedByLastSeen(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	time.Sleep(5 * time.Millisecond)
	tr.Touch("w1", "u2", "web")

	got := tr.Online("w1")
	if len(got) != 2 {
		t.Fatalf("want 2 entries, got %d", len(got))
	}
	if got[0].IdentityID != "u2" {
		t.Fatalf("most recent should be first: %+v", got)
	}
	if got[1].IdentityID != "u1" {
		t.Fatalf("second should be u1: %+v", got)
	}
}

func TestSweepEvictsStale(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	time.Sleep(120 * time.Millisecond) // past StaleAfter (60ms)
	ev := tr.Sweep()
	if ev != 1 {
		t.Fatalf("sweep evicted: want 1, got %d", ev)
	}
	if got := tr.OnlineCount("w1"); got != 0 {
		t.Fatalf("after sweep online: want 0, got %d", got)
	}
}

func TestSweepKeepsRecent(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	tr.Touch("w1", "u2", "web")
	if ev := tr.Sweep(); ev != 0 {
		t.Fatalf("recent entries should not be swept: %d", ev)
	}
	if got := tr.OnlineCount("w1"); got != 2 {
		t.Fatalf("want 2, got %d", got)
	}
}

func TestTouchUpdatesLastSeen(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	first := tr.Online("w1")[0].LastSeen
	time.Sleep(10 * time.Millisecond)
	tr.Touch("w1", "u1", "web") // second touch
	second := tr.Online("w1")[0].LastSeen
	if !second.After(first) {
		t.Fatalf("LastSeen should advance: first=%v second=%v", first, second)
	}
}

func TestSubscribeReceivesJoin(t *testing.T) {
	tr := New(cfgFast(), nil)
	ch, cancel := tr.Subscribe("w1")
	defer cancel()
	// drain synthetic tick
	<-ch
	tr.Touch("w1", "u1", "web")
	select {
	case ev := <-ch:
		if ev.Type != "join" || ev.Identity != "u1" || ev.Workspace != "w1" {
			t.Fatalf("unexpected event: %+v", ev)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("did not receive join event within 200ms")
	}
}

func TestSubscribeReceivesLeave(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	ch, cancel := tr.Subscribe("w1")
	defer cancel()
	// drain synthetic tick
	<-ch
	ev := tr.Sweep() // u1 is fresh, but force-emit by setting lastSeen to old
	if ev != 0 {
		t.Fatalf("fresh entry shouldn't be swept: %d", ev)
	}
	// Manually age u1 so the next sweep evicts it.
	tr.mu.Lock()
	tr.byID[key("w1", "u1")].LastSeen = time.Now().Add(-1 * time.Hour)
	tr.mu.Unlock()
	tr.Sweep()
	select {
	case ev := <-ch:
		if ev.Type != "leave" || ev.Identity != "u1" {
			t.Fatalf("unexpected event: %+v", ev)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("did not receive leave event within 200ms")
	}
}

func TestSubscribeDropsSlowConsumer(t *testing.T) {
	tr := New(Config{
		Interval:      10 * time.Millisecond,
		SweepEvery:    10 * time.Millisecond,
		StaleAfter:    50 * time.Millisecond,
		ChannelBuffer: 1,
	}, nil)
	ch, cancel := tr.Subscribe("w1")
	defer cancel()
	// Drain the initial tick.
	<-ch
	// Fire 50 touches. A buffer of 1 must NOT block the writer even
	// when the consumer is asleep.
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 50; i++ {
			tr.Touch("w1", "u-fast", "web")
		}
	}()
	wg.Wait()
}

func TestLagSinceLastTouch(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	lag := tr.LagSinceLastTouch()
	if lag > 50*time.Millisecond {
		t.Fatalf("fresh touch should have small lag, got %v", lag)
	}
}

func TestLagZeroWhenEmpty(t *testing.T) {
	tr := New(cfgFast(), nil)
	if got := tr.LagSinceLastTouch(); got != 0 {
		t.Fatalf("empty tracker should have 0 lag, got %v", got)
	}
}

func TestSnapshot(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	tr.Touch("w1", "u2", "web")
	tr.Touch("w2", "u3", "web")
	snap := tr.Snapshot()
	if snap["w1"] != 2 {
		t.Fatalf("w1 snap: want 2, got %d", snap["w1"])
	}
	if snap["w2"] != 1 {
		t.Fatalf("w2 snap: want 1, got %d", snap["w2"])
	}
}

func TestNameFn(t *testing.T) {
	tr := New(cfgFast(), func(id string) string {
		if id == "u1" {
			return "Alice"
		}
		return ""
	})
	tr.Touch("w1", "u1", "web")
	if got := tr.Online("w1")[0].DisplayName; got != "Alice" {
		t.Fatalf("name: want Alice, got %q", got)
	}
}

func TestRunStopsOnContextCancel(t *testing.T) {
	tr := New(cfgFast(), nil)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		tr.Run(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Run did not exit on context cancel")
	}
}

func TestEmptyIdentityIsNoOp(t *testing.T) {
	tr := New(cfgFast(), nil)
	if tr.Touch("w1", "", "web") {
		t.Fatal("empty identity should not be created")
	}
	if got := tr.OnlineCount("w1"); got != 0 {
		t.Fatalf("want 0, got %d", got)
	}
}

func TestDefaultConfigWhenZero(t *testing.T) {
	tr := New(Config{}, nil)
	if tr.cfg.Interval != 30*time.Second {
		t.Fatalf("default interval: %v", tr.cfg.Interval)
	}
	if tr.cfg.StaleAfter != 90*time.Second {
		t.Fatalf("default stale: %v", tr.cfg.StaleAfter)
	}
}

func TestTouchAfterSweepRecreates(t *testing.T) {
	tr := New(cfgFast(), nil)
	tr.Touch("w1", "u1", "web")
	tr.mu.Lock()
	tr.byID[key("w1", "u1")].LastSeen = time.Now().Add(-1 * time.Hour)
	tr.mu.Unlock()
	tr.Sweep()
	if !tr.Touch("w1", "u1", "web") {
		t.Fatal("after sweep, Touch should be created=true")
	}
}