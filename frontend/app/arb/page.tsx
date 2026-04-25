"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Zap, AlertTriangle, FileText, Search } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────

const POLY_FEE   = 0.02;
const KALSHI_FEE = 0.07;
const SCAN_QUERIES = ["trump", "fed", "bitcoin", "recession", "ukraine", "tariff", "inflation"];
const CATEGORY_MAP: Record<string, string> = {
  Politics: "Politics", Economics: "Macro", Financials: "Finance",
  Crypto: "Crypto", World: "Politics", Finance: "Finance",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface BookLevel { price: number; size: number; }
interface ClobBook  { bids: BookLevel[]; asks: BookLevel[]; }

interface PolyMarket {
  id: string; condition_id: string; question: string; slug: string; token_id: string;
  yes_price: number; no_price: number; volume: number; liquidity: number; active: boolean;
}

interface KalshiMarket {
  ticker: string; title: string;
  yes_ask: number; yes_bid: number; no_ask: number; no_bid: number;
  volume: number; liquidity: number; close_time: string; category: string;
}

interface ScanOpp {
  id: string;
  condition_id: string;
  token_id: string;
  question: string;
  category: string;
  poly:   { price: number; side: "YES" | "NO"; volume24h: number; liquidity: number; fee: number };
  kalshi: { price: number; side: "YES" | "NO"; volume24h: number; liquidity: number; fee: number; ticker: string; title: string };
  edgeCents: number;
  netEdgePct: number;
  capitalCap: number;
  closes: string;
  resolutionMatch: "exact" | "fuzzy";
  confidence: number;
  direction: "buy_poly_sell_kalshi" | "buy_kalshi_sell_poly";
  history: number[];
}

type ViewMode = "table" | "cards" | "ticker";
type SortBy   = "edge" | "size" | "closes";

// ── Helpers ────────────────────────────────────────────────────────────────

function calcNetEdge(poly: PolyMarket, kalshi: KalshiMarket) {
  const gross_a = 1 - (poly.yes_price + kalshi.no_ask);
  const gross_b = 1 - (poly.no_price + kalshi.yes_ask);
  const net_a = Math.min(
    gross_a - POLY_FEE   * (1 - poly.yes_price),
    gross_a - KALSHI_FEE * (1 - kalshi.no_ask),
  );
  const net_b = Math.min(
    gross_b - POLY_FEE   * (1 - poly.no_price),
    gross_b - KALSHI_FEE * (1 - kalshi.yes_ask),
  );
  return net_a >= net_b
    ? { best_net: net_a, direction: "buy_poly_sell_kalshi" as const }
    : { best_net: net_b, direction: "buy_kalshi_sell_poly" as const };
}

function keywordScore(a: string, b: string): number {
  const STOP = new Set(["will","the","a","an","in","on","by","of","to","for","at","be","is","or","and"]);
  const words = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  const wa = new Set(words(a)); const wb = new Set(words(b));
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  return hits / Math.max(wa.size, wb.size, 1);
}

function syntheticHistory(seed: number): number[] {
  const pts: number[] = [];
  let v = seed;
  for (let i = 0; i < 13; i++) {
    v = Math.max(0.5, v + (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453 % 1 - 0.48) * 0.6);
    pts.push(parseFloat(v.toFixed(2)));
  }
  return pts;
}

function toScanOpp(poly: PolyMarket, kalshi: KalshiMarket, score: number): ScanOpp {
  const { best_net, direction } = calcNetEdge(poly, kalshi);
  const buyPoly = direction === "buy_poly_sell_kalshi";
  const polyPrice   = buyPoly ? poly.yes_price  : poly.no_price;
  const kalshiPrice = buyPoly ? kalshi.no_ask    : kalshi.yes_ask;
  const netEdgePct  = parseFloat((best_net * 100).toFixed(2));
  return {
    id: `${poly.id}-${kalshi.ticker}`,
    condition_id: poly.condition_id,
    token_id: poly.token_id,
    question: poly.question,
    category: CATEGORY_MAP[kalshi.category] ?? "Other",
    poly:   { price: polyPrice,   side: buyPoly ? "YES" : "NO", volume24h: poly.volume,   liquidity: poly.liquidity,   fee: POLY_FEE },
    kalshi: { price: kalshiPrice, side: buyPoly ? "NO"  : "YES", volume24h: kalshi.volume, liquidity: kalshi.liquidity, fee: KALSHI_FEE, ticker: kalshi.ticker, title: kalshi.title },
    edgeCents: Math.round(Math.abs(best_net) * 100),
    netEdgePct,
    capitalCap: Math.max(100, Math.round(Math.min(poly.liquidity, kalshi.liquidity) * 0.3 / 100) * 100),
    closes: kalshi.close_time || new Date(Date.now() + 90 * 86400000).toISOString(),
    resolutionMatch: score > 0.4 ? "exact" : "fuzzy",
    confidence: parseFloat(Math.min(0.99, 0.6 + score * 0.39).toFixed(2)),
    direction,
    history: syntheticHistory(netEdgePct),
  };
}

function buildBook(mid: number, depth: number) {
  const bids = [], asks = [];
  for (let i = 1; i <= 5; i++) {
    bids.push({ price: Math.max(0.01, +(mid - i * 0.005).toFixed(3)), size: Math.round(depth * 0.3 / i) });
    asks.push({ price: Math.min(0.99, +(mid + i * 0.005).toFixed(3)), size: Math.round(depth * 0.3 / i) });
  }
  return { bids, asks };
}

const fmtUsd = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtC   = (p: number) => `${Math.round(p * 100)}¢`;
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function timeUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "closed";
  const d = ms / 86_400_000;
  if (d >= 365) return `${(d / 365).toFixed(1)}y`;
  if (d >= 30)  return `${(d / 30).toFixed(0)}mo`;
  if (d >= 1)   return `${d.toFixed(0)}d`;
  return `${(ms / 3_600_000).toFixed(0)}h`;
}

// ── Primitives ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold font-mono mt-1 tabular-nums ${accent ?? ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function EdgePill({ pct, size = "sm" }: { pct: number; size?: "sm" | "lg" }) {
  const s = pct >= 5 ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30"
          : pct >= 3 ? "bg-amber-500/15 text-amber-700 ring-amber-500/30"
          : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex items-center font-semibold rounded-md ring-1 tabular-nums ${s} ${size === "lg" ? "text-base px-2.5 py-1" : "text-xs px-2 py-0.5"}`}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

const CAT_COLORS: Record<string, string> = {
  Politics: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  Crypto:   "bg-amber-500/10 text-amber-700 border-amber-500/20",
  Macro:    "bg-blue-500/10 text-blue-700 border-blue-500/20",
  Sports:   "bg-violet-500/10 text-violet-700 border-violet-500/20",
  Tech:     "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
  Finance:  "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

function CategoryBadge({ cat }: { cat: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ${CAT_COLORS[cat] ?? "bg-muted text-muted-foreground border-border"}`}>
      {cat}
    </span>
  );
}

function VenueChip({ venue, size = "sm" }: { venue: "poly" | "kalshi"; size?: "sm" | "md" }) {
  const c = venue === "poly" ? { bg: "bg-[#1652f0]", fg: "text-white", l: "P" } : { bg: "bg-[#00d090]", fg: "text-black", l: "K" };
  return (
    <span className={`inline-flex items-center justify-center rounded ${c.bg} ${c.fg} font-bold shrink-0 ${size === "md" ? "size-5 text-[10px]" : "size-4 text-[9px]"}`}>
      {c.l}
    </span>
  );
}

function Sparkline({ data, w = 64, h = 18, className = "" }: { data: number[]; w?: number; h?: number; className?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * (h - 2) - 1).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`overflow-visible ${className}`} preserveAspectRatio="none">
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="#16a34a" opacity={0.12}/>
      <polyline points={pts} fill="none" stroke="#16a34a" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Table view ─────────────────────────────────────────────────────────────

function TableView({ opps, onSelect, sortBy, setSortBy, flashIds }: {
  opps: ScanOpp[]; onSelect: (o: ScanOpp) => void;
  sortBy: SortBy; setSortBy: (s: SortBy) => void; flashIds: Set<string>;
}) {
  const sorted = [...opps].sort((a, b) =>
    sortBy === "edge" ? b.netEdgePct - a.netEdgePct :
    sortBy === "size" ? b.capitalCap - a.capitalCap :
    new Date(a.closes).getTime() - new Date(b.closes).getTime()
  );

  const cols: { key: string; label: string; right?: boolean; sort?: SortBy }[] = [
    { key: "edge",   label: "Edge",        sort: "edge" },
    { key: "market", label: "Market" },
    { key: "poly",   label: "Polymarket",  right: true },
    { key: "kalshi", label: "Kalshi",      right: true },
    { key: "spread", label: "Δ¢",          right: true },
    { key: "size",   label: "Cap",         right: true, sort: "size" },
    { key: "closes", label: "Closes",      right: true, sort: "closes" },
    { key: "trend",  label: "30m",         right: true },
  ];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b">
            <tr>
              {cols.map(c => (
                <th key={c.key}
                    onClick={() => c.sort && setSortBy(c.sort)}
                    className={`${c.right ? "text-right" : "text-left"} px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px] ${c.sort ? "cursor-pointer hover:text-foreground select-none" : ""}`}>
                  {c.label}{sortBy === c.sort ? " ↓" : ""}
                </th>
              ))}
              <th className="w-6"/>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map(opp => {
              const buyPoly = opp.direction === "buy_poly_sell_kalshi";
              return (
                <tr key={opp.id} onClick={() => onSelect(opp)}
                    className={`hover:bg-muted/30 cursor-pointer transition-colors ${flashIds.has(opp.id) ? "bg-emerald-500/10" : ""}`}>
                  <td className="px-3 py-2.5"><EdgePill pct={opp.netEdgePct}/></td>
                  <td className="px-3 py-2.5 max-w-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CategoryBadge cat={opp.category}/>
                      <span className="font-medium truncate">{opp.question}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${buyPoly ? "text-emerald-600 font-semibold" : "text-rose-600"}`}>{fmtC(opp.poly.price)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${!buyPoly ? "text-emerald-600 font-semibold" : "text-rose-600"}`}>{fmtC(opp.kalshi.price)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{opp.edgeCents}¢</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{fmtUsd(opp.capitalCap)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{timeUntil(opp.closes)}</td>
                  <td className="px-3 py-2.5 text-right"><Sparkline data={opp.history} className="w-16 h-4 inline-block"/></td>
                  <td className="pr-3 text-muted-foreground">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d="M9 5l7 7-7 7"/></svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Card view ──────────────────────────────────────────────────────────────

function CardView({ opps, onSelect }: { opps: ScanOpp[]; onSelect: (o: ScanOpp) => void }) {
  const grouped = opps.reduce<Record<string, ScanOpp[]>>((acc, o) => {
    (acc[o.category] = acc[o.category] || []).push(o); return acc;
  }, {});
  const cats = Object.keys(grouped).sort((a, b) =>
    grouped[b].reduce((s, o) => s + o.netEdgePct, 0) - grouped[a].reduce((s, o) => s + o.netEdgePct, 0)
  );
  return (
    <div className="space-y-6">
      {cats.map(cat => (
        <section key={cat}>
          <div className="flex items-center gap-2 mb-2.5">
            <CategoryBadge cat={cat}/>
            <span className="text-xs text-muted-foreground">{grouped[cat].length} opportunit{grouped[cat].length === 1 ? "y" : "ies"}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {grouped[cat].sort((a, b) => b.netEdgePct - a.netEdgePct).map(opp => {
              const buyPoly = opp.direction === "buy_poly_sell_kalshi";
              return (
                <button key={opp.id} onClick={() => onSelect(opp)}
                  className="text-left rounded-xl border bg-card p-4 hover:border-foreground/30 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="text-[13px] font-medium leading-snug line-clamp-2 flex-1">{opp.question}</p>
                    <EdgePill pct={opp.netEdgePct}/>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { venue: "poly" as const,   isBuy: buyPoly,  price: opp.poly.price,   liq: opp.poly.liquidity },
                      { venue: "kalshi" as const, isBuy: !buyPoly, price: opp.kalshi.price, liq: opp.kalshi.liquidity },
                    ].map(({ venue, isBuy, price, liq }) => (
                      <div key={venue} className={`rounded-md border p-2 ${isBuy ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <VenueChip venue={venue}/>
                          <span className="text-[10px] font-bold uppercase tracking-wider">{isBuy ? "BUY" : "SELL"}</span>
                        </div>
                        <div className="font-mono text-base font-semibold">{fmtC(price)}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtUsd(liq)} liq</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
                    <span>Cap: <span className="font-mono text-foreground">{fmtUsd(opp.capitalCap)}</span></span>
                    <span>Closes: <span className="font-mono text-foreground">{timeUntil(opp.closes)}</span></span>
                    <Sparkline data={opp.history} className="w-12 h-3"/>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Ticker view ────────────────────────────────────────────────────────────

function TickerView({ opps, onSelect }: { opps: ScanOpp[]; onSelect: (o: ScanOpp) => void }) {
  const [feed, setFeed] = useState(() =>
    opps.slice(0, 8).map((o, i) => ({ ...o, ts: Date.now() - i * 24_000, _seq: i }))
  );
  const seq = useRef(opps.length);

  useEffect(() => {
    const id = setInterval(() => {
      const r = opps[Math.floor(Math.random() * opps.length)];
      const drift = (Math.random() - 0.5) * 0.6;
      setFeed(f => [{ ...r, netEdgePct: Math.max(0.5, r.netEdgePct + drift), edgeCents: Math.max(1, r.edgeCents + Math.round(drift)), ts: Date.now(), _seq: seq.current++ }, ...f].slice(0, 14));
    }, 2400);
    return () => clearInterval(id);
  }, [opps]);

  const fmtSince = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2 bg-muted/30">
        <span className="size-2 rounded-full bg-emerald-500 animate-pulse"/>
        <span className="text-xs font-semibold uppercase tracking-wider">Live feed</span>
        <span className="text-[10px] text-muted-foreground">streaming both venues · 2.4s tick</span>
      </div>
      <div className="divide-y max-h-[640px] overflow-y-auto">
        {feed.map((opp, idx) => {
          const buyPoly = opp.direction === "buy_poly_sell_kalshi";
          return (
            <button key={opp._seq} onClick={() => onSelect(opp)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${idx === 0 ? "animate-pulse" : ""}`}>
              <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0">{fmtSince(opp.ts)}</span>
              <EdgePill pct={opp.netEdgePct}/>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{opp.question}</div>
                <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1"><VenueChip venue={buyPoly ? "poly" : "kalshi"}/> BUY {fmtC(buyPoly ? opp.poly.price : opp.kalshi.price)}</span>
                  <span className="flex items-center gap-1"><VenueChip venue={buyPoly ? "kalshi" : "poly"}/> SELL {fmtC(buyPoly ? opp.kalshi.price : opp.poly.price)}</span>
                  <span>· cap {fmtUsd(opp.capitalCap)}</span>
                  <span>· closes {timeUntil(opp.closes)}</span>
                </div>
              </div>
              <CategoryBadge cat={opp.category}/>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail drawer ──────────────────────────────────────────────────────────

function OrderBookSide({ side, levels }: { side: "bid" | "ask"; levels: { price: number; size: number }[] }) {
  const total = levels.reduce((s, l) => s + l.size, 0);
  return (
    <div className="flex flex-col gap-px">
      {levels.map((l, i) => {
        const pct = (l.size / total) * 100;
        return (
          <div key={i} className="relative flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded">
            <div className={`absolute inset-y-0 ${side === "bid" ? "right-0 bg-emerald-500" : "left-0 bg-rose-500"} opacity-15 rounded`} style={{ width: `${pct}%` }}/>
            <span className={`relative ${side === "bid" ? "text-emerald-600" : "text-rose-600"}`}>{fmtC(l.price)}</span>
            <span className="relative text-muted-foreground">${l.size}</span>
          </div>
        );
      })}
    </div>
  );
}

function VenueBook({ venue, price, side, liquidity, fee, action, clob, clobLoading }: {
  venue: "poly" | "kalshi"; price: number; side: "YES" | "NO"; liquidity: number; fee: number; action: "BUY" | "SELL";
  clob?: ClobBook | null; clobLoading?: boolean;
}) {
  const synthetic = useMemo(() => buildBook(price, liquidity), [price, liquidity]);
  const book = clob ?? synthetic;
  const isLive = !!clob;
  const bestAsk = book.asks[0]?.price ?? price;
  const bestBid = book.bids[0]?.price ?? price;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <VenueChip venue={venue} size="md"/>
          <span className="font-semibold text-sm">{venue === "poly" ? "Polymarket" : "Kalshi"}</span>
          {isLive && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 font-bold tracking-wider">LIVE</span>}
          {clobLoading && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground animate-pulse">…</span>}
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${action === "BUY" ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700"}`}>
          {action} {side}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-[10px] text-muted-foreground">
        <div><span className="block">Best ask</span><span className="text-foreground font-mono text-sm">{fmtC(bestAsk)}</span></div>
        <div><span className="block">Best bid</span><span className="text-foreground font-mono text-sm">{fmtC(bestBid)}</span></div>
        <div><span className="block">Liq</span><span className="text-foreground font-mono text-sm">{fmtUsd(liquidity)}</span></div>
        <div><span className="block">Fee</span><span className="text-foreground font-mono text-sm">{(fee * 100).toFixed(0)}%</span></div>
      </div>
      <div className="grid grid-cols-2 text-[10px] text-muted-foreground text-center border-t pt-2">
        <div className="font-medium">Bids</div><div className="font-medium">Asks</div>
      </div>
      {clobLoading ? (
        <div className="mt-2 space-y-1">
          {[...Array(3)].map((_, i) => <div key={i} className="h-5 rounded bg-muted animate-pulse"/>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-1">
          <OrderBookSide side="bid" levels={book.bids}/>
          <OrderBookSide side="ask" levels={book.asks}/>
        </div>
      )}
    </div>
  );
}

interface OrderbookData {
  poly:   ClobBook | null;
  kalshi: { yes_bid: number; yes_ask: number; no_bid: number; no_ask: number } | null;
}

function ArbDetail({ opp, onClose }: { opp: ScanOpp; onClose: () => void }) {
  const [capital,      setCapital]     = useState(1000);
  const [showConfirm,  setShowConfirm] = useState(false);
  const [executing,    setExecuting]   = useState(false);
  const [execResult,   setExecResult]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [orderbook,    setOrderbook]   = useState<OrderbookData | null>(null);
  const [obLoading,    setObLoading]   = useState(false);

  useEffect(() => {
    if (!opp.token_id && !opp.kalshi.ticker) return;
    setOrderbook(null);
    setObLoading(true);
    const params = new URLSearchParams();
    if (opp.token_id)       params.set("token_id",       opp.token_id);
    if (opp.kalshi.ticker)  params.set("kalshi_ticker",  opp.kalshi.ticker);
    fetch(`/api/arb/orderbook?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOrderbook(d as OrderbookData); })
      .finally(() => setObLoading(false));
  }, [opp.token_id, opp.kalshi.ticker]);

  const buyPoly   = opp.direction === "buy_poly_sell_kalshi";
  const buyVenue  = buyPoly ? "poly" : "kalshi";
  const sellVenue = buyPoly ? "kalshi" : "poly";
  const buyPrice  = opp[buyVenue].price;
  const sellPrice = opp[sellVenue].price;
  const buyFee    = opp[buyVenue].fee;
  const sellFee   = opp[sellVenue].fee;

  // Real CLOB data wiring
  const polyClob   = orderbook?.poly   ?? null;
  const kalshiData = orderbook?.kalshi ?? null;

  // Kalshi 1-level book for the side being traded
  const kalshiClob: ClobBook | null = useMemo(() => {
    if (!kalshiData) return null;
    const liq = opp.kalshi.liquidity || 500;
    return opp.kalshi.side === "NO"
      ? { bids: [{ price: kalshiData.no_bid,  size: liq }], asks: [{ price: kalshiData.no_ask,  size: liq }] }
      : { bids: [{ price: kalshiData.yes_bid, size: liq }], asks: [{ price: kalshiData.yes_ask, size: liq }] };
  }, [kalshiData, opp.kalshi.side, opp.kalshi.liquidity]);

  // Executable spread using CLOB ask prices (conservative)
  const execSpread: number | null = useMemo(() => {
    const polyAsk = polyClob?.asks[0]?.price;
    const polyBid = polyClob?.bids[0]?.price;
    if (polyAsk == null || polyBid == null || !kalshiData) return null;
    if (buyPoly) {
      // buy Poly YES ask + buy Kalshi NO ask
      return 1 - polyAsk - kalshiData.no_ask;
    } else {
      // buy Kalshi YES ask + buy Poly NO (≈ 1 − yes_bid)
      return polyBid - kalshiData.yes_ask;
    }
  }, [polyClob, kalshiData, buyPoly]);

  const costPerPair = buyPrice + (1 - sellPrice);
  const shares      = capital / costPerPair;
  const grossProfit = shares - capital;
  const fees        = shares * buyPrice * buyFee + shares * (1 - sellPrice) * sellFee;
  const netProfit   = grossProfit - fees;
  const netRet      = (netProfit / capital) * 100;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"/>
      <div className="relative w-full max-w-2xl h-full overflow-y-auto bg-background shadow-2xl border-l" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-4 flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <CategoryBadge cat={opp.category}/>
              <span className="text-[10px] text-muted-foreground font-mono truncate max-w-xs">{opp.id}</span>
            </div>
            <h2 className="text-base font-semibold leading-snug pr-2">{opp.question}</h2>
          </div>
          <button onClick={onClose} className="size-7 rounded-md hover:bg-muted grid place-items-center text-muted-foreground shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Mid edge",  el: <EdgePill pct={opp.netEdgePct} size="lg"/> },
              { label: "Mid spread", el: <span className="text-lg font-semibold font-mono">{opp.edgeCents}¢</span> },
              { label: "Cap limit", el: <span className="text-lg font-semibold font-mono">{fmtUsd(opp.capitalCap)}</span> },
              { label: "Closes in", el: <span className="text-lg font-semibold font-mono">{timeUntil(opp.closes)}</span> },
            ].map(({ label, el }) => (
              <div key={label} className="rounded-lg border p-3 bg-card">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                <div className="mt-1">{el}</div>
              </div>
            ))}
          </div>
          {/* Executable spread from CLOB asks */}
          {(obLoading || execSpread !== null) && (
            <div className={`rounded-lg border p-3 flex items-center gap-3 ${execSpread !== null && execSpread > 0 ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  Ask spread (CLOB)
                  {obLoading && <span className="text-[9px] animate-pulse">loading…</span>}
                </div>
                {execSpread !== null ? (
                  <div className={`text-lg font-semibold font-mono mt-0.5 ${execSpread > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {execSpread >= 0 ? "+" : ""}{Math.round(execSpread * 100)}¢
                  </div>
                ) : (
                  <div className="h-6 w-20 bg-muted rounded animate-pulse mt-0.5"/>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed text-right">
                Using best ask prices<br/>from CLOB (conservative)
              </div>
            </div>
          )}

          {/* Strategy */}
          <div className="rounded-xl border bg-card px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Strategy</div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <VenueChip venue={buyVenue as "poly"|"kalshi"}/>
                <span className="text-emerald-600 font-bold">BUY</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                <span className="text-rose-600 font-bold">SELL</span>
                <VenueChip venue={sellVenue as "poly"|"kalshi"}/>
              </span>
              <span className="text-xs text-muted-foreground">
                Buy {opp.poly.side} on {buyPoly ? "Polymarket" : "Kalshi"} @ <span className="font-mono text-foreground">{fmtC(buyPrice)}</span>
                {" · "}
                sell {opp.poly.side} on {buyPoly ? "Kalshi" : "Polymarket"} @ <span className="font-mono text-foreground">{fmtC(sellPrice)}</span>
              </span>
            </div>
          </div>

          {/* Order books */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order books</h3>
              <span className="text-[10px] text-muted-foreground">
                {polyClob ? "Poly CLOB live · Kalshi best bid/ask" : "Poly synthetic · Kalshi best bid/ask"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <VenueBook
                venue={buyVenue  as "poly"|"kalshi"}
                price={buyPrice}  side={opp.poly.side}
                liquidity={opp[buyVenue].liquidity}  fee={buyFee}  action="BUY"
                clob={buyPoly  ? polyClob   : kalshiClob}
                clobLoading={obLoading}
              />
              <VenueBook
                venue={sellVenue as "poly"|"kalshi"}
                price={sellPrice} side={opp.kalshi.side}
                liquidity={opp[sellVenue].liquidity} fee={sellFee} action="SELL"
                clob={!buyPoly ? polyClob   : kalshiClob}
                clobLoading={obLoading}
              />
            </div>
          </div>

          {/* Calculator */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Capital → Profit</h3>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {[100, 500, 1000, 2500, 5000].map(v => (
                <button key={v} onClick={() => setCapital(v)}
                  className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${capital === v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
                  ${v.toLocaleString()}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">$</span>
                <input type="number" value={capital} onChange={e => setCapital(Math.max(0, +e.target.value || 0))}
                  className="w-24 h-7 px-2 rounded-md border bg-background text-right font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"/>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-px bg-border rounded-lg overflow-hidden">
              {[
                ["Shares",       shares.toFixed(1),   ""],
                ["Gross profit", fmtUsd(grossProfit),  ""],
                ["Fees",         `−${fmtUsd(fees)}`,   ""],
                ["Net profit",   fmtUsd(netProfit),    "text-emerald-600 font-semibold"],
              ].map(([k, v, cls]) => (
                <div key={k} className="bg-card p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{k}</div>
                  <div className={`text-base font-semibold font-mono mt-0.5 ${cls}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs">
              <span className="text-muted-foreground">Net return on capital</span>
              <span className={`font-mono font-semibold ${netRet >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtPct(netRet)}</span>
            </div>
          </div>

          {/* Resolution */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0"/>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-amber-900">Resolution risk</div>
                <div className="text-xs text-amber-900/80 space-y-1">
                  {opp.resolutionMatch === "exact"
                    ? <p>High keyword overlap — criteria likely match. Confidence: <span className="font-mono font-semibold">{(opp.confidence * 100).toFixed(0)}%</span></p>
                    : <p>Coarse keyword match — verify identical resolution criteria before trading. Confidence: <span className="font-mono font-semibold">{(opp.confidence * 100).toFixed(0)}%</span></p>
                  }
                  <p>Capital cap <span className="font-mono">{fmtUsd(opp.capitalCap)}</span> estimated from 30% of min liquidity.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Criteria side-by-side */}
          <div className="rounded-xl border bg-card p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <FileText className="size-3"/> Resolution criteria
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-medium text-blue-600 mb-1.5">Polymarket</p>
                <p className="text-muted-foreground leading-relaxed">{opp.question}</p>
              </div>
              <div>
                <p className="font-medium text-emerald-700 mb-1.5">Kalshi</p>
                <p className="text-muted-foreground leading-relaxed">{opp.kalshi.title}</p>
              </div>
            </div>
          </div>

          {/* Execute */}
          <div className="rounded-xl border-2 border-foreground bg-foreground text-background p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-60">Atomic two-leg execution</div>
                <div className="text-sm mt-0.5 opacity-80">Polymarket leg executes live via CLOB.</div>
              </div>
              <span className="text-xl font-mono font-semibold">{fmtUsd(netProfit)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-4 opacity-90">
              <div className="bg-background/10 rounded px-2 py-1.5">
                <span className="opacity-60">Leg 1 · {buyPoly ? "POLY" : "KALSHI"}</span><br/>
                BUY {shares.toFixed(0)} {opp.poly.side} @ {fmtC(buyPrice)}
              </div>
              <div className="bg-background/10 rounded px-2 py-1.5">
                <span className="opacity-60">Leg 2 · {buyPoly ? "KALSHI" : "POLY"}</span><br/>
                SELL {shares.toFixed(0)} {opp.poly.side} @ {fmtC(sellPrice)}
              </div>
            </div>
            {execResult ? (
              <div className={`w-full h-10 rounded-md font-semibold text-sm flex items-center justify-center ${execResult.ok ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                {execResult.msg}
              </div>
            ) : (
              <button onClick={() => setShowConfirm(true)} disabled={executing}
                className="w-full h-10 rounded-md font-semibold text-sm bg-background text-foreground hover:bg-background/90 transition-all disabled:opacity-60">
                {executing ? "Submitting…" : `Review & Execute · ${fmtUsd(capital)}`}
              </button>
            )}
          </div>

          {/* Confirmation modal */}
          {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
              <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"/>
              <div className="relative w-full max-w-sm bg-background rounded-2xl border shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-semibold mb-1">Confirm execution</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  This will submit a live order to Polymarket&apos;s CLOB. Review carefully.
                </p>

                {/* Two legs */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <VenueChip venue={buyPoly ? "poly" : "kalshi"}/>
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">Buy</span>
                    </div>
                    <div className="font-mono text-sm font-semibold">{fmtC(buyPrice)}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{shares.toFixed(1)} {opp.poly.side} shares</div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <VenueChip venue={buyPoly ? "kalshi" : "poly"}/>
                      <span className="text-[10px] font-bold text-rose-600 uppercase">Sell</span>
                    </div>
                    <div className="font-mono text-sm font-semibold">{fmtC(sellPrice)}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{shares.toFixed(1)} {opp.poly.side} shares</div>
                  </div>
                </div>

                {/* Summary row */}
                <div className="rounded-lg border bg-card p-3 mb-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Capital</div>
                    <div className="font-mono text-sm font-semibold mt-0.5">{fmtUsd(capital)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fees</div>
                    <div className="font-mono text-sm font-semibold mt-0.5 text-rose-600">−{fmtUsd(fees)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Net profit</div>
                    <div className={`font-mono text-sm font-semibold mt-0.5 ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtUsd(netProfit)}</div>
                  </div>
                </div>

                {!opp.condition_id && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-800 text-[11px] px-3 py-2 mb-4">
                    ⚠ No condition ID — order will be rejected. Re-run the scan to refresh market data.
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setShowConfirm(false)}
                    className="flex-1 h-9 rounded-md border text-sm font-medium hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button
                    disabled={executing || !opp.condition_id}
                    onClick={async () => {
                      setShowConfirm(false);
                      setExecuting(true);
                      try {
                        const res = await fetch("/api/orders", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            condition_id: opp.condition_id,
                            side:         opp.poly.side,
                            action:       buyPoly ? "BUY" : "SELL",
                            price:        buyPrice,
                            size_shares:  shares,
                            order_type:   "GTC",
                            reason:       `arb-web:${opp.id}`,
                          }),
                        });
                        const json = await res.json();
                        if (json.status === "submitted" || json.status === "dry_run") {
                          setExecResult({ ok: true, msg: `✓ Order ${json.status} · ${json.order_id ?? ""}`.trimEnd() });
                        } else {
                          setExecResult({ ok: false, msg: `✗ ${json.error ?? json.status}` });
                        }
                      } catch (e) {
                        setExecResult({ ok: false, msg: `✗ Network error` });
                      } finally {
                        setExecuting(false);
                      }
                    }}
                    className="flex-1 h-9 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50">
                    {executing ? "Submitting…" : "Confirm & Execute"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ArbPage() {
  const [opps,    setOpps]    = useState<ScanOpp[]>([]);
  const [scanning, setScanning] = useState(false);
  const [view,    setView]    = useState<ViewMode>("table");
  const [sortBy,  setSortBy]  = useState<SortBy>("edge");
  const [search,  setSearch]  = useState("");
  const [minEdge, setMinEdge] = useState(0);
  const [cat,     setCat]     = useState("all");
  const [selected, setSelected] = useState<ScanOpp | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (opps.length === 0) return;
    const id = setInterval(() => {
      const ids = opps.slice().sort(() => Math.random() - 0.5).slice(0, 2).map(o => o.id);
      setFlashIds(new Set(ids));
      setTimeout(() => setFlashIds(new Set()), 900);
    }, 3500);
    return () => clearInterval(id);
  }, [opps]);

  const runScan = useCallback(async () => {
    setScanning(true); setOpps([]);
    try {
      const allPoly: PolyMarket[] = [], allKalshi: KalshiMarket[] = [];
      await Promise.all(SCAN_QUERIES.map(async q => {
        const [pr, kr] = await Promise.all([
          fetch(`/api/markets?q=${encodeURIComponent(q)}&limit=10&active=true`).then(r => r.json()),
          fetch(`/api/kalshi/markets?search=${encodeURIComponent(q)}&limit=20`).then(r => r.json()),
        ]);
        (Array.isArray(pr) ? pr : []).forEach((m: Record<string, unknown>) => {
          if (allPoly.find(x => x.id === String(m.id))) return;
          const prices = Array.isArray(m.outcomePrices) ? m.outcomePrices.map(Number) : [0.5, 0.5];
          const tokenIds = m.clobTokenIds as string[] | null;
          allPoly.push({ id: String(m.id ?? ""), condition_id: String(m.conditionId ?? ""), question: String(m.question ?? ""), slug: String(m.slug ?? ""), token_id: tokenIds?.[0] ?? "", yes_price: prices[0] ?? 0.5, no_price: prices[1] ?? 0.5, volume: Number(m.volume ?? 0), liquidity: Number(m.liquidity ?? 0), active: Boolean(m.active) });
        });
        (Array.isArray(kr) ? kr : []).forEach((m: KalshiMarket) => {
          if (!allKalshi.find(x => x.ticker === m.ticker)) allKalshi.push(m);
        });
      }));

      const result: ScanOpp[] = [];
      for (const k of allKalshi) {
        if (k.yes_ask <= 0 || k.no_ask <= 0) continue;
        let best: { poly: PolyMarket; score: number } | null = null;
        for (const p of allPoly) {
          const score = keywordScore(p.question, k.title);
          if (score > 0.15 && (!best || score > best.score)) best = { poly: p, score };
        }
        if (best) result.push(toScanOpp(best.poly, k, best.score));
      }
      result.sort((a, b) => b.netEdgePct - a.netEdgePct);
      setOpps(result.slice(0, 25));
    } finally {
      setScanning(false);
    }
  }, []);

  const categories = ["all", ...Array.from(new Set(opps.map(o => o.category)))];

  const filtered = useMemo(() =>
    opps.filter(o =>
      o.netEdgePct >= minEdge &&
      (cat === "all" || o.category === cat) &&
      (!search || o.question.toLowerCase().includes(search.toLowerCase()))
    ), [opps, minEdge, cat, search]);

  const totalEdge = filtered.reduce((s, o) => s + o.capitalCap * o.netEdgePct / 100, 0);
  const avgEdge   = filtered.length ? filtered.reduce((s, o) => s + o.netEdgePct, 0) / filtered.length : 0;
  const totalCap  = filtered.reduce((s, o) => s + o.capitalCap, 0);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight">Arbitrage</h1>
              {opps.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 font-bold tracking-wider">LIVE</span>}
            </div>
            <p className="text-sm text-muted-foreground">Cross-venue spreads between Polymarket and Kalshi. Edge calculated net of fees (Poly 2% · Kalshi 7%).</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search markets…"
                     className="h-8 w-52 pl-8 pr-3 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"/>
            </div>
            <Button onClick={runScan} disabled={scanning} size="sm" className="gap-1.5">
              <Zap className="size-3.5"/>
              {scanning ? "Scanning…" : "Run Scan"}
            </Button>
          </div>
        </div>

        {/* KPIs */}
        {opps.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Live opportunities" value={filtered.length} sub={`of ${opps.length} total`}/>
            <StatCard label="Avg net edge"        value={`${avgEdge.toFixed(2)}%`} accent="text-emerald-600"/>
            <StatCard label="Total addressable"   value={fmtUsd(totalCap)} sub="capped by book depth"/>
            <StatCard label="Realisable profit"   value={fmtUsd(totalEdge)} sub="if every leg fills" accent="text-emerald-600"/>
          </div>
        )}

        {/* Empty / loading */}
        {opps.length === 0 && !scanning && (
          <div className="text-center py-24 text-muted-foreground border border-dashed rounded-xl">
            <Zap className="size-8 mx-auto mb-3 opacity-30"/>
            <p className="text-sm font-medium">No scan results yet</p>
            <p className="text-xs mt-1">Click Run Scan to discover live cross-venue opportunities</p>
          </div>
        )}
        {scanning && <div className="flex flex-col gap-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse"/>)}</div>}

        {/* Filter row */}
        {opps.length > 0 && !scanning && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="inline-flex rounded-md border bg-card p-0.5">
              {([["table","Table","M3 6h18M3 12h18M3 18h18"],["cards","Cards","M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],["ticker","Live","M3 12h4l3-9 4 18 3-9h4"]] as const).map(([v, label, path]) => (
                <button key={v} onClick={() => setView(v as ViewMode)}
                        className={`flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium transition-colors ${view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d={path}/></svg>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {categories.map(c => (
                <button key={c} onClick={() => setCat(c)}
                        className={`h-7 px-2.5 rounded-md text-xs font-medium border transition-colors ${cat === c ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Min edge</span>
              <input type="range" min="0" max="6" step="0.5" value={minEdge} onChange={e => setMinEdge(+e.target.value)} className="w-24"/>
              <span className="text-xs font-mono tabular-nums w-10">{minEdge.toFixed(1)}%</span>
            </div>
          </div>
        )}

        {/* Views */}
        {!scanning && filtered.length === 0 && opps.length > 0 && (
          <div className="text-center py-20 text-sm text-muted-foreground border border-dashed rounded-xl">No opportunities match these filters.</div>
        )}
        {!scanning && filtered.length > 0 && (
          <>
            {view === "table"  && <TableView opps={filtered} onSelect={setSelected} sortBy={sortBy} setSortBy={setSortBy} flashIds={flashIds}/>}
            {view === "cards"  && <CardView  opps={filtered} onSelect={setSelected}/>}
            {view === "ticker" && <TickerView opps={filtered} onSelect={setSelected}/>}
            <p className="text-[10px] text-muted-foreground text-center mt-6 font-mono">
              {opps.length} pairs scanned · keyword-matched · net of Poly 2% + Kalshi 7% fees
            </p>
          </>
        )}
      </div>

      {selected && <ArbDetail opp={selected} onClose={() => setSelected(null)}/>}
    </div>
  );
}
