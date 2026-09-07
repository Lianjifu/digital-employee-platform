package store

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// PublisherKeyStatus is the lifecycle state of a workspace publisher key.
const (
	PublisherKeyStatusActive  = "active"
	PublisherKeyStatusRotated = "rotated"
	PublisherKeyStatusRevoked = "revoked"
)

// WorkspacePublisherKey is a (workspaceId, keyId) trust anchor for skill
// signatures. Multiple entries per workspace form the rotation history;
// at most one entry per workspace carries status="active".
//
// All persistence lives in Store.WorkspacePublisherKeys, keyed by
// workspaceId. PrivateKey is NEVER persisted — generate-mode endpoints
// return it exactly once in the HTTP response body and drop it from memory.
//
// Required fields:
//
//	id            — wpk-<8hex> unique per workspace
//	workspaceId   — workspace identifier
//	keyId         — "ed25519:" + SHA256(publicKey)[:8] hex (16 chars)
//	publicKey     — base64 of 32-byte Ed25519 public key
//	name          — human-readable label, e.g. "Acme W1 Publisher"
//	status        — active | rotated | revoked
//	createdAt     — time.Time (server-side stamp)
//	createdBy     — operator name from audit identity
//	previousKeyId — non-empty after a rotation; the grace-window check uses
//	                this when status="rotated" to allow freshly-signed
//	                imports to still verify.
type WorkspacePublisherKey = map[string]any

// NewWorkspacePublisherKey builds a fresh entry. The caller is responsible
// for inserting it into Store.WorkspacePublisherKeys under Store.Lock.
func NewWorkspacePublisherKey(workspaceID, keyID, publicKey, name, createdBy string) WorkspacePublisherKey {
	return WorkspacePublisherKey{
		"id":          newPublisherKeyID(),
		"workspaceId": workspaceID,
		"keyId":       keyID,
		"publicKey":   publicKey,
		"name":        name,
		"status":      PublisherKeyStatusActive,
		"createdAt":   time.Now().UTC(),
		"createdBy":   createdBy,
	}
}

// ActivePublisherKey returns the active publisher key for a workspace, or
// nil if none. Caller must hold Store.RLock or Store.Lock.
func (s *Store) ActivePublisherKey(workspaceID string) WorkspacePublisherKey {
	if s.WorkspacePublisherKeys == nil {
		return nil
	}
	for _, doc := range s.WorkspacePublisherKeys {
		if str(doc["workspaceId"]) != workspaceID {
			continue
		}
		if str(doc["status"]) == PublisherKeyStatusActive {
			return doc
		}
	}
	return nil
}

// LatestPublisherKey returns the active key OR the most-recent rotated key
// for a workspace. Used to compute previousKeyId on rotation. Returns nil
// if the workspace has no key history.
func (s *Store) LatestPublisherKey(workspaceID string) WorkspacePublisherKey {
	if s.WorkspacePublisherKeys == nil {
		return nil
	}
	var active, rotated WorkspacePublisherKey
	activeAt, rotatedAt := time.Time{}, time.Time{}
	for _, doc := range s.WorkspacePublisherKeys {
		if str(doc["workspaceId"]) != workspaceID {
			continue
		}
		status := str(doc["status"])
		createdAt, _ := doc["createdAt"].(time.Time)
		switch status {
		case PublisherKeyStatusActive:
			if active == nil || createdAt.After(activeAt) {
				active = doc
				activeAt = createdAt
			}
		case PublisherKeyStatusRotated:
			if rotated == nil || createdAt.After(rotatedAt) {
				rotated = doc
				rotatedAt = createdAt
			}
		}
	}
	if active != nil {
		return active
	}
	return rotated
}

// LookupPublisherKeyByKeyID returns the entry for a workspace with the
// given keyId, regardless of status. Returns nil if no match.
func (s *Store) LookupPublisherKeyByKeyID(workspaceID, keyID string) WorkspacePublisherKey {
	if s.WorkspacePublisherKeys == nil {
		return nil
	}
	for _, doc := range s.WorkspacePublisherKeys {
		if str(doc["workspaceId"]) == workspaceID && str(doc["keyId"]) == keyID {
			return doc
		}
	}
	return nil
}

// MarkPublisherKeyRotated flips an active entry's status to "rotated" and
// records the keyId that replaced it as previousKeyId. Caller holds
// Store.Lock.
func (s *Store) MarkPublisherKeyRotated(workspaceID, oldKeyID, previousKeyID string) bool {
	for _, doc := range s.WorkspacePublisherKeys {
		if str(doc["workspaceId"]) == workspaceID &&
			str(doc["keyId"]) == oldKeyID &&
			str(doc["status"]) == PublisherKeyStatusActive {
			doc["status"] = PublisherKeyStatusRotated
			doc["previousKeyId"] = previousKeyID
			return true
		}
	}
	return false
}

// MarkPublisherKeyRevoked flips an entry's status to "revoked". Idempotent.
func (s *Store) MarkPublisherKeyRevoked(workspaceID, keyID string) bool {
	for _, doc := range s.WorkspacePublisherKeys {
		if str(doc["workspaceId"]) == workspaceID && str(doc["keyId"]) == keyID {
			doc["status"] = PublisherKeyStatusRevoked
			return true
		}
	}
	return false
}

func newPublisherKeyID() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "wpk-fallback"
	}
	return "wpk-" + hex.EncodeToString(b[:])
}
