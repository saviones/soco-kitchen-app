#!/usr/bin/env python3
"""Static file server for local preview.

Deliberately chdir()s to its own directory before touching anything else:
the preview harness launches with a cwd under ~/Desktop, which macOS TCC
blocks this interpreter from reading, so http.server's os.getcwd() default
raises PermissionError before the server ever starts.

Honours $PORT so the preview panel can pick the port.
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

PORT = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8737))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # never cache during development — the service worker is aggressive enough
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving {ROOT} on http://127.0.0.1:{PORT}", flush=True)
        httpd.serve_forever()
