package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeDocxTitle(t *testing.T) {
	cases := map[string]string{
		"skill_docx__输出招聘模板_docx": "输出招聘模板",
		"《招聘岗位模板》":               "招聘岗位模板",
		"abc123-招聘岗位模板.docx":     "招聘岗位模板",
		"docx":                   "生成文档",
	}
	for in, want := range cases {
		if got := normalizeDocxTitle(in); got != want {
			t.Fatalf("normalizeDocxTitle(%q)=%q want %q", in, got, want)
		}
	}
}

func TestDocxDownloadBasename(t *testing.T) {
	got := docxDownloadBasename("skill_docx__输出招聘模板_docx")
	if got != "输出招聘模板.docx" {
		t.Fatalf("basename=%s", got)
	}
	if strings.Contains(got, "skill") || strings.Contains(got, "_") {
		t.Fatalf("polluted basename: %s", got)
	}
}

func TestGenerateDocxArtifactLocal(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DE_SKILL_ARTIFACT_DIR", dir)
	filename, download, err := generateDocxArtifactLocal(
		"skill_docx__招聘岗位模板_docx",
		"一、基本信息\n岗位名称：人事专员\n\n二、岗位职责\n1. 负责招聘\n\n三、任职资格\n1. 本科及以上\n\n四、其他说明\n薪资面议",
	)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if !strings.HasSuffix(filename, "-招聘岗位模板.docx") {
		t.Fatalf("storage filename=%s", filename)
	}
	if download != "/api/skill-artifacts/"+filename {
		t.Fatalf("download=%s", download)
	}
	if display := docxDisplayNameFromStorage(filename); display != "招聘岗位模板.docx" {
		t.Fatalf("display=%s", display)
	}
	st, err := os.Stat(filepath.Join(dir, filename))
	if err != nil || st.Size() < 1000 {
		t.Fatalf("artifact missing or too small: %v size=%v", err, st)
	}
}

func TestContentDispositionAttachment(t *testing.T) {
	got := contentDispositionAttachment("1ecc2aef2257-skill_docx__输出招聘模版_docx.docx")
	if !strings.Contains(got, "filename*=UTF-8''") {
		t.Fatalf("missing RFC5987 filename*: %s", got)
	}
	if !strings.Contains(got, "%E8%BE%93%E5%87%BA") && !strings.Contains(got, "输出") {
		// PathEscape of 输出招聘模版.docx
		if !strings.Contains(got, "docx") {
			t.Fatalf("unexpected disposition: %s", got)
		}
	}
	idx := strings.Index(got, `filename="`)
	rest := got[idx+len(`filename="`):]
	end := strings.Index(rest, `"`)
	quoted := rest[:end]
	for _, r := range quoted {
		if r > 127 {
			t.Fatalf("non-ascii in filename=: %s", got)
		}
	}
}

func TestInferDocxTitleFromMessage(t *testing.T) {
	if got := inferDocxTitleFromMessage("请生成《招聘岗位模板》Word 文档"); got != "招聘岗位模板" {
		t.Fatalf("got %q", got)
	}
	if got := inferDocxTitleFromMessage("帮我出一份招聘岗位 JD 模板"); got != "招聘岗位模板" {
		t.Fatalf("got %q", got)
	}
}

func TestIsDocxSkillName(t *testing.T) {
	if !isDocxSkillName("docx") || !isDocxSkillName("Word文档") {
		t.Fatal("expected docx names to match")
	}
	if isDocxSkillName("政策问答") {
		t.Fatal("policy skill should not match docx")
	}
}
