"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  // Load saved address on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    if (saved) { setAddress(saved); setInputValue(saved); }
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
  const totalPnl = open.reduce((s, p) => s + p.cashPnl, 0);
  const totalValue = open.reduce((s, p) => s + p.currentValue, 0);

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
            placeholder="0x… Polymarket proxy wallet address"
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
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground mb-1">Open positions</p>
                    <p className="text-2xl font-semibold">{open.length}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground mb-1">Portfolio value</p>
                    <p className="text-2xl font-semibold">{fmtUsd(totalValue)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground mb-1">Unrealised PnL</p>
                    <p className={`text-2xl font-semibold ${totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {totalPnl >= 0 ? "+" : ""}{fmtUsd(totalPnl)}
                    </p>
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
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Market</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-center">Side</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-center">Outcome</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Shares</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Price</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {activity.map((a, i) => {
                      const isBuy = (a.side ?? "").toUpperCase() === "BUY";
                      const isYes = (a.outcome ?? "").toUpperCase() === "YES";
                      const total = a.usdcSize ?? ((a.size ?? 0) * (a.price ?? 0));
                      return (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                            {a.timestamp ? fmtDate(a.timestamp) : "—"}
                          </td>
                          <td className="px-3 py-2.5 max-w-[220px]">
                            <span className="line-clamp-2 leading-snug">{a.title ?? "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              variant="outline"
                              className={isBuy
                                ? "border-green-500/40 text-green-700 bg-green-500/10"
                                : "border-red-400/40 text-red-600 bg-red-400/10"}
                            >
                              {a.side ?? "—"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              variant="outline"
                              className={isYes
                                ? "border-blue-400/40 text-blue-700 bg-blue-400/10"
                                : "border-orange-400/40 text-orange-700 bg-orange-400/10"}
                            >
                              {a.outcome ?? "—"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{fmt(a.size ?? 0, 1)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{Math.round((a.price ?? 0) * 100)}¢</td>
                          <td className="px-3 py-2.5 text-right font-mono">{fmtUsd(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                      <p className={`text-lg font-semibold ${history[history.length - 1].pnl >= 0 ? "text-green-600" : "text-red-500"}`}>
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
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Market</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Side</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-right">Shares</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-right">Avg Entry</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-right">Current</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-right">Value</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-right">PnL</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {positions.map((pos, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-4 py-3 font-medium max-w-xs">
                <span className="line-clamp-2 leading-snug">{pos.title}</span>
              </td>
              <td className="px-4 py-3 text-center">
                <Badge
                  variant="outline"
                  className={
                    pos.outcome === "Yes" || pos.outcome === "YES"
                      ? "border-green-500/40 text-green-700 bg-green-500/10"
                      : "border-red-400/40 text-red-600 bg-red-400/10"
                  }
                >
                  {pos.outcome}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right font-mono">{fmt(pos.size, 1)}</td>
              <td className="px-4 py-3 text-right font-mono">{Math.round(pos.avgPrice * 100)}¢</td>
              <td className="px-4 py-3 text-right font-mono">{Math.round(pos.currentPrice * 100)}¢</td>
              <td className="px-4 py-3 text-right font-mono">{fmtUsd(pos.currentValue)}</td>
              <td className={`px-4 py-3 text-right font-mono font-semibold ${pos.cashPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                {pos.cashPnl >= 0 ? "+" : ""}{fmtUsd(pos.cashPnl)}
                <span className="block text-xs font-normal text-muted-foreground">
                  {pos.percentPnl >= 0 ? "+" : ""}{fmt(pos.percentPnl, 1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
