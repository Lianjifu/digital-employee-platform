package multimodal

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// stubProvider returns a deterministic extraction. Used to exercise the
// Registry without an external dependency.
type stubProvider struct {
	name       string
	kind       Kind
	available  bool
	extractFn  func(input []byte, mime string) (string, []Segment)
}

func (s *stubProvider) Name() string   { return s.name }
func (s *stubProvider) Kind() Kind     { return s.kind }
func (s *stubProvider) Available() bool { return s.available }
func (s *stubProvider) Extract(_ context.Context, input []byte, mime string) (Extraction, error) {
	if s.extractFn == nil {
		return Extraction{Text: string(input)}, nil
	}
	text, segs := s.extractFn(input, mime)
	return Extraction{Text: text, Segments: segs}, nil
}

func TestRegistryRegisterAndAvailable(t *testing.T) {
	r := New()
	r.Register(&stubProvider{name: "stub-ocr", kind: KindOCR, available: true})
	r.Register(&stubProvider{name: "stub-asr", kind: KindASR, available: false})
	r.Register(&stubProvider{name: "stub-asr-2", kind: KindASR, available: true})

	kinds := r.AvailableKinds()
	if len(kinds) != 2 {
		t.Fatalf("kinds: want 2, got %v", kinds)
	}
	if kinds[0] != KindASR || kinds[1] != KindOCR {
		t.Fatalf("sort order: %v", kinds)
	}
}

func TestExtractDispatchesToRightProvider(t *testing.T) {
	r := New()
	r.Register(&stubProvider{
		name: "ocr-stub", kind: KindOCR, available: true,
		extractFn: func(in []byte, _ string) (string, []Segment) {
			return "TEXT:" + string(in), nil
		},
	})
	ext, err := r.Extract(context.Background(), KindOCR, []byte("hello"), "text/plain")
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	if ext.Text != "TEXT:hello" {
		t.Fatalf("text: %q", ext.Text)
	}
	if ext.Provider != "ocr-stub" {
		t.Fatalf("provider: %q", ext.Provider)
	}
}

func TestExtractUnknownKind(t *testing.T) {
	r := New()
	_, err := r.Extract(context.Background(), KindASR, []byte("x"), "audio/wav")
	var noProv ErrNoProvider
	if !errors.As(err, &noProv) {
		t.Fatalf("expected ErrNoProvider, got %v", err)
	}
}

func TestExtractUnavailableProvider(t *testing.T) {
	r := New()
	r.Register(&stubProvider{name: "ocr-stub", kind: KindOCR, available: false})
	_, err := r.Extract(context.Background(), KindOCR, []byte("x"), "image/png")
	var unav ErrProviderUnavailable
	if !errors.As(err, &unav) {
		t.Fatalf("expected ErrProviderUnavailable, got %v", err)
	}
}

func TestExtractEmptyInput(t *testing.T) {
	r := New()
	r.Register(&stubProvider{name: "ocr-stub", kind: KindOCR, available: true})
	_, err := r.Extract(context.Background(), KindOCR, nil, "image/png")
	if err == nil {
		t.Fatal("expected error on empty input")
	}
}

func TestExtractCacheHit(t *testing.T) {
	dir := t.TempDir()
	r := New()
	r.SetCacheDir(dir)
	calls := 0
	r.Register(&stubProvider{
		name: "ocr-stub", kind: KindOCR, available: true,
		extractFn: func(in []byte, _ string) (string, []Segment) {
			calls++
			return "TEXT:" + string(in), nil
		},
	})
	first, err := r.Extract(context.Background(), KindOCR, []byte("hello"), "text/plain")
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	if first.Cached {
		t.Fatal("first should not be cached")
	}
	second, err := r.Extract(context.Background(), KindOCR, []byte("hello"), "text/plain")
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if !second.Cached {
		t.Fatal("second should be cached")
	}
	if calls != 1 {
		t.Fatalf("provider call count: want 1, got %d", calls)
	}
}

func TestExtractCacheKeyDistinguishesMime(t *testing.T) {
	dir := t.TempDir()
	r := New()
	r.SetCacheDir(dir)
	r.Register(&stubProvider{
		name: "ocr-stub", kind: KindOCR, available: true,
		extractFn: func(in []byte, mime string) (string, []Segment) {
			return mime + ":" + string(in), nil
		},
	})
	r.Extract(context.Background(), KindOCR, []byte("x"), "image/png")
	ext, err := r.Extract(context.Background(), KindOCR, []byte("x"), "image/jpeg")
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if ext.Cached {
		t.Fatalf("different MIME should miss cache, got cached=true")
	}
	if ext.Text != "image/jpeg:x" {
		t.Fatalf("text: %q", ext.Text)
	}
}

func TestEvictOlderThanRemoves(t *testing.T) {
	dir := t.TempDir()
	r := New()
	r.SetCacheDir(dir)
	r.SetRetention(1 * time.Hour)

	old := filepath.Join(dir, "oldkey.json")
	if err := os.WriteFile(old, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(old, past, past)

	removed, err := r.EvictOlderThan()
	if err != nil {
		t.Fatalf("evict: %v", err)
	}
	if removed != 1 {
		t.Fatalf("removed: want 1, got %d", removed)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("old file still present")
	}
}

func TestEvictEmptyDir(t *testing.T) {
	r := New() // cacheDir empty
	removed, err := r.EvictOlderThan()
	if err != nil {
		t.Fatalf("evict: %v", err)
	}
	if removed != 0 {
		t.Fatalf("removed: want 0, got %d", removed)
	}
}

func TestMimeForExt(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"photo.png", "image/png"},
		{"photo.JPG", "image/jpeg"},
		{"audio.mp3", "audio/mpeg"},
		{"audio.wav", "audio/wav"},
		{"video.webm", "application/octet-stream"},
		{"", "application/octet-stream"},
	}
	for _, c := range cases {
		if got := MimeForExt(c.name); got != c.want {
			t.Fatalf("%q: want %q got %q", c.name, c.want, got)
		}
	}
}

func TestCacheRecordRoundTrip(t *testing.T) {
	dir := t.TempDir()
	r := New()
	r.SetCacheDir(dir)
	r.Register(&stubProvider{
		name: "ocr-stub", kind: KindOCR, available: true,
		extractFn: func(in []byte, _ string) (string, []Segment) {
			return "T", []Segment{{StartMS: 0, EndMS: 1000, Text: "first"}, {Text: "second"}}
		},
	})
	if _, err := r.Extract(context.Background(), KindOCR, []byte("x"), "image/png"); err != nil {
		t.Fatalf("extract: %v", err)
	}
	// Verify the cached file exists & is valid JSON.
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected 1 cached file, got %d", len(entries))
	}
	data, _ := os.ReadFile(filepath.Join(dir, entries[0].Name()))
	var rec cachedRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		t.Fatalf("unmarshal cached: %v", err)
	}
	if rec.Text != "T" || len(rec.Segments) != 2 {
		t.Fatalf("cached content wrong: %+v", rec)
	}
}

func TestSetRetentionIgnoresZero(t *testing.T) {
	r := New()
	r.SetRetention(0)
	if r.retention != 7*24*time.Hour {
		t.Fatalf("retention changed: %v", r.retention)
	}
}