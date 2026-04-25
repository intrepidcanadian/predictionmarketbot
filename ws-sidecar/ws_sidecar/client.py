"""Polymarket CLOB WebSocket client (public market channel)."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime

import websockets

logger = logging.getLogger(__name__)

async def run_once(token_ids: list[str], ws_url: str, duration: float = 30.0) -> None:
    """Connect, subscribe to market channel, log messages for `duration` seconds."""
    async with websockets.connect(ws_url) as ws:
        logger.info("WS connected to %s", ws_url)

        sub_msg = json.dumps({"type": "subscribe", "assets_ids": token_ids})
        await ws.send(sub_msg)
        logger.info("Subscribed to %d token(s): %s...", len(token_ids), token_ids[0][:16])

        deadline = asyncio.get_event_loop().time() + duration
        async for raw in ws:
            now = datetime.now(UTC).isoformat()
            try:
                payload = json.loads(raw)
                events = payload if isinstance(payload, list) else [payload]
                for ev in events:
                    ev_type = ev.get("event_type") or ev.get("type") or "unknown"
                    asset = ev.get("asset_id", "?")[:16]
                    logger.info("[%s] event_type=%s asset_id=%s...", now, ev_type, asset)
            except Exception:
                logger.warning("[%s] raw=%s", now, raw[:120])

            if asyncio.get_event_loop().time() > deadline:
                logger.info("Duration elapsed, closing connection")
                break
