"""OpenAI-compatible LLM adapter with local stub fallback."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def invoke_openai_compatible(prompt: str) -> str | None:
    base = env("DE_LLM_BASE_URL")
    if not base:
        return None
    api_key = env("DE_LLM_API_KEY")
    model = env("DE_LLM_MODEL", "gpt-4o-mini")
    url = base.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a digital-employee runtime assistant."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {api_key}"} if api_key else {}),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=float(env("DE_LLM_TIMEOUT", "20"))) as resp:
            body = json.loads(resp.read().decode() or "{}")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None
    choices = body.get("choices") or []
    if not choices:
        return None
    msg = (choices[0].get("message") or {}).get("content")
    return str(msg) if msg else None
