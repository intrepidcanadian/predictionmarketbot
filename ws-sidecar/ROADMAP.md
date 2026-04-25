# WS Sidecar Roadmap

Ordered milestones. Each run picks the next unchecked item. Do ONE milestone per run.

- [x] **0 — Package skeleton** — pyproject.toml, src layout, pydantic config model, `__main__`, basic WS client that connects + prints messages. Verify: actual live connection log line.
- [ ] **1 — Orderbook maintenance** — parse `book` (snapshot) and `price_change` (delta) events; maintain in-memory orderbook per token; unit tests for the book merge logic.
- [ ] **2 — Trade log** — parse `last_trade_price` events; append to `ws-sidecar/trades.jsonl` (one JSON line per trade, rotated daily by filename `trades-YYYY-MM-DD.jsonl`); unit test.
- [ ] **3 — Snapshot writer** — periodically (every 1 s) write atomic snapshot per token to `ws-sidecar/snapshots/<token_id>.json` (best bid/ask, mid, spread, last trade); unit test atomic write.
- [ ] **4 — Volume windows** — rolling per-token volume summary over configurable windows (60 s, 300 s, 900 s); write to `ws-sidecar/volumes/<token_id>.json`; unit test windowed aggregation.
- [ ] **5 — Reconnect + resubscribe** — exponential backoff on disconnect; resubscribe on reconnect; log every reconnect event; integration test with a mock WS server that drops connections.
- [ ] **6 — Health endpoint** — small HTTP server (stdlib asyncio or aiohttp) on configurable port (default 8790); `GET /health` returns last-message timestamp per token as JSON.
- [ ] **7 — Graceful shutdown** — SIGTERM/SIGINT → flush in-flight writes, close WS, stop HTTP server cleanly. Manual verification.
- [ ] **8 — Executor integration: FilesystemMarketDataSource** — add `FilesystemMarketDataSource` to `executor/executor/market_data.py` that reads `ws-sidecar/snapshots/<token_id>.json`; gate with `--data-source=filesystem` CLI flag; all executor tests green; add unit tests for new code path.
- [ ] **9 — Executor integration: volume_spike trigger** — wire `executor/executor/triggers.py::_volume_spike` to read `ws-sidecar/volumes/<token_id>.json`; unit test that `volume_spike` fires when threshold exceeded; end-to-end tick test with filesystem data source.
- [ ] **10 — End-to-end verification** — run sidecar + executor together for ≥60 s against live Polymarket data; confirm `volume_spike` fires on real trades; write `## WS SIDECAR COMPLETE` to BUILD_LOG.md.
