package gateway

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type stubIdentity struct {
	name string
	ws   string
}

func (s *stubIdentity) ActorName() string    { return s.name }
func (s *stubIdentity) WorkspaceID() string  { return s.ws }

type captureAudit struct {
	mu    sync.Mutex
	rows  []auditRow
	actor string
	ws    string
}

type auditRow struct {
	ws, actor, action, target, result, reason string
}

func (c *captureAudit) fn() AuditFunc {
	return func(ws, actor, action, target, result, reason string) {
		c.mu.Lock()
		defer c.mu.Unlock()
		c.rows = append(c.rows, auditRow{ws, actor, action, target, result, reason})
	}
}

func (c *captureAudit) count(action, result string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	n := 0
	for _, r := range c.rows {
		if r.action == action && r.result == result {
			n++
		}
	}
	return n
}

func mustWriteFile(t *testing.T, path string, size int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, make([]byte, size), 0o644); err != nil {
		t.Fatal(err)
	}
}

func newAllowedDocx(t *testing.T, dir string) string {
	t.Helper()
	p := filepath.Join(dir, "report.docx")
	mustWriteFile(t, p, 256)
	return p
}

func TestValidateAcceptsAllowed(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	p := newAllowedDocx(t, root)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/report.docx", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	name, ok := ValidateArtifactRequest(rec, r, "report.docx", root, DefaultArtifactPolicy(), id, cap.fn())
	if !ok {
		t.Fatalf("expected ok, got %s", rec.Body.String())
	}
	if name != "report.docx" {
		t.Fatalf("expected clean name report.docx, got %s", name)
	}
	if cap.count(auditAction, "success") != 1 {
		t.Fatalf("expected 1 success audit row, got %d", cap.count(auditAction, "success"))
	}
	_ = p
}

func TestValidateRejectsTraversalRaw(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	_ = newAllowedDocx(t, root)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/..%2F..%2Fetc%2Fpasswd", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	name, ok := ValidateArtifactRequest(rec, r, "../../etc/passwd", root, DefaultArtifactPolicy(), id, cap.fn())
	if ok {
		t.Fatalf("expected reject, got ok name=%s", name)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	if cap.count(auditAction, "denied") != 1 {
		t.Fatalf("expected 1 denied audit row, got %d", cap.count(auditAction, "denied"))
	}
}

func TestValidateRejectsTraversalAfterDecode(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	_ = newAllowedDocx(t, root)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/%2e%2e%2fpasswd", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	// Pass encoded path as the rawName; gateway must decode first, then re-base.
	_, ok := ValidateArtifactRequest(rec, r, "%2e%2e%2fpasswd", root, DefaultArtifactPolicy(), id, cap.fn())
	if ok {
		t.Fatalf("expected reject on encoded traversal")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestValidateRejectsDisallowedExt(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	mustWriteFile(t, filepath.Join(root, "evil.exe"), 128)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/evil.exe", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	_, ok := ValidateArtifactRequest(rec, r, "evil.exe", root, DefaultArtifactPolicy(), id, cap.fn())
	if ok {
		t.Fatalf("expected reject on disallowed ext")
	}
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("expected 415, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "E_UNSUPPORTED_MEDIA_TYPE") {
		t.Fatalf("expected E_UNSUPPORTED_MEDIA_TYPE in body, got %s", rec.Body.String())
	}
}

func TestValidateRejectsOversize(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	p := filepath.Join(root, "huge.docx")
	mustWriteFile(t, p, 200)

	pol := DefaultArtifactPolicy()
	pol.MaxBytes = 100 // smaller than file size

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/huge.docx", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	_, ok := ValidateArtifactRequest(rec, r, "huge.docx", root, pol, id, cap.fn())
	if ok {
		t.Fatalf("expected reject on oversize")
	}
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "E_PAYLOAD_TOO_LARGE") {
		t.Fatalf("expected E_PAYLOAD_TOO_LARGE in body, got %s", rec.Body.String())
	}
}

func TestValidateRejectsMissingAuth(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	_ = newAllowedDocx(t, root)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/report.docx", nil)
	cap := &captureAudit{}
	// Empty actor → RequireAuth=true rejects.
	id := &stubIdentity{name: "", ws: "w1"}

	_, ok := ValidateArtifactRequest(rec, r, "report.docx", root, DefaultArtifactPolicy(), id, cap.fn())
	if ok {
		t.Fatalf("expected reject on missing auth")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestValidateRejectsEmptyName(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	_, ok := ValidateArtifactRequest(rec, r, "   ", root, DefaultArtifactPolicy(), id, cap.fn())
	if ok {
		t.Fatalf("expected reject on empty name")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestValidateEmitsAuditOnDenied(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	mustWriteFile(t, filepath.Join(root, "evil.exe"), 128)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/evil.exe", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	ValidateArtifactRequest(rec, r, "evil.exe", root, DefaultArtifactPolicy(), id, cap.fn())
	if cap.count(auditAction, "denied") != 1 {
		t.Fatalf("expected 1 denied audit row, got %d", cap.count(auditAction, "denied"))
	}
	if cap.count(auditAction, "success") != 0 {
		t.Fatalf("expected 0 success rows, got %d", cap.count(auditAction, "success"))
	}
}

func TestValidateRejectsDirectory(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	if err := os.MkdirAll(filepath.Join(root, "subdir.docx"), 0o755); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/subdir.docx", nil)
	cap := &captureAudit{}
	id := &stubIdentity{name: "alice", ws: "w1"}

	_, ok := ValidateArtifactRequest(rec, r, "subdir.docx", root, DefaultArtifactPolicy(), id, cap.fn())
	if ok {
		t.Fatalf("expected reject on directory")
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestValidateAuditsDefaultWorkspaceWhenMissing(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "artifacts")
	_ = newAllowedDocx(t, root)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/skill-artifacts/report.docx", nil)
	cap := &captureAudit{}
	// Empty ws → fallback to default.
	id := &stubIdentity{name: "alice", ws: ""}

	_, ok := ValidateArtifactRequest(rec, r, "report.docx", root, DefaultArtifactPolicy(), id, cap.fn())
	if !ok {
		t.Fatalf("expected ok, got %s", rec.Body.String())
	}
	cap.mu.Lock()
	defer cap.mu.Unlock()
	if len(cap.rows) != 1 || cap.rows[0].ws != defaultAuditWs {
		t.Fatalf("expected 1 audit row with ws=%s, got %+v", defaultAuditWs, cap.rows)
	}
}