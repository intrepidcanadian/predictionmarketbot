# Frontend Build Log

Append-only log. Each run records what was done, tradeoffs, and what to pick up next.

---

## 2026-04-25T00:00:00Z — milestone M0: Scaffold + skeletal layout

### What I did
- Scaffolded Next.js 16.2.4 app with TypeScript, Tailwind v4, ESLint via `bun create next-app@latest`
- Initialized shadcn/ui with `bunx shadcn@latest init --defaults`, added: button, sidebar, badge, tabs, card, separator, scroll-area, tooltip components
- Replaced default `app/layout.tsx` with root layout that includes `<NavSidebar />` + `<TooltipProvider />`
- Created `components/nav-sidebar.tsx` — `"use client"` component with active-link highlighting via `usePathname`
- Created stub pages: `/markets`, `/rules`, `/audit`, `/approvals`, `/positions`, `/signals`
- Root `/` redirects to `/markets` via `redirect()`
- Created `.claude/launch.json` for preview tool (runs `bun run dev` in frontend/)
- Confirmed executor venv needed Python 3.12 (system Python 3.9 incompatible); created `.venv` with `/opt/homebrew/bin/python3.12`
- Read Next.js 16 upgrade guide — key breaking change: `params`/`searchParams` must be awaited (async); Turbopack default; `middleware` renamed to `proxy`

### Tradeoffs / shortcuts
- Used `lucide-react` (already in package.json from shadcn scaffolding) for nav icons
- Sidebar is a fixed-width `aside` (not collapsible) — simple enough for localhost use
- Skipped `next/font` optimization concerns; Geist fonts are fine for local dev

### Verified by
- `curl -sL http://localhost:3111/markets` → HTTP 200, page HTML contains "Markets", sidebar nav items, "Polymarket Bot" title
- All 6 stub routes return 200: `/markets`, `/rules`, `/audit`, `/approvals`, `/positions`, `/signals`
- Executor test suite: 35 passed, 0 failed (Python 3.12, pytest 9.0.3)
- Preview tool had connection issues (serverId not found after start); verified via curl instead

### Follow-ups for future runs
- Preview tool `.claude/launch.json` uses `sh -c "cd ... && bun run dev"` — works but fragile if path changes
- Next.js 16 `params` must be awaited — ensure dynamic route pages use `await props.params`
- M1 (Markets browser) requires proxying Gamma API via route handler to avoid CORS

### Next milestone to pick up
**M1** — Markets browser: proxy Gamma API through `/api/markets` route handler, search + tag filter, price cards

---

## 2026-04-25T05:45:00Z — milestone M1: Markets browser

### What I did
- Created `app/api/markets/route.ts` — GET handler proxying `https://gamma-api.polymarket.com/markets`. Forwards params: limit (40), q→search, tag→tag_slug, closed, active, offset. Normalizes response: parses `outcomes` and `outcomePrices` from JSON-encoded strings into actual arrays. Uses `next: { revalidate: 30 }` to cache Gamma fetches.
- Rewrote `app/markets/page.tsx` as a client component with:
  - Debounced (300ms) search input with Search icon
  - 8 tag filter pills: All, Politics, Elections, Crypto, Sports, Science, Finance, Entertainment
  - 3-column responsive grid of `MarketCard` components
  - Skeleton loading state (12 placeholder cards), error banner, empty state
  - `MarketCard`: shows question, Active/Closed badge, Yes/No outcome labels, horizontal price bars (green/red), percentage prices, volume, liquidity, end date

### Tradeoffs / shortcuts
- Tag slugs hardcoded — Gamma has no clean `/tags` endpoint; covers the common cases
- No pagination UI — route handler accepts `offset` but no next/prev buttons yet
- `revalidate: 30` means data can be 30s stale — fine for local dashboard

### Verified by
- `bun run build` — compiled cleanly, 0 TypeScript errors
- `python -m pytest` in `executor/` — 35/35 pass
- Preview at `http://localhost:3111/markets` (1280×900): 40 live market cards from Gamma API, prices rendering as percentages (Yes: 53%, No: 48% on first card), green/red price bars, Vol/Liq/Ends metadata, tag filter pills active

### Follow-ups for future runs
- Add pagination (offset wired in route, needs prev/next UI)
- Market cards could link out to polymarket.com
- Tag discovery could pull from Gamma events API

### Next milestone to pick up
**M2** — Rules list: read `executor/rules/*.json`, display with state.status pills, toggle enabled, delete

---

## 2026-04-25T01:30:00Z — milestone M2: Rules list

### What I did
- Created `app/api/rules/route.ts` — GET reads all `executor/rules/*.json`, POST creates new rule file
- Created `app/api/rules/[id]/route.ts` — PATCH merges updates, DELETE removes rule file; uses `await props.params` (Next.js 16 async params)
- Rewrote `app/rules/page.tsx` as client component with:
  - `RuleCard`: status pill (armed/cooling_down/disabled/paused_by_guardrail) with color coding, trigger type badge, action label, dry-run warning, last-fired-at + fires-today footer
  - Toggle enabled via Switch component + PATCH API
  - Delete with confirm dialog + DELETE API
  - Skeleton loading state, error banner, empty state with refresh

### Tradeoffs / shortcuts
- Rules page uses "use client" + fetch on mount — no SSR. Fine for a local tool.
- Status inferred from `rule.state?.status` with fallback to "armed" if enabled and no state set
- Parallel runs wrote M2 concurrently with M0/M1 work; all three were committed together

### Verified by
- `bun run build` — exit code 0, routes: /api/rules (ƒ), /api/rules/[id] (ƒ), /rules (○)
- `python -m pytest` in executor/ — 35/35 pass

### Follow-ups for future runs
- Rule list has no "New Rule" button yet — that's M3 (rule builder)
- Could add edit link per rule once builder exists

### Next milestone to pick up
**M3** — Rule builder: form for trigger/action/guardrail fields, live validation, save to disk

---

## 2026-04-25T02:30:00Z — milestone M3: Rule builder form

### What I did
- Added shadcn components: `select.tsx`, `label.tsx`, `textarea.tsx`
- Created `app/rules/new/page.tsx` — full multi-section form:
  - General: name (auto-fills ID slug), ID, notes, enabled toggle
  - Target: condition_id, token_id, market_slug (informational), side (YES/NO)
  - Trigger: type selector + per-trigger fields for all 7 trigger types (price_cross, price_move, volume_spike, orderbook_imbalance, time_before_resolution, scheduled, external_signal)
  - Action: type selector + per-action fields for all 5 action types (limit_order, marketable_order, close_position, cancel_open_orders, notify_only)
  - Guardrails: dry_run toggle, max_position_usd, max_daily_loss_usd, cooldown_seconds, max_fires_per_day, kill_if_liquidity_below_usd, disable_after, require_manual_approval
- Client-side validation before submit (required fields, range checks, type-specific checks)
- POST to `/api/rules` on save, redirect to `/rules` on success
- Added "New Rule" button + link to rules list page header

### Tradeoffs / shortcuts
- No `condition` (all_of predicates) section in the builder — condition types are useful but add significant UI complexity; can add in a future milestone
- ID auto-fills from name but user can override; validation enforces URL-safe slug format
- Base UI Select's `onValueChange` passes `string | null` (not `string`) — added null coalescing throughout

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `curl http://localhost:3112/rules/new` → 200, `curl http://localhost:3112/rules` → 200
- `python -m pytest` — 35/35 pass

### Follow-ups for future runs
- Add `condition` section (all_of predicates) to the rule builder
- Add edit flow for existing rules (link from rule card)

### Next milestone to pick up
**M4** — Audit feed: tail `executor/audit.jsonl`, reverse chronological, expandable JSON records
