export default function ArchitecturePage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">System Architecture</h1>
        <p className="text-sm text-muted-foreground">
          Data flows and component boundaries for the prediction market trading bot.
        </p>
      </div>

      {/* Main diagram */}
      <div className="rounded-xl border bg-card p-6 font-mono text-xs leading-relaxed overflow-x-auto">
        <pre className="text-foreground whitespace-pre">{DIAGRAM}</pre>
      </div>

      {/* Component descriptions */}
      <div className="mt-8 grid grid-cols-2 gap-4">
        <Section title="External APIs" color="blue">
          <Row label="Polymarket Gamma" detail="gamma-api.polymarket.com — markets, search, tags" />
          <Row label="Polymarket CLOB" detail="clob.polymarket.com — orderbook depth" />
          <Row label="Polymarket Data" detail="data-api.polymarket.com — positions, PnL by wallet" />
          <Row label="Kalshi" detail="api.elections.kalshi.com/trade-api/v2 — markets, events" />
          <Row label="Anthropic" detail="api.anthropic.com — claude-sonnet-4-6 for rule drafting" />
        </Section>

        <Section title="Next.js Route Handlers (proxy layer)" color="purple">
          <Row label="GET /api/markets" detail="Proxies Polymarket Gamma; avoids CORS" />
          <Row label="GET /api/kalshi/markets" detail="Sweeps events + curated series; normalises prices" />
          <Row label="GET /api/positions" detail="Proxies Polymarket Data API by wallet address" />
          <Row label="POST /api/rules/draft" detail="Calls Claude with rule schema; returns draft JSON" />
          <Row label="GET/POST /api/rules" detail="CRUD on executor/rules/*.json (filesystem)" />
          <Row label="GET /api/audit" detail="Tails executor/audit.jsonl (last 200 lines)" />
          <Row label="GET/POST /api/approvals" detail="Reads/moves executor/approvals/pending|approved/" />
          <Row label="GET/POST /api/signals" detail="Read-write executor/signals.json" />
        </Section>

        <Section title="Frontend Pages" color="green">
          <Row label="/arb" detail="Cross-exchange arb scanner — fee-adjusted net spread" />
          <Row label="/markets" detail="Polymarket browser with search + tag filter" />
          <Row label="/rules" detail="Rule list, builder form, LLM-assisted drafting" />
          <Row label="/audit" detail="Executor audit feed (reverse-chrono, expandable)" />
          <Row label="/approvals" detail="One-click approval inbox for pending orders" />
          <Row label="/positions" detail="Live positions + unrealised PnL by wallet" />
          <Row label="/signals" detail="Key/value editor over executor/signals.json" />
        </Section>

        <Section title="Executor (Python 3.11+)" color="amber">
          <Row label="rules/*.json" detail="Declarative trading rules (target, trigger, condition, action, guardrails)" />
          <Row label="audit.jsonl" detail="Append-only log of every rule evaluation + outcome" />
          <Row label="approvals/pending/" detail="Orders awaiting manual approval" />
          <Row label="approvals/approved/" detail="Approved orders ready for execution" />
          <Row label="signals.json" detail="Live key/value overrides injected into rule conditions" />
          <Row label="mcp-polymarket/server.py" detail="MCP server: get_markets, get_orderbook, place_order (dry-run gated)" />
        </Section>
      </div>

      <div className="mt-6 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
        <p className="font-semibold">Architectural constraints (non-negotiable)</p>
        <p>• The LLM is <strong>never</strong> in the path that fires a rule. Execution is deterministic Python.</p>
        <p>• The LLM <strong>may</strong> draft rule JSON from English, but the draft is always reviewed before saving.</p>
        <p>• No FastAPI or additional backend — Next.js route handlers are the only server layer.</p>
        <p>• Filesystem is the source of truth (rules, audit, approvals, signals). No database.</p>
        <p>• Polymarket = USDC on Polygon. Kalshi = USD (bank account). Capital is not interchangeable.</p>
      </div>
    </div>
  );
}

const DIAGRAM = `
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                          EXTERNAL SERVICES                                  │
  │                                                                             │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐  ┌───────────┐  │
  │  │  Polymarket      │  │  Kalshi           │  │ Anthropic │  │Polymarket │  │
  │  │  Gamma API       │  │  Elections API    │  │ Claude    │  │ CLOB/Data │  │
  │  │  (markets/search)│  │  (events/markets) │  │ claude-   │  │ (orderbook│  │
  │  │                  │  │                   │  │ sonnet-4-6│  │ /positions│  │
  │  └────────┬─────────┘  └────────┬──────────┘  └─────┬─────┘  └─────┬─────┘  │
  └───────────┼────────────────────┼───────────────────┼──────────────┼────────┘
              │                    │                   │              │
  ┌───────────▼────────────────────▼───────────────────▼──────────────▼────────┐
  │                     NEXT.JS ROUTE HANDLERS  (proxy + filesystem I/O)        │
  │                                                                             │
  │  /api/markets   /api/kalshi/markets   /api/rules/draft   /api/positions     │
  │  /api/rules     /api/audit            /api/approvals     /api/signals       │
  └───────────────────────────────────┬─────────────────────────────────────────┘
                                      │
  ┌───────────────────────────────────▼─────────────────────────────────────────┐
  │                         FRONTEND PAGES (browser)                            │
  │                                                                             │
  │   /arb          /markets        /rules         /audit                       │
  │  (fee-adjusted  (Poly browser   (list + builder (executor                   │
  │   arb scanner)  + search)        + LLM draft)    audit.jsonl)               │
  │                                                                             │
  │   /approvals    /positions      /signals                                    │
  │  (approve       (live PnL       (key/value                                  │
  │   pending)       by wallet)      overrides)                                 │
  └──────────────────────────────────────────────────────────────────────────── ┘
                                      │  filesystem reads/writes
  ┌───────────────────────────────────▼─────────────────────────────────────────┐
  │                    FILESYSTEM  (source of truth)                            │
  │                                                                             │
  │   executor/rules/*.json          executor/audit.jsonl                       │
  │   executor/signals.json          executor/approvals/{pending,approved}/     │
  └───────────────────────────────────┬─────────────────────────────────────────┘
                                      │  reads rules + signals
  ┌───────────────────────────────────▼─────────────────────────────────────────┐
  │                    EXECUTOR  (Python 3.11+ — deterministic)                 │
  │                                                                             │
  │   Loop: read rules → evaluate conditions → check guardrails                 │
  │       → move to approvals/pending/  OR  call MCP → place_order             │
  │       → write to audit.jsonl                                                │
  │                                                                             │
  │   ┌────────────────────────────────────┐                                    │
  │   │  mcp-polymarket/server.py          │                                    │
  │   │  get_markets / get_orderbook       │                                    │
  │   │  place_order  (dry-run gated)      │                                    │
  │   └────────────────────────────────────┘                                    │
  └─────────────────────────────────────────────────────────────────────────────┘
`.trim();

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    blue: "border-blue-200 dark:border-blue-800",
    purple: "border-purple-200 dark:border-purple-800",
    green: "border-green-200 dark:border-green-800",
    amber: "border-amber-200 dark:border-amber-800",
  };
  const headings: Record<string, string> = {
    blue: "text-blue-700 dark:text-blue-400",
    purple: "text-purple-700 dark:text-purple-400",
    green: "text-green-700 dark:text-green-400",
    amber: "text-amber-700 dark:text-amber-400",
  };
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${colors[color]}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${headings[color]}`}>{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="text-xs">
      <span className="font-medium font-mono">{label}</span>
      <span className="text-muted-foreground"> — {detail}</span>
    </div>
  );
}
