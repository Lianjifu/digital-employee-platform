package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/metrics"
	"github.com/digital-employee-platform/backend/internal/visualdiff"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
	"github.com/digital-employee-platform/backend/pkg/response"
)

// visualdiffCacheDir returns the on-disk cache location. Lives under
// data/visual-diff/ by default, overridable via DE_VISUALDIFF_CACHE_DIR.
// The dir is created lazily on first write.
func visualdiffCacheDir() string {
	override := strings.TrimSpace(lookupEnv("DE_VISUALDIFF_CACHE_DIR"))
	if override != "" {
		return override
	}
	return filepath.Join("data", "visual-diff")
}

// visualdiffRetention returns the cache TTL. Default 7 days.
func visualdiffRetention() time.Duration {
	v := strings.TrimSpace(lookupEnv("DE_VISUALDIFF_RETENTION"))
	if v == "" {
		return 7 * 24 * time.Hour
	}
	if d, err := time.ParseDuration(v); err == nil && d > 0 {
		return d
	}
	return 7 * 24 * time.Hour
}

// visualdiffRequest is the JSON body accepted by POST /api/visualdiff.
// before / after are base64-encoded PNGs. Threshold / Highlight /
// Resize are optional overrides; zero values mean "use default".
type visualdiffRequest struct {
	Before       string  `json:"before"`
	After        string  `json:"after"`
	Threshold    float64 `json:"threshold,omitempty"`
	Highlight    bool    `json:"highlight,omitempty"`
	Tolerance    *uint8  `json:"tolerance,omitempty"`
	ResizeWidth  int     `json:"resizeWidth,omitempty"`
	ResizeHeight int     `json:"resizeHeight,omitempty"`
}

// visualdiffHandler accepts a pair of PNGs and returns the comparison.
// Latency is recorded into metrics.Global.VisualDiff as a per-size
// cumulative second counter.
func (s *Server) visualdiffHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "仅支持 POST"))
		return
	}
	if !auth.Has(identityFrom(r.Context()), "access.write") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 access.write 权限"))
		return
	}
	var req visualdiffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "无效 JSON"))
		return
	}
	before, err := base64.StdEncoding.DecodeString(strings.TrimSpace(req.Before))
	if err != nil || len(before) == 0 {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "before 必须是 base64 PNG"))
		return
	}
	after, err := base64.StdEncoding.DecodeString(strings.TrimSpace(req.After))
	if err != nil || len(after) == 0 {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "after 必须是 base64 PNG"))
		return
	}

	opts := visualdiff.Options{
		CacheDir: visualdiffCacheDir(),
	}
	if req.Threshold > 0 {
		opts.Threshold = req.Threshold
	}
	if req.Tolerance != nil {
		opts.Tolerance = *req.Tolerance
	}
	if req.ResizeWidth > 0 {
		opts.ResizeWidth = req.ResizeWidth
	}
	if req.ResizeHeight > 0 {
		opts.ResizeHeight = req.ResizeHeight
	}
	opts.Highlight = req.Highlight

	res, err := visualdiff.Diff(r.Context(), before, after, opts)
	if err != nil {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "视觉对比失败: "+err.Error()))
		return
	}

	bucket := visualdiff.SizesBucket(res.Width, res.Height)
	metrics.Global.VisualDiff.Observe(bucket, time.Duration(res.LatencyMS)*time.Millisecond)

	// Return the JSON envelope plus, if Highlight was set, the diff PNG
	// as a separate base64 field so the client can render it directly.
	body := map[string]any{
		"match":      res.Match,
		"diffRatio":  res.DiffRatio,
		"diffPixels": res.DiffPixels,
		"total":      res.Total,
		"width":      res.Width,
		"height":     res.Height,
		"latencyMS":  res.LatencyMS,
		"cacheKey":   res.CachedKey,
	}
	if len(res.DiffPNG) > 0 {
		body["diffPng"] = base64.StdEncoding.EncodeToString(res.DiffPNG)
	}
	response.OK(w, body)
}

// visualdiffFetchHandler streams a previously cached diff PNG. Path
// is /api/visualdiff/<key>.png — same shape as the skill-artifact
// preview sandbox so iframe-safe headers are reusable, though this
// endpoint always returns attachment.
func (s *Server) visualdiffFetchHandler(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/visualdiff/"), ".png")
	if key == "" || strings.ContainsAny(key, "/\\. ") {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "非法缓存键"))
		return
	}
	data := visualdiff.CachedDiffPNG(visualdiffCacheDir(), key)
	if data == nil {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "缓存不存在"))
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// visualdiffJanitor runs a sweeper that evicts entries older than
// DE_VISUALDIFF_RETENTION. Called from New() like heartbeat.
func (s *Server) visualdiffJanitor(ctx context.Context) {
	tick := time.NewTicker(1 * time.Hour)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if n, err := visualdiff.EvictOlderThan(visualdiffCacheDir(), visualdiffRetention()); err == nil && n > 0 {
				log.Printf("visualdiff: evicted %d cached entries (retention=%s)", n, visualdiffRetention())
			}
		}
	}
}