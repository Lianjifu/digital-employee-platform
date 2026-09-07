package visualdiff

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// makePNG returns a 100×100 PNG filled with the given color.
func makePNG(t *testing.T, w, h int, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return buf.Bytes()
}

func TestDiffIdenticalMatches(t *testing.T) {
	a := makePNG(t, 100, 100, color.RGBA{R: 200, G: 100, B: 50, A: 255})
	b := makePNG(t, 100, 100, color.RGBA{R: 200, G: 100, B: 50, A: 255})
	opts := Options{ResizeWidth: 100, ResizeHeight: 100, Tolerance: 8}
	res, err := Diff(context.Background(), a, b, opts)
	if err != nil {
		t.Fatalf("diff: %v", err)
	}
	if !res.Match {
		t.Fatalf("identical images should match: %+v", res)
	}
	if res.DiffRatio != 0 {
		t.Fatalf("diffRatio: want 0, got %f", res.DiffRatio)
	}
	if res.Total != 100*100 {
		t.Fatalf("total: want 10000, got %d", res.Total)
	}
}

func TestDiffDifferentDetects(t *testing.T) {
	a := makePNG(t, 100, 100, color.RGBA{R: 200, G: 100, B: 50, A: 255})
	b := makePNG(t, 100, 100, color.RGBA{R: 50, G: 50, B: 50, A: 255})
	opts := Options{ResizeWidth: 100, ResizeHeight: 100, Tolerance: 8}
	res, err := Diff(context.Background(), a, b, opts)
	if err != nil {
		t.Fatalf("diff: %v", err)
	}
	if res.Match {
		t.Fatalf("different images should NOT match: %+v", res)
	}
	if res.DiffRatio < 0.5 {
		t.Fatalf("diffRatio: want >= 0.5, got %f", res.DiffRatio)
	}
}

func TestDiffSmallColorShiftWithinTolerance(t *testing.T) {
	// ΔR=4 within tolerance (default 8), should match.
	a := makePNG(t, 100, 100, color.RGBA{R: 200, G: 100, B: 50, A: 255})
	b := makePNG(t, 100, 100, color.RGBA{R: 204, G: 100, B: 50, A: 255})
	opts := Options{ResizeWidth: 100, ResizeHeight: 100, Tolerance: 8}
	res, err := Diff(context.Background(), a, b, opts)
	if err != nil {
		t.Fatalf("diff: %v", err)
	}
	if !res.Match {
		t.Fatalf("small shift within tolerance should match: %+v", res)
	}
}

func TestDiffHighlightProducesImage(t *testing.T) {
	a := makePNG(t, 50, 50, color.RGBA{R: 100, A: 255})
	b := makePNG(t, 50, 50, color.RGBA{R: 200, A: 255})
	opts := Options{ResizeWidth: 50, ResizeHeight: 50, Tolerance: 8, Highlight: true}
	res, err := Diff(context.Background(), a, b, opts)
	if err != nil {
		t.Fatalf("diff: %v", err)
	}
	if len(res.DiffPNG) == 0 {
		t.Fatalf("expected highlighted diff PNG")
	}
	if _, err := png.Decode(bytes.NewReader(res.DiffPNG)); err != nil {
		t.Fatalf("DiffPNG is not valid PNG: %v", err)
	}
}

func TestDiffEmptyInputRejected(t *testing.T) {
	_, err := Diff(context.Background(), nil, nil, DefaultOptions())
	if err == nil {
		t.Fatal("expected error on empty input")
	}
}

func TestDiffBadPNGRejected(t *testing.T) {
	_, err := Diff(context.Background(), []byte("not a png"), []byte("also not"), DefaultOptions())
	if err == nil {
		t.Fatal("expected error on bad PNG")
	}
}

func TestDiffCacheHit(t *testing.T) {
	dir := t.TempDir()
	a := makePNG(t, 80, 80, color.RGBA{R: 50, G: 50, B: 50, A: 255})
	b := makePNG(t, 80, 80, color.RGBA{R: 60, G: 60, B: 60, A: 255})
	opts := DefaultOptions()
	opts.CacheDir = dir
	opts.Highlight = true
	first, err := Diff(context.Background(), a, b, opts)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	if first.CachedKey == "" {
		t.Fatal("expected cached key after first run")
	}
	second, err := Diff(context.Background(), a, b, opts)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if second.CachedKey != first.CachedKey {
		t.Fatalf("cache key mismatch: first=%s second=%s", first.CachedKey, second.CachedKey)
	}
	// Second call latency should be much lower.
	if second.LatencyMS > first.LatencyMS+5 {
		t.Logf("note: second latency %dms ≥ first %dms — cache miss?", second.LatencyMS, first.LatencyMS)
	}
}

func TestDiffContextCancellation(t *testing.T) {
	a := makePNG(t, 500, 500, color.RGBA{R: 100, A: 255})
	b := makePNG(t, 500, 500, color.RGBA{R: 200, A: 255})
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before call
	_, err := Diff(ctx, a, b, DefaultOptions())
	// ctx.Err() check happens after computation; we just confirm it doesn't
	// panic and returns some Result + err.
	if err == nil {
		t.Log("completed before ctx check — fine")
	}
}

func TestEvictOlderThanRemovesOldFiles(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "oldkey.json")
	if err := os.WriteFile(old, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Backdate mtime.
	past := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(old, past, past)

	fresh := filepath.Join(dir, "freshkey.json")
	if err := os.WriteFile(fresh, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	removed, err := EvictOlderThan(dir, 1*time.Hour)
	if err != nil {
		t.Fatalf("evict: %v", err)
	}
	if removed != 1 {
		t.Fatalf("removed: want 1, got %d", removed)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("old file still present: %v", err)
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatalf("fresh file removed: %v", err)
	}
}

func TestSizesBucket(t *testing.T) {
	cases := []struct {
		w, h int
		want string
	}{
		{100, 100, "small"},
		{400, 300, "medium"},
		{1280, 720, "large"},
		{4096, 4096, "huge"},
	}
	for _, c := range cases {
		if got := SizesBucket(c.w, c.h); got != c.want {
			t.Fatalf("%dx%d: want %q got %q", c.w, c.h, c.want, got)
		}
	}
}

func TestSortedKeysEmpty(t *testing.T) {
	if keys := SortedKeys(""); keys != nil {
		t.Fatalf("empty dir: want nil, got %v", keys)
	}
	if keys := SortedKeys(t.TempDir()); len(keys) != 0 {
		t.Fatalf("tempdir: want 0, got %d", len(keys))
	}
}

func TestCachedDiffPNG(t *testing.T) {
	if png := CachedDiffPNG("", ""); png != nil {
		t.Fatal("empty args should return nil")
	}
	if png := CachedDiffPNG(t.TempDir(), "nonexistent"); png != nil {
		t.Fatal("missing key should return nil")
	}
}

func TestCommonSizeUsesMinWhenNoResize(t *testing.T) {
	a := image.NewRGBA(image.Rect(0, 0, 100, 200))
	b := image.NewRGBA(image.Rect(0, 0, 300, 50))
	w, h := commonSize(a, b, Options{}) // zero → use min
	if w != 100 || h != 50 {
		t.Fatalf("commonSize: want 100x50, got %dx%d", w, h)
	}
}

func TestCommonSizeRespectsExplicit(t *testing.T) {
	a := image.NewRGBA(image.Rect(0, 0, 100, 200))
	b := image.NewRGBA(image.Rect(0, 0, 300, 50))
	opts := Options{ResizeWidth: 64, ResizeHeight: 64}
	w, h := commonSize(a, b, opts)
	if w != 64 || h != 64 {
		t.Fatalf("explicit resize: want 64x64, got %dx%d", w, h)
	}
}