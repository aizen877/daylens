"""CLI parser and command execution entrypoint for DayLens."""
from __future__ import annotations

import argparse
from http.server import ThreadingHTTPServer

from daylens.collector import demo, track
from daylens.config import DB_PATH
from daylens.db import connect, report
from daylens.server import Handler


class ReusableHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def main() -> None:
    parser = argparse.ArgumentParser(description="DayLens privacy-first activity tracker")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    demo_parser = sub.add_parser("demo")
    demo_parser.add_argument("--hours", type=float, default=2)
    track_parser = sub.add_parser("track")
    track_parser.add_argument("--interval", type=int, default=5)
    sub.add_parser("report")
    dash = sub.add_parser("dashboard")
    dash.add_argument("--host", default="127.0.0.1")
    dash.add_argument("--port", type=int, default=8777)
    args = parser.parse_args()

    if args.command == "init":
        connect().close()
        print(f"Initialized {DB_PATH}")
    elif args.command == "demo":
        print(f"Inserted {demo(args.hours)} demo activities into {DB_PATH}")
    elif args.command == "track":
        track(args.interval)
    elif args.command == "report":
        print(report())
    elif args.command == "dashboard":
        connect().close()
        port = args.port
        import sys, threading
        if sys.platform == "win32":
            t = threading.Thread(target=track, args=(5,), daemon=True)
            t.start()
            print("Background Windows tracker started (5s sampling).")
        print(f"Dashboard running at: http://{args.host}:{port}")
        try:
            ReusableHTTPServer((args.host, port), Handler).serve_forever()
        except OSError:
            port = 8788
            print(f"Port fallback -> Dashboard running at: http://{args.host}:{port}")
            ReusableHTTPServer((args.host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
