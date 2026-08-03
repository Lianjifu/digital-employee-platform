package server_test

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

func buildDemoSkillZip(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	add := func(name, content string) {
		t.Helper()
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	add("hello-echo/SKILL.md", `---
name: hello-echo
description: Echo helper skill for sandbox verification and package import tests.
version: 1.2.0
license: MIT
riskLevel: low
---

# Hello Echo

Run scripts/echo.py to print a greeting.
`)
	add("hello-echo/scripts/echo.py", "#!/usr/bin/env python3\nprint('hello-from-package')\n")
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestParseAndImportSkillPackage(t *testing.T) {
	raw := buildDemoSkillZip(t)
	tmp := t.TempDir()
	t.Setenv("DE_SKILL_PACKAGE_DIR", tmp)
	t.Setenv("DE_SKILL_TEST_SIM", "1")
	t.Setenv("DE_SKILL_RUNTIME_URL", "http://127.0.0.1:1")

	h := server.New(store.New()).Handler()
	b64 := base64.StdEncoding.EncodeToString(raw)
	body, _ := json.Marshal(map[string]any{
		"fileName": "hello-echo.skill", "contentBase64": b64,
	})
	rr := knowledgeDo(t, h, http.MethodPost, "/api/skills/import-package", "mock-admin-token", string(body))
	if rr.Code != 200 {
		t.Fatalf("import-package %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	if env.Data["name"] != "hello-echo" {
		t.Fatalf("name=%v", env.Data["name"])
	}
	if env.Data["source"] != "package" {
		t.Fatalf("source=%v", env.Data["source"])
	}
	if env.Data["hasScripts"] != true {
		t.Fatalf("expected hasScripts: %s", rr.Body.String())
	}
	skillID, _ := env.Data["id"].(string)
	if skillID == "" {
		t.Fatal("missing id")
	}
	pkgPath := filepath.Join(tmp, "w1", skillID)
	if _, err := os.Stat(filepath.Join(pkgPath, "SKILL.md")); err != nil {
		t.Fatalf("SKILL.md not materialized: %v", err)
	}
	if _, err := os.Stat(filepath.Join(pkgPath, "scripts", "echo.py")); err != nil {
		t.Fatalf("script not materialized: %v", err)
	}

	rr = knowledgeDo(t, h, http.MethodGet, "/api/skills/"+skillID+"/package", "mock-admin-token", "")
	if rr.Code != 200 {
		t.Fatalf("package info %d %s", rr.Code, rr.Body.String())
	}

	rr = knowledgeDo(t, h, http.MethodPost, "/api/skills/"+skillID+"/test", "mock-admin-token",
		`{"command":"scripts/echo.py"}`)
	if rr.Code != 200 {
		t.Fatalf("test package skill %d %s", rr.Code, rr.Body.String())
	}
	var testEnv struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &testEnv)
	if testEnv.Data["status"] != "success" {
		t.Fatalf("test status: %s", rr.Body.String())
	}

	// reject zip-root SKILL.md
	var badBuf bytes.Buffer
	zw := zip.NewWriter(&badBuf)
	w, _ := zw.Create("SKILL.md")
	_, _ = w.Write([]byte("---\nname: bad\ndescription: x\n---\n\n# Bad\n"))
	_ = zw.Close()
	badBody, _ := json.Marshal(map[string]any{
		"fileName": "bad.skill", "contentBase64": base64.StdEncoding.EncodeToString(badBuf.Bytes()),
	})
	rr = knowledgeDo(t, h, http.MethodPost, "/api/skills/import-package", "mock-admin-token", string(badBody))
	if rr.Code == 200 {
		t.Fatalf("zip-root SKILL.md must be rejected")
	}
}
