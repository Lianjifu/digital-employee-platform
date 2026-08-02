#!/usr/bin/env python3
"""Agent runtime: OpenAI-compatible adapter with local stub fallback."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer


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


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/healthz", "/"):
            mode = "openai-compatible" if env("DE_LLM_BASE_URL") else "stub"
            self._json(200, {"status": "ok", "service": "agent-runtime", "mode": mode})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            data = {}
        if self.path == "/v1/invoke":
            prompt = data.get("input") or data.get("prompt") or ""
            llm = invoke_openai_compatible(str(prompt))
            if llm is not None:
                self._json(
                    200,
                    {
                        "output": llm,
                        "graph": "openai-compatible",
                        "nodes": ["ingress", "llm", "egress"],
                        "provider": "openai-compatible",
                    },
                )
                return
            self._json(
                200,
                {
                    "output": f"[runtime stub] 已处理：{prompt}",
                    "graph": "minimal",
                    "nodes": ["ingress", "reason", "egress"],
                    "provider": "stub",
                },
            )
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt: str, *args) -> None:
        return


if __name__ == "__main__":
    host = env("DE_BIND_HOST", "127.0.0.1")
    port = int(env("DE_BIND_PORT", "8091") or "8091")
    print(f"de-agent-runtime on http://{host}:{port}")
    HTTPServer((host, port), Handler).serve_forever()
