"""LoopEvent sequence for /v1/run — tool dispatch then answer (parity with Go Harness)."""
from __future__ import annotations

from typing import Any, Iterator


def enabled_tools(payload: dict[str, Any]) -> list[str]:
    tools = payload.get("enabledTools") or []
    if not tools:
        snap = payload.get("snapshot") if isinstance(payload.get("snapshot"), dict) else {}
        tools = snap.get("toolRegistry") or []
    out: list[str] = []
    if isinstance(tools, list):
        for t in tools:
            name = str(t).strip()
            if name:
                out.append(name)
    return out


def tool_events(
    tools: list[str],
    *,
    corr: str,
    snap_id: str,
    user_input: str,
) -> list[dict[str, Any]]:
    """Emit tool LoopEvents matching Go bootstrap (knowledge.retrieve first)."""
    events: list[dict[str, Any]] = []
    if "knowledge.retrieve" in tools:
        events.append(
            {
                "type": "tool",
                "stage": "react",
                "name": "knowledge.retrieve",
                "status": "ok",
                "id": "tc_bootstrap_kr",
                "correlationId": corr,
                "snapshotId": snap_id,
                "args": {"query": user_input},
                "hits": [],
            }
        )
    for name in tools:
        if name == "knowledge.retrieve":
            continue
        events.append(
            {
                "type": "tool",
                "stage": "react",
                "name": name,
                "status": "skipped",
                "id": f"tc_{name.replace('.', '_')}",
                "correlationId": corr,
                "snapshotId": snap_id,
                "reason": "sidecar observes registry; execution stays on Go until remote dispatch is complete",
            }
        )
    return events


def iter_run_events(
    *,
    corr: str,
    snap_id: str,
    model_id: str,
    text: str,
    tools: list[str],
    user_input: str,
    provider: str,
    chunks: list[str],
) -> Iterator[dict[str, Any]]:
    yield {
        "type": "stage",
        "stage": "runtime",
        "status": "running",
        "correlationId": corr,
        "snapshotId": snap_id,
        "modelId": model_id,
        "runtimeMode": "remote",
    }
    for ev in tool_events(tools, corr=corr, snap_id=snap_id, user_input=user_input):
        yield ev
    for chunk in chunks:
        yield {
            "type": "delta",
            "stage": "runtime",
            "text": chunk,
            "correlationId": corr,
            "snapshotId": snap_id,
            "modelId": model_id,
        }
    yield {
        "type": "done",
        "stage": "done",
        "text": text,
        "correlationId": corr,
        "snapshotId": snap_id,
        "modelId": model_id,
        "mode": "direct",
        "runtimeMode": "remote",
        "provider": provider,
    }
