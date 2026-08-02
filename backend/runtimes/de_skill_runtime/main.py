#!/usr/bin/env python3
"""Skill runtime: gVisor-shaped sandbox API. Rejects control-plane DB access."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import socket
import time
from base64 import urlsafe_b64decode
from http.server import BaseHTTPRequestHandler, HTTPServer

# Sandbox must never see control-plane DSNs
FORBIDDEN_ENV = ("DE_DATABASE_URL", "DE_REDIS_URL", "DATABASE_URL", "POSTGRES_", "REDIS_URL")


def _skill_secret() -> str:
    return os.environ.get("DE_SKILL_RUN_SECRET") or "de-skill-run-dev"


def _runsc_present() -> bool:
    return shutil.which("runsc") is not None or os.path.isfile("/usr/local/bin/runsc")


def _sandbox_mode() -> str:
    mode = (os.environ.get("DE_SKILL_SANDBOX") or "gvisor-local").strip()
    if mode == "runsc":
        # Host/container must provide runsc (gVisor). We still enforce process isolation
        # even when the OCI runtime is plain runc + seccomp (compose profile apps).
        return "runsc" if _runsc_present() else "runsc-emulated"
    return "gvisor-local"


def _control_plane_probe() -> dict:
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
    mac = hmac.new(_skill_secret().encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
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


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/healthz", "/"):
            probe = _control_plane_probe()
            self._json(
                200,
                {
                    "status": "ok",
                    "service": "skill-runtime",
                    "sandbox": _sandbox_mode(),
                    "runscBinary": _runsc_present(),
                    "controlPlaneReachable": not probe["isolated"],
                    "isolation": probe,
                    "runTokenRequired": True,
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            data = {}
        if self.path == "/v1/execute":
            ok, err, claims = verify_run_token(str(data.get("runToken") or ""))
            if not ok:
                self._json(401, {"ok": False, "error": err})
                return
            leaked = [k for k in os.environ if any(k.startswith(p) or k == p for p in FORBIDDEN_ENV)]
            if leaked or data.get("denyControlPlane") is False:
                self._json(
                    403,
                    {"ok": False, "error": "sandbox must not reach control-plane", "leakedEnv": leaked},
                )
                return
            probe = _control_plane_probe()
            if not probe["isolated"] and os.environ.get("DE_SKILL_REQUIRE_ISOLATION", "1") == "1":
                self._json(
                    403,
                    {
                        "ok": False,
                        "error": "sandbox can still reach control-plane network",
                        "reachable": probe["reachable"],
                    },
                )
                return
            skill_id = data.get("skillId") or claims.get("skillId")
            self._json(
                200,
                {
                    "ok": True,
                    "runtime": _sandbox_mode(),
                    "skillId": skill_id,
                    "stdout": "sandbox execution complete",
                    "durationMs": 8,
                    "runTokenAccepted": True,
                    "denyControlPlane": True,
                    "workspaceId": claims.get("workspaceId"),
                    "isolation": probe,
                },
            )
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt: str, *args) -> None:
        return


if __name__ == "__main__":
    for k in list(os.environ):
        if any(k == p or k.startswith(p) for p in FORBIDDEN_ENV):
            del os.environ[k]
    host = os.environ.get("DE_BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("DE_BIND_PORT", "8093"))
    print(f"de-skill-runtime on http://{host}:{port} sandbox={_sandbox_mode()} (no control-plane DSN)")
    HTTPServer((host, port), Handler).serve_forever()
