"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowRightLeft, Zap } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  condition_id: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  active: boolean;
}

interface KalshiMarket {
  ticker: string;
  title: string;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  volume: number;
  liquidity: number;
  close_time: string;
}

interface ArbCalc {
  poly_yes_plus_kalshi_no: number;
  poly_no_plus_kalshi_yes: number;
  best_spread: number;
  best_direction: "poly-yes/kalshi-no" | "poly-no/kalshi-yes";
}

// Auto-scan seed queries — topics likely to exist on both exchanges
const SCAN_QUERIES = ["trump", "fed", "bitcoin", "recession", "ukraine", "tariff", "inflation"];

// ── Helpers ────────────────────────────────────────────────────────────────

function calcArb(poly: PolyMarket, kalshi: KalshiMarket): ArbCalc {
  const a = 1 - (poly.yes_price + kalshi.no_ask);
  const b = 1 - (poly.no_price + kalshi.yes_ask);
  return {
    poly_yes_plus_kalshi_no: a,
    poly_no_plus_kalshi_yes: b,
    best_spread: Math.max(a, b),
    best_direction: a >= b ? "poly-yes/kalshi-no" : "poly-no/kalshi-yes",
  };
}

function spreadColor(spread: number) {
  if (spread > 0.03) return "text-green-600 font-bold";
  if (spread > 0) return "text-green-500";
  if (spread > -0.03) return "text-yellow-600";
  return "text-muted-foreground";
}

function fmtPct(n: number) {
  return (n * 100).toFixed(1) + "¢";
}

function fmtSpread(n: number) {
  const sign = n >= 0 ? "+" : "";
  return sign + (n * 100).toFixed(1) + "¢";
}

// ── Market list items ──────────────────────────────────────────────────────

function PolyRow({ m, selected, onSelect }: { m: PolyMarket; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
      }`}
    >
      <p className="font-medium leading-snug line-clamp-2 mb-1">{m.question}</p>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span className="text-green-600 font-mono">YES {fmtPct(m.yes_price)}</span>
        <span className="text-red-500 font-mono">NO {fmtPct(m.no_price)}</span>
        <span>Vol ${(m.volume / 1000).toFixed(0)}K</span>
      </div>
    </button>
  );
}

function KalshiRow({ m, selected, onSelect }: { m: KalshiMarket; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
      }`}
    >
      <p className="font-medium leading-snug line-clamp-2 mb-1">{m.title}</p>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span className="text-green-600 font-mono">YES ask {fmtPct(m.yes_ask)}</span>
        <span className="text-red-500 font-mono">NO ask {fmtPct(m.no_ask)}</span>
        <span>Vol ${(m.volume / 1000).toFixed(0)}K</span>
      </div>
    </button>
  );
}

// ── Arb result panel ───────────────────────────────────────────────────────

function ArbPanel({ poly, kalshi }: { poly: PolyMarket; kalshi: KalshiMarket }) {
  const arb = calcArb(poly, kalshi);
  const feeNote = "~7¢ Kalshi fee + ~2¢ Poly spread on $1 notional";

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Arb calculation</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/40 p-3 space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Buy YES on Poly · NO on Kalshi
          </p>
          <p className="text-xs text-muted-foreground">
            {fmtPct(poly.yes_price)} + {fmtPct(kalshi.no_ask)} = {fmtPct(poly.yes_price + kalshi.no_ask)}
          </p>
          <p className={`text-lg font-mono ${spreadColor(arb.poly_yes_plus_kalshi_no)}`}>
            {fmtSpread(arb.poly_yes_plus_kalshi_no)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Buy NO on Poly · YES on Kalshi
          </p>
          <p className="text-xs text-muted-foreground">
            {fmtPct(poly.no_price)} + {fmtPct(kalshi.yes_ask)} = {fmtPct(poly.no_price + kalshi.yes_ask)}
          </p>
          <p className={`text-lg font-mono ${spreadColor(arb.poly_no_plus_kalshi_yes)}`}>
            {fmtSpread(arb.poly_no_plus_kalshi_yes)}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground flex-1">
          <strong>Best direction:</strong>{" "}
          {arb.best_direction === "poly-yes/kalshi-no"
            ? "Buy YES on Polymarket, NO on Kalshi"
            : "Buy NO on Polymarket, YES on Kalshi"}
          {" — "}
          gross spread <span className={spreadColor(arb.best_spread)}>{fmtSpread(arb.best_spread)}</span>
          {" per $1 notional before fees"}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        ⚠ Fees: {feeNote}. Resolution risk: verify both markets resolve on identical criteria before trading.
      </p>

      <div className="text-xs space-y-1 border-t pt-2">
        <p className="font-medium">Paired markets</p>
        <p className="text-muted-foreground line-clamp-1">
          <span className="text-foreground">Poly:</span> {poly.question}
        </p>
        <p className="text-muted-foreground line-clamp-1">
          <span className="text-foreground">Kalshi:</span> {kalshi.title}
        </p>
      </div>
    </div>
  );
}

// ── Auto-scan results ──────────────────────────────────────────────────────

interface ScanPair {
  poly: PolyMarket;
  kalshi: KalshiMarket;
  score: number;
  arb: ArbCalc;
}

function keywordScore(a: string, b: string): number {
  const stopWords = new Set(["will", "the", "a", "an", "in", "on", "by", "of", "to", "for", "at", "be", "is", "or", "and"]);
  const words = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  return hits / Math.max(wa.size, wb.size, 1);
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ArbPage() {
  const [polySearch, setPolySearch] = useState("");
  const [kalshiSearch, setKalshiSearch] = useState("");
  const [polyResults, setPolyResults] = useState<PolyMarket[]>([]);
  const [kalshiResults, setKalshiResults] = useState<KalshiMarket[]>([]);
  const [polyLoading, setPolyLoading] = useState(false);
  const [kalshiLoading, setKalshiLoading] = useState(false);
  const [selectedPoly, setSelectedPoly] = useState<PolyMarket | null>(null);
  const [selectedKalshi, setSelectedKalshi] = useState<KalshiMarket | null>(null);
  const [scanResults, setScanResults] = useState<ScanPair[]>([]);
  const [scanning, setScanning] = useState(false);

  const searchPoly = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setPolyLoading(true);
    try {
      const res = await fetch(`/api/markets?q=${encodeURIComponent(q)}&limit=20&active=true`);
      const data = await res.json();
      const markets: PolyMarket[] = (Array.isArray(data) ? data : []).map(
        (m: Record<string, unknown>) => {
          const prices = Array.isArray(m.outcomePrices)
            ? m.outcomePrices.map(Number)
            : [0.5, 0.5];
          return {
            id: String(m.id ?? ""),
            question: String(m.question ?? ""),
            slug: String(m.slug ?? ""),
            condition_id: String(m.conditionId ?? ""),
            yes_price: prices[0] ?? 0.5,
            no_price: prices[1] ?? 0.5,
            volume: Number(m.volume ?? 0),
            liquidity: Number(m.liquidity ?? 0),
            active: Boolean(m.active),
          };
        }
      );
      setPolyResults(markets);
    } finally {
      setPolyLoading(false);
    }
  }, []);

  const searchKalshi = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setKalshiLoading(true);
    try {
      const res = await fetch(`/api/kalshi/markets?search=${encodeURIComponent(q)}&limit=30`);
      const data = await res.json();
      setKalshiResults(Array.isArray(data) ? data : []);
    } finally {
      setKalshiLoading(false);
    }
  }, []);

  async function runAutoScan() {
    setScanning(true);
    setScanResults([]);
    try {
      const allPoly: PolyMarket[] = [];
      const allKalshi: KalshiMarket[] = [];

      await Promise.all(
        SCAN_QUERIES.map(async (q) => {
          const [pr, kr] = await Promise.all([
            fetch(`/api/markets?q=${encodeURIComponent(q)}&limit=10&active=true`).then((r) => r.json()),
            fetch(`/api/kalshi/markets?search=${encodeURIComponent(q)}&limit=20`).then((r) => r.json()),
          ]);
          (Array.isArray(pr) ? pr : []).forEach((m: Record<string, unknown>) => {
            const prices = Array.isArray(m.outcomePrices) ? m.outcomePrices.map(Number) : [0.5, 0.5];
            if (!allPoly.find((x) => x.id === String(m.id))) {
              allPoly.push({
                id: String(m.id ?? ""),
                question: String(m.question ?? ""),
                slug: String(m.slug ?? ""),
                condition_id: String(m.conditionId ?? ""),
                yes_price: prices[0] ?? 0.5,
                no_price: prices[1] ?? 0.5,
                volume: Number(m.volume ?? 0),
                liquidity: Number(m.liquidity ?? 0),
                active: Boolean(m.active),
              });
            }
          });
          (Array.isArray(kr) ? kr : []).forEach((m: KalshiMarket) => {
            if (!allKalshi.find((x) => x.ticker === m.ticker)) allKalshi.push(m);
          });
        })
      );

      // Match by keyword overlap, keep best match per Kalshi market
      const pairs: ScanPair[] = [];
      for (const k of allKalshi) {
        if (k.yes_ask <= 0 || k.no_ask <= 0) continue;
        let best: { poly: PolyMarket; score: number } | null = null;
        for (const p of allPoly) {
          const score = keywordScore(p.question, k.title);
          if (score > 0.15 && (!best || score > best.score)) best = { poly: p, score };
        }
        if (best) {
          const arb = calcArb(best.poly, k);
          pairs.push({ poly: best.poly, kalshi: k, score: best.score, arb });
        }
      }

      // Sort by best spread descending
      pairs.sort((a, b) => b.arb.best_spread - a.arb.best_spread);
      setScanResults(pairs.slice(0, 20));
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Arb Scanner</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Cross-exchange arbitrage: find markets where buying YES on one exchange and NO on the other
          costs less than $1.00 — locking in a risk-free spread. Always verify resolution criteria
          match before trading.
        </p>
      </div>

      {/* Manual pair search */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Polymarket */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Polymarket</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={polySearch}
                onChange={(e) => setPolySearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchPoly(polySearch)}
                placeholder="Search markets…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => searchPoly(polySearch)} disabled={polyLoading}>
              Go
            </Button>
          </div>
          <div className="flex flex-col gap-0.5 min-h-48 max-h-72 overflow-y-auto rounded-lg border p-1">
            {polyLoading && [...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
            {!polyLoading && polyResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Search Polymarket above</p>
            )}
            {polyResults.map((m) => (
              <PolyRow
                key={m.id}
                m={m}
                selected={selectedPoly?.id === m.id}
                onSelect={() => setSelectedPoly(m)}
              />
            ))}
          </div>
          {selectedPoly && (
            <div className="text-xs rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
              <span className="font-medium">Selected: </span>
              <span className="text-muted-foreground">{selectedPoly.question}</span>
            </div>
          )}
        </div>

        {/* Kalshi */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Kalshi</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={kalshiSearch}
                onChange={(e) => setKalshiSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchKalshi(kalshiSearch)}
                placeholder="Search markets…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => searchKalshi(kalshiSearch)} disabled={kalshiLoading}>
              Go
            </Button>
          </div>
          <div className="flex flex-col gap-0.5 min-h-48 max-h-72 overflow-y-auto rounded-lg border p-1">
            {kalshiLoading && [...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
            {!kalshiLoading && kalshiResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Search Kalshi above</p>
            )}
            {kalshiResults.map((m) => (
              <KalshiRow
                key={m.ticker}
                m={m}
                selected={selectedKalshi?.ticker === m.ticker}
                onSelect={() => setSelectedKalshi(m)}
              />
            ))}
          </div>
          {selectedKalshi && (
            <div className="text-xs rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
              <span className="font-medium">Selected: </span>
              <span className="text-muted-foreground">{selectedKalshi.title}</span>
            </div>
          )}
        </div>
      </div>

      {/* Manual arb result */}
      {selectedPoly && selectedKalshi && (
        <div className="mb-8">
          <ArbPanel poly={selectedPoly} kalshi={selectedKalshi} />
        </div>
      )}

      {/* Auto-scan */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Auto-scan
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Searches both exchanges for {SCAN_QUERIES.join(", ")} — matches by keyword overlap, ranked by spread.
            </p>
          </div>
          <Button onClick={runAutoScan} disabled={scanning} size="sm" className="gap-2">
            {scanning ? "Scanning…" : "Run Scan"}
          </Button>
        </div>

        {scanResults.length > 0 && (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Polymarket</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Kalshi</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Poly YES</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Poly NO</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">K YES ask</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">K NO ask</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Best spread</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-center">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {scanResults.map((pair, i) => (
                  <tr
                    key={i}
                    className="hover:bg-muted/20 cursor-pointer"
                    onClick={() => {
                      setSelectedPoly(pair.poly);
                      setSelectedKalshi(pair.kalshi);
                    }}
                  >
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <span className="line-clamp-2 leading-snug">{pair.poly.question}</span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <span className="line-clamp-2 leading-snug">{pair.kalshi.title}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-green-600">{fmtPct(pair.poly.yes_price)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-500">{fmtPct(pair.poly.no_price)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-green-600">{fmtPct(pair.kalshi.yes_ask)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-500">{fmtPct(pair.kalshi.no_ask)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${spreadColor(pair.arb.best_spread)}`}>
                      {fmtSpread(pair.arb.best_spread)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                        {pair.arb.best_direction === "poly-yes/kalshi-no"
                          ? "YES↑ / NO↓"
                          : "NO↑ / YES↓"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
