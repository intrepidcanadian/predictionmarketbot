"use client";

import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowRightLeft, Zap, FileText, AlertTriangle } from "lucide-react";

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
  // Direction A: YES on Poly + NO on Kalshi
  gross_a: number;
  net_a_if_yes: number;   // net if YES resolves — Poly pays, 2% fee
  net_a_if_no: number;    // net if NO resolves  — Kalshi pays, 7% fee
  worst_net_a: number;    // min of above (conservative)
  // Direction B: NO on Poly + YES on Kalshi
  gross_b: number;
  net_b_if_no: number;    // net if NO resolves  — Poly pays, 2% fee
  net_b_if_yes: number;   // net if YES resolves — Kalshi pays, 7% fee
  worst_net_b: number;
  // Summary
  best_net: number;
  best_direction: "poly-yes/kalshi-no" | "poly-no/kalshi-yes";
}

// Kalshi charges ~7% of winnings; Polymarket charges ~2% of winnings
const POLY_FEE = 0.02;
const KALSHI_FEE = 0.07;

// Auto-scan seed queries
const SCAN_QUERIES = ["trump", "fed", "bitcoin", "recession", "ukraine", "tariff", "inflation"];

// ── Helpers ────────────────────────────────────────────────────────────────

function calcArb(poly: PolyMarket, kalshi: KalshiMarket): ArbCalc {
  const gross_a = 1 - (poly.yes_price + kalshi.no_ask);
  const gross_b = 1 - (poly.no_price + kalshi.yes_ask);

  // Dir A: if YES resolves, Poly pays → 2% fee on (1 − yes_price) winnings
  const net_a_if_yes = gross_a - POLY_FEE * (1 - poly.yes_price);
  // Dir A: if NO resolves, Kalshi pays → 7% fee on (1 − no_ask) winnings
  const net_a_if_no  = gross_a - KALSHI_FEE * (1 - kalshi.no_ask);
  const worst_net_a  = Math.min(net_a_if_yes, net_a_if_no);

  // Dir B: if NO resolves, Poly pays → 2% fee on (1 − no_price) winnings
  const net_b_if_no  = gross_b - POLY_FEE * (1 - poly.no_price);
  // Dir B: if YES resolves, Kalshi pays → 7% fee on (1 − yes_ask) winnings
  const net_b_if_yes = gross_b - KALSHI_FEE * (1 - kalshi.yes_ask);
  const worst_net_b  = Math.min(net_b_if_no, net_b_if_yes);

  const best_net = Math.max(worst_net_a, worst_net_b);
  const best_direction = worst_net_a >= worst_net_b ? "poly-yes/kalshi-no" : "poly-no/kalshi-yes";

  return {
    gross_a, net_a_if_yes, net_a_if_no, worst_net_a,
    gross_b, net_b_if_no, net_b_if_yes, worst_net_b,
    best_net, best_direction,
  };
}

function netColor(n: number) {
  if (n > 0.03) return "text-green-600 font-bold";
  if (n > 0) return "text-green-500";
  if (n > -0.03) return "text-yellow-600";
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

// ── Fee breakdown row ──────────────────────────────────────────────────────

function FeeRow({
  label, cost, gross, feeLabel, feeAmt, net,
}: {
  label: string; cost: string; gross: number; feeLabel: string; feeAmt: number; net: number;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 space-y-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div>
          <p className="text-muted-foreground">Cost</p>
          <p className="font-mono">{cost}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Gross spread</p>
          <p className={`font-mono ${netColor(gross)}`}>{fmtSpread(gross)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Worst-case net</p>
          <p className={`font-mono text-sm ${netColor(net)}`}>{fmtSpread(net)}</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {feeLabel}
      </p>
    </div>
  );
}

// ── Resolution criteria panel ─────────────────────────────────────────────

interface ResolutionData {
  poly: { question: string; description: string } | null;
  kalshi: { title: string; rules_primary: string; rules_secondary: string } | null;
}

function ResolutionPanel({
  poly,
  kalshi,
  data,
  loading,
}: {
  poly: PolyMarket;
  kalshi: KalshiMarket;
  data: ResolutionData | null;
  loading: boolean;
}) {
  const polyText = data?.poly?.description ?? "";
  const kalshiText = [data?.kalshi?.rules_primary, data?.kalshi?.rules_secondary]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Resolution Criteria</h3>
        <span className="ml-auto flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Verify both sides resolve identically before trading
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Polymarket side */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-blue-600">Polymarket</p>
          <p className="text-xs font-medium leading-snug">{poly.question}</p>
          {loading ? (
            <div className="space-y-1.5 mt-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          ) : polyText ? (
            <div className="rounded-md bg-muted/40 p-2 max-h-48 overflow-y-auto">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{polyText}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No resolution text available</p>
          )}
        </div>

        {/* Kalshi side */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-purple-600">Kalshi</p>
          <p className="text-xs font-medium leading-snug">{kalshi.title}</p>
          {loading ? (
            <div className="space-y-1.5 mt-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          ) : kalshiText ? (
            <div className="rounded-md bg-muted/40 p-2 max-h-48 overflow-y-auto">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{kalshiText}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No resolution text available</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Arb result panel ───────────────────────────────────────────────────────

function ArbPanel({ poly, kalshi }: { poly: PolyMarket; kalshi: KalshiMarket }) {
  const arb = calcArb(poly, kalshi);

  const feeLabel_a = [
    `If YES: Poly fee ${fmtPct(POLY_FEE * (1 - poly.yes_price))} → net ${fmtSpread(arb.net_a_if_yes)}`,
    `If NO: Kalshi fee ${fmtPct(KALSHI_FEE * (1 - kalshi.no_ask))} → net ${fmtSpread(arb.net_a_if_no)}`,
  ].join(" · ");

  const feeLabel_b = [
    `If NO: Poly fee ${fmtPct(POLY_FEE * (1 - poly.no_price))} → net ${fmtSpread(arb.net_b_if_no)}`,
    `If YES: Kalshi fee ${fmtPct(KALSHI_FEE * (1 - kalshi.yes_ask))} → net ${fmtSpread(arb.net_b_if_yes)}`,
  ].join(" · ");

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Arb calculation</h3>
        <span className="ml-auto text-xs text-muted-foreground">Poly 2% · Kalshi 7% fee on winning leg</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FeeRow
          label="YES on Poly · NO on Kalshi"
          cost={`${fmtPct(poly.yes_price)} + ${fmtPct(kalshi.no_ask)}`}
          gross={arb.gross_a}
          feeLabel={feeLabel_a}
          feeAmt={0}
          net={arb.worst_net_a}
        />
        <FeeRow
          label="NO on Poly · YES on Kalshi"
          cost={`${fmtPct(poly.no_price)} + ${fmtPct(kalshi.yes_ask)}`}
          gross={arb.gross_b}
          feeLabel={feeLabel_b}
          feeAmt={0}
          net={arb.worst_net_b}
        />
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground flex-1">
          <strong>Best direction:</strong>{" "}
          {arb.best_direction === "poly-yes/kalshi-no"
            ? "Buy YES on Polymarket, NO on Kalshi"
            : "Buy NO on Polymarket, YES on Kalshi"}
          {" — "}
          worst-case net after fees{" "}
          <span className={netColor(arb.best_net)}>{fmtSpread(arb.best_net)}</span>
          {" per $1 notional"}
        </span>
      </div>

      <p className="text-xs text-amber-600">
        ⚠ Resolution risk: verify both markets resolve on identical criteria before trading.
        Fees modeled as 2% of Poly winnings and 7% of Kalshi winnings; actual fees may differ.
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
  const [resolutionData, setResolutionData] = useState<ResolutionData | null>(null);
  const [resolutionLoading, setResolutionLoading] = useState(false);

  useEffect(() => {
    if (!selectedPoly || !selectedKalshi) {
      setResolutionData(null);
      return;
    }
    let cancelled = false;
    setResolutionLoading(true);
    setResolutionData(null);
    const params = new URLSearchParams({
      poly_slug: selectedPoly.slug,
      kalshi_ticker: selectedKalshi.ticker,
    });
    fetch(`/api/arb/resolution?${params}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setResolutionData(d); })
      .catch(() => { if (!cancelled) setResolutionData(null); })
      .finally(() => { if (!cancelled) setResolutionLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPoly?.slug, selectedKalshi?.ticker]);

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

      // Sort by worst-case net spread descending
      pairs.sort((a, b) => b.arb.best_net - a.arb.best_net);
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
          costs less than $1.00. Spreads shown are <strong>worst-case net after fees</strong> (Poly 2% + Kalshi 7% on winning leg).
          Always verify resolution criteria match before trading.
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

      {/* Manual arb result + resolution criteria */}
      {selectedPoly && selectedKalshi && (
        <div className="mb-8 space-y-3">
          <ArbPanel poly={selectedPoly} kalshi={selectedKalshi} />
          <ResolutionPanel
            poly={selectedPoly}
            kalshi={selectedKalshi}
            data={resolutionData}
            loading={resolutionLoading}
          />
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
              Searches both exchanges for {SCAN_QUERIES.join(", ")} — matches by keyword overlap, ranked by worst-case net spread after fees.
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
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Gross</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Net (worst)</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-center">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {scanResults.map((pair, i) => {
                  const gross = pair.arb.best_direction === "poly-yes/kalshi-no"
                    ? pair.arb.gross_a
                    : pair.arb.gross_b;
                  return (
                    <tr
                      key={i}
                      className="hover:bg-muted/20 cursor-pointer"
                      onClick={() => {
                        setSelectedPoly(pair.poly);
                        setSelectedKalshi(pair.kalshi);
                      }}
                    >
                      <td className="px-3 py-2.5 max-w-[160px]">
                        <span className="line-clamp-2 leading-snug">{pair.poly.question}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[160px]">
                        <span className="line-clamp-2 leading-snug">{pair.kalshi.title}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-green-600">{fmtPct(pair.poly.yes_price)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-500">{fmtPct(pair.poly.no_price)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-green-600">{fmtPct(pair.kalshi.yes_ask)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-500">{fmtPct(pair.kalshi.no_ask)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${netColor(gross)}`}>
                        {fmtSpread(gross)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${netColor(pair.arb.best_net)}`}>
                        {fmtSpread(pair.arb.best_net)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                          {pair.arb.best_direction === "poly-yes/kalshi-no"
                            ? "YES↑ / NO↓"
                            : "NO↑ / YES↓"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
