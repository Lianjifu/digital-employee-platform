#!/usr/bin/env python3
"""Gateway for monolith stack: all API traffic → de-app :8100."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.error
import urllib.request

BACKEND_PORT = 8100
SKIP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
    "content-encoding", "host", "date", "server",
}


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        return

    def _proxy(self):
        url = f"http://127.0.0.1:{BACKEND_PORT}{self.path}"
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        req = urllib.request.Request(url, data=body, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in SKIP:
                req.add_header(k, v)
        timeout = 180 if "/stream" in self.path or "/copilot" in self.path else 60
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                status = resp.status
                headers = resp.headers
        except urllib.error.HTTPError as e:
            data = e.read()
            status = e.code
            headers = e.headers
        except Exception as e:
            data = f"gateway proxy error: {e}".encode()
            status = 502
            headers = {}
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_response(status)
        for k, v in headers.items():
            if k.lower() not in SKIP:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
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
