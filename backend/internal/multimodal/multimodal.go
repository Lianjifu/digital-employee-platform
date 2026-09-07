// Package multimodal implements provider-pluggable content extraction
// for W5-D2. Today the "extraction" pipeline covers OCR (image → text)
// and ASR (audio → transcript); both are routed through a Provider
// interface so the same handler signature works for any future
// capability (image captioning, video frame extraction, etc.).
//
// The MVP ships with a stub provider so the API surface is testable
// without external dependencies. Real providers (Tesseract, Whisper,
// vendor SDKs) plug in by implementing the Provider interface and
// being registered with the Registry on startup.
//
// Caching is content-addressed: SHA-256 of the input bytes + provider
// name + MIME kind. Repeat uploads of the same file skip extraction
// entirely, which is the common case for "re-upload with same image"
// during feedback loops.
package multimodal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Kind enumerates the supported extraction categories. Keep this list
// narrow; add new kinds deliberately.
type Kind string

const (
	KindOCR         Kind = "ocr"
	KindASR         Kind = "asr"
	KindImageCap    Kind = "image-caption"
)

// Segment is a timestamped chunk of an extraction. Used for ASR and
// OCR with positional metadata; other kinds can ignore.
type Segment struct {
	StartMS int64  `json:"startMs,omitempty"`
	EndMS   int64  `json:"endMs,omitempty"`
	Text    string `json:"text"`
}

// Extraction is the output of a Provider.Extract call.
type Extraction struct {
	Kind     Kind           `json:"kind"`
	Text     string         `json:"text"`
	Segments []Segment      `json:"segments,omitempty"`
	Meta     map[string]any `json:"meta,omitempty"`
	Provider string         `json:"provider"`
	Cached   bool           `json:"cached"`
	LatencyMS int64         `json:"latencyMS"`
}

// Provider is the contract every extraction backend implements.
type Provider interface {
	Name() string
	Kind() Kind
	Available() bool
	Extract(ctx context.Context, input []byte, mime string) (Extraction, error)
}

// Registry holds the active providers and the on-disk cache directory.
type Registry struct {
	mu        sync.RWMutex
	providers map[Kind]Provider
	cacheDir  string
	retention time.Duration
}

// New constructs an empty Registry. Add providers via Register, then
// call SetCacheDir before use.
func New() *Registry {
	return &Registry{
		providers: map[Kind]Provider{},
		retention: 7 * 24 * time.Hour,
	}
}

// SetCacheDir enables on-disk caching of extraction results.
func (r *Registry) SetCacheDir(dir string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cacheDir = dir
}

// SetRetention overrides the default 7-day TTL.
func (r *Registry) SetRetention(d time.Duration) {
	if d <= 0 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.retention = d
}

// Register attaches a Provider. Later registrations for the same Kind
// replace earlier ones.
func (r *Registry) Register(p Provider) {
	if p == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[p.Kind()] = p
}

// AvailableKinds returns the list of Kinds with at least one registered
// and Available() == true Provider.
func (r *Registry) AvailableKinds() []Kind {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Kind, 0, len(r.providers))
	for k, p := range r.providers {
		if p.Available() {
			out = append(out, k)
		}
	}
	sort.Slice(out, func(i, j int) bool { return string(out[i]) < string(out[j]) })
	return out
}

// Extract dispatches the input to the appropriate provider, consulting
// the cache first. Returns ErrNoProvider if no Provider is registered
// for the requested Kind.
func (r *Registry) Extract(ctx context.Context, kind Kind, input []byte, mime string) (Extraction, error) {
	r.mu.RLock()
	p, ok := r.providers[kind]
	cacheDir := r.cacheDir
	r.mu.RUnlock()
	if !ok {
		return Extraction{}, ErrNoProvider{Kind: kind}
	}
	if !p.Available() {
		return Extraction{}, ErrProviderUnavailable{Provider: p.Name(), Kind: kind}
	}
	if len(input) == 0 {
		return Extraction{}, errors.New("multimodal: empty input")
	}

	key := cacheKey(p.Name(), kind, mime, input)
	if cacheDir != "" {
		if ext, ok := loadCached(cacheDir, key); ok {
			ext.Cached = true
			return ext, nil
		}
	}

	start := time.Now()
	ext, err := p.Extract(ctx, input, mime)
	if err != nil {
		return ext, err
	}
	ext.Provider = p.Name()
	ext.Kind = kind
	ext.LatencyMS = time.Since(start).Milliseconds()

	if cacheDir != "" {
		_ = saveCached(cacheDir, key, ext)
	}
	if err := ctx.Err(); err != nil {
		return ext, err
	}
	return ext, nil
}

// ErrNoProvider signals the caller that no Provider is registered for
// the requested Kind. The HTTP layer maps this to 501 Not Implemented.
type ErrNoProvider struct{ Kind Kind }

func (e ErrNoProvider) Error() string { return fmt.Sprintf("multimodal: no provider for kind=%s", e.Kind) }

// ErrProviderUnavailable signals the Provider is registered but
// reports Available()==false (e.g. missing binary). Maps to 503.
type ErrProviderUnavailable struct {
	Provider string
	Kind     Kind
}

func (e ErrProviderUnavailable) Error() string {
	return fmt.Sprintf("multimodal: provider %s for kind=%s unavailable", e.Provider, e.Kind)
}

func cacheKey(provider string, kind Kind, mime string, input []byte) string {
	h := sha256.Sum256(input)
	raw := provider + "|" + string(kind) + "|" + mime + "|" + hex.EncodeToString(h[:])
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:16])
}

// cachedRecord is the on-disk form. We keep it small so retention sweeps
// stay cheap.
type cachedRecord struct {
	Kind      Kind           `json:"kind"`
	Text      string         `json:"text"`
	Segments  []Segment      `json:"segments,omitempty"`
	Meta      map[string]any `json:"meta,omitempty"`
	Provider  string         `json:"provider"`
	SavedAt   string         `json:"savedAt"`
}

func loadCached(dir, key string) (Extraction, bool) {
	data, err := os.ReadFile(filepath.Join(dir, key+".json"))
	if err != nil {
		return Extraction{}, false
	}
	var rec cachedRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return Extraction{}, false
	}
	return Extraction{
		Kind:     rec.Kind,
		Text:     rec.Text,
		Segments: rec.Segments,
		Meta:     rec.Meta,
		Provider: rec.Provider,
	}, true
}

var saveMu sync.Mutex

func saveCached(dir, key string, ext Extraction) error {
	saveMu.Lock()
	defer saveMu.Unlock()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	rec := cachedRecord{
		Kind:     ext.Kind,
		Text:     ext.Text,
		Segments: ext.Segments,
		Meta:     ext.Meta,
		Provider: ext.Provider,
		SavedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	buf, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, key+".json"), buf, 0o644)
}

// EvictOlderThan removes cached entries older than ttl. Used by the
// W5-D2 janitor goroutine.
func (r *Registry) EvictOlderThan() (int, error) {
	r.mu.RLock()
	dir := r.cacheDir
	ttl := r.retention
	r.mu.RUnlock()
	if dir == "" {
		return 0, nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, err
	}
	cutoff := time.Now().Add(-ttl)
	removed := 0
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(dir, e.Name()))
			removed++
		}
	}
	return removed, nil
}

// MimeForExt returns the conventional MIME type for a filename.
// Used by the HTTP handler when the multipart upload lacks a
// Content-Type header.
func MimeForExt(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".wav":
		return "audio/wav"
	case ".mp3":
		return "audio/mpeg"
	case ".m4a":
		return "audio/mp4"
	case ".ogg":
		return "audio/ogg"
	case ".flac":
		return "audio/flac"
	}
	return "application/octet-stream"
}