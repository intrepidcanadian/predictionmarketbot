"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Wallet } from "lucide-react";

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

const STORAGE_KEY = "polymarket_wallet_address";

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUsd(n: number) {
  const abs = Math.abs(n);
  const prefix = n < 0 ? "-$" : "$";
  return prefix + fmt(abs);
}

export default function PositionsPage() {
  const [address, setAddress] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Load saved address on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    if (saved) {
      setAddress(saved);
      setInputValue(saved);
    }
  }, []);

  // Fetch when address changes
  useEffect(() => {
    if (!address) return;
    fetchPositions(address);
  }, [address]);

  async function fetchPositions(addr: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/positions?user=${encodeURIComponent(addr)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPositions(Array.isArray(body) ? body : []);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }

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
            onClick={() => fetchPositions(address)}
            disabled={loading}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
            placeholder="0x... Polymarket wallet address (proxy wallet)"
            className="pl-9 font-mono text-xs"
          />
        </div>
        <Button type="submit" disabled={!inputValue.trim() || loading}>
          Load
        </Button>
      </form>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {!address && !loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Enter your Polymarket proxy wallet address above to load live positions.
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && address && positions.length === 0 && !error && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No positions found for this address.
        </div>
      )}

      {!loading && open.length > 0 && (
        <>
          {/* Summary row */}
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

          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Open
          </h2>
          <PositionsTable positions={open} />
        </>
      )}

      {!loading && closed.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
    </div>
  );
}

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
