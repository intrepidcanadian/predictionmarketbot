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
