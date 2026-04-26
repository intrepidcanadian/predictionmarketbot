"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Wallet } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Position {
  asset: string;
  conditionId: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  cashPnl: number;
  percentPnl: number;
  initialValue: number;
  currentValue: number;
  closed: boolean;
  endDate: string | null;
  source_rule?: string;
  venue?: string;
}

interface Activity {
  id?: string;
  type?: string;
  side?: string;
  outcome?: string;
  title?: string;
  size?: number;
  price?: number;
  usdcSize?: number;
  timestamp?: number;
  transactionHash?: string;
  asset?: string;
  conditionId?: string;
}

interface PortfolioSnapshot {
  ts: number;
  value: number;
  pnl: number;
  open: number;
  wallet: string;
}

const STORAGE_KEY = "polymarket_wallet_address";

// ── Formatters ────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUsd(n: number) {
  const abs = Math.abs(n);
  return (n < 0 ? "-$" : "$") + fmt(abs);
}

function fmtDate(ts: number) {
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString();
}

function fmtDateShort(ts: number) {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Sparkline chart ────────────────────────────────────────────────────────

function Sparkline({
  data,
  width = 600,
  height = 120,
  field,
  label,
  color,
}: {
  data: PortfolioSnapshot[];
  width?: number;
  height?: number;
  field: "value" | "pnl";
  label: string;
  color: string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-muted-foreground rounded-lg border border-dashed">
        Not enough data — snapshots are saved each time you load positions.
      </div>
    );
  }

  const values = data.map((d) => d[field]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pad = { top: 12, right: 8, bottom: 28, left: 52 };
  const W = width - pad.left - pad.right;
  const H = height - pad.top - pad.bottom;

  const px = (i: number) => pad.left + (i / (data.length - 1)) * W;
  const py = (v: number) => pad.top + H - ((v - min) / range) * H;

  const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(d[field]).toFixed(1)}`).join(" ");

  // Zero line if pnl goes negative
  const hasNeg = values.some((v) => v < 0);
  const zeroY = hasNeg ? py(0) : null;

  // Tick marks (up to 5 x-axis labels)
  const xTicks = data.reduce<number[]>((acc, _, i) => {
    const step = Math.max(1, Math.floor(data.length / 5));
    if (i % step === 0 || i === data.length - 1) acc.push(i);
    return acc;
  }, []);

  // Y ticks (3 labels)
  const yTicks = [min, min + range / 2, max];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* Zero line */}
      {zeroY !== null && (
        <line x1={pad.left} y1={zeroY} x2={pad.left + W} y2={zeroY} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3,3" />
      )}
      {/* Y axis labels */}
      {yTicks.map((v, i) => (
        <text key={i} x={pad.left - 4} y={py(v) + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.5}>
          {field === "pnl" ? (v >= 0 ? "+" : "") + fmtUsd(v) : fmtUsd(v)}
        </text>
      ))}
      {/* X axis labels */}
      {xTicks.map((i) => (
        <text key={i} x={px(i)} y={height - 4} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.5}>
          {fmtDateShort(data[i].ts)}
        </text>
      ))}
      {/* Area fill */}
      <path
        d={`${pathD} L${px(data.length - 1).toFixed(1)},${(pad.top + H).toFixed(1)} L${pad.left.toFixed(1)},${(pad.top + H).toFixed(1)} Z`}
        fill={color}
        fillOpacity={0.08}
      />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Last point dot */}
      <circle cx={px(data.length - 1)} cy={py(values[values.length - 1])} r={3} fill={color} />
    </svg>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const [address, setAddress] = useState("");
  const [inputValue, setInputValue] = useState("");

  const [positions, setPositions] = useState<Position[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const [activity, setActivity] = useState<Activity[]>([]);
  const [actLoading, setActLoading] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // Load address on mount: prefer saved manual override, fall back to agent wallet env var
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    if (saved) {
      setAddress(saved);
      setInputValue(saved);
      return;
    }
    fetch("/api/agent-wallet")
      .then((r) => r.json())
      .then(({ address: agentAddr }) => {
        if (agentAddr) {
          setAddress(agentAddr);
          setInputValue(agentAddr);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch all three when address changes
  useEffect(() => {
    if (!address) return;
    fetchPositions(address);
    fetchActivity(address);
    fetchHistory(address);
  }, [address]);

  const fetchPositions = useCallback(async (addr: string) => {
    setPosLoading(true);
    setPosError(null);
    try {
      const res = await fetch(`/api/positions?user=${encodeURIComponent(addr)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const list: Position[] = Array.isArray(body) ? body : [];
      setPositions(list);
      setLastFetched(new Date());

      // Save portfolio snapshot
      const open = list.filter((p) => !p.closed);
      const snap = {
        ts: Date.now(),
        value: open.reduce((s, p) => s + p.currentValue, 0),
        pnl: open.reduce((s, p) => s + p.cashPnl, 0),
        open: open.length,
        wallet: addr,
      };
      fetch("/api/portfolio-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap),
      });
    } catch (err) {
      setPosError(err instanceof Error ? err.message : "fetch failed");
      setPositions([]);
    } finally {
      setPosLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async (addr: string) => {
    setActLoading(true);
    setActError(null);
    try {
      const res = await fetch(`/api/activity?user=${encodeURIComponent(addr)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setActivity(Array.isArray(body) ? body : []);
    } catch (err) {
      setActError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setActLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (addr: string) => {
    setHistLoading(true);
    try {
      const res = await fetch(`/api/portfolio-snapshot?wallet=${encodeURIComponent(addr)}`);
      const body = await res.json();
      setHistory(Array.isArray(body) ? body : []);
    } finally {
      setHistLoading(false);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setAddress(trimmed);
  }

  const open = positions.filter((p) => !p.closed);
  const closed = positions.filter((p) => p.closed);
  const totalPnl    = open.reduce((s, p) => s + p.cashPnl, 0);
  const totalValue  = open.reduce((s, p) => s + p.currentValue, 0);
  const totalCost   = open.reduce((s, p) => s + p.initialValue, 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const closedPnl   = closed.reduce((s, p) => s + p.cashPnl, 0);
  const winners     = open.filter((p) => p.cashPnl > 0).length;
  const losers      = open.filter((p) => p.cashPnl < 0).length;
  const ruleCount   = positions.filter((p) => p.source_rule).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Positions &amp; PnL</h1>
          <p className="text-sm text-muted-foreground">
            Live data from Polymarket Data API — public, read-only, no auth required.
          </p>
        </div>
        {address && lastFetched && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { fetchPositions(address); fetchActivity(address); fetchHistory(address); }}
            disabled={posLoading}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${posLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>

      {/* Wallet address form */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="0x… agent proxy wallet (auto-loaded from POLYMARKET_FUNDER)"
            className="pl-9 font-mono text-xs"
          />
        </div>
        <Button type="submit" disabled={!inputValue.trim() || posLoading}>
          Load
        </Button>
      </form>

      {!address && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Enter your Polymarket proxy wallet address above to load live positions.
        </div>
      )}

      {address && (
        <Tabs defaultValue="positions">
          <TabsList className="mb-4">
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="history">Trade History</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio Value</TabsTrigger>
          </TabsList>

          {/* ── Positions tab ── */}
          <TabsContent value="positions">
            {posError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
                {posError}
              </div>
            )}

            {posLoading && (
              <div className="flex flex-col gap-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            )}

            {!posLoading && !posError && positions.length === 0 && (
              <p className="text-center py-16 text-muted-foreground text-sm">
                No positions found for this address.
              </p>
            )}

            {!posLoading && open.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Open positions</div>
                    <div className="text-2xl font-semibold font-mono tabular-nums mt-1">{open.length}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{ruleCount} rule-attributed</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Portfolio value</div>
                    <div className="text-2xl font-semibold font-mono tabular-nums mt-1">{fmtUsd(totalValue)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">cost basis {fmtUsd(totalCost)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Unrealised PnL</div>
                    <div className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${totalPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {totalPnl >= 0 ? "+" : "−"}{fmtUsd(Math.abs(totalPnl))}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${totalPnl >= 0 ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-rose-600/80 dark:text-rose-400/80"}`}>
                      {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Realised (closed)</div>
                    <div className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${closedPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {closedPnl >= 0 ? "+" : "−"}{fmtUsd(Math.abs(closedPnl))}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{closed.length} settled</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Hit rate</div>
                    <div className="text-2xl font-semibold font-mono tabular-nums mt-1">
                      {Math.round((winners / Math.max(1, winners + losers)) * 100)}%
                    </div>
                    <div className="text-[11px] mt-0.5">
                      <span className="text-emerald-600 dark:text-emerald-400">{winners}W</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-rose-600 dark:text-rose-400">{losers}L</span>
                    </div>
                  </div>
                </div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Open</h2>
                <PositionsTable positions={open} />
              </>
            )}

            {!posLoading && closed.length > 0 && (
              <div className="mt-6">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Closed / Resolved
                </h2>
                <PositionsTable positions={closed} />
              </div>
            )}

            {lastFetched && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Last updated {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </TabsContent>

          {/* ── Trade history tab ── */}
          <TabsContent value="history">
            {actError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
                {actError}
              </div>
            )}
            {actLoading && (
              <div className="flex flex-col gap-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            )}
            {!actLoading && !actError && activity.length === 0 && (
              <p className="text-center py-16 text-muted-foreground text-sm">No trade history found.</p>
            )}
            {!actLoading && activity.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-[70px_50px_minmax(0,1fr)_55px_60px_60px_85px] gap-2 px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  <span>Time</span>
                  <span>Type</span>
                  <span>Market</span>
                  <span className="text-center">Side</span>
                  <span className="text-center">Outcome</span>
                  <span className="text-right">Shares</span>
                  <span className="text-right">Total</span>
                </div>
                {activity.map((a, i) => {
                  const isBuy = (a.side ?? "").toUpperCase() === "BUY";
                  const isYes = (a.outcome ?? "").toUpperCase() === "YES";
                  const total = a.usdcSize ?? ((a.size ?? 0) * (a.price ?? 0));
                  const typeIcon = a.type === "redeem"
                    ? "M12 2v8m4-4-4 4-4-4M6 22h12"
                    : a.type === "fill"
                    ? "M5 12l5 5L20 7"
                    : "M3 12h4l3-9 4 18 3-9h4";
                  const sideClr = isBuy
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
                  return (
                    <div key={i} className="grid grid-cols-[70px_50px_minmax(0,1fr)_55px_60px_60px_85px] gap-2 items-center px-4 py-2 hover:bg-accent/40 transition-colors border-b border-border last:border-b-0 text-xs">
                      <span className="font-mono tabular-nums text-muted-foreground text-[11px]">
                        {a.timestamp ? fmtDate(a.timestamp) : "—"}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3 shrink-0">
                          <path d={typeIcon}/>
                        </svg>
                        <span className="text-[10px] uppercase tracking-wider truncate">{a.type ?? "—"}</span>
                      </span>
                      <span className="font-medium truncate">{a.title ?? "—"}</span>
                      <span className="text-center">
                        {a.side && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold tracking-wider ${sideClr}`}>
                            {a.side}
                          </span>
                        )}
                      </span>
                      <span className="text-center text-[11px]">{a.outcome ?? "—"}</span>
                      <span className="text-right font-mono tabular-nums">{fmt(a.size ?? 0, 1)}</span>
                      <span className="text-right font-mono tabular-nums font-semibold">{fmtUsd(total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Portfolio value tab ── */}
          <TabsContent value="portfolio">
            {histLoading && <Skeleton className="h-32 w-full rounded-lg" />}
            {!histLoading && (
              <div className="space-y-6">
                {history.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="rounded-lg border p-3">
                      <p className="text-muted-foreground mb-1">Snapshots</p>
                      <p className="text-lg font-semibold">{history.length}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-muted-foreground mb-1">Latest value</p>
                      <p className="text-lg font-semibold">{fmtUsd(history[history.length - 1].value)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-muted-foreground mb-1">Latest PnL</p>
                      <p className={`text-lg font-semibold ${history[history.length - 1].pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {history[history.length - 1].pnl >= 0 ? "+" : ""}{fmtUsd(history[history.length - 1].pnl)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium mb-3">Portfolio Value</p>
                  <Sparkline data={history} field="value" label="Value" color="#2563eb" />
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium mb-3">Unrealised PnL</p>
                  <Sparkline data={history} field="pnl" label="PnL" color="#16a34a" />
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  A snapshot is saved automatically each time you load the Positions tab.
                  Visit regularly to build up your history.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── Positions table ────────────────────────────────────────────────────────

function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_60px_70px_70px_70px_85px_95px] gap-2 px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        <span>Market</span>
        <span className="text-center">Side</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Avg entry</span>
        <span className="text-right">Mark</span>
        <span className="text-right">Value</span>
        <span className="text-right">PnL</span>
      </div>
      {positions.map((pos, i) => {
        const isYes = pos.outcome === "Yes" || pos.outcome === "YES";
        const sideClr = isYes
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
        const venueClr = pos.venue === "polymarket"
          ? "text-violet-600 dark:text-violet-400"
          : pos.venue === "kalshi"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_60px_70px_70px_70px_85px_95px] gap-2 items-center px-4 py-2.5 hover:bg-accent/40 transition-colors border-b border-border last:border-b-0">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug line-clamp-1">{pos.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {pos.venue && (
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${venueClr}`}>{pos.venue}</span>
                )}
                {pos.source_rule && (
                  <>
                    {pos.venue && <span className="text-muted-foreground/40 text-[10px]">·</span>}
                    <span className="text-[10px] text-muted-foreground font-mono truncate">rule: {pos.source_rule}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-center">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold tracking-wider ${sideClr}`}>
                {pos.outcome}
              </span>
            </div>
            <div className="text-right font-mono tabular-nums text-sm">{fmt(pos.size, 1)}</div>
            <div className="text-right font-mono tabular-nums text-sm text-muted-foreground">{Math.round(pos.avgPrice * 100)}¢</div>
            <div className="text-right font-mono tabular-nums text-sm font-semibold">{Math.round(pos.currentPrice * 100)}¢</div>
            <div className="text-right font-mono tabular-nums text-sm">{fmtUsd(pos.currentValue)}</div>
            <div className={`text-right font-mono tabular-nums text-sm font-semibold ${pos.cashPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {pos.cashPnl >= 0 ? "+" : "−"}{fmtUsd(Math.abs(pos.cashPnl))}
              <div className="text-[10px] font-normal opacity-70">
                {pos.percentPnl >= 0 ? "+" : ""}{fmt(pos.percentPnl, 1)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
