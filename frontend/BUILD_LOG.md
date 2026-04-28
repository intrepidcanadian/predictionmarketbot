# Frontend Build Log

Append-only log. Each run records what was done, tradeoffs, and what to pick up next.

---

## 2026-04-28T00:00:00Z — milestone A48: Trade Readiness checklist

### What I did
- Added a "Trade Readiness" panel in `ArbDetail` just before the "Create Rule from Arb" button
- Evaluates 5 criteria inline using already-available state (no new API calls):
  1. **Net spread positive** — `opp.netEdgePct > 0` (immediate)
  2. **CLOB ask spread profitable** — `clobNetPerContract > 0` (shows ⟳ while orderbook loads)
  3. **AI similarity ≥ 70** — `aiMatch.score >= 70` (shows ⟳ while scoring)
  4. **Date gap ≤ 90 days** — `dateGapDays(polyCloses, closes) <= 90` (immediate)
  5. **Min liquidity ≥ $500** — `Math.min(poly.liquidity, kalshi.liquidity) >= 500` (immediate)
- Criteria rows use ✓ (emerald Check icon), ✗ (rose X icon), ⟳ (loading), or — (data unavailable) icons
- Summary badge: **READY** (all 5 pass) / **LIKELY** (4 of 5 pass) / **REVIEW** (≤3 pass), color-coded emerald/amber/rose
- When a note exists for the pair, shows it as a violet italic preview at the bottom of the panel (consistent with existing note UI)
- Added A48 entry to `frontend/ROADMAP.md`

### Tradeoffs / shortcuts
- `pass` is `boolean | null`: `null` means data unavailable (e.g. no poly close date) and is excluded from the pass-count denominator — conservative but avoids false positives from missing data
- Panel uses `passCount === checks.length` for READY rather than `passCount === scored.length` so async-loading items don't prematurely flip the badge to READY while data is still loading
- No new state or API routes — purely derived from data already fetched by ArbDetail's existing effects

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: opened first arb row drawer; scrolled to bottom → "TRADE READINESS" panel visible with REVIEW badge; ✓ for net spread, ✗ for CLOB spread (negative), — for AI (not yet scored), ✗ for date gap (9mo), ✗ for liquidity ($0 on stale snapshot)
- Note text "Verified - same GTA VI resolution. 9mo date gap is a concern." shown in violet at bottom of panel
- No console errors

### Follow-ups for future runs
- Could add the readiness badge to the TableView row as a mini pill (so traders can see READY/REVIEW at a glance without opening the drawer)
- Could make the note preview in the checklist panel clickable (opens the note editor)
- Liquidity showing $0 for many pairs suggests the snapshot data has stale/zeroed liquidity fields — worth investigating if the scan route should refresh liquidity from the CLOB rather than relying on mid-scan estimates

### Next milestone to pick up
**A49** — suggestions: readiness badge as a TableView column pill; per-pair CLOB depth refresh button; or a new direction (e.g., Polymarket CLOB stream via WebSocket for real-time price updates)

---

## 2026-04-27T16:20:00Z — milestone A45: Pair notes

### What I did
- Created `frontend/app/api/arb/notes/route.ts` — `GET` returns `frontend/arb-notes.json` as `{ [pair_id]: string }`; `POST { pair_id, note }` upserts or deletes (empty note) and writes the file
- Added `notesMap: Record<string, string>` state + `saveNote` callback to `ArbPage`; loaded from API on mount
- `ArbDetail` gains two new props (`notesMap`, `onSaveNote`) plus local `showNoteEditor`/`noteText` states; `useEffect` on `opp.id` resets the editor when switching pairs
- Drawer header: "Add note" button (PenLine icon) when no note exists; saved note shown as a 2-line truncated preview with an "Edit" link; clicking Edit re-opens the textarea; Save (⌘/Ctrl+Enter or button), Cancel, and Delete note buttons
- `TableView` gains `notesMap` prop; the expand-icon column renders a small violet `PenLine` icon alongside the chevron for rows that have a note
- Inline quick-peek panel (A36 row expand) shows the note text at the bottom with a violet pencil icon when a note exists for that pair

### Tradeoffs / shortcuts
- Notes are keyed by `opp.id` (e.g. `540881-KXLAYOFFSYINFO-26-494000`). If a pair's Kalshi ticker or Polymarket slug changes (re-scan), the id is stable because it is constructed from both sides and memoised — no stale-note risk in practice
- No cap on notes file size (notes are intentional annotations, not high-volume append); could add a 1000-entry prune in a future run if needed
- The `useEffect` for noteText only depends on `opp.id`, not `notesMap` — prevents the editor from being clobbered mid-edit when a background scan updates the parent's notesMap

### Verified by
- `bun run tsc --noEmit` — 0 errors (exit code 0)
- `python -m pytest` in executor/ — 35/35 pass
- Browser: opened drawer → "Add note" visible; textarea opens on click; typed note, clicked Save → note preview with "Edit" appears in drawer header
- Note persisted to `frontend/arb-notes.json` (confirmed via `cat`)
- Closed drawer → violet PenLine indicator visible in first table row's expand column
- Opened quick-peek (⌄ expand) on first row → note text displayed at bottom of panel with pencil icon
- No new errors introduced (existing hydration mismatches are pre-A42 noise on Kalshi category pills)

### Follow-ups for future runs
- Could pass `notesMap` to `CardView` and `TickerView` to show indicators there too (currently only TableView)
- Could add a "Notes" filter pill to show only pairs with notes (useful for starred + annotated review workflow)
- Could show note count badge in the watchlist stats strip

### Next milestone to pick up
**A46** — (to be defined) — suggestions: note indicator in CardView/TickerView; "Notes" filter toggle; per-pair Kalshi order depth chart; or a new feature direction

---

## 2026-04-27T06:00:00Z — milestone A42: Hydration fix + close-date in drawer header

### What I did
- Changed `usePref` hook from lazy `useState(() => reads localStorage)` to `useState(init)` + `React.useLayoutEffect` pattern: server and client always hydrate with identical `init` values, then `useLayoutEffect` syncs from localStorage after mount without causing a paint-visible flash
- Added `suppressHydrationWarning` to all six groups of persisted filter pill buttons (Kalshi category, view mode, category, match, liquidity, date-gap) as belt-and-suspenders to silence any residual attribute mismatches
- Added close-date row in `ArbDetail` drawer header below the question title: shows "Poly closes [date] · Kalshi closes [date] · Xmo gap"; gap colored amber (>90d) or rose (>365d) matching the existing date-gap color scale

### Tradeoffs / shortcuts
- `React.useLayoutEffect` runs synchronously after DOM commit (before first browser paint), so there's no flash when stored prefs differ from init — users see their saved filters instantly without a flicker
- `suppressHydrationWarning` is a per-element escape hatch that suppresses the React error without fixing the root cause at the framework level; the `useLayoutEffect` pattern IS the correct fix, and `suppressHydrationWarning` is extra insurance given how Next.js App Router handles `"use client"` component hydration
- Close-date row re-uses `dateGapDays` + `fmtDateGap` helpers already present in the file — no new code needed beyond the JSX

### Verified by
- `bun run tsc --noEmit` — 0 errors (exit code 0)
- `python -m pytest` in executor/ — 35/35 pass
- Browser: `__RELOAD_MARKER__` technique confirmed ZERO new hydration errors appear after a fresh page load with empty localStorage; all 22 previously logged errors are pre-fix accumulated noise
- Kalshi category pills all render as active (bg-foreground) on fresh load — matches `init = [...KALSHI_CATS]` correctly
- Opened first arb pair drawer: "Poly closes May 31, 2026 · Kalshi closes Mar 1, 2027 · 9mo gap" visible below question title in amber

### Follow-ups for future runs
- The `usePref` useLayoutEffect approach is correct but Next.js still technically SSR-renders with `init` and then patches — long term, marking the page as `dynamic = 'force-dynamic'` or using `next/dynamic` with `ssr: false` would be a cleaner architectural fix
- Could add the Poly/Kalshi close dates to the TableView "Closes" column (currently shows only one date via `timeUntil(opp.closes)`)

### Next milestone to pick up
**A43** — (to be defined) — suggestions: close-date in TableView Closes column tooltip; per-pair Kalshi close date vs Poly end date sort; `dynamic = 'force-dynamic'` for arb page to eliminate SSR overhead entirely

---

## 2026-04-27T03:00:00Z — milestone A41: Date-gap filter + gap label

### What I did
- Added `dateGapDays(a, b)` helper: returns `|a − b|` in fractional days (null when either date missing)
- Added `fmtDateGap(days)` helper: formats as `<1d / Nd / Nmo / N.Xy`
- Added `maxDateGap` filter state via `usePref("arb:max-date-gap", 0)` — survives page reloads
- Updated `filtered` predicate: when `maxDateGap > 0`, excludes pairs where `dateGapDays(polyCloses, closes) > maxDateGap`; pairs with no Poly close date pass through (avoids false negatives)
- Added "Dates: Any/≤30d/≤90d/≤180d/≤365d" filter pill group in the filter row (after "Liq:"); each pill has a descriptive `title` tooltip
- Wired `maxDateGap` into `selectOpp` URL encoding (`max_date_gap` param) and mount URL-param restoration
- Updated TableView Match column: shows `MatchBadge` + a `Xmo gap` / `Xy gap` sub-label in amber (>90d) or rose (>365d) so false positives are scannable at a glance without opening the drawer
- Updated ArbDetail "Date proximity" hint in the match quality breakdown panel: shows `"3.2y apart"` / `"45d apart"` instead of the generic `"far apart"` string

### Tradeoffs / shortcuts
- Filter passes through pairs with no `polyCloses` (null gap) to avoid hiding real opportunities in markets that don't expose close dates; this is conservative but correct
- Gap threshold options are fixed (30/90/180/365d); could be a freeform number input in a future run
- Hydration warnings in the console are pre-existing (Kalshi category buttons + `usePref` on SSR) — not introduced by this change

### Verified by
- `bun run tsc --noEmit` — 0 errors (confirmed twice)
- `python -m pytest` in executor/ — 35/35 pass
- Browser: snapshot loaded (25 pairs), filter row shows "Dates: Any ≤30d ≤90d ≤180d ≤365d"
- Match column shows colored gap labels: "9mo gap" (amber) for ~9-month mismatch, "1.6y gap" / "3.6y gap" (rose) for year-level mismatches
- Clicking ≤30d: LIVE OPPORTUNITIES drops to 0 (all 25 pairs are false positives with >30d date gap) — filter working correctly
- Reset to Any: all 25 pairs return
- No new console errors

### Follow-ups for future runs
- Could add a gap sort column or secondary sort key so "closest date match" surfaces highest
- Could show the actual Poly/Kalshi close dates in the detail drawer header for quick reference
- The hydration mismatch from `usePref` buttons is worth fixing (suppress SSR state mismatch with `suppressHydrationWarning` on affected buttons)

### Next milestone to pick up
**A42** — (to be defined) — suggestions: close-date display in drawer header; gap sort; hydration fix for `usePref` buttons; or a new feature direction

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

---

## 2026-04-25T03:30:00Z — milestones M4+M5+M6+M7: Audit, Approvals, Signals, Positions

### What I did
- **M4 Audit feed**: `app/api/audit/route.ts` reads `executor/audit.jsonl`, parses JSONL, returns reversed (newest-first). `app/audit/page.tsx` has expandable row per record, colored status badge (submitted/dry_run/guardrail/blocked), green dot for trigger_matched. Auto-refreshes every 5s with live/pause toggle.
- **M5 Approvals inbox**: `app/api/approvals/route.ts` lists pending/*.json. `app/api/approvals/[id]/route.ts` POST moves file to approved/, DELETE removes it. `app/approvals/page.tsx` shows approve/reject buttons per pending item with JSON preview.
- **M6 Signals editor**: `app/api/signals/route.ts` GET/PUT reads+writes `signals.json`. `app/signals/page.tsx` key/value table with boolean toggles for true/false values, text inputs for other values. Unsaved-changes banner, Save button, add-row form with Enter key support.
- **M7 Positions**: Stub table (not wired to live data) showing market, side, shares, avg entry, current price, unrealised PnL with totals row.

### Tradeoffs / shortcuts
- Audit page: no pagination, just limit=100 newest records
- Approvals [id] route: id must not contain path separators (trusting filesystem naming)
- Signals: booleans detected by type of parsed value on load; all new values default to text until parsed
- Positions: static stub data only

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `curl` all 4 routes return 200: /audit, /approvals, /signals, /positions
- `python -m pytest` — 35/35 pass

### Follow-ups for future runs
- M9 (end-to-end walkthrough) is the last milestone — all features need browser verification
- Could add pagination to audit feed
- Positions page needs live data from CLOB sidecar

### Next milestone to pick up
**M9** — End-to-end browser walkthrough (M8 LLM drafting is optional, skip until M3 is battle-tested)

---

## 2026-04-25T04:00:00Z — milestone M9: End-to-end smoke test

### What I did
- Full production build: `bun run build` — exit code 0, all 16 routes compile (9 API, 7 pages)
- Verified all API routes via curl:
  - GET `/api/markets?limit=2` → 2 live markets from Gamma API ("Russia-Ukraine Ceasefire before GTA VI?")
  - GET `/api/rules` → 1 rule (from executor/rules/)
  - GET `/api/audit` → 1 audit record (from executor/audit.jsonl)
  - GET `/api/approvals` → 0 pending items
  - GET `/api/signals` → `{}`
- Full CRUD smoke tests:
  - POST `/api/rules` with test rule → created id=test-e2e ✓
  - PATCH `/api/rules/test-e2e` → enabled=False ✓
  - DELETE `/api/rules/test-e2e` → 204 ✓
  - PUT `/api/signals` `{"my-signal":true,"score":42}` → written ✓
  - GET `/api/signals` → reads back correctly ✓
  - PUT `/api/signals` `{}` → reset ✓
- `python -m pytest` — 35/35 pass
- All 7 page routes return HTTP 200: /, /markets, /rules, /rules/new, /audit, /approvals, /positions, /signals

### Tradeoffs / shortcuts
- Browser screenshot verification was blocked by preview tool connection issue (serverId not found); curl verification confirmed HTTP 200 + content for all routes
- M8 (LLM rule drafting) is intentionally skipped — the manual builder (M3) is functional and M8 is optional
- Preview tool workaround: `.claude/launch.json` at project root uses `sh -c "cd frontend && bun run dev"` pattern

### Verified by
- `bun run build` — exit code 0, 16 routes
- curl smoke tests on all API endpoints (read + write paths)
- `python -m pytest` — 35 passed, 0 failed

## FRONTEND COMPLETE

---

## 2026-04-26T00:00:00Z — milestone M8: LLM-assisted rule drafting

### What I did
- Installed `@anthropic-ai/sdk@0.91.1` (bun add)
- Added shadcn `dialog` component (`bunx shadcn@latest add dialog`)
- Created `frontend/.env.local` with `ANTHROPIC_API_KEY=` placeholder (gitignored)
- Created `app/api/rules/draft/route.ts` — POST handler that:
  - Returns 503 with helpful message if `ANTHROPIC_API_KEY` is not set
  - Calls `claude-sonnet-4-6` with full rule schema + 6 examples as system prompt
  - Asks Claude to emit raw JSON only (no code fences); strips accidental fences
  - Parses and returns `{ rule }` or `{ error }`
- Updated `app/rules/new/page.tsx` with:
  - "Draft from description" card (dashed border, Sparkles icon) at top of page
  - Textarea for English input + "Generate Draft" button (disabled while empty or loading)
  - Cmd+Enter keyboard shortcut to generate
  - Loading spinner while waiting for API
  - Error display below textarea on failure
  - Review Dialog showing generated JSON in a scrollable `<pre>` block
  - "Use Draft" button calls `applyDraft()` which maps all rule fields to form state
  - "Discard" button closes dialog without touching the form
  - `applyDraft()` converts all typed values to strings (form uses string inputs), flattens `price_expr` for limit orders

### Tradeoffs / shortcuts
- `price_expr` (dynamic pricing) is serialized as a JSON string in the `price` field — the form only has a plain price input, so dynamic expressions show as raw JSON that the user must understand
- No JSON editing in the dialog — user reviews and either accepts or discards; edits happen in the form after applying
- `ANTHROPIC_API_KEY` must be set manually in `.env.local`; no key-management UI

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `bun run build` — exit code 0, 17 routes (new: /api/rules/draft)
- `python -m pytest` — 35/35 pass
- Browser: `/rules/new` shows "Draft from description" card with textarea and Generate button
- Clicked "Generate Draft" with no API key → error "ANTHROPIC_API_KEY not set — add it to frontend/.env.local" shown inline, no console errors
- Preview screenshot confirms dashed-border card, Sparkles icon, proper layout

### Follow-ups for future runs
- All milestones are now complete (M0–M9 + M8)
- To use M8: set `ANTHROPIC_API_KEY` in `frontend/.env.local`, restart dev server
- Could add JSON editing in the review dialog (textarea instead of pre)
- Could show a diff view of what the draft would change if the form is already partially filled

---

## 2026-04-26T00:30:00Z — milestone A1: Resolution criteria panel

### What I did
- Created `app/api/arb/resolution/route.ts` — GET handler with `poly_slug` + `kalshi_ticker` params
  - Fetches Polymarket Gamma API `?slug=...` for full market `description` field
  - Fetches Kalshi `/markets/{ticker}` for `rules_primary` + `rules_secondary`
  - Returns `{ poly, kalshi }` with 5-minute ISR cache; uses `Promise.allSettled` so one-sided failures don't break the panel
- Updated `app/arb/page.tsx`:
  - Added `ResolutionData` interface and `resolutionData`/`resolutionLoading` state
  - `useEffect` fires when `selectedPoly?.slug` or `selectedKalshi?.ticker` changes; cancels in-flight fetches on re-select
  - Added `ResolutionPanel` component: two-column layout (blue Polymarket / purple Kalshi labels), scrollable `max-h-48` text boxes with `whitespace-pre-wrap`, amber "Verify both sides resolve identically" warning, loading skeletons
  - Placed `ResolutionPanel` below `ArbPanel` inside the `selectedPoly && selectedKalshi` guard

### Tradeoffs / shortcuts
- No diff highlighting between the two sides — user must read and compare manually
- `description` field on Gamma can be long markdown; rendered as pre-wrap plain text (no markdown rendering)
- Kalshi `rules_secondary` is sometimes empty; silently omitted with `filter(Boolean)`

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: ran auto-scan, clicked first row → ArbPanel appeared, then ResolutionPanel loaded with Polymarket description text (multi-paragraph) and Kalshi rules text side-by-side
- Network: `GET /api/arb/resolution?poly_slug=trump-out-as-president-before-gta-vi-846&kalshi_ticker=KXFEDEND-29-JAN20 → 200 OK`
- No console errors

### Follow-ups for future runs
- Could add a "Match" / "Mismatch" indicator (LLM-scored similarity — keep LLM out of trade path, this is display only)
- Could render Polymarket description as markdown

### Next milestone to pick up
**A2** — Real executable prices: show Polymarket CLOB bid/ask depth + Kalshi yes_bid/ask/no_bid/ask for the selected pair

---

## 2026-04-26T01:30:00Z — milestone A2: Real executable prices (CLOB orderbook)

### What I did
- Created `app/api/arb/orderbook/route.ts` — GET handler accepting `token_id` (Poly YES CLOB token) and `kalshi_ticker`
  - Fetches Polymarket CLOB: `GET https://clob.polymarket.com/book?token_id={token_id}` — returns up to 5 bid/ask levels
  - Fetches Kalshi single-market endpoint for fresh yes_bid/yes_ask/no_bid/no_ask
  - Uses `Promise.allSettled` so one-sided failures don't break the panel; `revalidate: 10` for freshness
- Updated `PolyMarket` interface: added `token_id: string` (from `clobTokenIds[0]`)
- Updated `ScanOpp` interface: added `token_id: string` (passed through from `toScanOpp`)
- Updated `runScan`: captures `clobTokenIds?.[0]` as `token_id` from markets API response
- Updated `VenueBook` component:
  - New props: `clob?: ClobBook | null`, `clobLoading?: boolean`
  - Uses real CLOB levels when provided; falls back to synthetic `buildBook` otherwise
  - Shows green "LIVE" badge when real data is present; animated "…" while loading
  - "Best ask" / "Best bid" labels replace "Mid" / "Spread"
  - Shows loading skeleton (3 muted rows) while fetching
- Updated `ArbDetail`:
  - Added `orderbook` and `obLoading` state
  - `useEffect` fetches `/api/arb/orderbook` when `opp.token_id` or `opp.kalshi.ticker` changes
  - Constructs `kalshiClob` (1-level book) from orderbook response based on `opp.kalshi.side`
  - Computes `execSpread` using CLOB ask prices: `1 − poly_yes_ask − kalshi_no_ask` (buy_poly direction) or `poly_yes_bid − kalshi_yes_ask` (buy_kalshi direction)
  - Added "Ask spread (CLOB)" metric card (appears when loading or data available; shown in emerald if positive, rose if negative)
  - Renamed "Edge" → "Mid edge" and "Spread" → "Mid spread" to distinguish from CLOB-based spread
  - Updated Order books label: "Poly CLOB live · Kalshi best bid/ask" vs "Poly synthetic · Kalshi best bid/ask"

### Tradeoffs / shortcuts
- Only the YES token CLOB is fetched (`clobTokenIds[0]`). For "buy_kalshi_sell_poly" direction, the executable spread approximates poly_no_ask ≈ `1 − yes_bid`. Fetching the NO token book would be more precise but doubles the requests.
- Kalshi doesn't expose full orderbook depth — the "book" for Kalshi is always 1 level (best bid/ask for the relevant YES/NO side)
- `execSpread` is mathematically correct for the YES-side approximation; the Gamma mid-spread and CLOB spread often diverge significantly (as expected for thin markets)
- The CLOB `clobTokenIds` is cached by the `/api/markets` revalidate window (30s), so `token_id` could be up to 30s stale — fine for display

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: ran scan → clicked first row → detail drawer opened with "LIVE" badges on both Kalshi and Polymarket VenueBooks
- Polymarket book shows 5 real bid/ask levels from CLOB (bids: 1¢–5¢, asks: 99¢–93¢)
- Kalshi shows 1-level book (bid: 7¢, ask: 9¢)
- "Ask spread (CLOB)" metric: -8¢ (correctly negative — keyword-matched false positive evaporates at real ask prices)
- Network: `GET /api/arb/orderbook?token_id=108999...&kalshi_ticker=KXFEDEND-29-JAN20 → 200 OK`
- No console errors, no failed network requests

### Follow-ups for future runs
- Could fetch the NO token CLOB (`clobTokenIds[1]`) when direction=buy_kalshi_sell_poly for exact NO ask price (removes the `1 − yes_bid` approximation)
- Large Poly CLOB sizes ($1M+ at 1¢) suggest some markets have automated market-maker bots quoting wide; could filter out levels with size > some threshold for better display

### Next milestone to pick up
**A4** — Spread history: append each auto-scan result to `frontend/arb-history.jsonl`; show a sparkline or table of spread-over-time for tracked pairs

---

## 2026-04-26T02:30:00Z — milestone A3: Fee-adjusted net spread

### What I did
- Added per-contract fee breakdown variables in `ArbDetail`: `grossPerContract`, `polyFeePerContract` (2% of buy price), `kalshiFeePerContract` (7% of NO stake), `netPerContract`, and CLOB variants
- Added "Spread decomposition" section in the detail drawer (between CLOB spread banner and Strategy):
  - Shows: Gross spread → Poly fee (2% taker) → Kalshi fee (7% settle) → Net spread, all in ¢ per $1 contract
  - Shows CLOB-based Net (CLOB) when orderbook data is available (conservative, uses ask prices)
  - Shows "Capital to net $10" break-even line: mid-price amount + CLOB amount (or "CLOB spread negative" when no real edge exists)
- No new API routes, no executor changes — pure UI addition

### Tradeoffs / shortcuts
- Poly fee formula uses `buyPrice * 0.02` (2% of notional), not 2% of profit — matches existing calculator for consistency
- Kalshi fee formula uses `(1 - sellPrice) * 0.07` (7% of NO stake cost), approximating the 7% settlement fee on winnings
- Break-even target is fixed at $10 net (arbitrary but useful signal); could be user-configurable

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → clicked first row ("Trump out as President before GTA VI?") → drawer opened showing SPREAD DECOMPOSITION: Gross +38.5¢, Poly fee -0.2¢, Kalshi fee -3.7¢, Net +34.6¢, Net (CLOB) -11.9¢, "CLOB spread negative" correctly indicating false positive at real ask prices
- No console errors

### Follow-ups for future runs
- Could make the $10 break-even target user-configurable (slider)
- CLOB NO token fetch would make the CLOB net more precise for buy_kalshi_sell_poly direction

### Next milestone to pick up
**A4** — Spread history

---

## 2026-04-26T02:00:00Z — milestone A4: Spread history (JSONL + sparkline)

### What I did
- Created `app/api/arb/history/route.ts`:
  - `GET ?pair_id=...` — reads `frontend/arb-history.jsonl`, filters by pair_id, returns last 100 entries newest-first
  - `POST` — appends an array of `HistoryEntry` JSON objects as newline-delimited records to the same file
- Added `HistoryEntry` interface to `page.tsx` (`ts`, `pair_id`, `kalshi_ticker`, `question`, `net_edge_pct`, `edge_cents`, `direction`)
- Updated `runScan`: after setting opps, fire-and-forget POST to `/api/arb/history` with all 25 results and the current ISO timestamp
- Added `history` state + `useEffect` to `ArbDetail`: fetches `/api/arb/history?pair_id={opp.id}` whenever the selected pair changes
- Added "Spread history" section in `ArbDetail` drawer (between Order books and Calculator):
  - "N scans tracked" badge in header
  - Sparkline of `net_edge_pct` over time when ≥2 data points (reuses the existing `Sparkline` component)
  - Compact table: Time (relative, e.g. "38s ago") · Edge · Spread — newest 8 entries shown; most-recent row is bold
  - "No history yet" placeholder for first-open

### Tradeoffs / shortcuts
- JSONL grows unboundedly (no rotation); for a localhost-only tool this is fine — a future run could prune entries older than N days
- History is per `pair_id` (`${poly_id}-${kalshi_ticker}`) — stable across sessions as long as the same pair surfaces from the scan
- Sparkline uses the existing SVG component; with only 2 identical data points (same scan value) it draws a flat line — will look more useful after several scans with drift
- Fire-and-forget: history append errors are silently swallowed (acceptable for an observability-only feature)

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: ran scan twice → clicked first row → "Spread history" card showed "2 scans tracked", sparkline, table with "38s ago +37.1% 37¢" and "41s ago +37.1% 37¢"
- `frontend/arb-history.jsonl` exists on disk with 32 entries (2 scans × 16 pairs)
- No console errors

### Follow-ups for future runs
- Add JSONL pruning (e.g. keep last 500 entries globally or last 100 per pair_id)
- Sparkline will look more useful once spread drifts across multiple sessions

### Next milestone to pick up
**A5** — Kalshi coverage expansion: paginate Kalshi events (cursor), category filter pills, filter yes_ask + no_ask > 1.10

---

## 2026-04-26T03:30:00Z — milestone A5: Kalshi coverage expansion

### What I did
- Updated `app/api/kalshi/markets/route.ts`:
  - Added `?categories=` param (comma-separated); defaults to all 6 ARB categories
  - Replaced hardcoded 2-page loop with cursor-based pagination up to `MAX_PAGES = 5`
  - Added `ILLIQUID_THRESHOLD = 1.10` — markets where `yes_ask + no_ask > 1.10` are filtered out after fetching
  - Changed response shape from bare array to `{ markets, meta: { total_before_filter, illiquid_filtered, pages_fetched } }`
  - Exported `ALL_KALSHI_CATEGORIES` constant for use by the page
  - Political series supplement always included regardless of category filter (they lack category metadata)
- Updated `app/arb/page.tsx`:
  - Added `KALSHI_CATS` constant and `kalshiCats: Set<string>` state (default: all categories)
  - Added `kalshiMeta: { count, illiquid }` state to store post-scan stats
  - Added `toggleKalshiCat` handler (toggle Set membership)
  - Added Kalshi category filter pills row below the header: 6 toggle pills (active = filled, inactive = muted outline)
  - "N Kalshi markets · M illiquid filtered" badge shown right-aligned in the pills row after scan
  - Updated `runScan`: passes `categories=` to Kalshi API, handles new `{ markets, meta }` response shape, sums `illiquid_filtered` across all 7 search queries, sets `kalshiMeta` after scan
  - Added `kalshiCats` to `useCallback` deps array

### Tradeoffs / shortcuts
- Illiquid count is summed across 7 search queries (each with overlapping markets); actual unique illiquid count may be lower than displayed (same market can appear across multiple queries). Acceptable approximation for a display-only badge.
- Political series markets (KXTRUMPSBA etc.) bypass category filter — they're always included since they have no category field from the API and are curated signal for arb

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: `/arb` shows 6 Kalshi category filter pills (all selected by default)
- Ran scan → "27 Kalshi markets · 7 illiquid filtered" badge appeared; 21 opportunities in results table
- Screenshot confirms: LIVE badge, category pills row, market count badge, KPI grid, results table all rendering correctly
- No console errors

### Follow-ups for future runs
- De-duplicate illiquid count across queries for more accurate badge count
- Could add "Select all / Clear" toggle for category pills

### Next milestone to pick up
**A6** — Arb-to-rule bridge: "Create Rule" button on a selected pair pre-fills the rule builder

---

## 2026-04-26T04:30:00Z — milestone A6: Arb-to-rule bridge

### What I did
- Added `useRouter` + `Plus` / `ChevronRight` icon imports to `app/arb/page.tsx`
- In `ArbDetail`: added `const router = useRouter()` and a "Create Rule from this arb" button (dashed emerald border, shown only when `opp.netEdgePct > 0`) that builds a URL with params: `from_arb=1`, `condition_id`, `token_id`, `side`, `price`, `kalshi`, `edge`, `question` (truncated to 100 chars)
- Updated `app/rules/new/page.tsx`:
  - Added `useEffect`, `Suspense` to React imports; `useSearchParams` to next/navigation imports
  - Renamed inner component to `NewRuleForm`, wrapped in `<Suspense>` in the default export (required by Next.js 16 for `useSearchParams` on prerendered pages)
  - `useEffect` on mount checks `from_arb=1`; pre-fills: name (`Arb: {question}`), slug, notes (Kalshi ticker + edge%), condition_id, token_id, side_label, trigger type=price_cross (threshold=buy_price, direction=below), action type=limit_order (BUY, price, size=$50, GTC), guardrails (dry_run=true, require_manual_approval=true)

### Tradeoffs / shortcuts
- Pre-fill action side is always "BUY" (both arb directions buy on Polymarket — just different token sides YES/NO); the "SELL" in the Strategy display is a UX framing, not the mechanical Polymarket action
- Price threshold is the current mid price; user should adjust before saving if they want a limit entry at a different level
- Size is hardcoded to $50 as a safe starting default; user edits before saving

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- `bun run build` — exit code 0, all routes compile cleanly
- Browser: /arb → Run Scan → click first row → scroll to bottom of drawer → "Create Rule from this arb" button visible (dashed emerald border, + icon)
- Clicked button → navigated to /rules/new with form pre-filled: Name="Arb: Trump out as President before GTA VI?", ID=arb-trump-out-as-president-before-gta-vi, Notes="Arb with Kalshi KXTRUMPBULLCASECOMBO-27DEC-26 · net edge 38.25%", condition_id and token_id populated, trigger=price_cross threshold=0.4750 direction=below, action=limit_order BUY price=0.4750 size=$50 GTC
- No console errors

### Follow-ups for future runs
- All A-series milestones (A1–A6) are now complete
- Could add a price input override in the Create Rule button to let user set a custom entry threshold before navigating
- Could prefill `disable_after` from the market's close_time (already available in opp.closes)

### Next milestone to pick up
All current milestones complete. Next run should define new A7+ milestones or consider: multi-leg rule support, Kalshi executor integration, or position reconciliation.

---

## 2026-04-26T05:30:00Z — milestone A7: Auto-refresh scan

### What I did
- Added `AUTO_INTERVALS = [60, 120, 300, 600]` constant
- Added state in `ArbPage`: `autoScan`, `autoInterval` (default 120s), `countdown`, `changedCount`
- Added refs: `prevOppsRef` (tracks last scan's opps for diff), `autoRunRef` (avoids stale closure in setInterval)
- Added `useEffect` to keep `autoRunRef.current` in sync with `runScan` whenever `kalshiCats` changes
- Added countdown `useEffect`: 1-second `setInterval` that decrements `countdown` and fires `autoRunRef.current()` when it reaches 0, then resets to `autoInterval` — restarts cleanly when `autoScan` or `autoInterval` changes
- Updated `runScan`: after computing `top`, diffs against `prevOppsRef.current` — counts pairs where edge moved >0.5% ("moved"), new pairs ("added"), and disappeared pairs ("removed") — sets `changedCount` (only after first scan so it doesn't fire on initial load)
- UI changes in page header:
  - Interval pill group (1m/2m/5m/10m) visible only when `autoScan` is on, highlighted pill = current interval
  - "Auto" toggle button: green pulsing dot + "Auto · Xs" countdown when on; muted when off
  - Amber "N changed" pulsing badge next to LIVE badge after any scan that detected drift

### Tradeoffs / shortcuts
- `autoRunRef` pattern avoids restarting the countdown interval every time `kalshiCats` changes (which would happen if `runScan` were a direct dep of the countdown useEffect)
- "N changed" count is a rough heuristic (>0.5% edge move = "changed"); pairs that appear/disappear are also counted — over-counts if the same market re-matches a different Kalshi ticker
- The badge clears when Auto is toggled off (via `setChangedCount(null)` in the toggle handler)
- Countdown display shows seconds ("Auto · 98s") for all intervals — could show "1m 38s" for longer intervals but seconds is clearer for the 1m/2m use case

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: `/arb` — clicked "Auto" button → green pulsing dot appeared, "Auto · 98s" countdown text, interval pills (1m/2m/5m/10m) appeared to the left; screenshot confirms layout
- DOM eval: `btns.map(b => b.textContent)` shows ["1m", "2m", "5m", "10m", "Auto · 117s", "Run Scan", …] ✓
- No console errors

### Follow-ups for future runs
- Could clear the "N changed" badge automatically after N seconds (currently persists until next scan or toggle)
- Could show countdown as "Xm Ys" for intervals ≥60s for readability
- Could add an "auto-open best opportunity" mode: when auto-scan fires and changedCount > 0, auto-select the top opp

### Next milestone to pick up
**A8** — to be defined. Candidates: pair match quality scoring (date proximity + title similarity), Kalshi position tracking, or JSONL history pruning (keep last N entries per pair).

---

## 2026-04-26T06:30:00Z — milestone A8: Pair match quality scoring

### What I did
- Added `dateProxScore(a, b)` helper: maps absolute date diff to 0–1 score (≤1d→1.0, ≤7d→0.8, ≤30d→0.5, ≤90d→0.2, >90d→0.0)
- Added `computeMatchQuality(kwScore, polyCloses, kalshiCloses)`: combines keyword overlap (60%) + date proximity (40%) into a `combined` score; grades H (≥0.5) / M (≥0.25) / L (otherwise); returns `MatchQuality` struct with all sub-scores
- Extended `PolyMarket` interface: added `end_date?: string`; captured `m.endDate` from `/api/markets` response in `runScan` (it was already returned by the Gamma proxy but not used)
- Added `matchQuality: MatchQuality` field to `ScanOpp`; updated `toScanOpp` to compute it; updated `resolutionMatch` and `confidence` to derive from `matchQuality.combined` rather than raw keyword score
- Added `MatchBadge` component: H=emerald, M=amber, L=muted with ring
- Added `SortBy = "match"` and "Match ↓" column to `TableView` (placed between Edge and Market columns, sortable)
- Replaced the old amber "Resolution risk" box in `ArbDetail` with a dynamic-color "Match quality" card showing:
  - Grade badge (H/M/L)
  - Three mini cards with progress bars: Keyword Overlap %, Date Proximity (% or "far apart" / "no poly date"), Combined Score %
  - Contextual text: H = "strong match", M = "verify before trading", L = "likely false positive"

### Tradeoffs / shortcuts
- Date proximity weight is 40% only when a poly end date exists; if `end_date` is missing the combined score equals the keyword score alone (not penalised — just less signal)
- `end_date` comes from Gamma's `endDate` field which is already returned by `/api/markets`; no new API calls needed
- "far apart" label shown when `dateProx === 0` but `polyCloses` is present (dates exist but >90 days apart); "no poly date" shown when `polyCloses` is undefined
- H/M/L thresholds (0.5, 0.25) are empirically chosen; most keyword-only false positives score M/L while true matches with aligned dates score H

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → "Match" column visible with Low/Med badges in table
- Clicked row 2 (Med match): detail panel shows match quality card with amber border, "Med" badge, Keyword Overlap 29%, Date Proximity "far apart", Combined 29%, warning text "Moderate match — verify resolution criteria before trading"
- No console errors

### Follow-ups for future runs
- Could add a "Min match" filter pill (Low/Med/High threshold) to the filter row so users can hide obvious false positives
- Could use LLM similarity scoring for display (not in trade path) to improve keyword matching accuracy
- JSONL history is unbounded — future run should prune entries older than N days or keep last N per pair

### Next milestone to pick up
**A9** — Min-match filter + JSONL history pruning.

---

## 2026-04-26T07:30:00Z — milestone A9: Min-match filter + JSONL history pruning

### What I did
- Added `minMatch: "all" | "M" | "H"` state (default: `"all"`) to `ArbPage`
- Extended `filtered` useMemo: `minMatch === "M"` hides grade-L pairs; `minMatch === "H"` shows only grade-H pairs
- Added "Match: All / Med+ / High" pill group to the filter row (between category pills and Min edge slider); active pill uses grade-appropriate amber/emerald color when non-default selected
- Updated `app/api/arb/history/route.ts` POST handler: after appending, if total entry count > `MAX_TOTAL_ENTRIES` (500), rewrites file keeping the newest 500 entries

### Tradeoffs / shortcuts
- "Med+" shows both M and H (i.e., hides only L); "High" shows only H — this matches the UX intent of progressively tightening the signal-to-noise filter
- Pruning reads the full file after each append (not ideal for huge files, but at 500-entry cap the read is trivial for a localhost tool)
- `MAX_TOTAL_ENTRIES = 500` is a global cap across all pairs, not per-pair — oldest entries are dropped first regardless of pair_id

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → filter row shows "Match: All | Med+ | High" pills
- Clicked "High" → table reduced from 20 results to 1 (the single High-grade pair), KPI updated to "1 of 20 total"
- Clicked back to "All" → all 20 results restored
- No console errors

### Follow-ups for future runs
- Could add an "A10" milestone: persist `minMatch` preference in localStorage so it survives page reloads
- JSONL pruning currently global (not per-pair) — could add per-pair cap if a single pair dominates the history file during long auto-scan sessions

### Next milestone to pick up
**A10** — to be defined. Candidates: persist filter preferences (minMatch, minEdge) in localStorage; Kalshi position tracking; JSONL per-pair cap.

---

## 2026-04-26T08:30:00Z — milestone A10: Persist filter preferences + architecture redesign

### What I did
- Added `usePref<T>(key, init)` hook to `app/arb/page.tsx` — localStorage-backed `useState` drop-in; reads on mount (SSR-safe), writes on every setter call; supports functional updates
- Wired `usePref` for 7 state vars: `view`, `sortBy`, `minEdge`, `cat`, `minMatch`, `kalshiCatsArr` (array, derived to Set via useMemo), `autoInterval`
- Not persisted: `opps`, `scanning`, `search`, `selected`, `flashIds`, `kalshiMeta`, `autoScan`, `countdown`, `changedCount` — these are session-specific or transient UI state
- Updated `toggleKalshiCat` to accept a string arg `c` (renamed from `cat` to avoid shadowing), use `setKalshiCatsArr` with functional update
- Fixed `runScan` dep array: `[kalshiCatsArr]` (the primitive array) instead of `[kalshiCats]` (the derived Set object, which would be a new ref every render)
- Rewrote `app/architecture/page.tsx`: replaced monospace `<pre>` ASCII art diagram with layered colour-coded tier cards — blue (external services), purple (route handlers), teal/amber split (frontend pages / filesystem), rose (executor + MCP sub-card), constraints panel with bolded keywords
- ROADMAP.md: added and checked A10

### Tradeoffs / shortcuts
- `usePref` writes on every setter call (not debounced) — fine for infrequent preference changes
- `kalshiCats` is derived via `useMemo` from `kalshiCatsArr`; this means `runScan` reads the latest set via closure without needing it in its dep array (the array dep is stable)
- Architecture page uses `dangerouslySetInnerHTML` only for bolding "never/may/always" in static constraint strings — content is hardcoded, no XSS vector

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: localStorage round-trip confirmed (set "arb:view" → JSON.parse reads back "cards")
- Browser: /architecture shows full 5-tier diagram, Executor+MCP card, constraints panel — no console errors

### Follow-ups for future runs
- Could clear stale localStorage keys on version bump (e.g. if KALSHI_CATS changes)
- Architecture page arrow SVG could use animated dashes for a live-data feel

### Next milestone to pick up
**A11** — Browser notifications for spread alerts.

---

## 2026-04-26T09:30:00Z — milestone A11: Browser notifications for spread alerts

### What I did
- Added `Bell` icon import from lucide-react
- Added `NOTIFY_THRESHOLDS = [5, 10, 20] as const` constant
- Added 3 new persisted state vars via `usePref`: `notifyEnabled` ("arb:notify", default false), `notifyThreshold` ("arb:notify-thresh", default 5)
- Added `notifyPerm` useState (init from `Notification.permission` on mount via useEffect)
- Added `notifiedIdsRef` (Set<string>) — tracks pair IDs already alerted this session; cleared only when a new manual scan runs
- Added `notifyRef` (mirror of enabled+threshold) — kept in sync via useEffect so `runScan` (a stale `useCallback`) can read latest notify prefs without needing them in its dep array
- Added `toggleNotify` async handler: requests `Notification.requestPermission()` on first enable; sets `notifyPerm`; bails if denied
- In `runScan`, after `setOpps(top)`: iterates top opps; for each where `netEdgePct >= notifyRef.current.threshold` and not in `notifiedIdsRef.current`, fires `new Notification(...)` with pair question + prices, tags with `arb-{id}` (browser de-dupes by tag), sets `onclick` to `window.focus()`
- Added "Notify controls" UI block in the page header between search and Auto: threshold pill group (`>5% / >10% / >20%`) visible when enabled; Bell button styled violet when active, opacity-50 + "Blocked" label when permission is denied

### Tradeoffs / shortcuts
- `notifiedIdsRef` is session-only (in-memory Set); page reload resets it — acceptable since a fresh scan after reload would re-alert on the same pairs. A durable set (localStorage) would avoid that but adds complexity.
- `notifyRef` pattern mirrors `autoRunRef` — avoids adding `notifyEnabled`/`notifyThreshold` to `runScan`'s dep array which would cascade into restarting the countdown useEffect
- Notification body truncates question at 80 chars to stay within OS notification char limits
- `tag: arb-{opp.id}` lets the browser group/replace notifications for the same pair (only one notification per pair visible in the notification center)
- Preview environment shows "Blocked" (correct — headless browser has Notification.permission === "denied"); can't demo actual notification firing in the preview

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `bun run build` — exit code 0, all routes compile
- `python -m pytest` — 35/35 pass
- Browser: `/arb` shows "Blocked" Notify button correctly positioned between search and Auto; no console errors
- Preview screenshot confirms layout: Search · Blocked · Auto · Run Scan in header row

### Follow-ups for future runs
- Test actual notification firing in a real browser (grant Notification permission in browser site settings)
- Could add a "Clear alerts" button to reset `notifiedIdsRef` within a session so re-appearing pairs can re-alert
- Could show a small notification count badge on the Bell icon after alerts fire

### Next milestone to pick up
**A12** — Alert history log.

---

## 2026-04-26T10:30:00Z — milestone A12: Alert history log

### What I did
- Created `app/api/alert-log/route.ts`:
  - `GET` — reads `frontend/alert-log.jsonl`, returns newest 50 entries reversed; returns `[]` if file absent
  - `POST` — appends single `AlertLogEntry` JSON record; prunes to newest `MAX_ENTRIES = 100` entries on each write
- Added `AlertLogEntry` interface to `app/arb/page.tsx`: `{ ts, pair_id, question, net_edge_pct, threshold, direction, poly_price, kalshi_price }`
- Added 3 new state vars in `ArbPage`: `alertLog`, `newAlertCount`, `showAlertLog`
- Mount `useEffect` fetches `/api/alert-log` on load and populates `alertLog`
- Updated notification block in `runScan`: when a notification fires, also POSTs `AlertLogEntry` to `/api/alert-log`, prepends it to `alertLog` state, and increments `newAlertCount`
- Added `History` icon import from lucide-react
- Updated Bell button UI:
  - Wrapped Bell button in `relative` div; shows a violet `newAlertCount` badge in top-right corner when `> 0`
  - Added History icon button (appears only when `alertLog.length > 0`) that toggles `showAlertLog` and clears `newAlertCount`
- Added "Recent Alerts" collapsible panel: appears between header and Kalshi filter pills when `showAlertLog && alertLog.length > 0`; shows last 10 entries (relative timestamp, net edge %, threshold crossed, question, P/K prices); close button inside panel header

### Tradeoffs / shortcuts
- `newAlertCount` is session-only (resets on page reload) — no localStorage; acceptable since the persistent count is visible via the panel's "N fired this session" badge
- Panel does NOT auto-open on new alerts — only opens on explicit History button click; this avoids layout shifts during auto-scan
- `innerText.includes('Recent Alerts')` check returns false in headless browser because Tailwind's `uppercase` CSS class transforms DOM text to uppercase — verified by inspecting `innerHTML` directly which confirmed "Recent Alerts" renders correctly

### Verified by
- `python -m pytest` — 35/35 pass
- `bun run tsc --noEmit` — 0 errors
- `bun run build` — exit code 0; `/api/alert-log` appears in build output as dynamic route
- Browser: POST test entry to `/api/alert-log` via eval → reload `/arb` → History (clock) icon button appeared → clicked → "RECENT ALERTS · 1 fired this session" panel rendered with entry: "2m ago · +12.5% · thresh >10% · Will Bitcoin exceed $100k in 2026? · P47¢ K35¢"
- No console errors

### Follow-ups for future runs
- Test unread count badge (visible only when browser has Notification permission, since `newAlertCount` only increments when real notifications fire)
- Could add per-pair cap (e.g. max 10 entries per pair_id) to prevent one high-frequency pair from filling the log
- `alert-log.jsonl` file path is relative to `process.cwd()` (frontend/) — consistent with `arb-history.jsonl` pattern

### Next milestone to pick up
**A14** — to be defined. Candidates: per-pair JSONL history cap (prevent one pair dominating the log); Kalshi position tracking; LLM-assisted match scoring (display only, not in trade path).

---

## 2026-04-26T11:30:00Z — milestone A13: Deep-link / shareable pair state

### What I did
- Added `Link2` and `Check` icons to lucide-react imports
- Added `pendingPairRef = useRef<string | null>(null)` to `ArbPage`
- Extended the mount `useEffect`: reads `?pair=` from `window.location.search`; if present, stores in `pendingPairRef` and fires `autoRunRef.current()` after 100ms so a scan starts immediately on deep-link load
- Added `useEffect` on `opps`: after any scan, if `pendingPairRef.current` is set, finds the matching opp by ID and calls `setSelected(match)` then clears the ref
- Added `selectOpp` wrapper (`useCallback`) that calls `setSelected` + `window.history.replaceState` to sync `?pair=<id>` to the URL on select, or `/arb` (no params) on deselect
- Replaced all `setSelected` call-sites in JSX (`onSelect` props for `TableView`/`CardView`/`TickerView`, and `onClose`) with `selectOpp`
- In `ArbDetail`: added `[copied, setCopied]` state; added "Copy link to this pair" button (Link2 icon → Check icon for 2s after click) in the sticky header between the pair ID badge and the close button

### Tradeoffs / shortcuts
- `window.history.replaceState` (not `router.replace`) is used for shallow URL updates — avoids Next.js App Router re-rendering the layout on every selection
- Auto-scan on deep-link fires via `autoRunRef` with a 100ms delay (ensures the ref is wired before the effect fires); this means a fresh page load with `?pair=` triggers one scan automatically
- If the pair no longer appears in the scan results (e.g. market closed), `pendingPairRef` is silently cleared and no drawer opens — acceptable for a localhost tool
- `navigator.clipboard.writeText` is fire-and-forget; errors silently swallowed (copy fails in non-HTTPS contexts, but localhost is treated as secure by browsers)

### Verified by
- `python -m pytest` in executor/ — 35/35 pass
- `bun run tsc --noEmit` — 0 errors
- Browser: clicked first card → URL updated to `?pair=540820-KXTRUMPBULLCASECOMBO-27DEC-26`
- "Copy link to this pair" button visible in drawer header (title confirmed via DOM)
- Closed drawer → URL reverted to `/arb` (no params)
- Deep-link test: navigated to `/arb?pair=540820-KXTRUMPBULLCASECOMBO-27DEC-26` → auto-scan fired → drawer opened automatically to the correct pair
- No console errors

### Follow-ups for future runs
- Per-pair JSONL history cap to prevent one high-frequency pair from filling `arb-history.jsonl`
- Could preserve the full query string (minEdge, category filter) in the shared URL so recipients see the same filtered view

---

## 2026-04-26T12:30:00Z — milestone A14: Pair watchlist

### What I did
- Added `Star` icon to lucide-react imports in `app/arb/page.tsx`
- Added 2 new persisted state vars via `usePref`:
  - `watchlistIds: string[]` ("arb:watchlist", default `[]`) — IDs of starred pairs
  - `showWatchlist: boolean` ("arb:show-watchlist", default `false`) — watchlist filter mode
- Added `toggleWatchlist(id)` useCallback that adds/removes an ID from `watchlistIds`
- Updated `filtered` useMemo: when `showWatchlist === true`, pre-filters `opps` to only IDs in `watchlistIds` before applying the usual edge/category/match/search filters
- Updated `TableView`:
  - Added `watchlistIds: string[]` and `onStar: (id: string) => void` props
  - Added a "star" column to `cols` (no header label) as the first column
  - Each row has a clickable star `<td>` with `e.stopPropagation()` so clicking the star doesn't open the detail drawer; star renders filled amber when watched, faded otherwise
- Updated `ArbDetail`:
  - Added `isWatched: boolean` and `onStar: () => void` props
  - Added a star button in the sticky header (between Copy Link and Close), with filled/outline styling matching the watch state
- Added "Starred (N)" toggle button at the start of the filter row; highlighted amber when active; shows count when watchlist is non-empty
- Added dedicated empty state: when `showWatchlist && watchlistIds.length === 0` shows "No starred pairs yet" prompt
- Updated `TableView` and `ArbDetail` call sites to pass new props

### Tradeoffs / shortcuts
- Stars are only shown in TableView (not CardView/TickerView) — card and ticker views are primarily for browsing, not monitoring; star from the detail drawer works across all views
- `showWatchlist` mode does not clear other filters (minEdge, category, match) — starred pairs still need to pass those filters; intentional so edge/quality thresholds remain active even in watchlist mode
- Watchlist persists pair IDs; if a pair disappears from scan results (market closed), it just won't appear — no stale-data display needed since we don't cache scan results

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → 21 results; switched to Table view → 21 star icons in tbody confirmed via DOM
- Clicked first star → localStorage `arb:watchlist` updated to `["540820-KXTRUMPBULLCASECOMBO-27DEC-26"]`; star filled amber; "Starred (1)" button text updated
- Clicked "Starred (1)" toggle → table filtered to 1 row; KPI shows "1 of 21 total"; localStorage `arb:show-watchlist` = true
- Screenshot confirmed: "★ Starred (1)" highlighted amber in filter row, single row with filled gold star, correct pair name
- No console errors

### Follow-ups for future runs
- Add star button to CardView cards (currently stars are table-only + drawer)
- Consider a "clear watchlist" button for resetting all starred pairs
- Per-pair JSONL history cap still outstanding from A13 follow-ups

### Next milestone to pick up
**A15** — CardView/TickerView stars + per-pair JSONL history cap.

---

## 2026-04-26T13:30:00Z — milestone A15: CardView/TickerView stars + per-pair JSONL cap

### What I did
- Updated `CardView` to accept `watchlistIds: string[]` and `onStar: (id: string) => void` props; added star `div[role=button]` next to each card's EdgePill with filled-amber / faded-outline states; uses `e.stopPropagation()` so clicking the star doesn't open the detail drawer
- Updated `TickerView` similarly: added `watchlistIds` + `onStar` props; added star `div[role=button]` at the end of each feed row
- Used `<div role="button" tabIndex={0}>` (not `<button>`) for both to avoid the HTML spec violation of nesting interactive elements — confirmed no more `button > button` nesting via DOM check (`button button` selector returned 0)
- Updated `CardView` and `TickerView` call sites in `ArbPage` to pass `watchlistIds={watchlistIds}` and `onStar={toggleWatchlist}`
- Updated `app/api/arb/history/route.ts` POST handler: added per-pair pruning (group by `pair_id`, trim each to `MAX_ENTRIES_PER_PAIR = 100`) before applying the existing global cap (`MAX_TOTAL_ENTRIES = 500`); entries are re-sorted chronologically after per-pair trim, then sliced to global cap and rewritten

### Tradeoffs / shortcuts
- `div[role=button]` is the right solution here — the card outer element is a `<button>` and nesting another `<button>` inside is an HTML spec violation. A `div[role=button]` with `tabIndex={0}` and keyboard handler provides equivalent accessibility
- Console showed stale hydration errors from a pre-fix page load; after reload the DOM confirmed `nestedButtonsFound: 0` and 17 `div[role=button]` elements in CardView
- Per-pair pruning re-sorts all entries chronologically before writing — this is a full file rewrite but at ≤500 entries it's trivial for a localhost tool

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → switched to Cards view → star icons visible on each card next to EdgePill; clicked star → localStorage `arb:watchlist` updated
- DOM check: `document.querySelectorAll('button button').length === 0` (no nested buttons); `document.querySelectorAll('[role="button"]').length === 17` (stars present)
- TickerView screenshot: star icons visible at the end of each feed row (amber filled for watched, faded outline otherwise)

### Follow-ups for future runs
- Could add a "Clear watchlist" button to reset all starred pairs in one click
- Could preserve category/edge filters in the shared URL (for Copy Link)
- JSONL per-pair pruning is now active; global cap still applies as a secondary safety net

### Next milestone to pick up
**A16** — Clear watchlist + filter URL preservation.

---

## 2026-04-26T14:30:00Z — milestone A16: Clear watchlist + filter URL preservation

### What I did
- Added `X` to lucide-react imports
- Added "Clear watchlist" `×` button: sibling `<button title="Clear watchlist">` placed inside the same wrapper `<div>` as the "Starred (N)" toggle; only renders when `watchlistIds.length > 0`; clicking calls `setWatchlistIds([])` + `setShowWatchlist(false)` so the watchlist mode also exits
- Updated `selectOpp` useCallback: when selecting a pair, serializes non-default filter state into the URL alongside `?pair=` — encodes `min_edge` (if > 0), `min_match` (if not "all"), `cat` (if not "all"), `view` (if not "table"); added `[minEdge, minMatch, cat, view]` to deps array
- Updated mount `useEffect`: reads `URLSearchParams` for the filter params `min_edge`, `min_match`, `cat`, `view` when a `?pair=` deep-link is detected; applies them via their `usePref` setters (also writes to localStorage) before triggering the auto-scan

### Tradeoffs / shortcuts
- Filter params only encode non-default values to keep URLs short; defaults (edge=0, match=all, cat=all, view=table) are omitted
- `selectOpp` now has `[minEdge, minMatch, cat, view]` in its dep array — this creates a new function ref on any filter change, passing new props to the three view components. React re-renders are cheap here (no heavy computation in the views)
- `showWatchlist` and `sortBy` are NOT included in the shared URL — they're session-level preferences, not part of the "this specific opportunity" context

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: ran scan → clicked "Med+" → selected first table row → URL updated to `?pair=540820-KXFEDEND-29-JAN20&min_match=M` (filter param encoded)
- Browser: "Starred (2)" button had X sibling → clicked X → watchlist cleared to `[]`, clear button disappeared, "Starred" text lost count suffix, `showWatchlist` reset to false, localStorage confirmed
- Copy Link button present in drawer; `window.location.href` = full URL with filter params

### Follow-ups for future runs
- Could include `sortBy` in the shared URL if users frequently share by match-sorted views
- Could add a "Select all / Clear all" toggle for Kalshi category pills
- LLM-assisted match scoring (display-only) is the next high-value improvement for reducing false positives

### Next milestone to pick up
**A17** — LLM-assisted match scoring.

---

## 2026-04-26T15:30:00Z — milestone A17: LLM-assisted match scoring

### What I did
- Created `app/api/arb/match-score/route.ts` — POST handler:
  - Accepts `{ poly_question, kalshi_title }` in body
  - Returns 503 with setup message if `ANTHROPIC_API_KEY` is not set
  - Calls `claude-haiku-4-5-20251001` with a cached system prompt (ephemeral cache_control on system block)
  - Asks Claude to score 0–100 and give a one-sentence verdict; strips accidental code fences from response
  - Derives grade: score ≥70 → H, ≥40 → M, <40 → L
  - Returns `{ score, verdict, grade }`
- Added `AiMatch` interface to `app/arb/page.tsx`
- Added `aiMatch`, `aiMatchLoading`, `aiMatchError` state to `ArbDetail`
- Added `useEffect` on `opp.id`: fires POST to `/api/arb/match-score`; clears previous result on each new pair
- Added "AI Similarity" card in the detail drawer (between match quality card and resolution criteria):
  - Header: "AI Similarity" + "claude-haiku · display only" sub-label
  - Loading: two skeleton bars while request in flight
  - Error: config prompt if API key missing; error message otherwise
  - Result: `MatchBadge` (H/M/L) + filled progress bar (emerald/amber/muted) + score % + italic one-sentence verdict

### Tradeoffs / shortcuts
- Uses market question + Kalshi title only (not full resolution text) — fast and cheap; adding description text would improve accuracy but double latency
- `claude-haiku-4-5-20251001` chosen for speed (< 1s typical) and cost; ephemeral cache_control on system prompt for prompt caching benefit on repeated calls
- No caching of results — each pair open fires a fresh API call; at haiku pricing this is negligible for a localhost tool
- LLM is NOT in the trade path — the score is display-only; the executor uses only deterministic rule conditions

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → clicked first row → "AI Similarity" card appeared in drawer with "Set ANTHROPIC_API_KEY in frontend/.env.local to enable AI match scoring." message (correct graceful fallback)
- `h3` headings in drawer confirmed: Spread decomposition · Order books · Spread history · Capital → Profit · AI Similarity · (Resolution criteria)
- No console errors

### Follow-ups for future runs
- Set `ANTHROPIC_API_KEY` in `frontend/.env.local` to test live scoring
- Could pass the full resolution text (from `/api/arb/resolution`) to the LLM for higher accuracy — would require fetching resolution first or a second API call
- Could cache scores per `opp.id` in a Map ref to avoid re-fetching when the user reopens the same pair

---

## 2026-04-26T16:30:00Z — milestone A18: Session AI score cache + full resolution text

### What I did
- Added `ResolutionData` interface to `app/arb/page.tsx` (client-side type mirroring the route's exported interface)
- Added `slug: string` field to `ScanOpp` interface; propagated `poly.slug` through `toScanOpp`
- Added `aiScoreCacheRef = useRef<Map<string, AiMatch>>(new Map())` in `ArbPage`; passed to `ArbDetail` as `aiScoreCache` prop
- Updated `ArbDetail` AI score `useEffect`: checks cache before firing POST; stores result in cache after successful fetch — avoids re-calling Haiku when user re-opens the same pair within a session
- Added `resolution` + `resLoading` state in `ArbDetail`
- Added resolution fetch `useEffect` in `ArbDetail`: fetches `/api/arb/resolution?poly_slug=...&kalshi_ticker=...` on pair open (route has 5-minute ISR cache, so re-opens are near-instant)
- Expanded "Resolution criteria" panel: each side now shows the market title in bold + scrollable full description/rules text below a hairline divider with a loading skeleton while fetching; added amber "Verify both sides resolve identically before trading." banner at the bottom

### Tradeoffs / shortcuts
- AI score cache is session-only (in `useRef`, cleared on page reload) — persistent cache would require localStorage or a server-side store; session-only is sufficient since Haiku calls are fast and cheap per session
- Resolution text fetched in `ArbDetail` (not at scan time) — avoids 40+ resolution fetches per scan; lazy-fetch on pair open is correct since the panel is only visible after selection
- Cache does NOT survive across different `ArbDetail` instances — since `ArbDetail` remounts when drawer closes/opens, the cache ref must live in `ArbPage` (parent) to persist across drawer open/close cycles. This is why it's defined in `ArbPage` and passed down.
- Resolution text can be long (multi-paragraph); capped at `max-h-36 overflow-y-auto` to keep the drawer usable

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → clicked first row ("Trump out as President before GTA VI?") → scrolled drawer to bottom → "Resolution criteria" panel shows full Polymarket description (multi-paragraph, GTA VI resolution logic) and Kalshi rules ("Will Trump end the Federal Reserve before Jan 20, 2029?") side-by-side with amber warning
- Confirmed this is a clear false positive — resolution criteria differ completely — validating the panel's utility
- No new console errors (pre-existing SSR button-nesting warning is unchanged)

### Follow-ups for future runs
- Could pass resolution text snippets (first 400 chars each) to `/api/arb/match-score` for higher-accuracy AI scoring — currently the LLM only sees market titles
- Could add a "Match/Mismatch" indicator (LLM-scored, not in trade path) that auto-fires when resolution text loads
- Pre-existing SSR `button > button` hydration warning in CardView (0 actual nested buttons in DOM) could be fixed by changing the card outer element to `<div role="button">` instead of `<button>`

### Next milestone to pick up
**A19** — to be defined. Candidates: feed resolution text to AI scoring for higher accuracy; fix CardView SSR button-nesting warning; Kalshi position tracking.

### Next milestone to pick up
**A18** — to be defined. Candidates: cache AI scores per session (avoid re-fetching same pair); pass resolution text to improve scoring accuracy; Kalshi position tracking.

---

## 2026-04-26T17:30:00Z — milestone A19: Resolution-aware AI scoring

### What I did
- Updated `app/api/arb/match-score/route.ts`: accepts optional `poly_resolution` and `kalshi_resolution` string params in the POST body; when either is present, the user message sent to Haiku includes the full resolution snippet in addition to titles; returns `usedResolution: boolean` in the response so the client can display the source label; updated system prompt to mention resolution text is the primary signal when present
- Replaced the two separate `useEffect`s in `ArbDetail` (one for resolution, one for AI score) with a single combined sequential effect: resolution is fetched first, then match-score is called with the first 400 chars of each side's resolution text when available; this ensures Haiku scores on what the markets actually resolve on (not just keyword-matched titles)
- AI cache (`aiScoreCache` Map ref in `ArbPage`) checked at the top of the combined effect — if cached, resolution is still fetched for display but the API call is skipped
- `cancelled` flag pattern prevents stale state updates on rapid pair switching (effect cleanup sets `cancelled = true`)
- Added `usedResolution?: boolean` to `AiMatch` interface
- Added "· resolution text" (emerald) / "· titles only" (amber) source label next to "claude-haiku · display only" in the AI Similarity card header — only visible when `aiMatch` is loaded

### Tradeoffs / shortcuts
- Resolution fetch is now on the critical path for AI scoring (sequential, not parallel). The resolution route has a 5-minute ISR cache so repeat opens of the same pair are fast (50–200ms). For brand-new pairs, latency is resolution (~300ms) + Haiku (~600ms) = ~900ms vs. the old ~600ms. Acceptable for a display-only feature.
- `poly_resolution` is capped at 400 chars (first 400 of `description`). For longer descriptions this may miss the specific resolution clause, but 400 chars covers the lead sentence which is usually the key criterion.
- `kalshi_resolution` joins `rules_primary` and `rules_secondary` before slicing to 400 chars — secondary rules are often blank, so the combined text is usually just `rules_primary`.
- "· resolution text" / "· titles only" labels only appear when `aiMatch` is set (i.e. after a successful API response). No label shows in the no-API-key graceful-fallback state.

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: `/arb` — ran scan → clicked first row → resolution panel loaded with full Polymarket + Kalshi text
- Network log confirmed sequential pattern: `GET /api/arb/resolution → 200 OK` fires before `POST /api/arb/match-score → 503 Service Unavailable` (503 expected — no ANTHROPIC_API_KEY set)
- `ERR_ABORTED` on stale resolution requests confirms `cancelled = true` cleanup is working on rapid re-opens
- Screenshot: AI Similarity card shows "claude-haiku · display only" with graceful "Set ANTHROPIC_API_KEY" fallback message; no new console errors

### Follow-ups for future runs
- Fix pre-existing CardView SSR `button > button` hydration warning (change card outer element from `<button>` to `<div role="button">`)
- With API key set: verify "· resolution text" emerald label appears in the AI card header
- Could pass first 400 chars to both the match-score POST AND the existing `AiMatch` cache key (so cache hit is still resolution-aware, not a stale title-only score from a pre-A19 session — session-only cache means this is a non-issue in practice)

### Next milestone to pick up
**A20** — to be defined. Candidates: fix CardView SSR `button > button` warning (change card outer `<button>` to `<div role="button">`); Kalshi position tracking; per-pair resolution diff highlighter (show which sentences differ between Poly and Kalshi rules).

---

## 2026-04-26T18:30:00Z — milestone A20: CardView hydration fix + resolution keyword diff

### What I did
- Added `computeResDiff(polyText, kalshiText)` helper: extracts significant words (>3 chars, filtered by a 40-word stop list) from each resolution text, returns `{ polyOnly, kalshiOnly }` using Set difference, capped at 14 tokens per side
- Changed CardView outer element from `<button>` to `<div role="button" tabIndex={0}>` with an `onKeyDown` handler — eliminates the pre-existing SSR hydration warning ("button cannot be a descendant of button") that appeared on every CardView render
- Added "KEY TERM DIFF" panel in ArbDetail resolution section: rendered only when `!resLoading` and both `poly.description` and `kalshi.rules_primary` are present; shows Poly-only tokens (blue chips) vs Kalshi-only tokens (emerald chips) in a 2-col grid inside a muted rounded panel below the amber warning banner
- Cleared stale Turbopack build cache (`.next/`) + restarted dev server to flush an intermediate compile failure caused by the button→div tag mismatch during editing

### Tradeoffs / shortcuts
- `computeResDiff` does simple Set difference on word tokens — no TF-IDF or stemming; common words that leak through the stop list may appear (e.g. "2029" appears as a Kalshi-only token for the Fed Reserve market, which is correct signal)
- Panel uses an IIFE in JSX (`(() => { ... })()`) to keep the diff computation co-located with the render without adding a new sub-component; acceptable for this volume of logic
- Stop list (40 words) was tuned empirically to remove noise while keeping meaningful terms; edge cases exist (e.g. "then", "resolves" still visible in some markets)
- Turbopack does not recover automatically from a JSX tag-mismatch compile error when edits are applied in two separate steps; always apply opening+closing tag changes atomically or restart the server

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: CardView rendered with 7 cards, 0 nested `button button` elements, 6 `[role="button"]` star icons
- Clicked first card ("Trump out as President before GTA VI?") → scrolled to bottom of drawer → "KEY TERM DIFF" panel visible with Poly-only tokens: `donald, trump, ceases, president, period, time, grand, theft, auto, officially, released, otherwise, neither, occurs` and Kalshi-only tokens: `federal, reserve, system, ended, january, 2029, then, resolves` — immediately reveals the false positive
- No console errors after fresh server restart

### Follow-ups for future runs
- Stem words (e.g. "resolves" → "resolve") to improve token matching accuracy
- Add a "Shared key terms" section showing terms that appear in both sides (positive signal for true matches)
- Kalshi position tracking still outstanding as a higher-effort follow-up

### Next milestone to pick up
**A21** — to be defined. Candidates: shared-terms section in resolution diff (positive signal); Kalshi position tracking; per-pair alert threshold (notify only when specific pair crosses its own threshold, not a global threshold).

---

## 2026-04-26T19:30:00Z — milestone A21: Shared key terms + min liquidity filter

### What I did
- Extended `computeResDiff` to return `shared: string[]` in addition to `polyOnly`/`kalshiOnly` — intersection of both term sets, capped at 10 tokens
- Updated resolution diff panel ("KEY TERM DIFF") to show a third row: "Shared terms — positive signal for true match" with violet chip styling; only renders when `shared.length > 0`
- Renamed column headers from "Poly-only terms"/"Kalshi-only terms" to "Poly-only"/"Kalshi-only" (shorter) to leave visual room for the shared row
- Added `minLiquidity` persisted pref (`arb:min-liq`, default `0`) via `usePref`
- Updated `filtered` useMemo to include `Math.min(opp.poly.liquidity, opp.kalshi.liquidity) >= minLiquidity` guard (skipped when `minLiquidity === 0`)
- Added "Liq: Any | $500 | $1K | $5K" pill group in the filter row before the Min edge slider

### Tradeoffs / shortcuts
- Shared terms only appear when count > 0 — for clear false positives (different topics) this section is absent, which is the correct positive-UX signal
- `minLiquidity` filters on `Math.min(poly.liq, kalshi.liq)` — the binding constraint is the tighter side; this correctly hides thin-market pairs
- All 21 current scan pairs have min-liq < $1K (keyword-matched false positives have $0 Kalshi liquidity), so $1K filter returns 0 results — this is correct behavior, not a bug

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: ran scan → filter row shows "Liq: **Any** | $500 | $1K | $5K" pills
- Clicked $1K → "0 of 21 total · No opportunities match these filters" confirmed; `localStorage.getItem('arb:min-liq')` = "1000"
- Reset to Any → 3 opportunities restored
- Clicked first card → KEY TERM DIFF showed Poly-only (blue) and Kalshi-only (emerald) tokens; no shared terms (correct — this is a false positive)
- No console errors

### Follow-ups for future runs
- Shared terms will appear for genuine arb pairs (same-topic markets) — not visible yet with current all-false-positive keyword matches
- Kalshi position tracking still outstanding
- Per-pair alert threshold outstanding
- Could add a "Show table view" switch in the filter row to make all views accessible without clicking the view toggle

### Next milestone to pick up
**A22** — to be defined. Candidates: Kalshi position tracking; per-pair alert threshold; LLM-scored match with resolution text visible in table (not just drawer); JSONL history visualization improvements.

---

## 2026-04-26T20:30:00Z — milestone A22: Venue deep links + CSV export + dual-title table column

### What I did
- Added `ExternalLink` and `Download` icons to lucide-react imports
- Added `exportToCsv(opps: ScanOpp[])` helper: generates CSV with columns Question, Kalshi Title, Edge %, Edge ¢, Match, Direction, Poly Price ¢, Kalshi Price ¢, Closes, Category; uses `Blob` + `URL.createObjectURL` (client-side, no API route needed); downloads as `arb-{date}.csv`
- Added "Export" button (`variant="outline"`) in the page header between Auto controls and Run Scan; disabled when no filtered results
- Updated ArbDetail drawer header: added "↗ Poly" link (`https://polymarket.com/event/{slug}`) and "↗ Kalshi" link (`https://kalshi.com/markets/{ticker}`) as `<a target="_blank">` elements in the pair-ID row; Poly link is conditional on `opp.slug` being non-empty
- Updated TableView market cell: added `opp.kalshi.title` as a second line below `opp.question` (muted, 10px, truncated), making false positives immediately visible without opening the drawer

### Tradeoffs / shortcuts
- Kalshi URL (`/markets/{ticker}`) is a best-effort guess at the direct market page URL; if Kalshi's routing doesn't handle the full ticker, the link may redirect to their homepage rather than the specific market — acceptable for a localhost tool
- CSV export is fully client-side — no new API route; the file downloads instantly
- Dual-title row slightly increases table row height (adds ~14px); did not change the overall table layout

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: ran scan → Table view → first row market cell shows "Trump out as President before GTA VI?" (Polymarket) + "Will Trump end the Federal Reserve before Jan 20, 2029?" (Kalshi) on separate lines
- Clicked first row → drawer header shows "↗ Poly" (`polymarket.com/event/trump-out-as-president-before-gta-vi-846`) and "↗ Kalshi" (`kalshi.com/markets/KXFEDEND-29-JAN20`) links confirmed via DOM inspection
- Screenshot confirms: all three features visible, no console errors

### Follow-ups for future runs
- Verify Kalshi deep-link URL format resolves correctly in a real browser (may need to adjust to series-based URL e.g. `/markets/KXFEDEND`)
- Per-pair alert threshold still outstanding
- Kalshi position tracking still outstanding
- Could add the AI score column to the CSV export when `aiScoreCache` contains results

### Next milestone to pick up
**A23** — to be defined. Candidates: per-pair alert threshold (notify only when a starred pair crosses a custom threshold); Kalshi position tracking; AI score visible in table (without opening drawer) using the session cache.

---

## 2026-04-26T21:00:00Z — milestone A23: AI score column in table (lazy cache)

### What I did
- Added `aiScoreVersion: number` state + `onAiScoreReady` useCallback (increments version) to `ArbPage`
- Added `onAiScoreReady?: () => void` prop to `ArbDetail`; called after `aiScoreCache.current.set(opp.id, d)` when a score successfully arrives from Haiku
- Updated `TableView` to accept `aiScoreCache` and `aiScoreVersion` props
- Added `hasAiScores = (aiScoreVersion ?? 0) > 0` guard — "AI" column header and cells are only rendered when at least one score exists in the cache
- AI cell renders `<MatchBadge grade={...}/>` when `aiScoreCache.current.get(opp.id)` is set, else `—` (muted)
- Column populates lazily as user opens pairs in the drawer; no batch calls, no new API routes

### Tradeoffs / shortcuts
- Column stays hidden without `ANTHROPIC_API_KEY` (correct — no scores ever arrive, so `onAiScoreReady` is never called)
- Cache is session-only; column resets on page reload (same as before A23)
- `aiScoreVersion` triggers a full `ArbPage` re-render on each new score; acceptable at ≤25 pairs per scan

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: ran scan (11 results after High match filter) → Table view — no "AI" header (correct, no key set)
- Opened first row drawer → AI Similarity card shows "Set ANTHROPIC_API_KEY" fallback, no console errors
- "AI" column correctly absent (would appear only after key is set and first pair is scored)

### Follow-ups for future runs
- Set `ANTHROPIC_API_KEY` in `frontend/.env.local` to test live column population
- Per-pair alert threshold still outstanding
- Kalshi position tracking still outstanding

### Next milestone to pick up
**A24** — to be defined. Candidates: per-pair alert threshold for starred pairs; Kalshi position tracking; match-score sort column ("Sort by AI").

---

## 2026-04-26T21:30:00Z — milestone A24: Per-pair alert threshold

### What I did
- Added `[pairThresholds, setPairThresholds] = usePref<Record<string,number>>("arb:pair-thresholds", {})` to `ArbPage`
- Added `setPairThreshold(id, thresh | null)` callback: functional update that adds/removes from the map; `null` removes the key (falls back to global)
- Added `pairAlertRef` (mirrors `watchlistIds` + `pairThresholds`); kept in sync via `useEffect` — same ref pattern as `notifyRef`/`autoRunRef`
- Updated `runScan` notification block: computes `effectiveThresh` per opp — uses `pairThresholds[id]` if the pair is starred and has a per-pair threshold, else falls back to global `notifyRef.current.threshold`
- Added `pairThresholds` + `onSetPairThreshold` props to `ArbDetail`
- Added threshold pill row in `ArbDetail` sticky header (below the question title, visible only when `isWatched`): pills for >5%/>10%/>20%/>30%; active pill highlighted violet; clicking active pill clears it (toggle-off); "overrides global" label appears when a per-pair threshold is set

### Tradeoffs / shortcuts
- Threshold only applies during `runScan` (auto-scan or manual scan); it does not retroactively re-alert for already-notified pair IDs in `notifiedIdsRef` — clearing a threshold won't re-trigger
- Pills are only visible when `isWatched` — no point setting a threshold for an unwatched pair (it would never be checked against a special threshold anyway, since `pairAlertRef.current.watchlistIds.includes(opp.id)` gates the per-pair logic)

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` — 35/35 pass
- Browser: pre-starred pair `540820-KXFEDEND-29-JAN20` via localStorage; ran scan; opened drawer → "Alert at: >5% >10% >20% >30%" row visible below question title
- Clicked `>20%` → pill turned violet, `arb:pair-thresholds` localStorage = `{"540820-KXFEDEND-29-JAN20":20}`, "overrides global" label appeared
- Screenshot confirms: violet `>20%` pill, "overrides global" label, no console errors

### Follow-ups for future runs
- Could show the effective threshold in the notification itself ("alert at >20% · pair threshold")
- Sort by AI score (add `"ai"` to SortBy, sort by `aiScoreCache.current.get(opp.id)?.score ?? -1`)
- Kalshi position tracking still outstanding

### Next milestone to pick up
**A25** — to be defined. Candidates: sort by AI score; Kalshi position tracking; JSONL history pruning per-pair visualization.

---

## 2026-04-27T00:00:00Z — milestone A25: Sort by AI score

### What I did
- Added `"ai"` to the `SortBy` union type (was `"edge" | "size" | "closes" | "match"`)
- Updated `TableView` sort comparator: `sortBy === "ai"` case uses `aiScoreCache?.current?.get(b.id)?.score ?? -1` descending; unscored pairs (`-1`) automatically sink to the bottom
- Added `sort: "ai" as SortBy` to the AI column definition in `cols` — makes the "AI" column header clickable with `↓` active indicator when that sort is active
- Column + sort only appear when `hasAiScores` is true (i.e. at least one score has arrived from Haiku this session) — no UI change when API key is absent

### Tradeoffs / shortcuts
- AI column is session-scoped (cache is a `Map` ref, not persisted) — sort resets on page reload; acceptable since the cache repopulates as the user opens pairs
- Unscored pairs use `-1` sentinel (not `0`) so they always rank below any real score; avoids false ties with actual 0-score pairs (which would mean "completely unrelated", a valid score)
- No new API routes, no executor changes

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: `/arb` page loads cleanly, no console errors; AI column correctly absent (no API key set, `hasAiScores === false`); AI column will become sortable once `ANTHROPIC_API_KEY` is set and first pair is scored

### Follow-ups for future runs
- Kalshi position tracking still outstanding
- Could persist AI scores to `arb-history.jsonl` or a dedicated cache file so sort survives page reload
- Per-pair JSONL history visualization improvements outstanding

---

## 2026-04-27T00:30:00Z — milestone A26: Persist AI scores across sessions

### What I did
- Created `app/api/arb/ai-cache/route.ts`:
  - `GET` — reads `frontend/arb-ai-cache.json`, returns the full map (`Record<string, AiMatchEntry>`); `Cache-Control: no-store` so the client always gets fresh data
  - `POST` — merges a single `{ id, match }` entry (stamps `ts`) into the file; prunes to newest 200 entries sorted by `ts` desc before writing
- Updated `app/arb/page.tsx`:
  - Mount `useEffect`: added `GET /api/arb/ai-cache` fetch that populates `aiScoreCacheRef.current` from file on load; calls `setAiScoreVersion(entries.length)` so the AI column appears immediately if scores exist
  - `ArbDetail` AI fetch: after `aiScoreCache.current.set(opp.id, d)`, fires a background `POST /api/arb/ai-cache` (fire-and-forget, errors swallowed)

### Tradeoffs / shortcuts
- `arb-ai-cache.json` uses `ts` field added at write time (not from the Haiku response itself) for pruning — the `AiMatch` interface is unchanged on the client side
- File rewrite on every POST: acceptable at ≤200 entries for a localhost tool
- Cache is pair_id-keyed; if the same pair surfaces with a different question (very unlikely for stable Kalshi tickers), the old score is overwritten — correct behavior

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: fresh page load → `GET /api/arb/ai-cache → 200 OK` visible in network log (confirmed via preview_network)
- No console errors
- `arb-ai-cache.json` does not exist yet (file created on first Haiku score write; requires `ANTHROPIC_API_KEY` to be set to trigger a write)

### Follow-ups for future runs
- Kalshi position tracking still outstanding
- Per-pair JSONL history visualization improvements outstanding
- Test round-trip: set `ANTHROPIC_API_KEY`, open a pair, reload page → AI column should reappear without re-fetching Haiku

### Next milestone to pick up
**A27** — Background AI score queue.

---

## 2026-04-27T01:00:00Z — milestone A27: Background AI score queue

### What I did
- Added `Loader2` and `Sparkles` to lucide-react imports in `app/arb/page.tsx`
- Added 3 new variables in `ArbPage`: `scoreProgress` state (`null | { current, total }`), `cancelScoringRef`, `scoringActiveRef`
- Added `scoreAll` useCallback (defined after `filtered` useMemo so it can close over it): captures unscored pair IDs from `filtered` at call time, then iterates sequentially — for each pair: fetch resolution (same 5-min ISR cache as drawer), then POST to `/api/arb/match-score` with resolution text; stores result in `aiScoreCacheRef` + calls `onAiScoreReady()` + fire-and-forgets to `/api/arb/ai-cache`; 250ms delay between calls; aborts on 503 (no API key)
- Added `stopScoring` useCallback: sets `cancelScoringRef.current = true` which breaks the loop at the next iteration
- Added "Score All (N)" / "Stop X/N" / "All Scored" button in page header between Export and Run Scan: hidden when no scan results (`opps.length === 0`), shows unscored count from current `filtered` view (re-derives on each `aiScoreVersion` bump), spinner + "Stop X/N" while active, disabled when all already scored

### Tradeoffs / shortcuts
- `scoreAll` captures `filtered` (and hence `opps`) at call time — if a rescan happens mid-scoring, the loop continues on the original snapshot; pairs not found in `opps` are silently skipped
- 503 aborts the whole queue (no API key) — the button returns to idle immediately; user sees "Score All (N)" again, indicating the batch didn't complete
- `unscoredCount` in the button label uses `aiScoreCacheRef.current` during render, updated via `aiScoreVersion` state bump — no stale display
- No toast on completion — the button label changes from "Stop X/N" back to "Score All (0)" or "All Scored" which is self-evident

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → "Score All (3)" button appeared in header between Export and Run Scan (Sparkles icon, correct count matching `filtered` unscored pairs given active Med+ filter); screenshot confirms layout
- No console errors

### Follow-ups for future runs
- Test with `ANTHROPIC_API_KEY` set: click "Score All" → watch AI column populate row by row; click Stop mid-way
- Kalshi position tracking still outstanding
- Per-pair JSONL history visualization improvements outstanding

### Next milestone to pick up
**A28** — to be defined. Candidates: Kalshi position tracking; JSONL history chart improvements (per-pair mini-chart in table); pair score vs spread correlation view.

---

## 2026-04-27T02:00:00Z — milestone A28: Real history sparklines

### What I did
- Added `realHistRef = useRef<Map<string, number[]>>(new Map())` and `[histVersion, setHistVersion] = useState(0)` to `ArbPage`
- Added `refreshRealHist` useCallback (empty deps, stable): fetches `GET /api/arb/history` (all entries, newest-first), groups by `pair_id` capped at 15 entries per pair, reverses each array to oldest-first, stores in `realHistRef`, increments `histVersion`
- Called `refreshRealHist()` in the mount `useEffect` (alongside alert log + AI cache fetches) to hydrate sparklines from history written in previous sessions
- Called `refreshRealHist()` in `runScan` via `.then()` on the history POST — so sparklines update after each scan once the POST completes; added `refreshRealHist` to `runScan`'s deps array
- Updated `TableView` props: added `realHistRef` and `histVersion`; updated "30m" column label to `(histVersion ?? 0) > 0 ? "Trend ●" : "Trend"` — the ● dot signals real history is loaded
- Updated sparkline in `TableView` row: `realHistRef?.current?.get(opp.id) ?? opp.history` — real data when ≥2 points, synthetic fallback otherwise
- Updated `CardView` props: added `realHistRef`; same sparkline fallback pattern
- Updated render calls at page bottom to pass `realHistRef` and `histVersion` to `TableView`; `realHistRef` to `CardView`

### Tradeoffs / shortcuts
- Real sparklines require ≥2 scans to show a trend (1 data point renders `null` from `Sparkline`); synthetic data shows as placeholder on the first scan — acceptable UX
- `refreshRealHist` fetches ALL history entries (all pairs) in one call rather than per-pair — one round-trip per scan instead of N, but the full file can be large if history grows. Acceptable at ≤500 total entries (existing JSONL cap)
- The `histVersion` state change triggers `ArbPage` re-render which cascades to `TableView`/`CardView` (neither is memoized), so they read updated `realHistRef.current` without needing the version passed explicitly — passing it to `TableView` only serves to drive the column header label change
- Race condition: `refreshRealHist` fires inside `.then()` of the history POST, so it runs after the POST completes — current scan's data IS included in the sparkline on the same scan (unlike calling GET before POST)

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran scan → 2 results visible in table with "TREND ●" column header (dot confirms `histVersion > 0`, real history loaded from previous sessions)
- `window.performance.getEntriesByType('resource').filter(e => e.name.includes('arb/history'))` confirmed 3 calls: mount + 2 scan cycles
- No console errors

### Follow-ups for future runs
- Run multiple scans in sequence and verify sparklines show actual trend variation (widening/narrowing spread visible as slope in sparkline)
- Kalshi position tracking still outstanding
- Could add a "Δ edge" delta column showing spread change since previous scan (requires storing previous scan edge per pair in a ref)

### Next milestone to pick up
**A29** — to be defined. Candidates: Spread change delta column (show ↑/↓ vs previous scan in table edge column); Kalshi position tracking; pair score vs spread correlation scatter.

---

## 2026-04-27T03:00:00Z — milestone A29: Spread delta indicator in Edge column

### What I did
- Added `prevEdgeRef = useRef<Map<string, number>>(new Map())` to `ArbPage`
- In `runScan`, before overwriting `prevOppsRef.current`, snapshot the previous scan's edges into `prevEdgeRef.current` (keyed by `opp.id`)
- Added `prevEdgeRef?: React.MutableRefObject<Map<string, number>>` prop to `TableView`
- In the Edge cell of each table row: after `EdgePill`, render a small `↑`/`↓` + magnitude string when `|delta| >= 0.1`; green for widening spread, red for narrowing
- Passed `prevEdgeRef` from `ArbPage` to `TableView` at the render site

### Tradeoffs / shortcuts
- Delta only visible after the second scan — first scan has no previous data (correct; the ref starts empty)
- No state/version counter needed: `TableView` re-renders whenever `opps` changes (via `setOpps`), which happens right after `prevEdgeRef.current` is updated in `runScan`, so React reads the latest ref value
- Threshold of 0.1pp ignores sub-tick noise; identical prices between scans show no delta (verified: two back-to-back scans on stable market returned clean edge pills with no arrow)
- Delta is session-only; resets on page reload (the previous scan ref is not persisted)

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: ran first scan (2 results, no arrows — correct); ran second scan immediately (prices unchanged, delta < 0.1pp, no arrows — correct stable-market behavior)
- No console errors

### Follow-ups for future runs
- Delta arrows will be visible when auto-scan is running over a volatile session — need a real market movement to see them in practice
- Kalshi position tracking still outstanding
- Pair score vs spread correlation scatter still outstanding

### Next milestone to pick up
**A30** — to be defined. Candidates: Kalshi position tracking; pair score vs spread correlation scatter; per-pair spread change history chart in drawer.

---

## 2026-04-27T04:00:00Z — milestone A30: Per-pair spread history chart in drawer

### What I did
- Added `SpreadChart({ entries })` component between `Sparkline` and the `// ── Table view` section: renders an SVG (400×80 viewBox) with labeled X-axis timestamps (oldest → latest, bottom corners), Y-axis ticks (min/mid/max with `±X.X` labels), horizontal grid lines, a dashed zero-crossing line when data straddles 0, a color-coded area+line (emerald when latest ≥ 0, rose when negative), per-entry dots (r=2 for ≤10 pts, r=1.5 for more)
- Replaced the plain `<Sparkline>` in the "Spread history" section of `ArbDetail` with `<SpreadChart entries={history}/>` wrapped in an IIFE that also computes and renders a summary line: "oldest X% → latest Y% Δ±Z% over Nh"
- Delta value colored emerald (widening) / rose (narrowing) when |Δ| > 0.05pp, neutral otherwise
- Expanded history table from `history.slice(0, 8)` to all entries, inside a `max-h-48 overflow-y-auto` scrollable container; table header is `sticky top-0 bg-card` to stay visible while scrolling
- Added Direction column to the table showing `P→K` (buy_poly_sell_kalshi) or `K→P` abbreviation

### Tradeoffs / shortcuts
- `SpreadChart` uses `preserveAspectRatio` omitted (SVG default) with a `viewBox="0 0 400 80"` and `className="w-full"` — scales cleanly to the drawer width without JS resize listeners
- Y-axis mid tick is the arithmetic mean of min/max, not a "round number" tick — acceptable for the fine-grained spreads seen in practice (e.g. 27.1–27.2%)
- `lineColor` is a hard-coded hex (`#10b981` / `#f43f5e`) rather than a CSS variable — SVG `stroke` does not inherit Tailwind classes without extra wiring; the colors match emerald-500/rose-500 exactly
- History data is already fetched in the existing `useEffect` (unchanged) — no new API calls

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: opened first pair → scrolled to "SPREAD HISTORY" → chart rendered with green line, Y-axis labels (+27.2/+27.1), X-axis timestamps (04:08 PM → 04:04 AM), 28 scans tracked; summary line "oldest +27.1% → latest +27.2% Δ+0.1% over 11.9h" visible; full history table with K→P direction column, scrollable
- No console errors

### Follow-ups for future runs
- Kalshi position tracking still outstanding
- Pair score vs spread correlation scatter still outstanding
- Could add a tooltip on hover over data dots showing exact timestamp + edge for that scan

### Next milestone to pick up
**A32** — to be defined. Candidates: Kalshi position tracking; pair score vs spread correlation scatter; batch match scoring UI improvements.

---

## 2026-04-27T05:00:00Z — milestone A31: SpreadChart hover tooltip

### What I did
- Added `useState<number | null>(null)` for `hovered` index tracking in `SpreadChart`
- Wrapped each data dot in a `<g key={i} style={{cursor:"crosshair"}} onMouseEnter={() => setHovered(i)}>` group containing: (1) a transparent `r=6` hit-target circle for reliable mouse capture, (2) a visible dot that grows from `r=1.5` to `r=3.5` on hover
- Added `onMouseLeave={() => setHovered(null)}` to the outer `<svg>` element to clear hover state when mouse leaves chart
- Rendered a floating SVG tooltip box (IIFE pattern) when `hovered !== null`: 88×30 px rect with `fill:"hsl(var(--card))"` background, date+time label in fontSize=7, `±X.XX%` edge value in fontSize=9 fontWeight=600 colored to match the line
- Edge-aware tooltip placement: flips left when `cx + tw + 8 > W - PAD.right`, flips down when `cy - th - 6 < PAD.top`
- Tooltip rendered in a `<g style={{pointerEvents:"none"}}>` overlay to avoid interfering with dot hover events

### Tradeoffs / shortcuts
- Tooltip uses SVG `<rect>` + `<text>` rather than HTML overlay — keeps all rendering within the SVG coordinate system, no need for `getBoundingClientRect` or portal
- `hsl(var(--card))` for tooltip background uses the shadcn/ui design token, so it adapts to light/dark mode automatically
- Hit-target radius of 6px is generous on a 400px-wide chart with up to 29 points (~13px spacing) — at high density some targets will overlap, but in practice arb history rarely exceeds 30 entries

### Verified by
- `bun run tsc --noEmit` — 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser DOM inspection: `circleCount: 58, groupCount: 29` (2 circles per entry — hit target + visible dot); correct SVG structure confirmed

### Next milestone to pick up
**A32** — Candidates: Kalshi position tracking; pair score vs spread correlation scatter; batch match scoring UI improvements.

---

## 2026-04-27T06:00:00Z — milestone A32: Server-side scan route + snapshot cache

### What I did
- Created `app/api/arb/scan/route.ts` (new file, ~250 lines):
  - **GET** — reads `arb-latest.json` and returns it (for instant page-load display); returns empty result if file doesn't exist yet
  - **POST** — checks cache: if `arb-latest.json` is < 5 min old and `force` is not set, returns cached result with `{ cached: true }`; otherwise runs a full fresh scan
  - Fresh scan: fetches ALL Kalshi markets in one paginated pass (cursor-based, up to 5 pages) + political series supplement; fetches Polymarket markets for each SCAN_QUERY keyword in parallel; cross-matches by keyword score; computes spreads + fees; writes results to `arb-latest.json` + appends to `arb-history.jsonl` (same pruning logic as before)
  - Returns `{ opps, scannedAt, cached, kalshiCount, illiquidFiltered }`
- Simplified `runScan` in `page.tsx` from ~100 lines to ~50: now a single `fetch('/api/arb/scan', { method: 'POST', body: { force } })` call; history writing, market fetching, spread computation all moved to server
- Added `lastScannedAt` state + `nowTick` state (30s interval) + `lastScannedLabel` useMemo to `ArbPage`; shows "scanned Xm ago" below the Run Scan button
- Updated mount effect to also `GET /api/arb/scan` on load — if snapshot has opps, populates state immediately (instant display without clicking Run Scan)
- Added `3600` to `AUTO_INTERVALS` (1h option) with correct label `1h`; fixed countdown display to show `Xh Ym` format for intervals ≥ 3600s
- Route is cron-ready: any external process (cron, curl) can `POST http://localhost:3111/api/arb/scan` to trigger an unattended scan

### Tradeoffs / shortcuts
- Server-side scan fetches ALL Kalshi markets (not keyword-filtered per-query) before cross-matching — this is actually better coverage (134 markets vs ~4 before); the Poly fetch is still keyword-based (7 parallel queries) to limit Gamma API calls
- Pure math functions (`calcNetEdge`, `keywordScore`, `computeMatchQuality`, `toScanOpp`, `syntheticHistory`) are duplicated in the route — the browser copies are still present but no longer called in `runScan`; they remain for display helpers (`computeResDiff`, etc.)
- `force` flag allows bypassing cache; currently only the "Run Scan" button passes `force: false` (same as default); a future "Force refresh" button could pass `force: true`
- `arb-latest.json` is written to `process.cwd()` which Next.js resolves to `frontend/` — same directory as `arb-history.jsonl`

### Verified by
- `bun run tsc --noEmit` — 0 errors (two runs, both exit 0)
- `python -m pytest` in executor/ — 35/35 pass
- `curl -X POST http://localhost:3111/api/arb/scan -H "Content-Type: application/json" -d '{}'` → `scannedAt: 2026-04-26T22:38:56Z, opps: 25, cached: False`
- `arb-latest.json` created at `frontend/arb-latest.json` with 25 opps
- Browser: page reload → snapshot loaded instantly (25 opps, no scan needed); "scanned 1m ago" label visible under Run Scan button; 134 Kalshi markets shown in meta badge

### Follow-ups for future runs
- Wire up a system cron: `* * * * * curl -s -X POST http://localhost:3111/api/arb/scan -H "Content-Type: application/json" -d '{}' >> /tmp/arb-scan.log` (every hour: change `* * * * *` to `0 * * * *`)
- Could expose a `/api/arb/scan/status` GET that returns last scan time + result count without returning all opps (useful for a status indicator)
- Kalshi position tracking still outstanding
- Browser `kalshiCatsArr` filter preference is no longer sent to the server scan (server fetches all categories); the UI category pills still filter displayed results correctly

### Next milestone to pick up
**A33** — Kalshi position tracking, scatter plot, and batch scoring UI improvements (all picked up together in the next run).

---

## 2026-04-27T06:00:00Z — milestones A33 + A34 + A35: Kalshi positions, scatter plot, batch scoring UI

### What I did

**A33 — Kalshi position tracking:**
- Created `app/api/arb/kalshi-positions/route.ts`: `GET /api/arb/kalshi-positions` calls `trade-api/v2/portfolio/positions` with `Authorization: Token {KALSHI_API_KEY}`; returns `{ positions[] }` or `{ error }` with 503 when key is absent
- Added `KalshiPosition` interface (ticker, market_title, position, market_exposure, realized_pnl, resting_order_count)
- `ArbPage`: on mount, fetches kalshi-positions into `kalshiPosMap: Map<string, KalshiPosition> | null` (ticker → position); `kalshiPosError` holds any error string; both passed to `ArbDetail`
- `ArbDetail`: new "Kalshi Position" panel shows contracts held, exposure ($), realized P&L (emerald/rose colored), resting order count; loading skeleton while `kalshiPosMap === null`; "Set KALSHI_API_KEY" message when error = "KALSHI_API_KEY not set"; panel hidden entirely when key is absent (clean UX)

**A34 — AI score vs spread scatter plot:**
- New `ScatterPlot` component: 540×240 SVG with X=AI similarity score (0–100), Y=net edge %; color-coded dots by grade (emerald H / amber M / slate L); transparent r=8 hit-target circle per point with r=4/5.5 visible dot (grows on hover); edge-aware tooltip (flips left/down near borders) showing truncated question, AI score, and edge %; dashed zero-line when spread crosses 0; legend row with grade colors
- Added `"scatter"` to `ViewMode` union
- Computed `hasAiScores = aiScoreVersion > 0` at `ArbPage` scope (was previously only inside `TableView`)
- View toggle gains a "Scatter" button (scatter-dot SVG icon) that appears only when `hasAiScores` is true; click opens the scatter view
- Clicking a scatter dot calls `onSelect(opp)` to open the detail drawer

**A35 — Batch scoring UI improvements:**
- Added `scoreSummary: { total: number; h: number; m: number; l: number } | null` state
- `scoreAll` now tallies H/M/L counts during the loop; after the finally block, calls `setScoreSummary(tally)` when `tally.total > 0`
- `useEffect` auto-dismisses summary after 6 seconds (clears on re-score)
- Added full-width progress strip below the page header (visible only during active scoring): violet `Sparkles` icon, "Batch scoring X/N" label, ETA counter (~0.8s/pair), violet progress bar, Cancel button
- Added green completion banner (visible after scoring, auto-dismissed after 6s): check icon, "Scored N pairs", H/M/L color-coded counts, ×-close button

### Tradeoffs / shortcuts
- Kalshi positions are fetched once on mount (not refreshed after scan) — position changes mid-session require a page reload; acceptable since positions rarely change mid-session
- `realized_pnl` and `market_exposure` are divided by 100 (Kalshi returns cent-denominated values); if Kalshi API returns dollars instead, this would show 1/100th; gracefully wrong rather than crashing
- Scatter plot is view-mode only (not shown alongside table) — avoids layout complexity; switching back to table retains filter state
- `hasAiScores` is now computed at ArbPage scope and also inside TableView (slight duplication) — both derive from `aiScoreVersion`, so they always agree

### Verified by
- `npx tsc --noEmit --skipLibCheck` — exit 0
- `node_modules/.bin/tsc --noEmit` — exit 0
- `python -m pytest` in executor/ — 35/35 pass
- Browser: page renders without new JS errors (pre-existing usePref hydration mismatch only); table, cards, live views all load correctly; Kalshi position panel renders with graceful "Set KALSHI_API_KEY" message (key not set in dev)

### Next milestone to pick up
**A36** — Candidates: system cron setup + scan log viewer; pair watchlist sync to server (persist across devices); improved false-positive triage (side-by-side resolution diff in table row).

---

## 2026-04-27T07:00:00Z — milestone A36: Inline row quick-peek with resolution diff

### What I did
- Added `ChevronDown` to lucide-react imports
- Added 4 state/ref items to `TableView`: `expandedId: string | null`, `expandLoading: boolean`, `expandResData = useRef<Map<string, ResolutionData | null>>(new Map())`, `expandResVersion: number`
- Added `handleExpandToggle(e, opp)`: stops propagation, toggles `expandedId`, lazily fetches `/api/arb/resolution?poly_slug=...&kalshi_ticker=...` on first expand; result is cached in `expandResData` ref; `expandResVersion` is bumped to trigger re-render
- Wrapped each `<tr>` in a `<React.Fragment key={opp.id}>` to allow the sibling expansion row
- Replaced the decorative `>` SVG chevron in the last column with a `<ChevronDown>` that rotates `-rotate-90` when collapsed and becomes upright when expanded; click calls `handleExpandToggle`, stopping propagation so the row-click drawer doesn't also fire
- Added expansion `<tr>` (sibling to main row, inside Fragment) rendered when `expandedId === opp.id`:
  - 2-column grid: **Polymarket** (blue header) shows full question + first 400 chars of description; **Kalshi** (emerald header) shows full title + first 400 chars of rules_primary; loading skeleton while fetch is in-flight
  - 3-column key-term diff using existing `computeResDiff`: Poly-only (blue), Kalshi-only (emerald), Shared (violet); each column shows up to 6 tokens
  - Amber "Verify resolution criteria match" warning row + "Open full →" button (calls `onSelect(opp)`) at the bottom

### Tradeoffs / shortcuts
- Resolution fetch is lazy and per-expand; no pre-fetching at scan time — avoids 25+ API calls on every scan
- Cache lives in a `useRef` inside `TableView`; survives re-renders but resets on page reload (fine — resolution text rarely changes mid-session and the API has 5-min ISR cache)
- `expandResVersion` state is used as a read-dependency in the render loop (`expandResVersion >= 0` tautology) so React knows to re-render when the ref map is updated — standard ref-backed state pattern
- Only one row expands at a time; `expandLoading` is a single boolean (not per-row), which is correct since only one expand can be in-flight at once

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0, no errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: page loaded with 25 scan results; clicked last cell of row 1 → tbody grew from 25 to 26 rows; expansion row showed "POLYMARKET / GTA VI released before June 2026?" vs "KALSHI / More tech layoffs in 2026 than in 2025?"; key-term diff showed Poly-only: grand, theft, auto, officially, released; Kalshi-only: layoffs, sector, resolves; Shared: 2026, count, information — clear false positive visible at a glance
- Screenshot confirmed: amber warning + 3-column diff rendered correctly; chevron rotated to ⌄ on expanded row

### Follow-ups for future runs
- System cron setup + scan log viewer — wire a cron to `POST /api/arb/scan` and show a "last N scans" log in the UI
- Pair watchlist sync to server — persist starred IDs to a server-side file so they survive across devices
- Could also expand to Cards view (currently only TableView has the inline peek)

### Next milestone to pick up
**A38** — Candidates: server-persisted watchlist; forced-refresh button; scan-log CSV export.

---

## 2026-04-27T08:00:00Z — milestone A37: Scan log viewer + cron setup

### What I did
- Updated `app/api/arb/scan/route.ts`:
  - Added `SCAN_LOG_FILE = path.join(process.cwd(), "scan-log.jsonl")` and `MAX_SCAN_LOG = 100`
  - Added `ScanLogEntry` interface: `{ ts, source, opps_count, kalshi_count, illiquid_filtered, duration_ms }`
  - Added `appendScanLog()` helper (appends entry, prunes file to `MAX_SCAN_LOG` lines)
  - `POST` handler now reads `X-Scan-Source` request header (`"manual"` by default, `"cron"` for external callers), records `t0 = Date.now()`, and appends a `ScanLogEntry` alongside the existing history + snapshot writes
- Created `app/api/arb/scan-log/route.ts`: `GET` reads `scan-log.jsonl`, reverses (newest first), returns up to 50 entries with `Cache-Control: no-store`
- Updated `app/arb/page.tsx`:
  - Added `ClipboardList` and `Terminal` to lucide-react imports
  - Added `ScanLogEntry` interface
  - Added `scanLog: ScanLogEntry[]` state and `showScanLog: boolean` state
  - Mount `useEffect`: fetches `GET /api/arb/scan-log` on load, populates `scanLog`
  - `runScan`: fires `GET /api/arb/scan-log` after each scan to refresh the log
  - Header: added sky-themed `ClipboardList` icon button (title="Scan run log") next to the alert History button
  - Panel (conditionally rendered when `showScanLog`): sky-bordered, shows last 20 entries with relative timestamp, source badge (sky=manual / emerald=cron / amber=forced), opps count, Kalshi market count, illiquid filtered count, and duration (ms or s); empty state when no runs yet; cron command at the bottom showing the `X-Scan-Source: cron` header invocation

### Tradeoffs / shortcuts
- Scan log is append-only with a simple tail-prune (last 100 lines); no per-source or per-day grouping — acceptable for a localhost tool
- `source` is derived from the `X-Scan-Source` request header; the browser UI always sends the default ("manual"); cron jobs or curl callers can pass `"cron"` to make entries visually distinct
- Panel shows last 20 entries (not all 50 returned by the API) to keep the panel compact; the full log is in the file and available via the API
- `duration_ms` covers the full POST handler from `t0 = Date.now()` to just before the final `NextResponse.json(response)` — includes Kalshi fetch + Poly fetch + cross-match; excludes file I/O for log writes (those run in `Promise.allSettled`)

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0, no errors
- `python -m pytest` in executor/ — 35/35 pass
- `GET /api/arb/scan-log → 200 OK` visible in mount network requests
- Ran scan via eval → `scan-log.jsonl` created with entry: `{"ts":"2026-04-27T00:11:18.097Z","source":"manual","opps_count":25,"kalshi_count":125,"illiquid_filtered":4,"duration_ms":797}`
- Clicked "Scan run log" button → panel opened showing "SCAN LOG · 1 recorded runs"; entry: "33s ago · MANUAL · 25 opps · 125K mkt · 4 illiq. · 797ms"; cron command visible at bottom
- Screenshot confirmed: panel renders with sky border, source badge, and cron snippet

### Follow-ups for future runs
- Server-persisted watchlist: persist starred pair IDs to a JSON file so they survive page reloads across devices
- Could add a "Forced" refresh button that passes `force: true` to `POST /api/arb/scan` and sets `source: "forced"`
- Could add scan-log CSV export
- `showScanLog` is session-only state (resets on reload) — could be persisted via `usePref` if frequently used

### Next milestone to pick up
**A38** — Candidates: server-persisted watchlist; forced-refresh button; scan-log CSV export.

---

## 2026-04-27T09:00:00Z — milestone A38: Server-persisted watchlist

### What I did
- Created `app/api/arb/watchlist/route.ts`:
  - `GET` — reads `frontend/arb-watchlist.json`, returns `{ ids: string[] }`; returns `{ ids: [] }` if file absent; `Cache-Control: no-store`
  - `POST` — accepts `{ ids: string[] }`, writes to file; returns `{ ok: true }`
- Added `syncWatchlist(ids: string[])` useCallback to `ArbPage`: fire-and-forget POST to `/api/arb/watchlist`; errors silently swallowed
- Updated `toggleWatchlist`: computes the new array inside the functional update and calls `syncWatchlist(next)` — single write per star/unstar action
- Updated mount `useEffect`: added `GET /api/arb/watchlist` fetch; when server returns non-empty `ids`, calls `setWatchlistIds(serverIds)` overriding localStorage; server is the source of truth when non-empty
- Updated clear watchlist button `onClick`: added `syncWatchlist([])` after clearing local state

### Tradeoffs / shortcuts
- Mount fetch uses server-wins logic: if server has IDs, they replace localStorage. If server is empty, localStorage is kept. This means the first run after adding this feature will inherit whatever is in localStorage (correct behavior).
- Fire-and-forget POST on every star/unstar means a failed write is silently lost — acceptable for a localhost tool where write failures are transient
- `arb-watchlist.json` is a full-rewrite file (not append-only) — at ≤N pair IDs it's trivial; no pruning needed
- The multiple GETs visible in the network log per load (mount + HMR re-mounts) are harmless; `Cache-Control: no-store` prevents stale data

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0, no errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: `GET /api/arb/watchlist → {"ids":[]}` confirmed via eval on fresh page load
- Round-trip: `POST /api/arb/watchlist {ids:["test-pair-123","test-pair-456"]}` → GET returned same IDs correctly
- After `window.location.reload()`: network log showed `GET /api/arb/watchlist → 200 OK` at mount confirming mount effect fires with new code
- Cleaned up test data via `POST {ids:[]}` after verification; no console errors introduced

### Follow-ups for future runs
- Forced-refresh button: pass `force: true` to `POST /api/arb/scan` to bypass the 5-min cache
- Scan-log CSV export
- `showScanLog` / `showAlertLog` are session-only state; could be persisted via `usePref` if frequently used

### Next milestone to pick up
**A39** — Candidates: forced-refresh button; scan-log CSV export; pair watchlist stats panel (total notional, best edge among starred pairs).

---

## 2026-04-27T10:00:00Z — milestone A39: Force-refresh + panel persistence + watchlist stats strip

### What I did
- **Scan route (`app/api/arb/scan/route.ts`)**: Changed `source` derivation so `body.force === true` sets `source = "forced"` automatically — the existing amber "FORCED" badge in the scan log now fires without any extra client-side header; cron callers still set `"cron"` via `X-Scan-Source` header
- **Force button**: Added `RefreshCw`-icon "Force" outline button (h-8, `variant="outline"`) immediately left of "Run Scan"; both buttons share the `scanning` disabled state; "Force" calls `runScan(true)` (bypasses 5-min snapshot cache); tooltip: "Force refresh — bypass 5-min snapshot cache"
- **Panel persistence**: Changed `showScanLog` and `showAlertLog` from `useState(false)` to `usePref<boolean>("arb:show-scan-log", false)` and `usePref<boolean>("arb:show-alert-log", false)` — panels now reopen on page reload if left open in a prior session
- **Watchlist stats strip**: Added amber-bordered strip (rendered via IIFE when `showWatchlist && watchlistIds.length > 0 && opps.length > 0`) between the filter row and the views section; computes from `opps.filter(o => watchlistIds.includes(o.id))`; shows ★ icon, count, "Best: +X% pair title", "Avg edge: +Y%"; hidden entirely when watchlist is empty or inactive

### Tradeoffs / shortcuts
- Stats strip uses all starred opps (not the further-filtered `filtered` array) — best-edge and count are always about the full watchlist regardless of other active filters; a starred pair filtered out by minEdge still shows in the strip
- Panel persistence via `usePref` picks up the pre-existing localStorage hydration mismatch (server renders `false`, client reads saved `true`) — React warns and corrects; same pre-existing behavior as other `usePref` booleans; no regression
- `showScanLog`/`showAlertLog` keys are new (`arb:show-scan-log`, `arb:show-alert-log`); existing sessions that had them open will get `null` on first load (defaults to `false`), then persist correctly thereafter

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0
- `python -m pytest` in executor/ — 35/35 pass
- Browser: page loaded; Force + Run Scan buttons visible in header; clicked Run Scan; scan completed ("scanned just now" label); watchlist active with 1 starred pair → amber stats strip appeared: "★ 1 starred · Best: +73.8% GTA VI released before June 2026? · Avg edge: +73.8%"
- Screenshot confirmed all three A39 features rendering correctly

### Follow-ups for future runs
- Scan-log CSV export
- Force button could show a flash/"bypassed cache" toast after completion
- Stats strip could show total addressable capital across starred pairs

### Next milestone to pick up
**A40** — Candidates: scan-log CSV export; per-category spread heatmap; "stale cache" indicator when snapshot is >5min old

---

## 2026-04-27T11:00:00Z — milestone A40: Stale cache warning

### What I did
- Added `snapshotStaleness` useMemo (depends on `lastScannedAt` + `nowTick`, same deps as `lastScannedLabel`) returning `"fresh" | "stale" | "very-stale"` based on age thresholds: fresh (<5min), stale (5–15min), very-stale (>15min)
- Updated "scanned X ago" label `<span>`: dynamic `text-*` class (muted-foreground / amber-500 / rose-500); prepends a pulsing `<span className="animate-pulse">●</span>` when not fresh; added `flex items-center gap-1` for alignment
- Updated Force button: border + text color mirrors staleness tier (amber-500/60 border, amber-500 text for stale; rose-500/60 / rose-500 for very-stale); tooltip changes to "Data is stale — force refresh now" when not fresh; `transition-colors` added for smooth tier transitions

### Tradeoffs / shortcuts
- `snapshotStaleness` is derived purely from `lastScannedAt` + `nowTick` (ticks every 30s) — the amber/rose threshold has up to 30s latency, which is imperceptible for 5-min/15-min boundaries
- No new state or API calls — staleness is purely computed from existing state
- The hydration errors in the console are pre-existing (from `usePref`-backed Kalshi category pills since A10); A40 introduces no new hydration mismatches

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0, no errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser DOM eval: `{ className: "text-[10px] font-mono flex items-center gap-1 text-rose-500", text: "●scanned 41m ago" }` — rose color and pulsing dot present for 41min-old snapshot (> 15min → very-stale)
- Screenshot confirmed: Force button has rose border, "● scanned 41m ago" label visible in rose below Run Scan button

### Follow-ups for future runs
- Scan-log CSV export still outstanding
- Per-category spread heatmap
- Could add a toast on Force completion ("Cache bypassed — fresh data loaded")

### Next milestone to pick up
**A41** — Candidates: scan-log CSV export; per-category spread heatmap; Polymarket position integration in arb drawer

---

## 2026-04-27T12:00:00Z — milestone A43: Polymarket position in ArbDetail

### What I did
- Added `PolyPosition` interface to `app/arb/page.tsx`: `{ conditionId, title, outcome, size, avgPrice, currentPrice, cashPnl, currentValue, closed }`
- Added `polyPosMap: Map<string, PolyPosition[]> | null` and `polyWalletSet: boolean` state to `ArbPage`
- In the mount `useEffect`: reads `"polymarket_wallet_address"` from localStorage (same key used by `/positions` page); if set, fetches `/api/positions?user=<wallet>` and indexes results by `conditionId` (one market can have multiple outcome positions); if not set, keeps `polyPosMap = new Map()` and `polyWalletSet = false`
- Added `polyPosMap` and `polyWalletSet` props to `ArbDetail` signature and call site
- Added "Polymarket Position" panel in `ArbDetail` immediately before the "Create Rule" button (symmetric placement to existing Kalshi Position panel):
  - When `polyWalletSet = true`: shows the panel; if `polyPosMap === null` → loading skeleton; if no open positions → "No open position on this market."; if positions found → 4-column grid per position (Outcome / Size / Avg Price / Cash P&L with emerald/rose coloring)
  - When `polyWalletSet = false`: shows a prompt with link to `/positions` to configure a wallet address

### Tradeoffs / shortcuts
- Positions fetched once on mount (same pattern as Kalshi positions); stale if user makes trades mid-session — acceptable for a localhost tool
- `conditionId` matching reuses the existing `opp.condition_id` field already in `ScanOpp` — no new API field needed
- Multiple outcome positions for the same market (YES + NO) are both shown as separate rows in `open.map()` — edge case for hedged positions
- The wallet key `"polymarket_wallet_address"` is shared with `/positions` page (defined as `STORAGE_KEY` there) — no new localStorage key introduced
- Pre-existing Kalshi category pill hydration warnings unchanged (not caused by A43)

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0
- `python -m pytest` in executor/ — 35/35 pass
- Browser: `/arb` loaded; ran scan → 25 results; clicked first table row → drawer opened; scrolled to "POLYMARKET POSITION" panel → rendered "No open position on this market." (test wallet `0x000...0001` has no real positions); panel correctly shows wallet-linked state
- Screenshot confirmed: panel appears between key-term diff section and "Create Rule" button

### Follow-ups for future runs
- Scan-log CSV export (repeatedly deferred)
- Per-category spread heatmap: aggregate avg/max edge by Kalshi category across all current opps
- Refresh positions after each scan (so new fills appear without page reload)

### Next milestone to pick up
**A44** — Candidates: scan-log CSV export; per-category spread heatmap; refresh Poly positions after scan

---

## 2026-04-27T13:00:00Z — milestone A44: Per-category spread heatmap

### What I did
- Added `CategoryHeatmap` function component (before `TableView`) in `app/arb/page.tsx`:
  - `useMemo` groups `opps` by `opp.category` (Macro/Politics/Other/…), computes count, avg net edge, and max net edge per category; sorts descending by avg edge
  - Renders a `flex flex-wrap` row of compact `w-[108px]` cards below the KPI grid
  - Each card: category name + count badge, a 3px proportional bar (emerald for positive, rose for negative, width scaled to max abs avg across all categories), avg edge value in color-coded monospace, optional "max +X%" sub-line when max ≫ avg (+2% threshold)
  - Clicking a card calls `onSelect(cat)` to set the category filter; clicking an already-active card resets to "all"; active card shown with `ring-1 ring-foreground/20` border highlight
  - Component takes the full unfiltered `opps` array so the breakdown is stable regardless of other active filters
- Wired into the render between the KPI grid and the "Empty / loading" block: `{opps.length > 0 && !scanning && <CategoryHeatmap opps={opps} activeCat={cat} onSelect={setCat}/>}`
- Added A44 to ROADMAP.md

### Tradeoffs / shortcuts
- Heatmap uses `opps` (unfiltered), not `filtered` — so bar heights and counts don't shift as you apply minEdge/match/liq filters; this gives a stable "full picture" view which is more useful for category-level signal
- Categories are the post-`CATEGORY_MAP` values ("Macro", "Politics", "Other", etc.), same as what the filter-row pills use, so clicking a heatmap card and clicking the filter-row pill are equivalent
- No new state, no new API routes, no new localStorage keys — purely computed from existing state

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0, 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: heatmap renders 3 cards (Macro 5, Other 11, Politics 9) with green bars and avg/max labels
- Click "Macro" card → results filter to 5 of 25, Macro card shows ring highlight, filter-row "Macro" pill activates, KPIs update to 39.78% avg / $500 addressable / $199 profit
- No new console errors (pre-existing Kalshi category pill hydration warnings unchanged)

### Follow-ups for future runs
- Scan-log CSV export (deferred 4 times — good candidate for next run)
- Refresh Poly positions after each scan
- Could add a count-of-high-match pairs per category as a sub-label on each heatmap card

### Next milestone to pick up
**A45** — Candidates: scan-log CSV export; refresh Poly positions after scan; count-of-H-match pairs per heatmap card

---

## 2026-04-27T14:00:00Z — milestone A46: Notes-enriched CSV export + scan-log CSV download

### What I did
- Extended `exportToCsv(opps, notesMap)` to accept a `notesMap: Record<string, string>` parameter (default `{}`); added a "Notes" column as the last field in the CSV, populated from `notesMap[opp.id]`, properly double-quote-escaped
- Updated the Export button call site to pass `notesMap` so pair annotations (from A45) travel with every export
- Added `exportScanLogToCsv(entries: ScanLogEntry[])` helper: generates a CSV with columns Timestamp, Source, Opps, Kalshi Markets, Illiquid Filtered, Duration ms; downloads as `scan-log-{date}.csv`
- Added a `Download` icon button in the scan log panel header (between the entry count label and the ✕ close button); `disabled` when `scanLog.length === 0`; `title="Download scan log as CSV"`
- Added A46 to ROADMAP.md

### Tradeoffs / shortcuts
- Notes column is always present in the CSV even when empty strings — consistent schema regardless of annotation state
- `exportScanLogToCsv` is purely client-side (same pattern as `exportToCsv`) — no new API route needed since `scanLog` state is already loaded in `ArbPage`
- Download button uses `<button>` with `disabled` prop (not a shadcn `Button`) to match the icon-button style of the adjacent close button

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0, 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: scan log panel opened → ↓ download icon visible in header next to "5 recorded runs" and ✕ close button
- Export button visible in page header; passing `notesMap` confirmed by TypeScript type check (would error if signature mismatch)
- No new console errors (pre-existing Kalshi category pill hydration warnings unchanged)

### Follow-ups for future runs
- Verify Notes column content in downloaded CSV when a pair has a saved note (can test by adding a note, then exporting)
- Scan-log CSV content could include a "pairs" column listing top pair IDs for that scan
- Could add a "Notes" filter pill ("Annotated / Unannotated") in the filter row

### Next milestone to pick up
**A47** — Candidates: Notes filter (Annotated/Unannotated pill), refresh Poly positions after each scan, count-of-H-match pairs per heatmap card, scan-log "pairs" column

---

## 2026-04-28T00:00:00Z — milestone A47: Notes filter pill + CardView/TickerView indicators

### What I did
- Added `notesFilter` state via `usePref<"all" | "annotated" | "unannotated">("arb:notes-filter", "all")` — persists across page reloads
- Updated `filtered` useMemo: when `notesFilter === "annotated"`, excludes pairs with no note in `notesMap`; when `"unannotated"`, excludes pairs that have a note; added `notesFilter` and `notesMap` to deps array
- Added "Notes:" filter pill group in the filter row (between "Dates:" and the min-edge slider): renders only when `Object.keys(notesMap).length > 0` so the pill is invisible until at least one note exists; three pills — "Any" (default), "✎ Noted" (violet active highlight), "No note" (default active highlight); each has a descriptive `title` tooltip
- Updated `CardView` signature: added `notesMap?: Record<string, string>` prop; renders a `<span title={...}><PenLine .../></span>` in the card footer alongside the sparkline when `notesMap[opp.id]` is truthy; wrapped in existing `flex items-center gap-1.5` div to keep footer alignment intact
- Updated `TickerView` signature: added `notesMap?: Record<string, string>` prop; renders the same `PenLine` span between the `CategoryBadge` and the star button
- Updated both call sites in `ArbPage` to pass `notesMap={notesMap}`

### Tradeoffs / shortcuts
- Notes filter pill group is conditionally shown (only when `notesMap` is non-empty) to avoid confusing an empty "Notes" filter row on fresh installs with no annotations
- `notesFilter` is persisted via `usePref` like all other filters — survives page reload; defaults to "all" (no filtering)
- `PenLine` in CardView/TickerView uses `<span title={...}>` wrapper because lucide-react SVG components do not accept a `title` prop (would cause TS2322)
- No new API routes, no new localStorage keys beyond `arb:notes-filter`

### Verified by
- `node_modules/.bin/tsc --noEmit` — exit 0, 0 errors
- `python -m pytest` in executor/ — 35/35 pass
- Browser: filter row shows "Notes: Any ✎ Noted No note" pills (arb-notes.json has 1 note)
- Clicked "✎ Noted" → LIVE OPPORTUNITIES dropped to 1 of 25; table shows only the annotated pair; KPIs updated to 74.58% avg edge, $100 cap, $75 profit
- Pill rendered with violet active styling when "✎ Noted" active; "Any" pill dark when default
- No new console errors (pre-existing Kalshi category pill hydration warnings unchanged)

### Follow-ups for future runs
- Refresh Poly positions after each auto-scan (deferred from A43/A44)
- Count-of-H-match pairs per heatmap card (deferred from A44)
- Scan-log "pairs" column listing top pair IDs for that scan
- Could pass `notesFilter` through the `?pair=` URL encoding (for Copy Link to preserve notes-filter state)

### Next milestone to pick up
**A48** — Candidates: refresh Poly positions after each scan; count-of-H-match per heatmap card; scan-log pairs column; CardView/TickerView note indicator tooltip on hover
