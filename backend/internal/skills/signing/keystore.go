package signing

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// TrustedKey is one entry in the trust store. A skill package's signature
// verifies only if its declared KeyID matches a TrustedKey here.
type TrustedKey struct {
	KeyID     string    `json:"keyId"`     // "ed25519:abcdef0123456789"
	PublicKey string    `json:"publicKey"` // base64 of 32-byte Ed25519 public key
	Name      string    `json:"name"`      // human-readable, e.g. "DEP Platform Team"
	AddedAt   time.Time `json:"addedAt"`
	AddedBy   string    `json:"addedBy,omitempty"`
}

// TrustFile is the on-disk format for a list of trusted keys. Default path
// `data/skill-keys/trusted-publishers.json`.
type TrustFile struct {
	Keys []TrustedKey `json:"keys"`
}

// TrustStore is the in-memory cache used by the server at attach/import time.
// All methods are safe for concurrent use.
type TrustStore struct {
	mu sync.RWMutex
	m  map[string]TrustedKey // by KeyID
}

// NewTrustStore builds a TrustStore from a TrustFile. Returns nil if the
// input is empty.
func NewTrustStore(tf TrustFile) *TrustStore {
	if len(tf.Keys) == 0 {
		return &TrustStore{m: map[string]TrustedKey{}}
	}
	ts := &TrustStore{m: make(map[string]TrustedKey, len(tf.Keys))}
	for _, k := range tf.Keys {
		ts.m[k.KeyID] = k
	}
	return ts
}

// Add registers a TrustedKey. Later Adds with the same KeyID overwrite.
func (ts *TrustStore) Add(k TrustedKey) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if ts.m == nil {
		ts.m = map[string]TrustedKey{}
	}
	ts.m[k.KeyID] = k
}

// Lookup returns the TrustedKey for a KeyID and whether it exists.
func (ts *TrustStore) Lookup(keyID string) (TrustedKey, bool) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	k, ok := ts.m[keyID]
	return k, ok
}

// LookupPublic returns the decoded public key for a KeyID, or an error if
// the key isn't trusted or its base64 form is malformed.
func (ts *TrustStore) LookupPublic(keyID string) (ed25519.PublicKey, error) {
	k, ok := ts.Lookup(keyID)
	if !ok {
		return nil, fmt.Errorf("signing: unknown keyID %q", keyID)
	}
	raw, err := base64.StdEncoding.DecodeString(k.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("signing: decode public key for %s: %w", keyID, err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("signing: invalid public key size for %s", keyID)
	}
	return ed25519.PublicKey(raw), nil
}

// Remove drops a key from the store. Returns whether the key was present.
func (ts *TrustStore) Remove(keyID string) bool {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if _, ok := ts.m[keyID]; ok {
		delete(ts.m, keyID)
		return true
	}
	return false
}

// Snapshot returns the current key list (sorted by KeyID) — used by the
// admin endpoint / sign CLI to enumerate publishers.
func (ts *TrustStore) Snapshot() []TrustedKey {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	out := make([]TrustedKey, 0, len(ts.m))
	for _, k := range ts.m {
		out = append(out, k)
	}
	// sort for determinism
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1].KeyID > out[j].KeyID; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

// LoadTrustFile reads a TrustFile from disk. Missing file → empty (not an
// error). Malformed JSON → error. Callers should treat empty as "no trusted
// publishers yet" and let DevKeyStore populate if applicable.
func LoadTrustFile(path string) (TrustFile, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return TrustFile{}, nil
		}
		return TrustFile{}, err
	}
	var tf TrustFile
	if err := json.Unmarshal(body, &tf); err != nil {
		return TrustFile{}, fmt.Errorf("signing: parse trust file %s: %w", path, err)
	}
	return tf, nil
}

// WriteTrustFile persists the trust file atomically (write tmp → rename).
// Used by the admin key-registration endpoint and by DevKeyStore when it
// auto-provisions a developer keypair.
func WriteTrustFile(path string, tf TrustFile) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(tf, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// DevKeyFile is the on-disk format for a single dev keypair. Default path
// `data/skill-keys/dev-keypair.json`.
type DevKeyFile struct {
	KeyID      string    `json:"keyId"`
	PrivateKey string    `json:"privateKey"` // base64 of 64-byte Ed25519 private seed
	PublicKey  string    `json:"publicKey"`  // base64 of 32-byte public key
	Name       string    `json:"name"`
	CreatedAt  time.Time `json:"createdAt"`
}

// DevKeyStore handles the dev-only auto-provisioned keypair. In dev/demo
// mode the server boots, looks for dev-keypair.json, and either loads the
// existing one or generates a fresh one. The public half is added to the
// TrustStore so signatures from this key verify without explicit setup.
type DevKeyStore struct {
	path     string
	mu       sync.Mutex
	signer   *Ed25519Signer
	file     DevKeyFile
}

// NewDevKeyStore loads (or generates) the dev keypair at path. The signer is
// ready to use immediately on return. Returns an error if generation fails
// or the existing file is unreadable.
func NewDevKeyStore(path string) (*DevKeyStore, error) {
	d := &DevKeyStore{path: path}
	if err := d.loadOrGenerate(); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *DevKeyStore) loadOrGenerate() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	body, err := os.ReadFile(d.path)
	if err == nil {
		// Existing keypair — load and verify.
		var kf DevKeyFile
		if err := json.Unmarshal(body, &kf); err != nil {
			return fmt.Errorf("dev keystore: parse %s: %w", d.path, err)
		}
		privRaw, err := base64.StdEncoding.DecodeString(kf.PrivateKey)
		if err != nil {
			return fmt.Errorf("dev keystore: decode private: %w", err)
		}
		if len(privRaw) != ed25519.PrivateKeySize {
			return errors.New("dev keystore: invalid private key length")
		}
		priv := ed25519.PrivateKey(privRaw)
		d.signer = NewEd25519Signer(priv, kf.Name)
		if kf.KeyID == "" {
			kf.KeyID = d.signer.KeyID()
		}
		d.file = kf
		return nil
	}
	if !os.IsNotExist(err) {
		return err
	}
	// Auto-provision.
	priv, err := GenerateEd25519Key()
	if err != nil {
		return err
	}
	pub := priv.Public().(ed25519.PublicKey)
	kf := DevKeyFile{
		PrivateKey: base64.StdEncoding.EncodeToString(priv),
		PublicKey:  base64.StdEncoding.EncodeToString(pub),
		Name:       "DEP Dev Keypair (auto-provisioned)",
		CreatedAt:  time.Now().UTC(),
	}
	d.signer = NewEd25519Signer(priv, kf.Name)
	kf.KeyID = d.signer.KeyID()
	d.file = kf

	if err := os.MkdirAll(filepath.Dir(d.path), 0o700); err != nil {
		return err
	}
	body, err = json.MarshalIndent(kf, "", "  ")
	if err != nil {
		return err
	}
	tmp := d.path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, d.path); err != nil {
		return err
	}
	return nil
}

// Signer returns the loaded Ed25519Signer. Safe for concurrent use.
func (d *DevKeyStore) Signer() *Ed25519Signer {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.signer
}

// TrustedKey returns a TrustedKey record suitable for adding to a TrustStore.
// The AddedAt / AddedBy fields are filled by the caller.
func (d *DevKeyStore) TrustedKey() TrustedKey {
	d.mu.Lock()
	defer d.mu.Unlock()
	return TrustedKey{
		KeyID:     d.file.KeyID,
		PublicKey: d.file.PublicKey,
		Name:      d.file.Name,
	}
}

// File returns the on-disk record (for debugging / observability).
func (d *DevKeyStore) File() DevKeyFile {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.file
}

// KeyIDHex returns the bare 8-byte hex of the public key fingerprint (the
// suffix after "ed25519:"). Useful for log lines.
func (d *DevKeyStore) KeyIDHex() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	id := d.file.KeyID
	if len(id) > 8 && id[:8] == "ed25519:" {
		return id[8:]
	}
	return id
}

// EncodePublicHex is a small helper for logs / CLI output. It renders the
// 32-byte public key as a 64-char hex string.
func EncodePublicHex(pub ed25519.PublicKey) string {
	return hex.EncodeToString(pub)
}