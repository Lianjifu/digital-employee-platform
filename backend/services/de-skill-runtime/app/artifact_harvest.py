"""Harvest recently written office files into DE_SKILL_ARTIFACT_DIR."""
from __future__ import annotations

import os
import shutil
import time
import uuid
from pathlib import Path


def artifact_dir() -> Path:
    raw = os.environ.get("DE_SKILL_ARTIFACT_DIR") or "/tmp/de-stack/artifacts"
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def harvest_office_artifact(package_path: str, max_age_sec: float = 900) -> dict | None:
    root = Path(package_path)
    if not root.is_dir():
        return None
    now = time.time()
    candidates: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        low = p.name.lower()
        if not (low.endswith(".pptx") or low.endswith(".docx") or low.endswith(".pdf")):
            continue
        parts = {x.lower() for x in p.parts}
        if "node_modules" in parts or ".git" in parts:
            continue
        try:
            age = now - p.stat().st_mtime
        except OSError:
            continue
        if age > max_age_sec:
            continue
        candidates.append(p)
    if not candidates:
        return None
    best = max(candidates, key=lambda p: p.stat().st_mtime)
    ext = best.suffix.lower()
    stem = best.stem
    # Strip leading hex id if present
    if "-" in stem and len(stem.split("-", 1)[0]) in range(6, 13):
        stem = stem.split("-", 1)[1]
    artifact_id = uuid.uuid4().hex[:12]
    filename = f"{artifact_id}-{stem}{ext}"
    dest = artifact_dir() / filename
    try:
        shutil.copy2(best, dest)
    except OSError:
        return None
    if ext == ".pptx":
        # Soft check: must contain ppt/
        try:
            import zipfile

            with zipfile.ZipFile(dest) as zf:
                names = set(zf.namelist())
            need = {
                "ppt/theme/theme1.xml",
                "ppt/slideMasters/slideMaster1.xml",
                "ppt/slideLayouts/slideLayout1.xml",
            }
            if not need.issubset(names) and "ppt/slides/slide1.xml" in names:
                # Allow harvested pptxgen decks that may use different master names;
                # only reject if no ppt/ at all.
                pass
            if not any(n.startswith("ppt/") for n in names):
                dest.unlink(missing_ok=True)
                return None
        except Exception:
            dest.unlink(missing_ok=True)
            return None
    download = f"/api/skill-artifacts/{filename}"
    return {
        "ok": True,
        "downloadPath": download,
        "filename": filename,
        "artifactPath": str(dest),
        "sourcePath": str(best),
    }
