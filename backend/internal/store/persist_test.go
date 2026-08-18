package store

import (
	"context"
	"sync"
	"testing"
)

func TestPersistSnapshotAndHydrateMessages(t *testing.T) {
	st := New()
	st.Messages["conv-x"] = []map[string]any{{"id": "m1", "role": "user", "content": "hi"}}
	st.Conversations = append(st.Conversations, map[string]any{"id": "conv-x", "workspaceId": "w1"})

	var mu sync.Mutex
	got := map[string][]map[string]any{}
	st.SetPersistHook(func(_ context.Context, collection string, items []map[string]any) error {
		mu.Lock()
		defer mu.Unlock()
		cp := make([]map[string]any, len(items))
		copy(cp, items)
		got[collection] = cp
		return nil
	})

	if err := st.PersistNow(context.Background()); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	msgs := got["messages"]
	mu.Unlock()
	if len(msgs) == 0 {
		t.Fatal("expected messages snapshot")
	}

	st2 := New()
	st2.HydrateFrom("messages", msgs)
	if len(st2.Messages["conv-x"]) != 1 {
		t.Fatalf("hydrate messages: %#v", st2.Messages)
	}
}

func TestDurableCollectionsNonEmpty(t *testing.T) {
	if len(DurableCollections) < 10 {
		t.Fatalf("expected expanded durable set, got %d", len(DurableCollections))
	}
	if ShouldReplaceOnPersist("channel_inbound") {
		t.Fatal("inbound must upsert, not replace")
	}
}
