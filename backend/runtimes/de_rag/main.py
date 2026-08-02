#!/usr/bin/env python3
"""RAG service: published-only retrieve with vector-memory or optional Milvus."""
from __future__ import annotations

import json
import math
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

DEFAULT_PUBLISHED = [
    {
        "docId": "kd-1",
        "title": "故障手册-缓存",
        "snippet": "检查 Redis 慢查询与热点 key",
        "score": 0.91,
        "status": "published",
    },
    {
        "docId": "kd-2",
        "title": "发布手册-灰度",
        "snippet": "先金丝雀 5% 流量再全量",
        "score": 0.88,
        "status": "published",
    },
]

_TOKEN = re.compile(r"[\w\u4e00-\u9fff]+", re.UNICODE)
COLLECTION = "de_published_docs"
DIM = 64


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN.findall(text or "")]


def embed(text: str) -> dict[str, float]:
    counts: dict[str, float] = {}
    for t in tokenize(text):
        counts[t] = counts.get(t, 0.0) + 1.0
    norm = math.sqrt(sum(v * v for v in counts.values())) or 1.0
    return {k: v / norm for k, v in counts.items()}


def dense_embed(text: str, dim: int = DIM) -> list[float]:
    """Deterministic hashing trick → fixed-dim unit vector for Milvus."""
    vec = [0.0] * dim
    for t in tokenize(text):
        h = hash(t)
        vec[h % dim] += 1.0
        vec[(h // dim) % dim] += 0.5
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0.0) for k, v in a.items())


class VectorIndex:
    def __init__(self) -> None:
        self.docs: list[dict] = []
        self.vectors: list[dict[str, float]] = []
        self.reindex(DEFAULT_PUBLISHED)

    def reindex(self, docs: list[dict]) -> int:
        published = [d for d in docs if (d.get("status") or "published") == "published"]
        self.docs = published
        self.vectors = [embed(f"{d.get('title', '')} {d.get('snippet', '')}") for d in published]
        return len(published)

    def ingest(self, docs: list[dict]) -> int:
        """Upsert published docs (chunk-light: one vector per doc)."""
        by_id = {
            str(d.get("docId") or d.get("id")): d
            for d in self.docs
            if str(d.get("docId") or d.get("id"))
        }
        for d in docs:
            if (d.get("status") or "published") != "published":
                continue
            did = str(d.get("docId") or d.get("id") or "")
            if not did:
                continue
            by_id[did] = d
        return self.reindex(list(by_id.values()))

    def search(self, query: str, top_k: int = 8) -> list[dict]:
        qv = embed(query)
        scored: list[tuple[float, dict]] = []
        for doc, vec in zip(self.docs, self.vectors):
            score = cosine(qv, vec)
            q = (query or "").lower()
            if q and score <= 0:
                blob = f"{doc.get('title', '')} {doc.get('snippet', '')}".lower()
                if q in blob:
                    score = 0.35
            if not q:
                score = float(doc.get("score") or 0.5)
            if score > 0:
                hit = dict(doc)
                hit["score"] = round(score, 4)
                scored.append((score, hit))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [h for _, h in scored[:top_k]]


class MilvusIndex:
    """Optional Milvus / Milvus-Lite backend (DE_MILVUS_URI)."""

    def __init__(self, uri: str) -> None:
        from pymilvus import DataType, MilvusClient  # type: ignore

        self.client = MilvusClient(uri)
        self.uri = uri
        if COLLECTION in self.client.list_collections():
            self.client.drop_collection(COLLECTION)
        schema = self.client.create_schema(auto_id=False, enable_dynamic_field=True)
        schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=64)
        schema.add_field("title", DataType.VARCHAR, max_length=512)
        schema.add_field("snippet", DataType.VARCHAR, max_length=2048)
        schema.add_field("status", DataType.VARCHAR, max_length=32)
        schema.add_field("vector", DataType.FLOAT_VECTOR, dim=DIM)
        idx = self.client.prepare_index_params()
        idx.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
        self.client.create_collection(COLLECTION, schema=schema, index_params=idx)
        self.reindex(DEFAULT_PUBLISHED)

    def reindex(self, docs: list[dict]) -> int:
        published = [d for d in docs if (d.get("status") or "published") == "published"]
        if COLLECTION in self.client.list_collections():
            # recreate for simple sync semantics
            self.client.drop_collection(COLLECTION)
            schema = self.client.create_schema(auto_id=False, enable_dynamic_field=True)
            from pymilvus import DataType  # type: ignore

            schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=64)
            schema.add_field("title", DataType.VARCHAR, max_length=512)
            schema.add_field("snippet", DataType.VARCHAR, max_length=2048)
            schema.add_field("status", DataType.VARCHAR, max_length=32)
            schema.add_field("vector", DataType.FLOAT_VECTOR, dim=DIM)
            idx = self.client.prepare_index_params()
            idx.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
            self.client.create_collection(COLLECTION, schema=schema, index_params=idx)
        if not published:
            return 0
        rows = []
        for d in published:
            text = f"{d.get('title', '')} {d.get('snippet', '')}"
            rows.append(
                {
                    "id": str(d.get("docId") or d.get("id")),
                    "title": str(d.get("title") or "")[:512],
                    "snippet": str(d.get("snippet") or "")[:2048],
                    "status": "published",
                    "vector": dense_embed(text),
                }
            )
        self.client.insert(COLLECTION, rows)
        return len(rows)

    def search(self, query: str, top_k: int = 8) -> list[dict]:
        res = self.client.search(
            COLLECTION,
            data=[dense_embed(query)],
            limit=top_k,
            output_fields=["title", "snippet", "status"],
        )
        hits: list[dict] = []
        for batch in res:
            for row in batch:
                ent = row.get("entity") or {}
                hits.append(
                    {
                        "docId": row.get("id"),
                        "title": ent.get("title"),
                        "snippet": ent.get("snippet"),
                        "status": ent.get("status") or "published",
                        "score": round(float(row.get("distance") or 0), 4),
                    }
                )
        return hits


def build_index():
    uri = (os.environ.get("DE_MILVUS_URI") or "").strip()
    if uri:
        try:
            idx = MilvusIndex(uri)
            return idx, "milvus"
        except Exception as exc:  # noqa: BLE001
            print(f"milvus unavailable ({exc}), falling back to vector-memory")
    return VectorIndex(), "vector-memory"


INDEX, BACKEND = build_index()


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
            n = len(getattr(INDEX, "docs", []) or [])
            if BACKEND == "milvus":
                try:
                    n = INDEX.client.get_collection_stats(COLLECTION).get("row_count", n)  # type: ignore[attr-defined]
                except Exception:  # noqa: BLE001
                    pass
            self._json(
                200,
                {
                    "status": "ok",
                    "service": "rag",
                    "mode": "published-only",
                    "backend": BACKEND,
                    "indexed": n,
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
        if self.path == "/v1/retrieve":
            corr = data.get("correlationId") or ""
            if data.get("docs") and BACKEND != "milvus":
                tmp = VectorIndex()
                tmp.reindex(data["docs"])
                results = tmp.search(data.get("query") or "")
                backend = "vector-memory"
            else:
                if data.get("docs"):
                    INDEX.reindex(data["docs"])
                results = INDEX.search(data.get("query") or "")
                backend = BACKEND
            self._json(
                200,
                {
                    "query": data.get("query"),
                    "results": results,
                    "backend": backend,
                    "correlationId": corr,
                    "publishedOnly": True,
                },
            )
            return
        if self.path == "/v1/sync":
            docs = data.get("docs") or []
            n = INDEX.reindex(docs)
            self._json(200, {"indexed": n, "backend": BACKEND})
            return
        if self.path == "/v1/ingest":
            docs = data.get("docs") or []
            if hasattr(INDEX, "ingest"):
                n = INDEX.ingest(docs)
            else:
                n = INDEX.reindex(docs)
            self._json(200, {"indexed": n, "backend": BACKEND, "mode": "ingest"})
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt: str, *args) -> None:
        return


if __name__ == "__main__":
    import os

    host = os.environ.get("DE_BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("DE_BIND_PORT", "8092"))
    print(f"de-rag on http://{host}:{port} backend={BACKEND}")
    HTTPServer((host, port), Handler).serve_forever()
