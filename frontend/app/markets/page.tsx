"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const TAGS = [
  { label: "All",           value: "" },
  { label: "Politics",      value: "politics" },
  { label: "Elections",     value: "elections" },
  { label: "Crypto",        value: "crypto" },
  { label: "Sports",        value: "sports" },
  { label: "Science",       value: "science" },
  { label: "Finance",       value: "finance" },
  { label: "Entertainment", value: "entertainment" },
];

interface Market {
  id: string;
  question: string;
  slug: string;
  conditionId?: string;
  outcomes: string[] | null;
  outcomePrices: string[] | null;
  endDate: string | null;
  volume: string | null;
  liquidity: string | null;
  active: boolean;
  closed: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePrice(p: string | null | undefined): number {
  if (!p) return 0.5;
  const n = parseFloat(p);
  return isNaN(n) ? 0.5 : n;
}

function fmtVolume(v: string | null | undefined): string {
  if (!v) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeUntil(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms)) return "—";
  if (ms < 0) return "closed";
  const d = ms / 86_400_000;
  if (d >= 365) return `${(d / 365).toFixed(1)}y`;
  if (d >= 30)  return `${(d / 30).toFixed(0)}mo`;
  if (d >= 1)   return `${d.toFixed(0)}d`;
  return `${(ms / 3_600_000).toFixed(0)}h`;
}

// ── Primitives ─────────────────────────────────────────────────────────────────

function YesNoBar({ yes }: { yes: number }) {
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted w-full">
      <div className="bg-emerald-500/80" style={{ width: `${yes * 100}%` }} />
      <div className="bg-rose-400/70"    style={{ width: `${(1 - yes) * 100}%` }} />
    </div>
  );
}

function StatusBadge({ active, closed }: { active: boolean; closed: boolean }) {
  if (closed) return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Closed</span>
  );
  if (active) return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium">Active</span>
  );
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Inactive</span>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────

function MarketRow({ m, sortBy }: { m: Market; sortBy: string }) {
  const yes = parsePrice(m.outcomePrices?.[0]);
  const no  = parsePrice(m.outcomePrices?.[1]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_140px_80px_70px] gap-3 items-center px-4 py-2.5 hover:bg-accent/40 transition-colors border-b border-border last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug line-clamp-1">{m.question}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusBadge active={m.active} closed={m.closed} />
          <span className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-[160px]">{m.slug}</span>
        </div>
      </div>
      <YesNoBar yes={yes} />
      <div className="flex items-center justify-end gap-2 font-mono tabular-nums text-sm">
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{Math.round(yes * 100)}¢</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-rose-600 dark:text-rose-400 font-semibold">{Math.round(no * 100)}¢</span>
      </div>
      <div className="text-right text-xs text-muted-foreground tabular-nums font-mono">{fmtVolume(m.volume)}</div>
      <div className="text-right text-xs text-muted-foreground tabular-nums font-mono">{timeUntil(m.endDate)}</div>
    </div>
  );
}

// ── Card view ─────────────────────────────────────────────────────────────────

function MarketCard({ m }: { m: Market }) {
  const yes = parsePrice(m.outcomePrices?.[0]);
  const no  = parsePrice(m.outcomePrices?.[1]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug line-clamp-3 flex-1">{m.question}</p>
        <StatusBadge active={m.active} closed={m.closed} />
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">YES</span>
          <span className="font-mono tabular-nums text-base font-semibold text-emerald-600 dark:text-emerald-400">
            {Math.round(yes * 100)}¢
          </span>
        </div>
        <YesNoBar yes={yes} />
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">NO</span>
          <span className="font-mono tabular-nums text-base font-semibold text-rose-600 dark:text-rose-400">
            {Math.round(no * 100)}¢
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2">
        <span>Vol: <span className="font-mono text-foreground">{fmtVolume(m.volume)}</span></span>
        <span>Liq: <span className="font-mono text-foreground">{fmtVolume(m.liquidity)}</span></span>
        <span>Closes: <span className="font-mono text-foreground">{timeUntil(m.endDate)}</span></span>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_140px_80px_70px] gap-3 items-center px-4 py-3 border-b border-border">
      <div className="space-y-1.5">
        <div className="h-3.5 bg-muted rounded w-3/4 animate-pulse" />
        <div className="h-2.5 bg-muted rounded w-1/3 animate-pulse" />
      </div>
      <div className="h-1.5 bg-muted rounded-full animate-pulse" />
      <div className="h-3 bg-muted rounded w-3/4 ml-auto animate-pulse" />
      <div className="h-3 bg-muted rounded animate-pulse" />
      <div className="h-3 bg-muted rounded animate-pulse" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
      <div className="h-3 bg-muted rounded w-full animate-pulse" />
      <div className="h-1.5 bg-muted rounded-full animate-pulse" />
      <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ViewMode = "table" | "cards";
type SortBy   = "volume" | "closes";

export default function MarketsPage() {
  const [query,   setQuery]   = useState("");
  const [tag,     setTag]     = useState("");
  const [view,    setView]    = useState<ViewMode>("table");
  const [sortBy,  setSortBy]  = useState<SortBy>("volume");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMarkets = useCallback(async (q: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "40" });
      if (q) params.set("q", q);
      if (t) params.set("tag", t);
      const res = await fetch(`/api/markets?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMarkets(Array.isArray(data) ? data : data.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch markets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMarkets(query, tag), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, tag, fetchMarkets]);

  const sorted = useMemo(() => {
    return [...markets].sort((a, b) => {
      if (sortBy === "volume") {
        return parseFloat(b.volume ?? "0") - parseFloat(a.volume ?? "0");
      }
      return new Date(a.endDate ?? "9999").getTime() - new Date(b.endDate ?? "9999").getTime();
    });
  }, [markets, sortBy]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Markets</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${sorted.length} markets · synced from `}
            {!loading && <span className="font-mono text-[11px]">gamma-api.polymarket.com</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search markets…"
              className="h-8 w-64 pl-8 pr-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Tag pills */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {TAGS.map(t => (
          <button
            key={t.value}
            onClick={() => setTag(t.value)}
            className={cn(
              "h-7 px-3 rounded-full text-xs font-medium border transition-colors",
              tag === t.value
                ? "bg-foreground text-background border-foreground"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar: view + sort */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {([
            ["table", "Table", "M3 6h18M3 12h18M3 18h18"],
            ["cards", "Cards", "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
          ] as const).map(([v, label, path]) => (
            <button key={v} onClick={() => setView(v)}
              className={cn(
                "flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium transition-colors",
                view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                <path d={path} />
              </svg>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Sort</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="h-7 px-2 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="volume">Highest volume</option>
            <option value="closes">Ending soonest</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {loading ? (
        view === "table" ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_140px_80px_70px] gap-3 px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
              <span>Market</span><span>YES / NO</span>
              <span className="text-right">Price</span>
              <span className="text-right">Volume</span>
              <span className="text-right">Closes</span>
            </div>
            {Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No markets found.
        </div>
      ) : view === "table" ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_140px_80px_70px] gap-3 px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
            <span>Market</span>
            <span>YES / NO</span>
            <span className="text-right">Price</span>
            <span
              onClick={() => setSortBy("volume")}
              className={cn("text-right cursor-pointer hover:text-foreground select-none", sortBy === "volume" && "text-foreground")}
            >
              Volume{sortBy === "volume" ? " ↓" : ""}
            </span>
            <span
              onClick={() => setSortBy("closes")}
              className={cn("text-right cursor-pointer hover:text-foreground select-none", sortBy === "closes" && "text-foreground")}
            >
              Closes{sortBy === "closes" ? " ↑" : ""}
            </span>
          </div>
          {sorted.map(m => <MarketRow key={m.id} m={m} sortBy={sortBy} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(m => <MarketCard key={m.id} m={m} />)}
        </div>
      )}
    </div>
  );
}
