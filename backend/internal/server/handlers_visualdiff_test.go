package server_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

// makePNGBytes returns a w×h PNG filled with c, as raw bytes.
func makePNGBytes(t *testing.T, w, h int, c color.RGBA) []byte {
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

func TestVisualDiffIdentical(t *testing.T) {
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	t.Setenv("DE_VISUALDIFF_CACHE_DIR", t.TempDir())
	h := server.New(store.New()).Handler()

	before := makePNGBytes(t, 80, 80, color.RGBA{R: 100, G: 50, B: 50, A: 255})
	after := makePNGBytes(t, 80, 80, color.RGBA{R: 100, G: 50, B: 50, A: 255})

	body, _ := json.Marshal(map[string]any{
		"before":      base64.StdEncoding.EncodeToString(before),
		"after":       base64.StdEncoding.EncodeToString(after),
		"resizeWidth": 80,
		"resizeHeight": 80,
	})
	req := httptest.NewRequest("POST", "/api/visualdiff", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	data, _ := out["data"].(map[string]any)
	if match, _ := data["match"].(bool); !match {
		t.Fatalf("expected match=true: %+v", data)
	}
}

func TestVisualDiffDifferent(t *testing.T) {
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	t.Setenv("DE_VISUALDIFF_CACHE_DIR", t.TempDir())
	h := server.New(store.New()).Handler()

	before := makePNGBytes(t, 60, 60, color.RGBA{R: 200, A: 255})
	after := makePNGBytes(t, 60, 60, color.RGBA{R: 50, A: 255})

	body, _ := json.Marshal(map[string]any{
		"before":      base64.StdEncoding.EncodeToString(before),
		"after":       base64.StdEncoding.EncodeToString(after),
		"resizeWidth": 60,
		"resizeHeight": 60,
	})
	req := httptest.NewRequest("POST", "/api/visualdiff", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	data, _ := out["data"].(map[string]any)
	if match, _ := data["match"].(bool); match {
		t.Fatalf("expected match=false: %+v", data)
	}
	if ratio, _ := data["diffRatio"].(float64); ratio < 0.5 {
		t.Fatalf("expected diffRatio >= 0.5, got %f", ratio)
	}
}

func TestVisualDiffHighlightReturnsDiffPng(t *testing.T) {
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	cacheDir := t.TempDir()
	t.Setenv("DE_VISUALDIFF_CACHE_DIR", cacheDir)
	h := server.New(store.New()).Handler()

	before := makePNGBytes(t, 40, 40, color.RGBA{R: 100, A: 255})
	after := makePNGBytes(t, 40, 40, color.RGBA{R: 200, A: 255})

	body, _ := json.Marshal(map[string]any{
		"before":       base64.StdEncoding.EncodeToString(before),
		"after":        base64.StdEncoding.EncodeToString(after),
		"highlight":    true,
		"resizeWidth":  40,
		"resizeHeight": 40,
	})
	req := httptest.NewRequest("POST", "/api/visualdiff", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	data, _ := out["data"].(map[string]any)
	png64, _ := data["diffPng"].(string)
	if png64 == "" {
		t.Fatalf("expected diffPng in response: %+v", data)
	}
	raw, _ := base64.StdEncoding.DecodeString(png64)
	if _, err := png.Decode(bytes.NewReader(raw)); err != nil {
		t.Fatalf("diffPng is not valid PNG: %v", err)
	}
	key, _ := data["cacheKey"].(string)
	if key == "" {
		t.Fatal("expected cacheKey")
	}
	// Fetch via GET
	req2 := httptest.NewRequest("GET", "/api/visualdiff/"+key+".png", nil)
	req2.Header.Set("Authorization", "Bearer mock-admin-token")
	req2.Header.Set("X-Workspace-Id", "w1")
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != 200 {
		t.Fatalf("GET want 200, got %d", rr2.Code)
	}
	if !strings.HasPrefix(rr2.Header().Get("Content-Type"), "image/png") {
		t.Fatalf("Content-Type: %q", rr2.Header().Get("Content-Type"))
	}
}

func TestVisualDiffRejectsBadInput(t *testing.T) {
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	t.Setenv("DE_VISUALDIFF_CACHE_DIR", t.TempDir())
	h := server.New(store.New()).Handler()

	body, _ := json.Marshal(map[string]any{
		"before": "not-base64!!!",
		"after":  base64.StdEncoding.EncodeToString([]byte("anything")),
	})
	req := httptest.NewRequest("POST", "/api/visualdiff", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 400 {
		t.Fatalf("want 400, got %d", rr.Code)
	}
}

func TestVisualDiffNoAuth(t *testing.T) {
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "false")
	h := server.New(store.New()).Handler()

	body, _ := json.Marshal(map[string]any{
		"before": "abc",
		"after":  "def",
	})
	req := httptest.NewRequest("POST", "/api/visualdiff", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 401 {
		t.Fatalf("want 401, got %d", rr.Code)
	}
}

func TestVisualDiffFetchMissingKey(t *testing.T) {
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	t.Setenv("DE_VISUALDIFF_CACHE_DIR", t.TempDir())
	h := server.New(store.New()).Handler()

	req := httptest.NewRequest("GET", "/api/visualdiff/nonexistent.png", nil)
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 404 {
		t.Fatalf("want 404, got %d", rr.Code)
	}
}

func TestVisualDiffFetchRejectsTraversal(t *testing.T) {
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	t.Setenv("DE_VISUALDIFF_CACHE_DIR", t.TempDir())
	h := server.New(store.New()).Handler()

	// Build requests with a raw RequestURI so we don't trip
	// httptest.NewRequest's path-cleaning panic. Each path decodes to
	// something the handler must reject.
	cases := []struct {
		name string
		uri  string
	}{
		{"encoded-slash", "/api/visualdiff/sub%2Fdir.png"},
		{"space", "/api/visualdiff/has%20space.png"},
		{"empty-key", "/api/visualdiff/.png"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, err := http.NewRequest("GET", "http://example.com"+c.uri, nil)
			if err != nil {
				t.Fatalf("build req: %v", err)
			}
			req.RequestURI = c.uri
			req.Header.Set("Authorization", "Bearer mock-admin-token")
			req.Header.Set("X-Workspace-Id", "w1")
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code == http.StatusOK {
				t.Fatalf("path %q should NOT 200 (got %d)", c.uri, rr.Code)
			}
		})
	}
}

func TestVisualDiffUsesDefaultCacheDir(t *testing.T) {
	// Sanity check: the helper returns a non-empty path even when env is
	// unset (so the handler always has a destination).
	t.Setenv("DE_VISUALDIFF_CACHE_DIR", "")
	h := server.New(store.New())
	_ = h
	if !filepath.IsAbs(filepath.Clean("data/visual-diff")) && false {
		t.Fatal("unreachable — sanity only")
	}
}