"""Agent runtime FastAPI service: OpenAI-compatible adapter with local stub fallback."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.llm import env, invoke_openai_compatible

app = FastAPI(title="de-agent-runtime", version="1.0.0")


@app.get("/healthz")
@app.get("/")
def healthz() -> dict[str, str]:
    mode = "openai-compatible" if env("DE_LLM_BASE_URL") else "stub"
    return {"status": "ok", "service": "agent-runtime", "mode": mode}


@app.post("/v1/invoke")
async def invoke(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        data = {}
    if not isinstance(data, dict):
        data = {}
    prompt = data.get("input") or data.get("prompt") or ""
    llm = invoke_openai_compatible(str(prompt))
    if llm is not None:
        return {
            "output": llm,
            "graph": "openai-compatible",
            "nodes": ["ingress", "llm", "egress"],
            "provider": "openai-compatible",
        }
    return {
        "output": f"[runtime stub] 已处理：{prompt}",
        "graph": "minimal",
        "nodes": ["ingress", "reason", "egress"],
        "provider": "stub",
    }


@app.exception_handler(404)
async def not_found(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "not found"})
