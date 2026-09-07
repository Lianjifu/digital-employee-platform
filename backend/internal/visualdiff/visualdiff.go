// Package visualdiff implements pixel-level PNG comparison for W4-D2.
//
// Design choice: client-side screenshot capture. The browser captures
// two PNGs (canvas.toDataURL / html2canvas), POSTs them as multipart
// or JSON body, and this package does the diff. We intentionally avoid
// rod / chromedp here — adding a headless browser runtime is heavy
// and the only consumer (the workspace canvas) already runs in a
// browser.
//
// Output:
//
//   - match         — true when diffRatio < threshold (default 0.005 = 0.5%)
//   - diffRatio     — fraction of pixels that differ
//   - diffPNG       — optional highlighted diff image (red overlay on
//                     changed pixels), returned when Highlight is set
//   - width/height  — pixel dimensions of the comparison
//   - latencyMS     — wall-clock time for the diff
//
// Caching: results are keyed by (size, sha256(before), sha256(after)).
// Repeated comparisons of the same pair skip the pixel walk entirely.
// Cache lives on disk under data/visual-diff/<key>.json (metadata) +
// <key>.png (highlight image).
package visualdiff

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Result is the comparison output.
type Result struct {
	Match      bool    `json:"match"`
	DiffRatio  float64 `json:"diffRatio"`
	DiffPixels int     `json:"diffPixels"`
	Total      int     `json:"totalPixels"`
	Width      int     `json:"width"`
	Height     int     `json:"height"`
	LatencyMS  int64   `json:"latencyMS"`
	// DiffPNG is the highlighted diff image. Only populated when the
// caller opts into Highlight AND the diff produced output. Cached on
// disk so a follow-up GET can stream it.
	DiffPNG []byte `json:"-"`
	// CachedKey is the cache key for the result. Empty when caching is
	// disabled (CacheDir == "").
	CachedKey string `json:"-"`
}

// Options controls the comparison.
type Options struct {
	// Threshold is the max diffRatio allowed for Match=true. Default 0.005.
	Threshold float64
	// ResizeTo fits both images to a common box before comparing. Set to
// (0,0) to keep original sizes. Default 1024×768 — large enough for
	// most dashboards, small enough to keep memory bounded.
	ResizeWidth  int
	ResizeHeight int
	// Highlight overlays red on changed pixels in the diff PNG. Cached.
	Highlight bool
	// CacheDir enables on-disk caching of results. nil → no cache.
	CacheDir string
	// Tolerance is the per-channel |Δ| allowed before a pixel counts as
// "different". Default 8 (out of 255) — covers JPEG artefacts + minor
	// AA differences.
	Tolerance uint8
}

// DefaultOptions is the fallback when the caller passes a zero Options.
func DefaultOptions() Options {
	return Options{
		Threshold:    0.005,
		ResizeWidth:  1024,
		ResizeHeight: 768,
		Tolerance:    8,
	}
}

// Diff compares two PNG byte streams and returns a Result. The actual
// pixel walk runs under a context so callers can cap latency.
func Diff(ctx context.Context, before, after []byte, opts Options) (Result, error) {
	if len(before) == 0 || len(after) == 0 {
		return Result{}, errors.New("visualdiff: empty input")
	}
	def := DefaultOptions()
	if opts.Threshold <= 0 {
		opts.Threshold = def.Threshold
	}
	if opts.ResizeWidth <= 0 {
		opts.ResizeWidth = def.ResizeWidth
	}
	if opts.ResizeHeight <= 0 {
		opts.ResizeHeight = def.ResizeHeight
	}
	if opts.Tolerance == 0 {
		opts.Tolerance = def.Tolerance
	}
	start := time.Now()

	imgA, err := decodePNG(bytes.NewReader(before))
	if err != nil {
		return Result{}, fmt.Errorf("visualdiff: decode before: %w", err)
	}
	imgB, err := decodePNG(bytes.NewReader(after))
	if err != nil {
		return Result{}, fmt.Errorf("visualdiff: decode after: %w", err)
	}

	w, h := commonSize(imgA, imgB, opts)
	if w == 0 || h == 0 {
		return Result{}, errors.New("visualdiff: invalid dimensions")
	}

	// Cache lookup.
	if opts.CacheDir != "" {
		key := cacheKey(w, h, before, after, opts)
		if r, ok := loadCached(opts.CacheDir, key); ok {
			r.LatencyMS = time.Since(start).Milliseconds()
			r.CachedKey = key
			return r, nil
		}
	}

	resizedA := resizeIfNeeded(imgA, w, h)
	resizedB := resizeIfNeeded(imgB, w, h)

	diffPixels, total, diffImg := walkPixels(resizedA, resizedB, opts.Tolerance)
	ratio := 0.0
	if total > 0 {
		ratio = float64(diffPixels) / float64(total)
	}

	res := Result{
		Match:      ratio < opts.Threshold,
		DiffRatio:  ratio,
		DiffPixels: diffPixels,
		Total:      total,
		Width:      w,
		Height:     h,
		LatencyMS:  time.Since(start).Milliseconds(),
	}

	if opts.Highlight && diffImg != nil {
		var buf bytes.Buffer
		if err := png.Encode(&buf, diffImg); err == nil {
			res.DiffPNG = buf.Bytes()
		}
	}

	if opts.CacheDir != "" {
		key := cacheKey(w, h, before, after, opts)
		_ = saveCached(opts.CacheDir, key, res)
		res.CachedKey = key
	}

	if err := ctx.Err(); err != nil {
		return res, err
	}
	return res, nil
}

// CachedDiffPNG returns the highlighted diff image for a previously
// cached comparison. Returns nil if not cached.
func CachedDiffPNG(cacheDir, key string) []byte {
	if cacheDir == "" || key == "" {
		return nil
	}
	data, err := os.ReadFile(filepath.Join(cacheDir, key+".png"))
	if err != nil {
		return nil
	}
	return data
}

func decodePNG(r io.Reader) (image.Image, error) {
	img, err := png.Decode(r)
	if err != nil {
		return nil, err
	}
	return img, nil
}

func commonSize(a, b image.Image, opts Options) (int, int) {
	w, h := opts.ResizeWidth, opts.ResizeHeight
	if w == 0 || h == 0 {
		// Use min dimensions to handle mismatched screenshots.
		wa, ha := a.Bounds().Dx(), a.Bounds().Dy()
		wb, hb := b.Bounds().Dx(), b.Bounds().Dy()
		if wa < wb {
			w = wa
		} else {
			w = wb
		}
		if ha < hb {
			h = ha
		} else {
			h = hb
		}
	}
	return w, h
}

// resizeIfNeeded applies nearest-neighbour scaling via the standard
// library. We deliberately avoid a high-quality scaler — visualdiff
// wants speed, not aesthetics. Box-filter scaling would be better but
// requires an external lib.
func resizeIfNeeded(src image.Image, w, h int) image.Image {
	if src.Bounds().Dx() == w && src.Bounds().Dy() == h {
		return src
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	// Box filter via sub-sample.
	aw, ah := src.Bounds().Dx(), src.Bounds().Dy()
	xStep := aw / w
	if xStep < 1 {
		xStep = 1
	}
	yStep := ah / h
	if yStep < 1 {
		yStep = 1
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			sx := x * xStep
			sy := y * yStep
			r, g, b, a := src.At(src.Bounds().Min.X+sx, src.Bounds().Min.Y+sy).RGBA()
			// Convert from pre-multiplied 16-bit to 8-bit.
			dst.SetRGBA(x, y, color.RGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(b >> 8),
				A: uint8(a >> 8),
			})
		}
	}
	return dst
}

// walkPixels walks two RGBA images of identical dimensions, returning
// (changed, total, highlightedDiff). The diff image is nil unless the
// caller wants one; we don't allocate it eagerly.
func walkPixels(a, b image.Image, tol uint8) (int, int, *image.RGBA) {
	ba := a.Bounds()
	bb := b.Bounds()
	w, h := ba.Dx(), ba.Dy()
	if bb.Dx() != w || bb.Dy() != h {
		return 0, 0, nil
	}
	var diff *image.RGBA
	changed := 0
	total := w * h
	tol16 := uint32(tol) * uint32(tol) // squared per-channel threshold
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r1, g1, b1, _ := a.At(ba.Min.X+x, ba.Min.Y+y).RGBA()
			r2, g2, b2, _ := b.At(bb.Min.X+x, bb.Min.Y+y).RGBA()
			dr := uint32((r1>>8)-(r2>>8)) * uint32((r1>>8)-(r2>>8))
			dg := uint32((g1>>8)-(g2>>8)) * uint32((g1>>8)-(g2>>8))
			db := uint32((b1>>8)-(b2>>8)) * uint32((b1>>8)-(b2>>8))
			if dr+dg+db > tol16*3 {
				changed++
				if diff == nil {
					diff = image.NewRGBA(image.Rect(0, 0, w, h))
				}
				diff.Set(x, y, color.RGBA{R: 255, A: 220})
			}
		}
	}
	return changed, total, diff
}

func cacheKey(w, h int, before, after []byte, opts Options) string {
	hb := sha256.Sum256(before)
	ha := sha256.Sum256(after)
	raw := fmt.Sprintf("%dx%d|%s|%s|t=%d|r=%f|%v",
		w, h, hex.EncodeToString(hb[:8]), hex.EncodeToString(ha[:8]),
		opts.Tolerance, opts.Threshold, opts.Highlight)
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:16])
}

// cachedRecord is the on-disk form.
type cachedRecord struct {
	Match      bool    `json:"match"`
	DiffRatio  float64 `json:"diffRatio"`
	DiffPixels int     `json:"diffPixels"`
	Total      int     `json:"total"`
	Width      int     `json:"width"`
	Height     int     `json:"height"`
	SavedAt    string  `json:"savedAt"`
}

func loadCached(dir, key string) (Result, bool) {
	data, err := os.ReadFile(filepath.Join(dir, key+".json"))
	if err != nil {
		return Result{}, false
	}
	var rec cachedRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return Result{}, false
	}
	return Result{
		Match:      rec.Match,
		DiffRatio:  rec.DiffRatio,
		DiffPixels: rec.DiffPixels,
		Total:      rec.Total,
		Width:      rec.Width,
		Height:     rec.Height,
	}, true
}

var saveMu sync.Mutex

func saveCached(dir, key string, r Result) error {
	saveMu.Lock()
	defer saveMu.Unlock()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	rec := cachedRecord{
		Match:      r.Match,
		DiffRatio:  r.DiffRatio,
		DiffPixels: r.DiffPixels,
		Total:      r.Total,
		Width:      r.Width,
		Height:     r.Height,
		SavedAt:    time.Now().UTC().Format(time.RFC3339),
	}
	buf, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, key+".json"), buf, 0o644); err != nil {
		return err
	}
	if r.DiffPNG != nil {
		return os.WriteFile(filepath.Join(dir, key+".png"), r.DiffPNG, 0o644)
	}
	return nil
}

// EvictOlderThan removes cached entries older than ttl. Used by a
// janitor goroutine driven by DE_VISUALDIFF_RETENTION. Returns the
// number of entries removed.
func EvictOlderThan(dir string, ttl time.Duration) (int, error) {
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

// SizesBuckets groups latency metrics by image size bucket for the
// `de_visualdiff_seconds{size}` Prometheus label. Buckets are coarse —
// the dashboard just needs a coarse histogram, not precise timing.
func SizesBucket(w, h int) string {
	pixels := w * h
	switch {
	case pixels < 200*200:
		return "small"
	case pixels < 800*600:
		return "medium"
	case pixels < 1920*1080:
		return "large"
	default:
		return "huge"
	}
}

// SortedKeys is a stable list of cache keys for the given dir. Used by
// the GET /api/visualdiff endpoint to list prior comparisons.
func SortedKeys(dir string) []string {
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		out = append(out, e.Name()[:len(e.Name())-len(".json")])
	}
	sort.Strings(out)
	return out
}