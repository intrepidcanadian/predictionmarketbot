import { Globe, Server, Monitor, Database, Cpu, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Data ───────────────────────────────────────────────────────────────────

const EXTERNAL = [
  { name: "Gamma API",      host: "gamma-api.polymarket.com",                 detail: "markets · search · tags" },
  { name: "CLOB API",       host: "clob.polymarket.com",                      detail: "orderbook depth · orders" },
  { name: "Data API",       host: "data-api.polymarket.com",                  detail: "positions · PnL by wallet" },
  { name: "Kalshi API",     host: "api.elections.kalshi.com/trade-api/v2",    detail: "events · markets · prices" },
  { name: "Anthropic API",  host: "api.anthropic.com",                        detail: "claude-sonnet-4-6 · rule drafting" },
];

const ROUTES = [
  { path: "GET /api/markets",           detail: "Gamma proxy · CORS shield · 30s ISR" },
  { path: "GET /api/kalshi/markets",    detail: "Cursor-paginated · illiquid filter" },
  { path: "GET /api/arb/orderbook",     detail: "CLOB + Kalshi bid/ask · 10s cache" },
  { path: "GET /api/arb/history",       detail: "Pair spread history · JSONL read" },
  { path: "POST /api/arb/history",      detail: "Append + prune to 500 entries" },
  { path: "POST /api/rules/draft",      detail: "LLM rule drafting · never executes" },
  { path: "GET/POST /api/rules",        detail: "CRUD on executor/rules/*.json" },
  { path: "GET /api/audit",             detail: "Tail audit.jsonl · newest first" },
  { path: "GET /api/approvals",         detail: "List pending/ · move to approved/" },
  { path: "GET /api/positions",         detail: "Wallet positions via Data API" },
  { path: "GET/PUT /api/signals",       detail: "Read-write signals.json" },
  { path: "POST /api/orders",           detail: "Dry-run order submission via MCP" },
];

const PAGES = [
  { path: "/arb",        detail: "Fee-adjusted arb scanner · CLOB depth · history" },
  { path: "/markets",    detail: "Polymarket browser · search · tag filter" },
  { path: "/rules",      detail: "Rule list · builder form · LLM drafting" },
  { path: "/audit",      detail: "Executor audit feed · reverse-chrono" },
  { path: "/approvals",  detail: "One-click pending order approval" },
  { path: "/positions",  detail: "Live PnL by wallet address" },
  { path: "/signals",    detail: "Key/value editor over signals.json" },
];

const FS_ENTRIES = [
  { path: "executor/rules/*.json",              detail: "Declarative trading rules" },
  { path: "executor/audit.jsonl",               detail: "Append-only evaluation log" },
  { path: "executor/signals.json",             detail: "Live condition overrides" },
  { path: "executor/approvals/pending/",        detail: "Awaiting manual approval" },
  { path: "executor/approvals/approved/",       detail: "Ready for execution" },
  { path: "frontend/arb-history.jsonl",         detail: "Pair spread history (500-entry cap)" },
];

const CONSTRAINTS = [
  "The LLM is never in the path that fires a rule — execution is deterministic Python.",
  "The LLM may draft rule JSON from English, but the draft is always reviewed before saving.",
  "No FastAPI or additional backend — Next.js route handlers are the only server layer.",
  "Filesystem is the source of truth (rules, audit, approvals, signals). No database.",
  "Polymarket = USDC on Polygon. Kalshi = USD (bank account). Capital is not interchangeable.",
];

// ── Primitives ─────────────────────────────────────────────────────────────

function Arrow() {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <div className="flex flex-col items-center gap-0">
        <div className="w-px h-4 bg-border"/>
        <svg viewBox="0 0 10 6" className="size-2.5 text-border fill-current">
          <polygon points="5,6 0,0 10,0"/>
        </svg>
      </div>
    </div>
  );
}

function SplitArrow() {
  return (
    <div className="relative h-8" aria-hidden>
      {/* vertical stem */}
      <div className="absolute left-1/2 top-0 w-px h-4 bg-border -translate-x-1/2"/>
      {/* horizontal bar at 50% */}
      <div className="absolute left-[25%] right-[25%] top-4 h-px bg-border"/>
      {/* left leg down */}
      <div className="absolute left-[25%] top-4 h-4 w-px bg-border -translate-x-1/2"/>
      {/* right leg down */}
      <div className="absolute right-[25%] top-4 h-4 w-px bg-border translate-x-1/2"/>
      {/* left arrowhead */}
      <svg viewBox="0 0 10 6" className="absolute left-[25%] bottom-0 -translate-x-1/2 size-2.5 text-border fill-current">
        <polygon points="5,6 0,0 10,0"/>
      </svg>
      {/* right arrowhead */}
      <svg viewBox="0 0 10 6" className="absolute right-[25%] bottom-0 translate-x-1/2 size-2.5 text-border fill-current">
        <polygon points="5,6 0,0 10,0"/>
      </svg>
    </div>
  );
}

function LayerHeader({ icon: Icon, label, sublabel, color }: { icon: LucideIcon; label: string; sublabel?: string; color: string }) {
  const colors: Record<string, string> = {
    blue:   "text-blue-600   dark:text-blue-400",
    purple: "text-purple-600 dark:text-purple-400",
    teal:   "text-teal-600   dark:text-teal-400",
    amber:  "text-amber-600  dark:text-amber-400",
    rose:   "text-rose-600   dark:text-rose-400",
  };
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`size-4 shrink-0 ${colors[color]}`}/>
      <span className={`text-xs font-semibold uppercase tracking-wider ${colors[color]}`}>{label}</span>
      {sublabel && <span className="text-[10px] text-muted-foreground">({sublabel})</span>}
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────

function ExternalLayer() {
  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-500/5 p-4">
      <LayerHeader icon={Globe} label="External Services" sublabel="never called from the browser directly" color="blue"/>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {EXTERNAL.map(s => (
          <div key={s.name} className="rounded-lg border border-blue-200/60 dark:border-blue-800/60 bg-background p-2.5">
            <div className="text-[11px] font-semibold text-foreground mb-0.5">{s.name}</div>
            <div className="text-[9px] font-mono text-muted-foreground truncate" title={s.host}>{s.host}</div>
            <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{s.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteLayer() {
  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-500/5 p-4">
      <LayerHeader icon={Server} label="Next.js Route Handlers" sublabel="proxy + filesystem I/O" color="purple"/>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {ROUTES.map(r => (
          <div key={r.path} className="flex items-baseline gap-1.5 text-[11px]">
            <code className="font-mono text-purple-700 dark:text-purple-300 shrink-0 text-[10px]">{r.path}</code>
            <span className="text-muted-foreground truncate">{r.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrontendLayer() {
  return (
    <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-500/5 p-4 h-full">
      <LayerHeader icon={Monitor} label="Frontend Pages" sublabel="browser" color="teal"/>
      <div className="space-y-1.5">
        {PAGES.map(p => (
          <div key={p.path} className="flex items-baseline gap-1.5 text-[11px]">
            <code className="font-mono text-teal-700 dark:text-teal-300 shrink-0 w-24">{p.path}</code>
            <span className="text-muted-foreground">{p.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilesystemLayer() {
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-500/5 p-4 h-full">
      <LayerHeader icon={Database} label="Filesystem" sublabel="source of truth" color="amber"/>
      <div className="space-y-1.5">
        {FS_ENTRIES.map(e => (
          <div key={e.path} className="flex items-baseline gap-1.5 text-[11px]">
            <code className="font-mono text-amber-700 dark:text-amber-300 shrink-0 text-[9.5px] leading-tight">{e.path}</code>
            <span className="text-muted-foreground shrink-0">{e.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutorLayer() {
  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-500/5 p-4">
      <LayerHeader icon={Cpu} label="Executor" sublabel="Python 3.11+ · deterministic" color="rose"/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
            Loop: read rules → evaluate conditions → check guardrails →
            write <code className="font-mono text-rose-700 dark:text-rose-300">audit.jsonl</code>
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            On match with <code className="font-mono text-rose-700 dark:text-rose-300">require_manual_approval</code>:
            move order to <code className="font-mono text-rose-700 dark:text-rose-300">approvals/pending/</code>
          </p>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            On approved orders: call MCP server → <code className="font-mono text-rose-700 dark:text-rose-300">place_order</code>
          </p>
        </div>
        <div className="rounded-lg border border-rose-200/60 dark:border-rose-800/60 bg-background p-3">
          <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider mb-2">
            mcp-polymarket/server.py
          </p>
          {[
            { fn: "get_markets()",    note: "search Polymarket markets" },
            { fn: "get_orderbook()",  note: "CLOB bid/ask levels" },
            { fn: "place_order()",    note: "dry-run gated · USDC/Polygon" },
          ].map(({ fn, note }) => (
            <div key={fn} className="flex items-baseline gap-1.5 text-[11px] mb-1.5">
              <code className="font-mono text-rose-700 dark:text-rose-300 shrink-0">{fn}</code>
              <span className="text-muted-foreground">{note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">System Architecture</h1>
        <p className="text-sm text-muted-foreground">
          Data flows and component boundaries for the prediction market trading bot.
        </p>
      </div>

      {/* Layered flow diagram */}
      <div>
        <ExternalLayer/>
        <Arrow/>
        <RouteLayer/>
        <SplitArrow/>
        <div className="grid grid-cols-2 gap-4">
          <FrontendLayer/>
          <FilesystemLayer/>
        </div>
        <Arrow/>
        <ExecutorLayer/>
      </div>

      {/* Constraints */}
      <div className="mt-8 rounded-xl border border-foreground/20 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="size-4 text-amber-500 shrink-0"/>
          <span className="text-xs font-semibold uppercase tracking-wider">Architectural constraints (non-negotiable)</span>
        </div>
        <ul className="space-y-1.5">
          {CONSTRAINTS.map((c, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="size-1 rounded-full bg-amber-500 shrink-0 mt-1.5"/>
              <span dangerouslySetInnerHTML={{ __html: c.replace(/never|may|always/g, w => `<strong class="text-foreground">${w}</strong>`) }}/>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
