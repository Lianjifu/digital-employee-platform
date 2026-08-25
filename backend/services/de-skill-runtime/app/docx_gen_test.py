"""Tests for docx_gen routing guards."""
from docx_gen import (
    build_docx_artifact,
    is_docx_request,
    looks_like_code_as_docx_body,
    looks_like_placeholder_as_docx_body,
)


def test_is_docx_request_only_explicit_action():
    assert is_docx_request({"action": "generate_docx"}, "skill-docx")
    assert is_docx_request({"action": "docx"}, "skill-docx")
    assert not is_docx_request({"action": "run"}, "skill-docx")
    assert not is_docx_request({}, "skill-docx")


def test_rejects_python_script_as_body():
    code = "from docx import Document\nd = Document()\n"
    assert looks_like_code_as_docx_body(code)
    result = build_docx_artifact(
        {"action": "generate_docx", "title": "测试", "content": code},
        "skill-docx",
    )
    assert result["ok"] is False
    assert "无效" in result["error"]


def test_rejects_placeholder_as_body():
    placeholder = "title=招聘人事招聘模板, content=按检索结果整理的可编辑招聘模板正文"
    assert looks_like_placeholder_as_docx_body(placeholder)
    result = build_docx_artifact(
        {"action": "generate_docx", "title": "测试", "content": placeholder},
        "skill-docx",
    )
    assert result["ok"] is False
    assert "占位" in result["error"] or "摘要" in result["error"]


def test_accepts_plain_text_body(tmp_path, monkeypatch):
    monkeypatch.setenv("DE_SKILL_ARTIFACT_DIR", str(tmp_path))
    result = build_docx_artifact(
        {
            "action": "generate_docx",
            "title": "招聘岗位模板",
            "content": "一、岗位职责\n1. 负责招聘",
        },
        "skill-docx",
    )
    assert result["ok"] is True
    assert "招聘岗位模板" in result["downloadName"]
