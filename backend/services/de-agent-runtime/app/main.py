"""Agent runtime FastAPI service: OpenAI-compatible adapter with local stub fallback."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.llm import env, invoke_openai_compatible

app = FastAPI(title="de-agent-runtime", version="1.0.0")


def _allow_stub() -> bool:
    v = (env("DE_ALLOW_RUNTIME_STUB") or "").strip().lower()
    return v in ("1", "true", "yes")


@app.get("/healthz")
@app.get("/")
def healthz() -> dict[str, str]:
    if env("DE_LLM_BASE_URL"):
        mode = "openai-compatible"
    elif _allow_stub():
        mode = "stub"
    else:
        mode = "unconfigured"
    return {"status": "ok", "service": "agent-runtime", "mode": mode}


@app.post("/v1/invoke")
async def invoke(request: Request) -> Any:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        data = {}
    if not isinstance(data, dict):
        data = {}
    prompt = data.get("input") or data.get("prompt") or ""
    llm = invoke_openai_compatible(
        str(prompt),
        base_url=str(data.get("baseUrl") or data.get("base_url") or "") or None,
        api_key=str(data.get("apiKey") or data.get("api_key") or "") or None,
        model=str(data.get("model") or data.get("modelId") or "") or None,
    )
    if llm is not None:
        return {
            "output": llm,
            "graph": "openai-compatible",
            "nodes": ["ingress", "llm", "egress"],
            "provider": "openai-compatible",
        }
    if not _allow_stub():
        return JSONResponse(
            status_code=503,
            content={
                "error": "no LLM configured",
                "message": "Set DE_LLM_BASE_URL (and optional DE_LLM_API_KEY / DE_LLM_MODEL), or DE_ALLOW_RUNTIME_STUB=1 for legacy stub.",
                "provider": "none",
            },
        )
    return {
        "output": f"[runtime stub] 已处理：{prompt}",
        "graph": "minimal",
        "nodes": ["ingress", "reason", "egress"],
        "provider": "stub",
    }


@app.exception_handler(404)
async def not_found(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "not found"})
