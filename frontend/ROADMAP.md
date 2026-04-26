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
- [ ] **A10** — Persist filter preferences: view mode, sort column, minEdge, category pill, minMatch grade, Kalshi category selection, and auto-scan interval survive page reloads via localStorage
