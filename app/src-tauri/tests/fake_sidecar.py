# Copyright 2026 Lakelet contributors
# SPDX-License-Identifier: Apache-2.0
"""A stand-in for ``lakelet serve`` for the supervisor's tests: takes the real arguments,
records them, writes ``.lakelet/serve.json`` the way core step 9 does, prints the
``serving`` line, then lives for LAKELET_FAKE_LIFETIME seconds (0: refuse and exit)."""

import json
import os
import secrets
import sys
import time

args = sys.argv[1:]
project = args[args.index("-C") + 1]
lifetime = int(os.environ.get("LAKELET_FAKE_LIFETIME", "60"))
lakelet_dir = os.path.join(project, ".lakelet")
os.makedirs(lakelet_dir, exist_ok=True)
with open(os.path.join(lakelet_dir, "fake-args.txt"), "w", encoding="utf-8") as f:
    f.write(" ".join(args))
    if "LAKELET_DEV_ORIGIN" in os.environ:
        f.write(f" env LAKELET_DEV_ORIGIN={os.environ['LAKELET_DEV_ORIGIN']}")

if lifetime == 0:
    print("fake sidecar refusing to start", file=sys.stderr)
    sys.exit(1)

port = 40000 + (os.getpid() % 10000)
with open(os.path.join(lakelet_dir, "serve.json"), "w", encoding="utf-8") as f:
    json.dump({"port": port, "pid": os.getpid(), "token": secrets.token_urlsafe(32), "started": "now"}, f)
print(f"serving http://127.0.0.1:{port}: /api (bearer token in serve.json) and /v1 (the catalog)")
print("Ctrl-C stops it.")
sys.stdout.flush()
time.sleep(lifetime)
