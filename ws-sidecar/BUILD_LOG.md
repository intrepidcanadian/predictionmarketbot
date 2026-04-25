# WS Sidecar Build Log

Each run appends one entry. Coordinate state through this file and ROADMAP.md.

---

## 2026-04-25T13:41:00Z — milestone 0: Package skeleton

### What I did
- Initialized git repo at project root; created `.gitignore`.
- Created `ws-sidecar/` package with:
  - `pyproject.toml` — `ws-sidecar` package, Python 3.12 venv, deps: `pydantic>=2.5`, `websockets>=12.0`.
  - `ws_sidecar/config.py` — `SidecarConfig` pydantic model (ws_url, token_ids, snapshot_interval, volume_windows, health_port, output dirs, backoff params). Loads from `subscriptions.json`.
  - `ws_sidecar/client.py` — `run_once()` async function: connects to WS, sends subscription, logs events for a configurable duration.
  - `ws_sidecar/__main__.py` — CLI entry point with `test` subcommand.
  - `subscriptions.json` — seeded with two token IDs for "US x Iran ceasefire" (highest 24h-volume market as of 2026-04-25).
  - `tests/__init__.py` — empty, ready for milestone 1 tests.
  - `ROADMAP.md` — 11 ordered milestones with checkboxes.
- Discovered correct WS endpoint: `wss://ws-subscriptions-clob.polymarket.com/ws/market` (channel in URL path, not in subscription body).
- Subscription format: `{"type": "subscribe", "assets_ids": [...]}`

### Verification command + observed output
```
ws-sidecar/.venv/bin/ws-sidecar --subs ws-sidecar/subscriptions.json test --duration 15
```
```
2026-04-25 13:40:34,252 INFO ws_sidecar.client: WS connected to wss://ws-subscriptions-clob.polymarket.com/ws/market
2026-04-25 13:40:34,253 INFO ws_sidecar.client: Subscribed to 2 token(s): 5004964214202461...
2026-04-25 13:40:34,345 INFO ws_sidecar.client: [2026-04-25T05:40:34.344321+00:00] event_type=book asset_id=5004964214202461...
2026-04-25 13:40:34,345 INFO ws_sidecar.client: [2026-04-25T05:40:34.344321+00:00] event_type=book asset_id=1109596534509332...
2026-04-25 13:41:01,099 INFO ws_sidecar.client: [2026-04-25T05:41:01.095462+00:00] event_type=price_change asset_id=?...
2026-04-25 13:41:01,101 INFO ws_sidecar.client: Duration elapsed, closing connection
```
Received `book` snapshots for both tokens immediately on subscribe, then a `price_change` event ~27 s later. Connection clean.

### Executor tests
```
35 passed in 0.19s
```

### Tradeoffs / shortcuts
- `asset_id=?` on `price_change` because those events wrap deltas in a `price_changes` array (not a top-level `asset_id`). Parsing is milestone 1.
- Venv uses Python 3.12 (system 3.9 is default on this machine). The installed `ws-sidecar` script shebang uses the full `python3.12` path so the CLI works correctly.

### Follow-ups
- Milestone 1 must parse `price_changes` nested format and maintain per-token orderbook.
- The `book` event shape appears to be `[{market, asset_id, timestamp, ...bids/asks}]` (a list), while `price_change` shape is `{market, price_changes: [{asset_id, price, ...}]}`. Confirm exact shape in milestone 1 by printing full raw messages.

### Next milestone
**Milestone 1 — Orderbook maintenance**: parse `book` snapshot and `price_change` delta events; maintain in-memory orderbook per token; unit tests for book-merge logic.
