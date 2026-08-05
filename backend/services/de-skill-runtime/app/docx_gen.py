"""Word (.docx) artifact generation for skill-runtime."""
from __future__ import annotations

import os
import re
import sys
import uuid
from pathlib import Path

# Allow importing backend/scripts/generate_docx.py
_SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from generate_docx import generate_docx, normalize_title  # noqa: E402

_SKILL_DOCX_PREFIX = re.compile(r"(?i)^skill[_-]?docx[_-]*")
_DOCX_SUFFIX = re.compile(r"(?i)(_docx|\.docx)$")
_NON_NAME = re.compile(r"[^\w\u4e00-\u9fff·-]+", re.UNICODE)


def artifact_dir() -> Path:
    raw = os.environ.get("DE_SKILL_ARTIFACT_DIR") or "/tmp/de-stack/artifacts"
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def is_docx_request(data: dict, skill_id: str | None) -> bool:
    action = str(data.get("action") or "").strip().lower()
    if action in {"generate_docx", "docx"}:
        return True
    name = str(data.get("skillName") or data.get("name") or "").strip().lower()
    if name in {"docx", "word", "文档生成", "word文档"}:
        return True
    sid = str(skill_id or data.get("skillId") or "").strip().lower()
    return "docx" in sid or sid.endswith("-docx")


def safe_download_basename(title: str) -> str:
    """User-facing download name, e.g. 招聘岗位模板.docx"""
    base = normalize_title(title)
    base = _SKILL_DOCX_PREFIX.sub("", base)
    base = _DOCX_SUFFIX.sub("", base)
    base = _NON_NAME.sub("", base.replace(" ", ""))
    base = base.strip(".-_") or "生成文档"
    base = base[:32]
    return f"{base}.docx"


def build_docx_artifact(data: dict, skill_id: str | None) -> dict:
    raw_title = str(data.get("title") or data.get("filename") or "生成文档").strip() or "生成文档"
    title = normalize_title(raw_title)
    content = str(
        data.get("content")
        or data.get("input")
        or data.get("command")
        or data.get("body")
        or ""
    )
    artifact_id = uuid.uuid4().hex[:12]
    download_name = safe_download_basename(title)
    filename = f"{artifact_id}-{download_name}"
    path = artifact_dir() / filename
    generate_docx(path, title, content)
    download = f"/api/skill-artifacts/{filename}"
    return {
        "ok": True,
        "runtime": "docx-local",
        "skillId": skill_id,
        "filename": filename,
        "downloadName": download_name,
        "title": title,
        "artifactId": artifact_id,
        "artifactPath": str(path),
        "downloadPath": download,
        "stdout": (
            f"已生成 Word 文档「{title}」\n"
            f"文件名：{download_name}\n"
            f"下载链接：{download}\n"
            "请把下载链接发给用户，不要改写文件名或链接。"
        ),
        "error": None,
        "durationMs": 40,
        "runTokenAccepted": True,
        "denyControlPlane": True,
    }
