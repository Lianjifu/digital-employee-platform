"""Skill runtime FastAPI service: gVisor-shaped sandbox API."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.sandbox import (
    FORBIDDEN_ENV,
    control_plane_probe,
    run_package_script,
    runsc_present,
    sandbox_mode,
    strip_forbidden_env,
    verify_run_token,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    strip_forbidden_env()
    yield


app = FastAPI(title="de-skill-runtime", version="1.0.0", lifespan=lifespan)


@app.get("/healthz")
@app.get("/")
def healthz() -> dict[str, Any]:
    probe = control_plane_probe()
    return {
        "status": "ok",
        "service": "skill-runtime",
        "sandbox": sandbox_mode(),
        "runscBinary": runsc_present(),
        "controlPlaneReachable": not probe["isolated"],
        "isolation": probe,
        "runTokenRequired": True,
    }


@app.post("/v1/execute")
async def execute(request: Request) -> JSONResponse:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        data = {}
    if not isinstance(data, dict):
        data = {}
    ok, err, claims = verify_run_token(str(data.get("runToken") or ""))
    if not ok:
        return JSONResponse(status_code=401, content={"ok": False, "error": err})
    leaked = [k for k in os.environ if any(k.startswith(p) or k == p for p in FORBIDDEN_ENV)]
    if leaked or data.get("denyControlPlane") is False:
        return JSONResponse(
            status_code=403,
            content={"ok": False, "error": "sandbox must not reach control-plane", "leakedEnv": leaked},
        )
    probe = control_plane_probe()
    if not probe["isolated"] and os.environ.get("DE_SKILL_REQUIRE_ISOLATION", "1") == "1":
        return JSONResponse(
            status_code=403,
            content={
                "ok": False,
                "error": "sandbox can still reach control-plane network",
                "reachable": probe["reachable"],
            },
        )
    skill_id = data.get("skillId") or claims.get("skillId")
    command = str(data.get("command") or "").strip()
    package_path = str(data.get("packagePath") or "").strip()
    scripts = data.get("scripts") or []
    if not isinstance(scripts, list):
        scripts = []
    scripts = [str(x) for x in scripts]
    timeout_sec = int(data.get("timeoutSec") or 30)
    duration_ms = 8 + min(40, len(command) // 4)
    stdout_lines = [
        f"sandbox={sandbox_mode()}",
        f"skillId={skill_id}",
        "denyControlPlane=true",
    ]
    exec_ok = True
    if package_path:
        exec_ok, pkg_out, duration_ms = run_package_script(package_path, scripts, command, timeout_sec)
        stdout_lines.append(pkg_out)
    elif command:
        stdout_lines.append(f"command={command}")
        stdout_lines.append("status=accepted")
    else:
        stdout_lines.append("status=noop")
    return JSONResponse(
        status_code=200,
        content={
            "ok": exec_ok,
            "runtime": sandbox_mode(),
            "skillId": skill_id,
            "stdout": "\n".join(stdout_lines),
            "error": None if exec_ok else "skill script failed",
            "durationMs": duration_ms,
            "runTokenAccepted": True,
            "denyControlPlane": True,
            "workspaceId": claims.get("workspaceId"),
            "correlationId": data.get("correlationId"),
            "packagePath": package_path or None,
            "isolation": probe,
        },
    )


@app.exception_handler(404)
async def not_found(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "not found"})
