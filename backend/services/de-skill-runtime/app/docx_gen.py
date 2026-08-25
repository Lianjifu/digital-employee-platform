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


def looks_like_code_as_docx_body(content: str) -> bool:
    s = (content or "").strip()
    if not s:
        return False
    lower = s.lower()
    strong = (
        "from docx import",
        "import docx",
        "document()",
        "qn('w:eastasia')",
        "wd_align_paragraph",
        "python-docx",
        "```python",
        "add_heading(",
        "add_paragraph(",
    )
    if any(sig in lower for sig in strong):
        return True
    code_lines = 0
    for line in s.split("\n"):
        trim = line.strip()
        if not trim:
            continue
        if trim.startswith(("import ", "from ", "def ", "class ")):
            code_lines += 1
    return code_lines >= 2


def looks_like_placeholder_as_docx_body(content: str) -> bool:
    s = (content or "").strip()
    if not s:
        return False
    if re.match(r"(?i)^\s*title\s*=\s*.+\s*,\s*content\s*=", s):
        return True
    lower = s.lower()
    if len(s) < 160:
        for hint in ("可编辑", "摘要", "按检索", "整理的正文", "整理的可编辑", "模板正文"):
            if hint in lower:
                return True
    if len(s) < 80 and not any(m in s for m in ("一、", "岗位职责", "任职要求", "##")):
        return True
    return False


def is_docx_request(data: dict, skill_id: str | None) -> bool:
    action = str(data.get("action") or "").strip().lower()
    return action in {"generate_docx", "docx"}


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
    if looks_like_code_as_docx_body(content):
        return {
            "ok": False,
            "runtime": "docx-local",
            "skillId": skill_id,
            "error": "docx 正文无效：不能是 Python 生成脚本，请传入人话正文",
            "stdout": "",
            "durationMs": 0,
        }
    if looks_like_placeholder_as_docx_body(content):
        return {
            "ok": False,
            "runtime": "docx-local",
            "skillId": skill_id,
            "error": "docx 正文无效：不能是摘要或 title=content= 占位符，请传入完整模板正文",
            "stdout": "",
            "durationMs": 0,
        }
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
