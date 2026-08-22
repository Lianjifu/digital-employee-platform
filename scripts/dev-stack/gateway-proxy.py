#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.error
import urllib.request

ROUTES = [
    ("/agent", 8101), ("/api/copilot", 8101), ("/api/conversations", 8101), ("/api/sessions", 8101), ("/api/actions", 8101),
    ("/api/share", 8101), ("/api/attachments", 8101),
    ("/api/tasks", 8101), ("/api/digital-employees", 8101), ("/api/digital-employee-", 8101),
    ("/api/agents", 8101), ("/api/slash-commands", 8101),
    ("/api/workflows", 8103), ("/api/workflow-", 8103),
    ("/api/model", 8102), ("/api/knowledge", 8102), ("/api/memory", 8102), ("/api/skills", 8102),
    ("/api/skill-", 8102), ("/api/platform-tools", 8102), ("/api/mcp-connections", 8102), ("/api/tools", 8102),
    ("/api/channel", 8102), ("/api/channels", 8102),
    ("/v1/evaluate", 8100), ("/api/access", 8100), ("/api/zero-trust", 8100), ("/api/governance", 8100),
    ("/api/audit", 8100), ("/api/workspaces", 8100), ("/api/auth", 8100), ("/api/home", 8100),
    ("/api/operations", 8100), ("/api/billing", 8100), ("/api/backups", 8100), ("/api/tenant", 8100),
    ("/api/notification-channels", 8100), ("/api/api-keys", 8100),
    ("/de.collab.", 8101), ("/de.employee.", 8101), ("/de.rag.", 8102), ("/de.runtime.", 8102),
    ("/connect", 8100), ("/de.", 8100), ("/api", 8100), ("/healthz", 8100), ("/readyz", 8100), ("/metrics", 8100),
]
SKIP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
    "content-encoding", "host", "date", "server",
}


def pick(path: str) -> int:
    for prefix, port in ROUTES:
        if path.startswith(prefix):
            return port
    return 8100


def is_stream_path(path: str) -> bool:
    return "/stream" in path


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        return

    def _write_response_headers(self, status, headers):
        self.send_response(status)
        for k, v in headers.items():
            if k.lower() not in SKIP:
                self.send_header(k, v)
        self.end_headers()

    def _proxy_stream(self, resp, status, headers):
        self._write_response_headers(status, headers)
        if self.command == "HEAD":
            return
        while True:
            chunk = resp.read(8192)
            if not chunk:
                break
            self.wfile.write(chunk)
            self.wfile.flush()

    def _proxy_buffered(self, data, status, headers):
        self._write_response_headers(status, headers)
        if self.command != "HEAD":
            self.wfile.write(data)

    def _proxy(self):
        port = pick(self.path.split("?", 1)[0])
        url = f"http://127.0.0.1:{port}{self.path}"
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        req = urllib.request.Request(url, data=body, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in SKIP:
                req.add_header(k, v)
        stream = is_stream_path(self.path)
        timeout = 180 if stream else 60
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if stream:
                    self._proxy_stream(resp, resp.status, resp.headers)
                    return
                data = resp.read()
                self._proxy_buffered(data, resp.status, resp.headers)
        except urllib.error.HTTPError as e:
            if stream:
                self._proxy_stream(e, e.code, e.headers)
                return
            self._proxy_buffered(e.read(), e.code, e.headers)
        except Exception as e:
            data = f"gateway proxy error: {e}".encode()
            status = 502
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def do_GET(self):
        self._proxy()

    def do_POST(self):
        self._proxy()

    def do_PUT(self):
        self._proxy()

    def do_PATCH(self):
        self._proxy()

    def do_DELETE(self):
        self._proxy()

    def do_OPTIONS(self):
        self._proxy()

    def do_HEAD(self):
        self._proxy()


ThreadingHTTPServer(("127.0.0.1", 8089), H).serve_forever()
