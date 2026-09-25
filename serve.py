#!/usr/bin/env python3
"""Serve this folder, trying the next available port when one is occupied."""
import functools
import http.server
import pathlib
import sys
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(pathlib.Path(__file__).parent))
for port in range(int(sys.argv[1]) if len(sys.argv) > 1 else 8000, 8101):
    try:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
        break
    except OSError:
        continue
else:
    raise SystemExit('No available port; pass a starting port below 8101.')
print(f'SiteLens Sim: http://localhost:{port}', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
