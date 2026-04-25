"""Entry point for the WS sidecar."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from .client import run_once
from .config import SidecarConfig

log = logging.getLogger(__name__)


def main() -> int:
    p = argparse.ArgumentParser(prog="ws-sidecar")
    p.add_argument(
        "--subs",
        type=Path,
        default=Path("ws-sidecar/subscriptions.json"),
        help="Path to subscriptions.json",
    )
    p.add_argument("--log-level", default="INFO")
    sub = p.add_subparsers(dest="cmd", required=True)

    test_p = sub.add_parser("test", help="connect and log messages for N seconds (smoke test)")
    test_p.add_argument("--duration", type=float, default=30.0)

    args = p.parse_args()
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    cfg = SidecarConfig.load(args.subs)

    if args.cmd == "test":
        if not cfg.token_ids:
            log.error("No token_ids configured in %s", args.subs)
            return 1
        asyncio.run(run_once(cfg.token_ids, cfg.ws_url, args.duration))

    return 0


if __name__ == "__main__":
    sys.exit(main())
