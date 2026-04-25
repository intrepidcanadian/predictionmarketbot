from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field


class SidecarConfig(BaseModel):
    ws_url: str = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
    token_ids: list[str] = Field(default_factory=list)
    snapshot_interval: float = 1.0
    volume_windows: list[int] = Field(default_factory=lambda: [60, 300, 900])
    health_port: int = 8790
    trades_dir: str = "ws-sidecar"
    snapshots_dir: str = "ws-sidecar/snapshots"
    volumes_dir: str = "ws-sidecar/volumes"
    backoff_min: float = 1.0
    backoff_max: float = 60.0
    backoff_factor: float = 2.0

    @classmethod
    def load(cls, subs_path: Path) -> "SidecarConfig":
        if subs_path.exists():
            data = json.loads(subs_path.read_text())
            return cls(**data)
        return cls()
