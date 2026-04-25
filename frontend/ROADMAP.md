# Frontend Roadmap

Milestones are picked up one at a time by the hourly builder. Check off each when verified in-browser.

## Milestones

- [x] **M0** — Scaffold: Next.js 16 app router + shadcn/ui + Tailwind, skeletal nav layout, all stub routes rendering
- [x] **M1** — Markets browser: proxy Polymarket Gamma API through route handler, search + tag filter, price display
- [x] **M2** — Rules list: read `executor/rules/*.json`, display with state.status pills, toggle enabled, delete
- [x] **M3** — Rule builder: form for trigger/action/guardrail fields, live validation against rule schema, save to disk
- [ ] **M4** — Audit feed: tail `executor/audit.jsonl`, reverse chronological, expandable JSON records
- [ ] **M5** — Approvals inbox: list `executor/approvals/pending/`, one-click approve (move to approved/)
- [ ] **M6** — Signals editor: key/value UI over `executor/signals.json`, save in place
- [ ] **M7** — Positions + PnL panel: stub data display, ready for live trading path hookup
- [ ] **M8** — LLM-assisted rule drafting: English → JSON → review modal → save (only after M3 is solid)
- [ ] **M9** — End-to-end browser walkthrough: all features verified, no console errors
