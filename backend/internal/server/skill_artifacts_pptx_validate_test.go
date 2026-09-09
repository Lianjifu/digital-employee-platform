package server

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writePptxFixture writes a minimal pptx-style zip with the given
// per-slide XML bodies. Used by tests to avoid real PPTX fixtures.
func writePptxFixture(t *testing.T, dir, name string, slides []string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}
	defer f.Close()
	zw := zip.NewWriter(f)
	for i, body := range slides {
		w, err := zw.Create(strings.ReplaceAll("ppt/slides/slideN.xml", "N", slideItoa(i+1)))
		if err != nil {
			t.Fatalf("zip entry: %v", err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatalf("zip write: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	return path
}

func slideItoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

const slideShell = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://xmlns" xmlns:p="http://xmlns"><a:t>%s</a:t></p:sld>`

func TestPptxLeakageReason_CleanDeck(t *testing.T) {
	dir := t.TempDir()
	path := writePptxFixture(t, dir, "clean.pptx", []string{
		strings.ReplaceAll(slideShell, "%s", "Q3 研发季度汇报"),
		strings.ReplaceAll(slideShell, "%s", "背景与目标"),
		strings.ReplaceAll(slideShell, "%s", "关键指标"),
	})
	reason, err := pptxLeakageReason(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reason != "" {
		t.Fatalf("clean deck flagged: %s", reason)
	}
}

func TestPptxLeakageReason_CatchesForbiddenPlaceholders(t *testing.T) {
	dir := t.TempDir()
	path := writePptxFixture(t, dir, "bad.pptx", []string{
		strings.ReplaceAll(slideShell, "%s", "Q3 研发季度汇报"),
		strings.ReplaceAll(slideShell, "%s", "【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述"),
		strings.ReplaceAll(slideShell, "%s", "本节交代本次汇报的业务背景与战略目标"),
	})
	reason, err := pptxLeakageReason(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reason == "" {
		t.Fatal("expected leakage, got none")
	}
	if !strings.Contains(reason, "slide 2") {
		t.Fatalf("expected slide 2 in reason, got %q", reason)
	}
}

func TestPptxLeakageReason_NoSlides(t *testing.T) {
	dir := t.TempDir()
	path := writePptxFixture(t, dir, "empty.pptx", nil)
	reason, err := pptxLeakageReason(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(reason, "未找到幻灯片") {
		t.Fatalf("expected missing-slides reason, got %q", reason)
	}
}

func TestPptxLeakageReason_BadZip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notazip.pptx")
	if err := os.WriteFile(path, []byte("not a zip"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := pptxLeakageReason(path); err == nil {
		t.Fatal("expected error on non-zip file")
	}
}