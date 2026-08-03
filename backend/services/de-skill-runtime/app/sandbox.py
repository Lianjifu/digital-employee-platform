"""Skill sandbox: RunToken verification, script execution, isolation probes."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import shutil
import socket
import subprocess
import time
from base64 import urlsafe_b64decode
from pathlib import Path

FORBIDDEN_ENV = ("DE_DATABASE_URL", "DE_REDIS_URL", "DATABASE_URL", "POSTGRES_", "REDIS_URL")
_SCRIPT_RE = re.compile(
    r"^(?:(?:python3?|node|bash|sh)\s+)?(?:\./)?(scripts/[A-Za-z0-9._/-]+\.(?:py|sh|js|mjs|ts))(?:\s+(.*))?$",
    re.I,
)


def skill_secret() -> str:
    return os.environ.get("DE_SKILL_RUN_SECRET") or "de-skill-run-dev"


def runsc_present() -> bool:
    return shutil.which("runsc") is not None or os.path.isfile("/usr/local/bin/runsc")


def sandbox_mode() -> str:
    mode = (os.environ.get("DE_SKILL_SANDBOX") or "gvisor-local").strip()
    if mode == "runsc":
        return "runsc" if runsc_present() else "runsc-emulated"
    return "gvisor-local"


def control_plane_probe() -> dict:
    """Best-effort: confirm sandbox cannot reach typical control-plane hosts."""
    hosts = [
        os.environ.get("DE_PROBE_POSTGRES_HOST", "postgres"),
        os.environ.get("DE_PROBE_REDIS_HOST", "redis"),
        "de-postgres",
        "de-redis",
    ]
    reachable = []
    for h in hosts:
        try:
            socket.create_connection((h, 5432 if "postgres" in h or h == "postgres" else 6379), timeout=0.15)
            reachable.append(h)
        except OSError:
            pass
    return {"reachable": reachable, "isolated": len(reachable) == 0}


def verify_run_token(token: str) -> tuple[bool, str, dict]:
    """Validate v1.<payload>.<hexmac> tokens minted by de-core."""
    if not token:
        return False, "missing runToken", {}
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return False, "invalid runToken format", {}
    payload_b64, sig = parts[1], parts[2]
    mac = hmac.new(skill_secret().encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mac, sig):
        return False, "invalid runToken signature", {}
    try:
        pad = "=" * (-len(payload_b64) % 4)
        raw = urlsafe_b64decode(payload_b64 + pad)
        claims = json.loads(raw.decode())
    except (ValueError, json.JSONDecodeError):
        return False, "invalid runToken payload", {}
    exp = int(claims.get("exp") or 0)
    if exp and int(time.time()) > exp:
        return False, "runToken expired", {}
    return True, "", claims


def safe_under(root: Path, rel: str) -> Path | None:
    try:
        target = (root / rel).resolve()
        root_res = root.resolve()
        if root_res == target or str(target).startswith(str(root_res) + os.sep):
            return target
    except OSError:
        return None
    return None


def run_package_script(
    package_path: str, scripts: list[str], command: str, timeout_sec: int
) -> tuple[bool, str, int]:
    root = Path(package_path)
    if not root.is_dir():
        return False, f"packagePath not found: {package_path}", 0
    m = _SCRIPT_RE.match(command.strip())
    if not m:
        md = root / "SKILL.md"
        if not md.is_file():
            md = root / "skill.md"
        preview = ""
        if md.is_file():
            preview = md.read_text(encoding="utf-8", errors="replace")[:800]
        return True, (
            f"package={root}\n"
            f"scripts={','.join(scripts) if scripts else '(none)'}\n"
            f"command={command}\n"
            f"status=loaded\n"
            f"--- SKILL.md preview ---\n{preview}"
        ), 12
    rel = m.group(1).replace("\\", "/")
    args_tail = (m.group(2) or "").strip()
    target = safe_under(root, rel)
    if target is None or not target.is_file():
        return False, f"script not found or outside package: {rel}", 0
    lower = rel.lower()
    if lower.endswith(".py"):
        cmd = ["python3", str(target)]
    elif lower.endswith(".js") or lower.endswith(".mjs"):
        cmd = ["node", str(target)]
    elif lower.endswith(".ts"):
        cmd = ["npx", "--yes", "tsx", str(target)]
    else:
        cmd = ["bash", str(target)]
    if args_tail:
        cmd.extend(args_tail.split())
    env = {k: v for k, v in os.environ.items() if not any(k == p or k.startswith(p) for p in FORBIDDEN_ENV)}
    env["DE_SKILL_PACKAGE_ROOT"] = str(root)
    started = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            env=env,
            capture_output=True,
            text=True,
            timeout=max(1, min(timeout_sec, 120)),
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, f"script timeout after {timeout_sec}s: {rel}", int((time.time() - started) * 1000)
    except FileNotFoundError as exc:
        return False, f"runtime binary missing: {exc}", int((time.time() - started) * 1000)
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    lines = [
        f"package={root}",
        f"script={rel}",
        f"exit={proc.returncode}",
    ]
    if out:
        lines.append("--- stdout ---")
        lines.append(out[:8000])
    if err:
        lines.append("--- stderr ---")
        lines.append(err[:4000])
    ok = proc.returncode == 0
    return ok, "\n".join(lines), int((time.time() - started) * 1000)


def strip_forbidden_env() -> None:
    for k in list(os.environ):
        if any(k == p or k.startswith(p) for p in FORBIDDEN_ENV):
            del os.environ[k]
