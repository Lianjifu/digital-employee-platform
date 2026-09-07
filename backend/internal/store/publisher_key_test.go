package store

import (
	"testing"
	"time"
)

// TestPublisherKeySnapshotHydrate verifies that workspace publisher keys
// survive a snapshotLocked → HydrateFrom round-trip — the durability seam
// used by PersistNow / kv_documents.
func TestPublisherKeySnapshotHydrate(t *testing.T) {
	src := New()
	w1 := NewWorkspacePublisherKey("w1", "ed25519:abc123", "PUBKEY_B64", "Acme W1", "admin@acme.com")
	src.WorkspacePublisherKeys[str(w1["id"])] = w1
	w2 := NewWorkspacePublisherKey("w2", "ed25519:def456", "PUBKEY_B64_2", "Acme W2", "admin@acme.com")
	w2["status"] = PublisherKeyStatusRotated
	w2["previousKeyId"] = "ed25519:old999"
	src.WorkspacePublisherKeys[str(w2["id"])] = w2

	snap := src.snapshotLocked("workspace_publisher_keys")
	if len(snap) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(snap))
	}

	dst := New()
	dst.HydrateFrom("workspace_publisher_keys", snap)
	if len(dst.WorkspacePublisherKeys) != 2 {
		t.Fatalf("expected 2 entries after hydrate, got %d", len(dst.WorkspacePublisherKeys))
	}
	var w1Doc, w2Doc map[string]any
	for _, d := range dst.WorkspacePublisherKeys {
		switch str(d["workspaceId"]) {
		case "w1":
			w1Doc = d
		case "w2":
			w2Doc = d
		}
	}
	if w1Doc == nil {
		t.Fatal("w1 entry missing")
	} else {
		if str(w1Doc["keyId"]) != "ed25519:abc123" {
			t.Fatalf("w1 keyId=%v", w1Doc["keyId"])
		}
		if str(w1Doc["status"]) != PublisherKeyStatusActive {
			t.Fatalf("w1 status=%v", w1Doc["status"])
		}
	}
	if w2Doc == nil {
		t.Fatal("w2 entry missing")
	} else if str(w2Doc["previousKeyId"]) != "ed25519:old999" {
		t.Fatalf("w2 previousKeyId=%v", w2Doc["previousKeyId"])
	}
}

// TestActivePublisherKey verifies the lookup helper returns the right entry
// across multiple workspaces and ignores rotated/revoked entries.
func TestActivePublisherKey(t *testing.T) {
	s := New()
	w1Active := NewWorkspacePublisherKey("w1", "ed25519:active1", "PUB1", "W1 active", "admin")
	s.WorkspacePublisherKeys[str(w1Active["id"])] = w1Active
	w2Old := NewWorkspacePublisherKey("w2", "ed25519:rotated1", "PUB_OLD", "W2 old", "admin")
	w2Old["status"] = PublisherKeyStatusRotated
	s.WorkspacePublisherKeys[str(w2Old["id"])] = w2Old
	w2New := NewWorkspacePublisherKey("w2", "ed25519:active2", "PUB2", "W2 active", "admin")
	s.WorkspacePublisherKeys[str(w2New["id"])] = w2New

	got := s.ActivePublisherKey("w1")
	if got == nil || str(got["keyId"]) != "ed25519:active1" {
		t.Fatalf("w1 active=%v", got)
	}
	got = s.ActivePublisherKey("w2")
	if got == nil || str(got["keyId"]) != "ed25519:active2" {
		t.Fatalf("w2 active=%v", got)
	}
	got = s.ActivePublisherKey("w3")
	if got != nil {
		t.Fatalf("w3 should be nil, got %v", got)
	}
}

// TestMarkPublisherKeyRotated verifies the rotation flow: the old active
// key flips to "rotated" with previousKeyId set to the new keyId.
func TestMarkPublisherKeyRotated(t *testing.T) {
	s := New()
	oldKey := NewWorkspacePublisherKey("w1", "ed25519:old", "PUB_OLD", "Old", "admin")
	s.WorkspacePublisherKeys[str(oldKey["id"])] = oldKey
	newKey := NewWorkspacePublisherKey("w1", "ed25519:new", "PUB_NEW", "New", "admin")
	s.WorkspacePublisherKeys[str(newKey["id"])] = newKey

	if !s.MarkPublisherKeyRotated("w1", "ed25519:old", "ed25519:new") {
		t.Fatal("expected MarkPublisherKeyRotated to return true")
	}
	if str(oldKey["status"]) != PublisherKeyStatusRotated {
		t.Fatalf("old key status=%v", oldKey["status"])
	}
	if str(oldKey["previousKeyId"]) != "ed25519:new" {
		t.Fatalf("previousKeyId=%v", oldKey["previousKeyId"])
	}
	// Idempotent: calling again returns false (status no longer active).
	if s.MarkPublisherKeyRotated("w1", "ed25519:old", "ed25519:new") {
		t.Fatal("second rotate should be a no-op")
	}
}

// TestMarkPublisherKeyRevoked verifies revoke flips status and is idempotent.
func TestMarkPublisherKeyRevoked(t *testing.T) {
	s := New()
	k := NewWorkspacePublisherKey("w1", "ed25519:k1", "PUB", "P", "admin")
	s.WorkspacePublisherKeys[str(k["id"])] = k
	if !s.MarkPublisherKeyRevoked("w1", "ed25519:k1") {
		t.Fatal("revoke should return true on first call")
	}
	if str(k["status"]) != PublisherKeyStatusRevoked {
		t.Fatalf("status=%v", k["status"])
	}
	// Idempotent.
	if !s.MarkPublisherKeyRevoked("w1", "ed25519:k1") {
		t.Fatal("second revoke should still return true")
	}
}

// TestLookupPublisherKeyByKeyID verifies the per-key lookup used by the
// grace-window verifier (when status="rotated", import signed by old key).
func TestLookupPublisherKeyByKeyID(t *testing.T) {
	s := New()
	k := NewWorkspacePublisherKey("w1", "ed25519:abc", "PUB", "P", "admin")
	s.WorkspacePublisherKeys[str(k["id"])] = k
	got := s.LookupPublisherKeyByKeyID("w1", "ed25519:abc")
	if got == nil {
		t.Fatal("lookup returned nil")
	}
	if s.LookupPublisherKeyByKeyID("w1", "ed25519:missing") != nil {
		t.Fatal("missing key should return nil")
	}
	if s.LookupPublisherKeyByKeyID("w2", "ed25519:abc") != nil {
		t.Fatal("cross-workspace lookup should return nil")
	}
}

// TestNewWorkspacePublisherKeySetsCreatedAt verifies the time stamp is
// populated close to now (within 1s slack for slow CI).
func TestNewWorkspacePublisherKeySetsCreatedAt(t *testing.T) {
	before := time.Now().UTC()
	doc := NewWorkspacePublisherKey("w1", "ed25519:abc", "PUB", "P", "admin")
	after := time.Now().UTC()
	createdAt, ok := doc["createdAt"].(time.Time)
	if !ok {
		t.Fatalf("createdAt type=%T", doc["createdAt"])
	}
	if createdAt.Before(before) || createdAt.After(after.Add(time.Second)) {
		t.Fatalf("createdAt %v outside [%v,%v]", createdAt, before, after)
	}
}
