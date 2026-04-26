"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Zap, AlertTriangle, FileText, Search, Plus, ChevronRight, Bell, History, Link2, Check, Star, X, ExternalLink, Download } from "lucide-react";

// ── localStorage preference hook ───────────────────────────────────────────

type SetState<T> = (v: T | ((prev: T) => T)) => void;

function usePref<T>(key: string, init: T): [T, SetState<T>] {
  const [val, setValRaw] = useState<T>(() => {
    if (typeof window === "undefined") return init;
    try {
      const s = localStorage.getItem(key);
      return s !== null ? (JSON.parse(s) as T) : init;
    } catch { return init; }
  });
  const setVal: SetState<T> = useCallback((action) => {
    setValRaw(prev => {
      const next = typeof action === "function" ? (action as (p: T) => T)(prev) : action;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [val, setVal];
}

// ── Constants ──────────────────────────────────────────────────────────────

const POLY_FEE   = 0.02;
const KALSHI_FEE = 0.07;
const SCAN_QUERIES = ["trump", "fed", "bitcoin", "recession", "ukraine", "tariff", "inflation"];
const CATEGORY_MAP: Record<string, string> = {
  Politics: "Politics", Economics: "Macro", Financials: "Finance",
  Crypto: "Crypto", World: "Politics", Finance: "Finance",
};
const KALSHI_CATS = ["Politics", "Economics", "Financials", "Crypto", "World", "Finance"] as const;
const AUTO_INTERVALS    = [60, 120, 300, 600] as const;
const NOTIFY_THRESHOLDS = [5, 10, 20] as const;

// ── Types ──────────────────────────────────────────────────────────────────

interface BookLevel { price: number; size: number; }
interface ClobBook  { bids: BookLevel[]; asks: BookLevel[]; }

interface HistoryEntry {
  ts: string;
  pair_id: string;
  kalshi_ticker: string;
  question: string;
  net_edge_pct: number;
  edge_cents: number;
  direction: string;
}

interface AlertLogEntry {
  ts: string;
  pair_id: string;
  question: string;
  net_edge_pct: number;
  threshold: number;
  direction: string;
  poly_price: number;
  kalshi_price: number;
}

interface PolyMarket {
  id: string; condition_id: string; question: string; slug: string; token_id: string;
  yes_price: number; no_price: number; volume: number; liquidity: number; active: boolean;
  end_date?: string;
}

interface KalshiMarket {
  ticker: string; title: string;
  yes_ask: number; yes_bid: number; no_ask: number; no_bid: number;
  volume: number; liquidity: number; close_time: string; category: string;
}

interface MatchQuality {
  keyword: number;
  dateProx: number;
  combined: number;
  grade: "H" | "M" | "L";
  polyCloses?: string;
}

interface ResolutionData {
  poly: { question: string; description: string } | null;
  kalshi: { title: string; rules_primary: string; rules_secondary: string } | null;
}

interface ScanOpp {
  id: string;
  slug: string;
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
  matchQuality: MatchQuality;
  direction: "buy_poly_sell_kalshi" | "buy_kalshi_sell_poly";
  history: number[];
}

type ViewMode = "table" | "cards" | "ticker";
type SortBy   = "edge" | "size" | "closes" | "match";

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

function computeResDiff(polyText: string, kalshiText: string): { polyOnly: string[]; kalshiOnly: string[]; shared: string[] } {
  const STOP = new Set([
    "will","the","a","an","in","on","by","of","to","for","at","be","is","or","and",
    "if","this","that","market","resolve","resolved","yes","no","contract","event",
    "based","other","any","all","not","with","from","its","has","have","been","are",
    "which","when","where","under","after","before","than","more","most","such","each",
  ]);
  const words = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
  const wa = new Set(words(polyText));
  const wb = new Set(words(kalshiText));
  return {
    polyOnly:   [...wa].filter(w => !wb.has(w)).slice(0, 14),
    kalshiOnly: [...wb].filter(w => !wa.has(w)).slice(0, 14),
    shared:     [...wa].filter(w => wb.has(w)).slice(0, 10),
  };
}

function dateProxScore(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const da = new Date(a).getTime(), db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  const days = Math.abs(da - db) / 86_400_000;
  if (days <= 1)  return 1.0;
  if (days <= 7)  return 0.8;
  if (days <= 30) return 0.5;
  if (days <= 90) return 0.2;
  return 0.0;
}

function computeMatchQuality(kwScore: number, polyCloses?: string, kalshiCloses?: string): MatchQuality {
  const dp = dateProxScore(polyCloses, kalshiCloses);
  const combined = dp > 0 ? 0.6 * kwScore + 0.4 * dp : kwScore;
  const grade: MatchQuality["grade"] = combined >= 0.5 ? "H" : combined >= 0.25 ? "M" : "L";
  return { keyword: kwScore, dateProx: dp, combined, grade, polyCloses };
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
  const mq = computeMatchQuality(score, poly.end_date, kalshi.close_time);
  return {
    id: `${poly.id}-${kalshi.ticker}`,
    slug: poly.slug,
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
    resolutionMatch: mq.grade === "H" ? "exact" : "fuzzy",
    confidence: parseFloat(Math.min(0.99, 0.5 + mq.combined * 0.49).toFixed(2)),
    matchQuality: mq,
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
  const s = pct >= 5 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30"
          : pct >= 3 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/30"
          : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex items-center font-semibold rounded-md ring-1 tabular-nums ${s} ${size === "lg" ? "text-base px-2.5 py-1" : "text-xs px-2 py-0.5"}`}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

const CAT_COLORS: Record<string, string> = {
  Politics: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  Crypto:   "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  Macro:    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  Sports:   "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  Tech:     "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  Finance:  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
};

function CategoryBadge({ cat }: { cat: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ${CAT_COLORS[cat] ?? "bg-muted text-muted-foreground border-border"}`}>
      {cat}
    </span>
  );
}

function MatchBadge({ grade }: { grade: "H" | "M" | "L" }) {
  const s = grade === "H" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30"
          : grade === "M" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/30"
          : "bg-muted text-muted-foreground ring-border";
  const label = grade === "H" ? "High" : grade === "M" ? "Med" : "Low";
  return (
    <span className={`inline-flex items-center font-semibold rounded ring-1 text-[9px] px-1.5 py-0.5 tabular-nums tracking-wide ${s}`}>
      {label}
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
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="currentColor" opacity={0.12}/>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Table view ─────────────────────────────────────────────────────────────

function TableView({ opps, onSelect, sortBy, setSortBy, flashIds, watchlistIds, onStar }: {
  opps: ScanOpp[]; onSelect: (o: ScanOpp) => void;
  sortBy: SortBy; setSortBy: (s: SortBy) => void; flashIds: Set<string>;
  watchlistIds: string[]; onStar: (id: string) => void;
}) {
  const sorted = [...opps].sort((a, b) =>
    sortBy === "edge"  ? b.netEdgePct - a.netEdgePct :
    sortBy === "size"  ? b.capitalCap - a.capitalCap :
    sortBy === "match" ? b.matchQuality.combined - a.matchQuality.combined :
    new Date(a.closes).getTime() - new Date(b.closes).getTime()
  );

  const cols: { key: string; label: string; right?: boolean; sort?: SortBy }[] = [
    { key: "star",   label: "" },
    { key: "edge",   label: "Edge",        sort: "edge" },
    { key: "match",  label: "Match",       sort: "match" as SortBy },
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
                  <td className="pl-3 pr-1 py-2.5" onClick={e => { e.stopPropagation(); onStar(opp.id); }}>
                    <Star className={`size-3.5 transition-colors ${watchlistIds.includes(opp.id) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-400"}`}/>
                  </td>
                  <td className="px-3 py-2.5"><EdgePill pct={opp.netEdgePct}/></td>
                  <td className="px-3 py-2.5"><MatchBadge grade={opp.matchQuality.grade}/></td>
                  <td className="px-3 py-2.5 max-w-xs">
                    <div className="flex items-center gap-2 min-w-0 mb-0.5">
                      <CategoryBadge cat={opp.category}/>
                      <span className="font-medium truncate">{opp.question}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate pl-px">{opp.kalshi.title}</div>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${buyPoly ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-rose-600 dark:text-rose-400"}`}>{fmtC(opp.poly.price)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${!buyPoly ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-rose-600 dark:text-rose-400"}`}>{fmtC(opp.kalshi.price)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{opp.edgeCents}¢</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{fmtUsd(opp.capitalCap)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{timeUntil(opp.closes)}</td>
                  <td className="px-3 py-2.5 text-right"><Sparkline data={opp.history} className="w-16 h-4 inline-block text-emerald-600 dark:text-emerald-400"/></td>
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

function CardView({ opps, onSelect, watchlistIds, onStar }: {
  opps: ScanOpp[]; onSelect: (o: ScanOpp) => void;
  watchlistIds: string[]; onStar: (id: string) => void;
}) {
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
              const watched = watchlistIds.includes(opp.id);
              return (
                <div key={opp.id} role="button" tabIndex={0}
                  onClick={() => onSelect(opp)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(opp); }}
                  className="text-left rounded-xl border bg-card p-4 hover:border-foreground/30 hover:shadow-sm transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="text-[13px] font-medium leading-snug line-clamp-2 flex-1">{opp.question}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <EdgePill pct={opp.netEdgePct}/>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); onStar(opp.id); }}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onStar(opp.id); } }}
                        className={`rounded p-0.5 transition-colors hover:bg-muted cursor-pointer ${watched ? "text-amber-400" : "text-muted-foreground/30 hover:text-amber-400"}`}
                      >
                        <Star className={`size-3.5 ${watched ? "fill-amber-400" : ""}`}/>
                      </div>
                    </div>
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
                    <Sparkline data={opp.history} className="w-12 h-3 text-emerald-600 dark:text-emerald-400"/>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Ticker view ────────────────────────────────────────────────────────────

function TickerView({ opps, onSelect, watchlistIds, onStar }: {
  opps: ScanOpp[]; onSelect: (o: ScanOpp) => void;
  watchlistIds: string[]; onStar: (id: string) => void;
}) {
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
          const watched = watchlistIds.includes(opp.id);
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
              <div
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); onStar(opp.id); }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onStar(opp.id); } }}
                className={`ml-1 rounded p-0.5 transition-colors hover:bg-muted shrink-0 cursor-pointer ${watched ? "text-amber-400" : "text-muted-foreground/30 hover:text-amber-400"}`}
              >
                <Star className={`size-3.5 ${watched ? "fill-amber-400" : ""}`}/>
              </div>
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
            <span className={`relative ${side === "bid" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{fmtC(l.price)}</span>
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
          {isLive && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold tracking-wider">LIVE</span>}
          {clobLoading && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground animate-pulse">…</span>}
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${action === "BUY" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-700 dark:text-rose-400"}`}>
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

interface AiMatch {
  score: number;
  verdict: string;
  grade: "H" | "M" | "L";
  usedResolution?: boolean;
}

function ArbDetail({ opp, onClose, isWatched, onStar, aiScoreCache }: {
  opp: ScanOpp; onClose: () => void; isWatched: boolean; onStar: () => void;
  aiScoreCache: React.MutableRefObject<Map<string, AiMatch>>;
}) {
  const router = useRouter();
  const [capital,      setCapital]     = useState(1000);
  const [showConfirm,  setShowConfirm] = useState(false);
  const [executing,    setExecuting]   = useState(false);
  const [execResult,   setExecResult]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [orderbook,    setOrderbook]   = useState<OrderbookData | null>(null);
  const [obLoading,    setObLoading]   = useState(false);
  const [history,      setHistory]     = useState<HistoryEntry[]>([]);
  const [copied,       setCopied]      = useState(false);
  const [aiMatch,      setAiMatch]     = useState<AiMatch | null>(null);
  const [aiMatchLoading, setAiMatchLoading] = useState(false);
  const [aiMatchError, setAiMatchError] = useState<string | null>(null);
  const [resolution,   setResolution]  = useState<ResolutionData | null>(null);
  const [resLoading,   setResLoading]  = useState(false);

  useEffect(() => {
    setHistory([]);
    fetch(`/api/arb/history?pair_id=${encodeURIComponent(opp.id)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setHistory(d as HistoryEntry[]))
      .catch(() => {});
  }, [opp.id]);

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

  // Sequential effect: fetch resolution first, then AI score with resolution text for higher accuracy.
  // If AI score is cached, still fetch resolution for display but skip the API call.
  useEffect(() => {
    let cancelled = false;

    const cachedAI = aiScoreCache.current.get(opp.id);
    setResolution(null);
    setResLoading(true);
    setAiMatch(cachedAI ?? null);
    setAiMatchError(null);
    setAiMatchLoading(!cachedAI);

    const resParams = new URLSearchParams();
    if (opp.slug)          resParams.set("poly_slug",     opp.slug);
    if (opp.kalshi.ticker) resParams.set("kalshi_ticker", opp.kalshi.ticker);

    fetch(`/api/arb/resolution?${resParams}`)
      .then(r => r.ok ? r.json() : null)
      .then(async (resData: ResolutionData | null) => {
        if (cancelled) return;
        setResolution(resData);
        setResLoading(false);

        if (cachedAI) return; // AI already loaded from cache

        const polyRes    = resData?.poly?.description?.slice(0, 400)?.trim() ?? "";
        const kalshiRes  = [resData?.kalshi?.rules_primary, resData?.kalshi?.rules_secondary]
          .filter(Boolean).join("\n").slice(0, 400).trim();

        const body: Record<string, string> = {
          poly_question: opp.question,
          kalshi_title:  opp.kalshi.title,
        };
        if (polyRes)   body.poly_resolution   = polyRes;
        if (kalshiRes) body.kalshi_resolution = kalshiRes;

        try {
          const r = await fetch("/api/arb/match-score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (cancelled) return;
          const d = await r.json();
          if (d.error) setAiMatchError(d.error);
          else {
            setAiMatch(d as AiMatch);
            aiScoreCache.current.set(opp.id, d as AiMatch);
          }
        } catch {
          if (!cancelled) setAiMatchError("Network error");
        } finally {
          if (!cancelled) setAiMatchLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResLoading(false);
          if (!cachedAI) setAiMatchError("Network error");
          if (!cachedAI) setAiMatchLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [opp.id, opp.slug, opp.kalshi.ticker, opp.question, opp.kalshi.title, aiScoreCache]);

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

  const costPerPair            = buyPrice + (1 - sellPrice);
  const shares                 = capital / costPerPair;
  const grossProfit            = shares - capital;
  const fees                   = shares * buyPrice * buyFee + shares * (1 - sellPrice) * sellFee;
  const netProfit              = grossProfit - fees;
  const netRet                 = (netProfit / capital) * 100;

  // Per-contract fee breakdown (per $1 payout)
  const grossPerContract     = 1 - costPerPair;
  const polyFeePerContract   = buyPrice * POLY_FEE;
  const kalshiFeePerContract = (1 - sellPrice) * KALSHI_FEE;
  const netPerContract       = grossPerContract - polyFeePerContract - kalshiFeePerContract;
  const clobNetPerContract   = execSpread != null
    ? execSpread - polyFeePerContract - kalshiFeePerContract : null;
  const breakEvenFor10       = netPerContract > 0 ? Math.ceil(10 / netPerContract) : null;
  const clobBreakEvenFor10   = clobNetPerContract != null && clobNetPerContract > 0
    ? Math.ceil(10 / clobNetPerContract) : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"/>
      <div className="relative w-full max-w-2xl h-full overflow-y-auto bg-background shadow-2xl border-l" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-4 flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <CategoryBadge cat={opp.category}/>
              <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">{opp.id}</span>
              {opp.slug && (
                <a href={`https://polymarket.com/event/${opp.slug}`} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-medium shrink-0">
                  <ExternalLink className="size-2.5"/>Poly
                </a>
              )}
              <a href={`https://kalshi.com/markets/${opp.kalshi.ticker}`} target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-0.5 text-[10px] text-[#00d090] hover:underline font-medium shrink-0">
                <ExternalLink className="size-2.5"/>Kalshi
              </a>
            </div>
            <h2 className="text-base font-semibold leading-snug pr-2">{opp.question}</h2>
          </div>
          <button
            onClick={onStar}
            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            className={`size-7 rounded-md hover:bg-muted grid place-items-center shrink-0 transition-colors ${isWatched ? "text-amber-400" : "text-muted-foreground"}`}
          >
            <Star className={`size-3.5 ${isWatched ? "fill-amber-400" : ""}`}/>
          </button>
          <button
            onClick={() => {
              if (typeof navigator !== "undefined") {
                navigator.clipboard.writeText(window.location.href).catch(() => {});
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            title="Copy link to this pair"
            className="size-7 rounded-md hover:bg-muted grid place-items-center text-muted-foreground shrink-0"
          >
            {copied ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400"/> : <Link2 className="size-3.5"/>}
          </button>
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
                  <div className={`text-lg font-semibold font-mono mt-0.5 ${execSpread > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
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

          {/* Fee decomposition */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spread decomposition</h3>
              <span className="text-[10px] text-muted-foreground">per $1 contract · mid prices</span>
            </div>
            {([
              ["Gross spread",           grossPerContract,         "text-foreground",  false],
              ["Poly fee (2% taker)",    -polyFeePerContract,      "text-rose-600",    false],
              ["Kalshi fee (7% settle)", -kalshiFeePerContract,    "text-rose-600",    false],
              ["Net spread",             netPerContract,           netPerContract > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400", true],
            ] as [string, number, string, boolean][]).map(([label, val, cls, sep]) => (
              <div key={label} className={`flex items-center justify-between text-xs ${sep ? "pt-1.5 border-t mt-1 font-semibold" : "text-muted-foreground py-0.5"}`}>
                <span>{label}</span>
                <span className={`font-mono ${cls}`}>
                  {val >= 0 ? "+" : "−"}{Math.abs(val * 100).toFixed(1)}¢
                </span>
              </div>
            ))}
            {clobNetPerContract != null && (
              <div className="mt-2.5 pt-2.5 border-t">
                <div className="text-[10px] text-muted-foreground mb-1.5">CLOB ask prices (conservative)</div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Net (CLOB)</span>
                  <span className={`font-mono ${clobNetPerContract > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {clobNetPerContract >= 0 ? "+" : "−"}{Math.abs(clobNetPerContract * 100).toFixed(1)}¢
                  </span>
                </div>
              </div>
            )}
            <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Capital to net $10</span>
              <div className="flex items-center gap-3 font-mono">
                {breakEvenFor10 != null
                  ? <span className="text-muted-foreground">{fmtUsd(breakEvenFor10)} mid</span>
                  : <span className="text-rose-600 dark:text-rose-400">mid spread negative</span>}
                {clobNetPerContract != null && (clobBreakEvenFor10 != null
                  ? <span className={`font-semibold ${clobBreakEvenFor10 < 5000 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{fmtUsd(clobBreakEvenFor10)} CLOB</span>
                  : <span className="text-rose-600 dark:text-rose-400">CLOB spread negative</span>)}
              </div>
            </div>
          </div>

          {/* Strategy */}
          <div className="rounded-xl border bg-card px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Strategy</div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <VenueChip venue={buyVenue as "poly"|"kalshi"}/>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">BUY</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                <span className="text-rose-600 dark:text-rose-400 font-bold">SELL</span>
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

          {/* Spread history */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spread history</h3>
              {history.length > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono">{history.length} scan{history.length !== 1 ? "s" : ""} tracked</span>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No history yet — run another scan to start tracking this pair.</p>
            ) : (
              <>
                {history.length >= 2 && (
                  <div className="mb-3">
                    <Sparkline
                      data={[...history].reverse().map(e => e.net_edge_pct)}
                      w={320} h={40}
                      className="w-full h-10"
                    />
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-muted-foreground border-b">
                      <tr>
                        <th className="text-left pb-1 font-normal">Time</th>
                        <th className="text-right pb-1 font-normal">Edge</th>
                        <th className="text-right pb-1 font-normal">Spread</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {history.slice(0, 8).map((e, i) => {
                        const ago = (() => {
                          const s = Math.floor((Date.now() - new Date(e.ts).getTime()) / 1000);
                          if (s < 60) return `${s}s ago`;
                          if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                          if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
                          return `${Math.floor(s / 86400)}d ago`;
                        })();
                        return (
                          <tr key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
                            <td className="py-1">{ago}</td>
                            <td className={`py-1 text-right ${e.net_edge_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {e.net_edge_pct >= 0 ? "+" : ""}{e.net_edge_pct.toFixed(1)}%
                            </td>
                            <td className="py-1 text-right">{e.edge_cents}¢</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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
                ["Net profit",   fmtUsd(netProfit),    "text-emerald-600 dark:text-emerald-400 font-semibold"],
              ].map(([k, v, cls]) => (
                <div key={k} className="bg-card p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{k}</div>
                  <div className={`text-base font-semibold font-mono mt-0.5 ${cls}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs">
              <span className="text-muted-foreground">Net return on capital</span>
              <span className={`font-mono font-semibold ${netRet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{fmtPct(netRet)}</span>
            </div>
          </div>

          {/* Resolution risk + match quality */}
          <div className={`rounded-xl border p-4 ${opp.matchQuality.grade === "H" ? "border-emerald-500/30 bg-emerald-500/5" : opp.matchQuality.grade === "M" ? "border-amber-500/30 bg-amber-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`size-4 mt-0.5 shrink-0 ${opp.matchQuality.grade === "H" ? "text-emerald-600 dark:text-emerald-400" : opp.matchQuality.grade === "M" ? "text-amber-600 dark:text-amber-400" : "text-rose-500 dark:text-rose-400"}`}/>
              <div className="flex-1 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${opp.matchQuality.grade === "H" ? "text-emerald-900 dark:text-emerald-100" : opp.matchQuality.grade === "M" ? "text-amber-900 dark:text-amber-200" : "text-rose-900 dark:text-rose-200"}`}>
                    Match quality
                  </span>
                  <MatchBadge grade={opp.matchQuality.grade}/>
                </div>
                {/* Score breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Keyword overlap", val: opp.matchQuality.keyword, hint: `${(opp.matchQuality.keyword * 100).toFixed(0)}%` },
                    { label: "Date proximity",  val: opp.matchQuality.dateProx, hint: opp.matchQuality.dateProx === 0 ? (opp.matchQuality.polyCloses ? "far apart" : "no poly date") : `${(opp.matchQuality.dateProx * 100).toFixed(0)}%` },
                    { label: "Combined score",  val: opp.matchQuality.combined, hint: `${(opp.matchQuality.combined * 100).toFixed(0)}%` },
                  ].map(({ label, val, hint }) => (
                    <div key={label} className="rounded-md bg-background/60 border border-border/60 p-2">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden mb-1">
                        <div className="h-full rounded-full bg-foreground/40 transition-all" style={{ width: `${Math.round(val * 100)}%` }}/>
                      </div>
                      <div className="text-[10px] font-mono font-semibold">{hint}</div>
                    </div>
                  ))}
                </div>
                <p className={`text-[11px] leading-relaxed ${opp.matchQuality.grade === "H" ? "text-emerald-900/80 dark:text-emerald-100/90" : opp.matchQuality.grade === "M" ? "text-amber-900/80 dark:text-amber-200/90" : "text-rose-900/80 dark:text-rose-200/90"}`}>
                  {opp.matchQuality.grade === "H"
                    ? "Strong keyword + date match — criteria likely identical."
                    : opp.matchQuality.grade === "M"
                    ? "Moderate match — verify resolution criteria before trading."
                    : "Weak match — likely a false positive from keyword overlap. Check resolution text carefully."}
                  {" "}Cap <span className="font-mono font-semibold">{fmtUsd(opp.capitalCap)}</span> = 30% of min liquidity.
                </p>
              </div>
            </div>
          </div>

          {/* AI Similarity */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Similarity</h3>
              <span className="text-[10px] text-muted-foreground">
                claude-haiku · display only
                {aiMatch?.usedResolution
                  ? <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">· resolution text</span>
                  : aiMatch && <span className="ml-1.5 text-amber-600 dark:text-amber-400">· titles only</span>}
              </span>
            </div>
            {aiMatchLoading && (
              <div className="space-y-2">
                <div className="h-3 w-3/4 rounded bg-muted animate-pulse"/>
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse"/>
              </div>
            )}
            {aiMatchError && !aiMatchLoading && (
              <p className="text-[11px] text-muted-foreground">
                {aiMatchError.includes("ANTHROPIC_API_KEY")
                  ? "Set ANTHROPIC_API_KEY in frontend/.env.local to enable AI match scoring."
                  : `Error: ${aiMatchError}`}
              </p>
            )}
            {aiMatch && !aiMatchLoading && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <MatchBadge grade={aiMatch.grade}/>
                  <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${aiMatch.grade === "H" ? "bg-emerald-500" : aiMatch.grade === "M" ? "bg-amber-500" : "bg-muted-foreground"}`}
                      style={{ width: `${aiMatch.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold font-mono tabular-nums w-10 text-right">{aiMatch.score}%</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed italic">&ldquo;{aiMatch.verdict}&rdquo;</p>
              </div>
            )}
          </div>

          {/* Criteria side-by-side */}
          <div className="rounded-xl border bg-card p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <FileText className="size-3"/> Resolution criteria
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-medium text-blue-600 dark:text-blue-400 mb-1.5">Polymarket</p>
                <p className="text-muted-foreground leading-relaxed font-medium">{opp.question}</p>
                {resLoading && <div className="h-16 rounded bg-muted animate-pulse mt-2"/>}
                {!resLoading && resolution?.poly?.description && (
                  <p className="text-muted-foreground leading-relaxed text-[10px] mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap border-t border-border/50 pt-2">
                    {resolution.poly.description}
                  </p>
                )}
              </div>
              <div>
                <p className="font-medium text-emerald-700 dark:text-emerald-400 mb-1.5">Kalshi</p>
                <p className="text-muted-foreground leading-relaxed font-medium">{opp.kalshi.title}</p>
                {resLoading && <div className="h-16 rounded bg-muted animate-pulse mt-2"/>}
                {!resLoading && resolution?.kalshi && (
                  <p className="text-muted-foreground leading-relaxed text-[10px] mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap border-t border-border/50 pt-2">
                    {[resolution.kalshi.rules_primary, resolution.kalshi.rules_secondary].filter(Boolean).join("\n\n")}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3 shrink-0"/> Verify both sides resolve identically before trading.
            </div>
            {!resLoading && resolution?.poly?.description && resolution?.kalshi?.rules_primary && (() => {
              const { polyOnly, kalshiOnly, shared } = computeResDiff(
                resolution.poly.description,
                [resolution.kalshi.rules_primary, resolution.kalshi.rules_secondary].filter(Boolean).join(" "),
              );
              if (polyOnly.length === 0 && kalshiOnly.length === 0 && shared.length === 0) return null;
              return (
                <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Key term diff</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <p className="text-blue-500 dark:text-blue-400 font-medium mb-1">Poly-only</p>
                      {polyOnly.length > 0
                        ? <div className="flex flex-wrap gap-1">{polyOnly.map(w => (
                            <span key={w} className="rounded px-1.5 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono">{w}</span>
                          ))}</div>
                        : <span className="text-muted-foreground italic">none</span>
                      }
                    </div>
                    <div>
                      <p className="text-emerald-600 dark:text-emerald-400 font-medium mb-1">Kalshi-only</p>
                      {kalshiOnly.length > 0
                        ? <div className="flex flex-wrap gap-1">{kalshiOnly.map(w => (
                            <span key={w} className="rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono">{w}</span>
                          ))}</div>
                        : <span className="text-muted-foreground italic">none</span>
                      }
                    </div>
                  </div>
                  {shared.length > 0 && (
                    <div className="border-t border-border/40 pt-2 text-[10px]">
                      <p className="text-violet-600 dark:text-violet-400 font-medium mb-1">
                        Shared terms
                        <span className="ml-1.5 font-normal text-muted-foreground">— positive signal for true match</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {shared.map(w => (
                          <span key={w} className="rounded px-1.5 py-0.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 font-mono">{w}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Create Rule from Arb */}
          {opp.netEdgePct > 0 && (
            <button
              onClick={() => {
                const params = new URLSearchParams({
                  from_arb: "1",
                  condition_id: opp.condition_id,
                  token_id: opp.token_id,
                  side: opp.poly.side,
                  price: opp.poly.price.toFixed(4),
                  kalshi: opp.kalshi.ticker,
                  edge: opp.netEdgePct.toFixed(2),
                  question: opp.question.slice(0, 100),
                });
                router.push(`/rules/new?${params}`);
              }}
              className="w-full rounded-xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-4 hover:border-emerald-500/60 hover:bg-emerald-500/8 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-emerald-500/15 grid place-items-center text-emerald-700 dark:text-emerald-400 shrink-0">
                  <Plus className="size-4"/>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Create Rule from this arb</div>
                  <div className="text-xs text-muted-foreground">Pre-fills rule builder with price_cross trigger · limit_order · dry_run + manual approval on</div>
                </div>
                <ChevronRight className="ml-auto size-4 text-muted-foreground shrink-0"/>
              </div>
            </button>
          )}

          {/* Execute */}
          <div className="rounded-xl border-2 border-foreground bg-foreground text-background p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-60">Atomic two-leg execution</div>
                <div className="text-sm mt-0.5 opacity-80">Both orders placed simultaneously. Either both fill or both cancel.</div>
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
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Buy</span>
                    </div>
                    <div className="font-mono text-sm font-semibold">{fmtC(buyPrice)}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{shares.toFixed(1)} {opp.poly.side} shares</div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <VenueChip venue={buyPoly ? "kalshi" : "poly"}/>
                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Sell</span>
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
                    <div className="font-mono text-sm font-semibold mt-0.5 text-rose-600 dark:text-rose-400">−{fmtUsd(fees)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Net profit</div>
                    <div className={`font-mono text-sm font-semibold mt-0.5 ${netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{fmtUsd(netProfit)}</div>
                  </div>
                </div>

                {!opp.condition_id && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] px-3 py-2 mb-4">
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

// ── Helpers ────────────────────────────────────────────────────────────────

function exportToCsv(opps: ScanOpp[]) {
  const header = ["Question","Kalshi Title","Edge %","Edge ¢","Match","Direction","Poly Price ¢","Kalshi Price ¢","Closes","Category"].join(",");
  const rows = opps.map(o =>
    [
      `"${o.question.replace(/"/g,'""')}"`,
      `"${o.kalshi.title.replace(/"/g,'""')}"`,
      o.netEdgePct.toFixed(2),
      o.edgeCents,
      o.matchQuality.grade,
      o.direction,
      Math.round(o.poly.price * 100),
      Math.round(o.kalshi.price * 100),
      `"${o.closes}"`,
      o.category,
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `arb-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ArbPage() {
  const [opps,       setOpps]       = useState<ScanOpp[]>([]);
  const [scanning,   setScanning]   = useState(false);
  const [view,       setView]       = usePref<ViewMode>("arb:view", "table");
  const [sortBy,     setSortBy]     = usePref<SortBy>("arb:sort", "edge");
  const [search,     setSearch]     = useState("");
  const [minEdge,    setMinEdge]    = usePref<number>("arb:min-edge", 0);
  const [cat,        setCat]        = usePref<string>("arb:cat", "all");
  const [selected,   setSelected]   = useState<ScanOpp | null>(null);
  const [minMatch,      setMinMatch]      = usePref<"all" | "M" | "H">("arb:min-match", "all");
  const [minLiquidity,  setMinLiquidity]  = usePref<number>("arb:min-liq", 0);
  const [flashIds,   setFlashIds]   = useState<Set<string>>(new Set());
  const [kalshiCatsArr, setKalshiCatsArr] = usePref<string[]>("arb:kalshi-cats", [...KALSHI_CATS]);
  const kalshiCats = useMemo(() => new Set(kalshiCatsArr), [kalshiCatsArr]);
  const [kalshiMeta,   setKalshiMeta]   = useState<{ count: number; illiquid: number } | null>(null);
  const [autoScan,     setAutoScan]     = useState(false);
  const [autoInterval, setAutoInterval] = usePref<number>("arb:auto-interval", 120);
  const [countdown,    setCountdown]    = useState(120);
  const [changedCount, setChangedCount] = useState<number | null>(null);
  const prevOppsRef      = useRef<ScanOpp[]>([]);
  const autoRunRef       = useRef<() => void>(() => {});
  const pendingPairRef   = useRef<string | null>(null);
  const aiScoreCacheRef  = useRef<Map<string, AiMatch>>(new Map());

  // Watchlist
  const [watchlistIds,  setWatchlistIds]  = usePref<string[]>("arb:watchlist", []);
  const [showWatchlist, setShowWatchlist] = usePref<boolean>("arb:show-watchlist", false);
  const toggleWatchlist = useCallback((id: string) => {
    setWatchlistIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, [setWatchlistIds]);

  // Notification state
  const [notifyEnabled,   setNotifyEnabled]   = usePref<boolean>("arb:notify", false);
  const [notifyThreshold, setNotifyThreshold] = usePref<number>("arb:notify-thresh", 5);
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>("default");
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  // Ref so runScan can read latest notify prefs without re-creating its callback
  const notifyRef = useRef({ enabled: false, threshold: 5 });

  // Alert history log
  const [alertLog,      setAlertLog]      = useState<AlertLogEntry[]>([]);
  const [newAlertCount, setNewAlertCount] = useState(0);
  const [showAlertLog,  setShowAlertLog]  = useState(false);

  // Init permission from browser on mount; fetch alert log; capture ?pair= + filter deep-link
  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifyPerm(Notification.permission);
    fetch("/api/alert-log")
      .then(r => r.ok ? r.json() : [])
      .then(d => setAlertLog(d as AlertLogEntry[]))
      .catch(() => {});
    const sp = new URLSearchParams(window.location.search);
    const pairParam = sp.get("pair");
    if (pairParam) {
      pendingPairRef.current = pairParam;
      // Apply any filter params encoded in the shared URL
      const urlMinEdge = sp.get("min_edge");
      if (urlMinEdge !== null) setMinEdge(+urlMinEdge);
      const urlMinMatch = sp.get("min_match");
      if (urlMinMatch === "M" || urlMinMatch === "H") setMinMatch(urlMinMatch);
      const urlCat = sp.get("cat");
      if (urlCat) setCat(urlCat);
      const urlView = sp.get("view");
      if (urlView === "table" || urlView === "cards" || urlView === "ticker") setView(urlView as ViewMode);
      // Trigger a scan so the pending pair can be auto-selected once results arrive
      setTimeout(() => autoRunRef.current(), 100);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select a pair from deep-link after the first scan populates opps
  useEffect(() => {
    if (!pendingPairRef.current || opps.length === 0) return;
    const match = opps.find(o => o.id === pendingPairRef.current);
    if (match) {
      setSelected(match);
      pendingPairRef.current = null;
    }
  }, [opps]);

  // Wrapper that syncs selection + active filters to the URL
  const selectOpp = useCallback((opp: ScanOpp | null) => {
    setSelected(opp);
    if (opp) {
      const params = new URLSearchParams({ pair: opp.id });
      if (minEdge > 0)        params.set("min_edge",   minEdge.toString());
      if (minMatch !== "all") params.set("min_match",  minMatch);
      if (cat !== "all")      params.set("cat",        cat);
      if (view !== "table")   params.set("view",       view);
      window.history.replaceState(null, "", `/arb?${params}`);
    } else {
      window.history.replaceState(null, "", "/arb");
    }
  }, [minEdge, minMatch, cat, view]);

  // Keep notifyRef in sync
  useEffect(() => {
    notifyRef.current = { enabled: notifyEnabled, threshold: notifyThreshold };
  }, [notifyEnabled, notifyThreshold]);

  const toggleNotify = useCallback(async () => {
    if (notifyEnabled) { setNotifyEnabled(false); return; }
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      setNotifyPerm(perm);
      if (perm !== "granted") return;
    }
    setNotifyEnabled(true);
  }, [notifyEnabled, setNotifyEnabled]);

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
      const catsParam = encodeURIComponent([...kalshiCats].join(","));
      let totalIlliquid = 0;
      await Promise.all(SCAN_QUERIES.map(async q => {
        const [pr, kr] = await Promise.all([
          fetch(`/api/markets?q=${encodeURIComponent(q)}&limit=10&active=true`).then(r => r.json()),
          fetch(`/api/kalshi/markets?search=${encodeURIComponent(q)}&categories=${catsParam}`).then(r => r.json()),
        ]);
        (Array.isArray(pr) ? pr : []).forEach((m: Record<string, unknown>) => {
          if (allPoly.find(x => x.id === String(m.id))) return;
          const prices = Array.isArray(m.outcomePrices) ? m.outcomePrices.map(Number) : [0.5, 0.5];
          const tokenIds = m.clobTokenIds as string[] | null;
          allPoly.push({ id: String(m.id ?? ""), condition_id: String(m.conditionId ?? ""), question: String(m.question ?? ""), slug: String(m.slug ?? ""), token_id: tokenIds?.[0] ?? "", yes_price: prices[0] ?? 0.5, no_price: prices[1] ?? 0.5, volume: Number(m.volume ?? 0), liquidity: Number(m.liquidity ?? 0), active: Boolean(m.active), end_date: m.endDate ? String(m.endDate) : undefined });
        });
        const krMarkets: KalshiMarket[] = Array.isArray(kr) ? kr : (kr.markets ?? []);
        if (!Array.isArray(kr) && kr.meta?.illiquid_filtered) totalIlliquid += kr.meta.illiquid_filtered;
        krMarkets.forEach((m: KalshiMarket) => {
          if (!allKalshi.find(x => x.ticker === m.ticker)) allKalshi.push(m);
        });
      }));
      setKalshiMeta({ count: allKalshi.length, illiquid: totalIlliquid });

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
      const top = result.slice(0, 25);

      // Diff against previous scan for the "N changed" badge
      if (prevOppsRef.current.length > 0) {
        const prevIds = new Set(prevOppsRef.current.map(o => o.id));
        const newIds  = new Set(top.map(o => o.id));
        const moved   = top.filter(o => {
          const prev = prevOppsRef.current.find(p => p.id === o.id);
          return prev && Math.abs(prev.netEdgePct - o.netEdgePct) > 0.5;
        }).length;
        const added   = top.filter(o => !prevIds.has(o.id)).length;
        const removed = [...prevIds].filter(id => !newIds.has(id)).length;
        setChangedCount(moved + added + removed);
      }
      prevOppsRef.current = top;
      setOpps(top);

      // Browser notifications for new opportunities above threshold
      if (
        notifyRef.current.enabled &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        for (const opp of top) {
          if (
            opp.netEdgePct >= notifyRef.current.threshold &&
            !notifiedIdsRef.current.has(opp.id)
          ) {
            notifiedIdsRef.current.add(opp.id);
            const n = new Notification(`Arb +${opp.netEdgePct.toFixed(1)}% detected`, {
              body: `${opp.question.slice(0, 80)}${opp.question.length > 80 ? "…" : ""}\nPoly ${fmtC(opp.poly.price)} · Kalshi ${fmtC(opp.kalshi.price)}`,
              tag: `arb-${opp.id}`,
            });
            n.onclick = () => window.focus();
            // Persist to alert log
            const entry: AlertLogEntry = {
              ts: new Date().toISOString(),
              pair_id: opp.id,
              question: opp.question,
              net_edge_pct: opp.netEdgePct,
              threshold: notifyRef.current.threshold,
              direction: opp.direction,
              poly_price: opp.poly.price,
              kalshi_price: opp.kalshi.price,
            };
            fetch("/api/alert-log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(entry),
            }).catch(() => {});
            setAlertLog(prev => [entry, ...prev].slice(0, 50));
            setNewAlertCount(c => c + 1);
          }
        }
      }

      // Persist history (fire-and-forget)
      const ts = new Date().toISOString();
      const entries: HistoryEntry[] = top.map(o => ({
        ts,
        pair_id: o.id,
        kalshi_ticker: o.kalshi.ticker,
        question: o.question,
        net_edge_pct: o.netEdgePct,
        edge_cents: o.edgeCents,
        direction: o.direction,
      }));
      fetch("/api/arb/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries),
      }).catch(() => {});
    } finally {
      setScanning(false);
    }
  }, [kalshiCatsArr]);

  const toggleKalshiCat = useCallback((c: string) => {
    setKalshiCatsArr(prev => {
      const s = new Set(prev);
      if (s.has(c)) s.delete(c); else s.add(c);
      return [...s];
    });
  }, [setKalshiCatsArr]);

  // Keep autoRunRef current so the countdown interval never captures a stale runScan
  useEffect(() => { autoRunRef.current = runScan; }, [runScan]);

  // Countdown + auto-trigger
  useEffect(() => {
    if (!autoScan) return;
    setCountdown(autoInterval);
    let c = autoInterval;
    const id = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        c = autoInterval;
        setCountdown(autoInterval);
        autoRunRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [autoScan, autoInterval]);

  const categories = ["all", ...Array.from(new Set(opps.map(o => o.category)))];

  const filtered = useMemo(() =>
    (showWatchlist ? opps.filter(o => watchlistIds.includes(o.id)) : opps).filter(o =>
      o.netEdgePct >= minEdge &&
      (cat === "all" || o.category === cat) &&
      (minMatch === "all" || (minMatch === "M" ? o.matchQuality.grade !== "L" : o.matchQuality.grade === "H")) &&
      (minLiquidity === 0 || Math.min(o.poly.liquidity, o.kalshi.liquidity) >= minLiquidity) &&
      (!search || o.question.toLowerCase().includes(search.toLowerCase()))
    ), [opps, minEdge, cat, minMatch, minLiquidity, search, showWatchlist, watchlistIds]);

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
              {changedCount !== null && changedCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-bold tracking-wider animate-pulse">
                  {changedCount} changed
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Cross-venue spreads between Polymarket and Kalshi. Edge calculated net of fees (Poly 2% · Kalshi 7%).</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search markets…"
                     className="h-8 w-52 pl-8 pr-3 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"/>
            </div>
            {/* Notify controls */}
            <div className="flex items-center gap-1.5">
              {notifyEnabled && (
                <div className="flex items-center gap-1 bg-muted rounded-md px-1 h-8">
                  {NOTIFY_THRESHOLDS.map(t => (
                    <button key={t} onClick={() => setNotifyThreshold(t)}
                      className={`h-6 px-1.5 rounded text-[10px] font-mono font-medium transition-colors ${notifyThreshold === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      &gt;{t}%
                    </button>
                  ))}
                </div>
              )}
              <div className="relative">
                <button
                  onClick={toggleNotify}
                  disabled={notifyPerm === "denied"}
                  title={notifyPerm === "denied" ? "Notifications blocked by browser — check browser site settings" : "Alert when a new arb pair exceeds the threshold"}
                  className={`h-8 px-2.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5
                    ${notifyEnabled
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30"
                      : notifyPerm === "denied"
                      ? "opacity-50 cursor-not-allowed bg-background border-border text-muted-foreground"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  <Bell className={`size-3 ${notifyEnabled ? "text-violet-500" : ""}`}/>
                  {notifyPerm === "denied" ? "Blocked" : notifyEnabled ? `Alert >${notifyThreshold}%` : "Notify"}
                </button>
                {newAlertCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none">
                    {newAlertCount > 9 ? "9+" : newAlertCount}
                  </span>
                )}
              </div>
              {alertLog.length > 0 && (
                <button
                  onClick={() => { setShowAlertLog(p => !p); setNewAlertCount(0); }}
                  title="Recent alert history"
                  className={`h-8 w-8 rounded-md border transition-colors flex items-center justify-center ${showAlertLog ? "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  <History className="size-3.5"/>
                </button>
              )}
            </div>
            {/* Auto-scan controls */}
            <div className="flex items-center gap-1.5">
              {autoScan && (
                <div className="flex items-center gap-1 bg-muted rounded-md px-1 h-8">
                  {AUTO_INTERVALS.map(s => (
                    <button key={s} onClick={() => setAutoInterval(s)}
                      className={`h-6 px-1.5 rounded text-[10px] font-mono font-medium transition-colors ${autoInterval === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      {s < 60 ? `${s}s` : `${s / 60}m`}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setAutoScan(p => !p); setChangedCount(null); }}
                className={`h-8 px-2.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${autoScan ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                <span className={`size-1.5 rounded-full ${autoScan ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`}/>
                {autoScan ? `Auto · ${countdown}s` : "Auto"}
              </button>
            </div>
            <Button onClick={() => exportToCsv(filtered)} disabled={filtered.length === 0} size="sm" variant="outline" className="gap-1.5">
              <Download className="size-3.5"/>
              Export
            </Button>
            <Button onClick={runScan} disabled={scanning} size="sm" className="gap-1.5">
              <Zap className="size-3.5"/>
              {scanning ? "Scanning…" : "Run Scan"}
            </Button>
          </div>
        </div>

        {/* Alert history log panel */}
        {showAlertLog && alertLog.length > 0 && (
          <div className="mb-5 rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-500/15">
              <History className="size-3.5 text-violet-500"/>
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider">Recent Alerts</span>
              <span className="text-[10px] text-muted-foreground">{alertLog.length} fired this session</span>
              <button onClick={() => setShowAlertLog(false)} className="ml-auto size-5 rounded hover:bg-muted/60 grid place-items-center text-muted-foreground">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
            <div className="divide-y divide-violet-500/10 max-h-52 overflow-y-auto">
              {alertLog.slice(0, 10).map((e, i) => {
                const ago = (() => {
                  const s = Math.floor((Date.now() - new Date(e.ts).getTime()) / 1000);
                  if (s < 60) return `${s}s ago`;
                  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
                  return `${Math.floor(s / 86400)}d ago`;
                })();
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-[11px]">
                    <span className="font-mono text-muted-foreground w-14 shrink-0">{ago}</span>
                    <span className={`font-mono font-semibold shrink-0 ${e.net_edge_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                      +{e.net_edge_pct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">thresh &gt;{e.threshold}%</span>
                    <span className="truncate text-foreground/80">{e.question}</span>
                    <span className="font-mono text-muted-foreground shrink-0">P{Math.round(e.poly_price * 100)}¢ K{Math.round(e.kalshi_price * 100)}¢</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Kalshi category filter pills */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-medium">Kalshi categories:</span>
          {KALSHI_CATS.map(c => (
            <button key={c} onClick={() => toggleKalshiCat(c)}
              className={`h-6 px-2.5 rounded-md text-[10px] font-medium border transition-colors ${kalshiCats.has(c) ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
              {c}
            </button>
          ))}
          {kalshiMeta && (
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              {kalshiMeta.count} Kalshi markets
              {kalshiMeta.illiquid > 0 && <span className="text-rose-500"> · {kalshiMeta.illiquid} illiquid filtered</span>}
            </span>
          )}
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
        {opps.length > 0 && !scanning && showWatchlist && watchlistIds.length === 0 && (
          <div className="text-center py-20 text-muted-foreground border border-dashed rounded-xl">
            <Star className="size-8 mx-auto mb-3 opacity-30"/>
            <p className="text-sm font-medium">No starred pairs yet</p>
            <p className="text-xs mt-1">Click the ★ on any row to add a pair to your watchlist</p>
          </div>
        )}
        {scanning && <div className="flex flex-col gap-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse"/>)}</div>}

        {/* Filter row */}
        {opps.length > 0 && !scanning && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {/* Watchlist toggle + clear */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setShowWatchlist(p => !p)}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border transition-colors ${showWatchlist ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                <Star className={`size-3 ${showWatchlist ? "fill-amber-400 text-amber-400" : ""}`}/>
                Starred{watchlistIds.length > 0 ? ` (${watchlistIds.length})` : ""}
              </button>
              {watchlistIds.length > 0 && (
                <button
                  onClick={() => { setWatchlistIds([]); setShowWatchlist(false); }}
                  title="Clear watchlist"
                  className="h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors">
                  <X className="size-3"/>
                </button>
              )}
            </div>
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground font-medium mr-0.5">Match:</span>
              {([["all", "All", ""], ["M", "Med+", "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"], ["H", "High", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"]] as const).map(([v, label, active]) => (
                <button key={v} onClick={() => setMinMatch(v)}
                        className={`h-7 px-2.5 rounded-md text-xs font-medium border transition-colors ${minMatch === v ? (active || "bg-foreground text-background border-foreground") : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground font-medium mr-0.5">Liq:</span>
              {([0, 500, 1000, 5000] as const).map(v => (
                <button key={v} onClick={() => setMinLiquidity(v)}
                        className={`h-7 px-2.5 rounded-md text-xs font-medium border transition-colors ${minLiquidity === v ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  {v === 0 ? "Any" : v >= 1000 ? `$${v / 1000}K` : `$${v}`}
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
            {view === "table"  && <TableView opps={filtered} onSelect={selectOpp} sortBy={sortBy} setSortBy={setSortBy} flashIds={flashIds} watchlistIds={watchlistIds} onStar={toggleWatchlist}/>}
            {view === "cards"  && <CardView  opps={filtered} onSelect={selectOpp} watchlistIds={watchlistIds} onStar={toggleWatchlist}/>}
            {view === "ticker" && <TickerView opps={filtered} onSelect={selectOpp} watchlistIds={watchlistIds} onStar={toggleWatchlist}/>}
            <p className="text-[10px] text-muted-foreground text-center mt-6 font-mono">
              {opps.length} pairs scanned · keyword-matched · net of Poly 2% + Kalshi 7% fees
            </p>
          </>
        )}
      </div>

      {selected && <ArbDetail opp={selected} onClose={() => selectOpp(null)} isWatched={watchlistIds.includes(selected.id)} onStar={() => toggleWatchlist(selected.id)} aiScoreCache={aiScoreCacheRef}/>}
    </div>
  );
}
