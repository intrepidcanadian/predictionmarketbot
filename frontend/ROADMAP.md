# Frontend Roadmap

Milestones are picked up one at a time by the hourly builder. Check off each when verified in-browser.

## Original milestones (COMPLETE)

- [x] **M0** — Scaffold: Next.js 16 app router + shadcn/ui + Tailwind, skeletal nav layout, all stub routes rendering
- [x] **M1** — Markets browser: proxy Polymarket Gamma API through route handler, search + tag filter, price display
- [x] **M2** — Rules list: read `executor/rules/*.json`, display with state.status pills, toggle enabled, delete
- [x] **M3** — Rule builder: form for trigger/action/guardrail fields, live validation against rule schema, save to disk
- [x] **M4** — Audit feed: tail `executor/audit.jsonl`, reverse chronological, expandable JSON records
- [x] **M5** — Approvals inbox: list `executor/approvals/pending/`, one-click approve (move to approved/)
- [x] **M6** — Signals editor: key/value UI over `executor/signals.json`, save in place
- [x] **M7** — Positions + PnL panel: live data from Polymarket Data API, wallet address input
- [x] **M8** — LLM-assisted rule drafting: English → JSON → review modal → save
- [x] **M9** — End-to-end browser walkthrough: all features verified, no console errors

## Arb Scanner milestones

- [x] **A1** — Resolution criteria panel: fetch and display resolution text from both markets side-by-side when a pair is selected, so user can verify identical resolution before trading
- [x] **A2** — Real executable prices: show Polymarket CLOB bid/ask depth + Kalshi yes_bid/ask/no_bid/ask for the selected pair (not just mid); compute spread using ask prices (conservative, what you'd actually pay)
- [x] **A3** — Fee-adjusted net spread: display gross spread, Kalshi fee (~7% of profit), Poly spread cost (~1–2¢), and net spread after fees; add a break-even notional size calculator
- [x] **A4** — Spread history: append each auto-scan result to `frontend/arb-history.jsonl`; show a sparkline or table of spread-over-time for tracked pairs
- [x] **A5** — Kalshi coverage expansion: paginate Kalshi events (cursor), add category filter pills, filter out markets where yes_ask + no_ask > 1.10 (illiquid/mispriced), show market count badge
- [x] **A6** — Arb-to-rule bridge: "Create Rule" button on a selected pair pre-fills the rule builder (target from Polymarket market, trigger=price_cross, action=limit_order, guardrails with dry_run+require_manual_approval)
- [x] **A7** — Auto-refresh scan: configurable interval (1m/2m/5m/10m) with countdown timer, auto toggle button, and "N changed" diff badge when results shift between scans
- [x] **A8** — Pair match quality scoring: keyword overlap + date proximity scores combined into H/M/L grade badge shown in table column (sortable) and detail panel with progress-bar breakdown and contextual warning text
- [x] **A9** — Min-match filter + history pruning: "Match: All / Med+ / High" filter pills in the filter row to hide false positives; JSONL history capped at 500 entries (prune on each POST)
- [x] **A10** — Persist filter preferences: view mode, sort column, minEdge, category pill, minMatch grade, Kalshi category selection, and auto-scan interval survive page reloads via localStorage
- [x] **A11** — Browser notifications for spread alerts: Bell button with threshold presets (>5%/>10%/>20%); fires a native browser notification when auto-scan finds a new pair exceeding the threshold; de-duplicated per session to avoid spam
- [x] **A12** — Alert history log: persist every fired notification to `frontend/alert-log.jsonl` via `/api/alert-log`; show a collapsible "Recent Alerts" panel (last 10 entries) next to the Bell button with an unread count badge; prune log to 100 entries
- [x] **A13** — Deep-link / shareable pair state: when a pair is selected the URL updates to `?pair=<id>` (shallow); on page load with `?pair=` set, auto-run a scan then auto-select the matching pair; add "Copy Link" button in the ArbDetail header so users can share or bookmark a specific arb opportunity
- [x] **A14** — Pair watchlist: ★ star button on each table row and in the detail drawer header; starred pair IDs persist in localStorage; "Starred (N)" toggle in the filter row shows only starred pairs; dedicated empty state when watchlist is empty
- [x] **A15** — CardView/TickerView stars + per-pair JSONL history cap: star button on every card in CardView and each row in TickerView (using `div[role=button]` to avoid nested-button HTML error); per-pair cap of 100 entries in `arb-history.jsonl` POST pruning (in addition to the existing global 500-entry cap)
- [x] **A16** — Clear watchlist + filter URL preservation: "×" clear button next to "Starred (N)" auto-hides when watchlist is empty; `selectOpp` encodes active non-default filters (minEdge, minMatch, cat, view) into the `?pair=` URL so Copy Link captures the full view state; mount effect reads those params back and applies them on deep-link load
- [x] **A17** — LLM-assisted match scoring: `POST /api/arb/match-score` calls `claude-haiku-4-5-20251001` with the two market titles and returns a 0–100 semantic similarity score + one-sentence verdict + H/M/L grade; shown as "AI Similarity" card in the detail drawer (below match quality); graceful "Set ANTHROPIC_API_KEY" message when key is absent; display-only, not in trade path
- [x] **A18** — Session AI score cache + full resolution text: cache AI scores by `opp.id` in a `Map` ref at `ArbPage` level (avoid re-calling Haiku when re-opening the same pair); add `slug` field to `ScanOpp`; fetch `/api/arb/resolution` in `ArbDetail` on pair open and expand the "Resolution criteria" panel to show the full description/rules text (scrollable, with loading skeleton); amber "Verify both sides resolve identically" banner at the bottom of the panel
- [x] **A19** — Resolution-aware AI scoring: sequence resolution fetch before AI score call; pass first 400 chars of each side's resolution text to `/api/arb/match-score` so Haiku scores on what markets actually resolve on (not just titles); show "scored on: resolution text" vs "scored on: titles only" sub-label in AI Similarity card
- [x] **A20** — CardView hydration fix + resolution keyword diff: change CardView outer `<button>` to `<div role="button">` eliminating the SSR button-in-button hydration warning; add a "Key term diff" panel below the resolution criteria showing tokens unique to each side (Poly-only in blue, Kalshi-only in emerald), making false positives immediately obvious
- [x] **A21** — Shared key terms + min liquidity filter: extend `computeResDiff` to return `shared[]` (intersection set, capped at 10); display as a violet "Shared terms — positive signal for true match" row below the diff panel; add `minLiquidity` persisted filter (`arb:min-liq`, default 0) with "Liq: Any/$500/$1K/$5K" pill group in filter row, filtered on `Math.min(poly.liq, kalshi.liq)`
- [x] **A22** — Venue deep links + CSV export + dual-title table column: add "↗ Poly" and "↗ Kalshi" external links in the ArbDetail drawer header; add an "Export" button that downloads current filtered results as a CSV file (client-side, no API route); show the matched Kalshi market title below each Polymarket question in the table's Market column for instant false-positive triage without opening the drawer
