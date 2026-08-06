"""Skill runtime FastAPI service: gVisor-shaped sandbox API."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.docx_gen import artifact_dir, build_docx_artifact, is_docx_request
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
    if is_docx_request(data, str(skill_id) if skill_id is not None else None):
        payload = build_docx_artifact(data, str(skill_id) if skill_id is not None else None)
        payload["workspaceId"] = claims.get("workspaceId")
        payload["correlationId"] = data.get("correlationId")
        payload["isolation"] = probe
        return JSONResponse(status_code=200, content=payload)

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
    exec_status = "noop"
    if package_path:
        exec_ok, pkg_out, duration_ms = run_package_script(package_path, scripts, command, timeout_sec)
        stdout_lines.append(pkg_out)
        if "status=needs_instruction" in pkg_out:
            exec_status = "needs_instruction"
            exec_ok = False
        elif exec_ok:
            exec_status = "executed"
        else:
            exec_status = "failed"
    elif command:
        stdout_lines.append(f"command={command}")
        stdout_lines.append("status=needs_instruction")
        stdout_lines.append("hint=packagePath required to execute scripts")
        exec_ok = False
        exec_status = "needs_instruction"
    else:
        stdout_lines.append("status=noop")
        exec_status = "noop"
    return JSONResponse(
        status_code=200,
        content={
            "ok": exec_ok,
            "status": exec_status,
            "runtime": sandbox_mode(),
            "skillId": skill_id,
            "stdout": "\n".join(stdout_lines),
            "error": None if exec_ok else (
                "needs_instruction: provide action=run with scripts/... command"
                if exec_status == "needs_instruction"
                else "skill script failed"
            ),
            "durationMs": duration_ms,
            "runTokenAccepted": True,
            "denyControlPlane": True,
            "workspaceId": claims.get("workspaceId"),
            "correlationId": data.get("correlationId"),
            "packagePath": package_path or None,
            "isolation": probe,
        },
    )


@app.get("/v1/artifacts/{name}")
def get_artifact(name: str):
    from fastapi.responses import FileResponse

    safe = Path(name).name
    if safe != name or ".." in name or "/" in name or "\\" in name:
        return JSONResponse(status_code=400, content={"error": "invalid artifact name"})
    path = artifact_dir() / safe
    if not path.is_file():
        return JSONResponse(status_code=404, content={"error": "artifact not found"})
    media = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if safe.lower().endswith(".docx")
        else "application/octet-stream"
    )
    return FileResponse(path, media_type=media, filename=safe)


@app.exception_handler(404)
async def not_found(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "not found"})
