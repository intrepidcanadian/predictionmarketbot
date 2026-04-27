import { type NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// ── Config ─────────────────────────────────────────────────────────────────

const GAMMA  = "https://gamma-api.polymarket.com";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const UA     = { "User-Agent": "predictionmarketbot/0.1" };

const SCAN_QUERIES    = ["trump", "fed", "bitcoin", "recession", "ukraine", "tariff", "inflation"];
const POLY_FEE        = 0.02;
const KALSHI_FEE      = 0.07;
const ILLIQUID_THRESH = 1.10;
const MAX_KALSHI_PAGES = 5;
const CACHE_TTL_MS    = 5 * 60 * 1000; // 5 minutes
const MAX_RESULTS     = 25;

const POLITICAL_SERIES = [
  "KXTRUMPSBA", "KXCORPTAXCUT", "KXCHIPSREPEAL", "KXWITHDRAW",
  "KXGDPUSMIN", "GDPUSMIN", "BTCETHRETURN", "KXSOLETHRATIO",
  "KXARRESTMAMDANI", "KXDJTPOSTMUSK", "KXDEPORTMUSK",
];

const LATEST_FILE   = path.join(process.cwd(), "arb-latest.json");
const HISTORY_FILE  = path.join(process.cwd(), "arb-history.jsonl");
const SCAN_LOG_FILE = path.join(process.cwd(), "scan-log.jsonl");
const MAX_PER_PAIR  = 100;
const MAX_TOTAL     = 500;
const MAX_SCAN_LOG  = 100;

// ── Types ──────────────────────────────────────────────────────────────────

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
  keyword: number; dateProx: number; combined: number;
  grade: "H" | "M" | "L"; polyCloses?: string;
}

interface ScanOpp {
  id: string; slug: string; condition_id: string; token_id: string;
  question: string; category: string;
  poly:   { price: number; side: "YES"|"NO"; volume24h: number; liquidity: number; fee: number };
  kalshi: { price: number; side: "YES"|"NO"; volume24h: number; liquidity: number; fee: number; ticker: string; title: string };
  edgeCents: number; netEdgePct: number; capitalCap: number; closes: string;
  resolutionMatch: "exact"|"fuzzy"; confidence: number;
  matchQuality: MatchQuality;
  direction: "buy_poly_sell_kalshi"|"buy_kalshi_sell_poly";
  history: number[];
}

interface HistoryEntry {
  ts: string; pair_id: string; kalshi_ticker: string; question: string;
  net_edge_pct: number; edge_cents: number; direction: string;
}

interface ScanResult {
  opps: ScanOpp[]; scannedAt: string; cached: boolean;
  kalshiCount: number; illiquidFiltered: number;
}

interface ScanLogEntry {
  ts: string; source: string; opps_count: number;
  kalshi_count: number; illiquid_filtered: number; duration_ms: number;
}

// ── Pure helpers (mirrors page.tsx) ───────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  Politics: "Politics", Economics: "Macro", Financials: "Finance",
  Crypto: "Crypto", World: "Politics", Finance: "Finance",
};

function calcNetEdge(poly: PolyMarket, kalshi: KalshiMarket) {
  const gross_a = 1 - (poly.yes_price + kalshi.no_ask);
  const gross_b = 1 - (poly.no_price  + kalshi.yes_ask);
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
  const wa = new Set(words(a)), wb = new Set(words(b));
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  return hits / Math.max(wa.size, wb.size, 1);
}

function dateProxScore(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const da = new Date(a).getTime(), db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  const days = Math.abs(da - db) / 86_400_000;
  if (days <= 1) return 1.0; if (days <= 7) return 0.8;
  if (days <= 30) return 0.5; if (days <= 90) return 0.2;
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
  const buyPoly     = direction === "buy_poly_sell_kalshi";
  const polyPrice   = buyPoly ? poly.yes_price  : poly.no_price;
  const kalshiPrice = buyPoly ? kalshi.no_ask    : kalshi.yes_ask;
  const netEdgePct  = parseFloat((best_net * 100).toFixed(2));
  const mq = computeMatchQuality(score, poly.end_date, kalshi.close_time);
  return {
    id: `${poly.id}-${kalshi.ticker}`,
    slug: poly.slug, condition_id: poly.condition_id, token_id: poly.token_id,
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
    matchQuality: mq, direction,
    history: syntheticHistory(netEdgePct),
  };
}

// ── Fetchers ───────────────────────────────────────────────────────────────

function parseJsonField(v: unknown): string[] | null {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return null;
}

async function fetchPolyForQuery(q: string): Promise<PolyMarket[]> {
  try {
    const url = `${GAMMA}/markets?search=${encodeURIComponent(q)}&limit=10&active=true&closed=false`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return [];
    const raw = await res.json();
    const items: unknown[] = Array.isArray(raw) ? raw : (raw.data ?? []);
    return items.map((m: unknown) => {
      const market = m as Record<string, unknown>;
      const prices   = parseJsonField(market.outcomePrices)?.map(Number) ?? [0.5, 0.5];
      const tokenIds = parseJsonField(market.clobTokenIds);
      return {
        id:           String(market.id ?? ""),
        condition_id: String(market.conditionId ?? ""),
        question:     String(market.question ?? ""),
        slug:         String(market.slug ?? ""),
        token_id:     tokenIds?.[0] ?? "",
        yes_price:    prices[0] ?? 0.5,
        no_price:     prices[1] ?? 0.5,
        volume:       Number(market.volume ?? 0),
        liquidity:    Number(market.liquidity ?? 0),
        active:       Boolean(market.active),
        end_date:     market.endDate ? String(market.endDate) : undefined,
      } satisfies PolyMarket;
    });
  } catch { return []; }
}

function normalizeKalshiMarket(m: Record<string, unknown>, category = ""): KalshiMarket {
  return {
    ticker:     String(m.ticker ?? ""),
    title:      String(m.title ?? ""),
    yes_ask:    parseFloat(String(m.yes_ask_dollars ?? "0")),
    yes_bid:    parseFloat(String(m.yes_bid_dollars ?? "0")),
    no_ask:     parseFloat(String(m.no_ask_dollars ?? "0")),
    no_bid:     parseFloat(String(m.no_bid_dollars ?? "0")),
    volume:     parseFloat(String(m.volume_fp ?? "0")),
    liquidity:  parseFloat(String(m.liquidity_dollars ?? "0")),
    close_time: String(m.close_time ?? ""),
    category:   String(m.category ?? category),
  };
}

async function fetchAllKalshiMarkets(): Promise<{ markets: KalshiMarket[]; illiquidFiltered: number }> {
  const seen    = new Set<string>();
  const markets: KalshiMarket[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    try {
      const url = new URL(`${KALSHI}/events`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("status", "open");
      url.searchParams.set("with_nested_markets", "true");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString(), { headers: UA });
      if (!res.ok) break;
      const data = await res.json();
      for (const event of (data.events ?? []) as Record<string, unknown>[]) {
        const cat = String(event.category ?? "");
        const nested = (event.markets as Record<string, unknown>[]) ?? [];
        if (nested.length !== 1) continue;
        const m = normalizeKalshiMarket(nested[0], cat);
        if (!seen.has(m.ticker) && m.yes_ask > 0 && m.no_ask > 0) {
          seen.add(m.ticker);
          markets.push(m);
        }
      }
      cursor = (data.cursor as string | null) ?? null;
      pages++;
    } catch { break; }
  } while (cursor && pages < MAX_KALSHI_PAGES);

  // Supplement with curated political/economic series
  await Promise.allSettled(POLITICAL_SERIES.map(async (series) => {
    try {
      const res = await fetch(`${KALSHI}/markets?limit=20&status=open&series_ticker=${series}`, { headers: UA });
      if (!res.ok) return;
      const data = await res.json();
      for (const m of (data.markets ?? []) as Record<string, unknown>[]) {
        const normalized = normalizeKalshiMarket(m);
        if (!seen.has(normalized.ticker) && normalized.yes_ask > 0 && normalized.no_ask > 0) {
          seen.add(normalized.ticker);
          markets.push(normalized);
        }
      }
    } catch { /* ignore */ }
  }));

  const total = markets.length;
  const liquid = markets.filter(m => m.yes_ask + m.no_ask <= ILLIQUID_THRESH);
  return { markets: liquid, illiquidFiltered: total - liquid.length };
}

// ── History helpers ────────────────────────────────────────────────────────

async function appendHistory(entries: HistoryEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await fs.appendFile(HISTORY_FILE, entries.map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8");
  // Prune
  try {
    const raw  = await fs.readFile(HISTORY_FILE, "utf-8");
    const all  = raw.trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l) as HistoryEntry; } catch { return null; } }).filter((e): e is HistoryEntry => e !== null);
    const groups = new Map<string, HistoryEntry[]>();
    for (const e of all) { if (!groups.has(e.pair_id)) groups.set(e.pair_id, []); groups.get(e.pair_id)!.push(e); }
    if (all.length > MAX_TOTAL || [...groups.values()].some(g => g.length > MAX_PER_PAIR)) {
      const trimmed: HistoryEntry[] = [];
      for (const g of groups.values()) trimmed.push(...g.slice(-MAX_PER_PAIR));
      trimmed.sort((a, b) => a.ts.localeCompare(b.ts));
      await fs.writeFile(HISTORY_FILE, trimmed.slice(-MAX_TOTAL).map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8");
    }
  } catch { /* non-fatal */ }
}

async function appendScanLog(entry: ScanLogEntry): Promise<void> {
  try {
    await fs.appendFile(SCAN_LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
    // Prune to MAX_SCAN_LOG entries
    const raw = await fs.readFile(SCAN_LOG_FILE, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    if (lines.length > MAX_SCAN_LOG) {
      await fs.writeFile(SCAN_LOG_FILE, lines.slice(-MAX_SCAN_LOG).join("\n") + "\n", "utf-8");
    }
  } catch { /* non-fatal */ }
}

// ── Route handlers ─────────────────────────────────────────────────────────

/** GET — return the last cached snapshot (for instant page-load display) */
export async function GET() {
  try {
    const raw = await fs.readFile(LATEST_FILE, "utf-8");
    return NextResponse.json(JSON.parse(raw) as ScanResult, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { opps: [], scannedAt: null, cached: false, kalshiCount: 0, illiquidFiltered: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** POST — run a scan (or return cached result if fresh) */
export async function POST(req: NextRequest) {
  const body   = await req.json().catch(() => ({})) as { force?: boolean };
  const force  = body.force === true;
  const source = force ? "forced" : (req.headers.get("x-scan-source") ?? "manual");
  const t0     = Date.now();

  // Check cache
  if (!force) {
    try {
      const raw    = await fs.readFile(LATEST_FILE, "utf-8");
      const cached = JSON.parse(raw) as ScanResult;
      if (cached.scannedAt && Date.now() - new Date(cached.scannedAt).getTime() < CACHE_TTL_MS) {
        return NextResponse.json({ ...cached, cached: true });
      }
    } catch { /* no cache yet */ }
  }

  // Fresh scan
  const allPoly: PolyMarket[]     = [];
  const allKalshi: KalshiMarket[] = [];
  let totalIlliquid = 0;

  // Fetch Kalshi once (all markets) + Poly per keyword in parallel
  const [kalshiResult, ...polyResults] = await Promise.all([
    fetchAllKalshiMarkets(),
    ...SCAN_QUERIES.map(fetchPolyForQuery),
  ]);

  const { markets: kalshiMarkets, illiquidFiltered } = kalshiResult;
  totalIlliquid = illiquidFiltered;
  allKalshi.push(...kalshiMarkets);

  for (const polyList of polyResults) {
    for (const p of polyList) {
      if (!allPoly.find(x => x.id === p.id)) allPoly.push(p);
    }
  }

  // Cross-match
  const result: ScanOpp[] = [];
  for (const k of allKalshi) {
    let best: { poly: PolyMarket; score: number } | null = null;
    for (const p of allPoly) {
      const score = keywordScore(p.question, k.title);
      if (score > 0.15 && (!best || score > best.score)) best = { poly: p, score };
    }
    if (best) result.push(toScanOpp(best.poly, k, best.score));
  }
  result.sort((a, b) => b.netEdgePct - a.netEdgePct);
  const top = result.slice(0, MAX_RESULTS);

  const scannedAt = new Date().toISOString();
  const response: ScanResult = {
    opps: top, scannedAt, cached: false,
    kalshiCount: allKalshi.length, illiquidFiltered: totalIlliquid,
  };

  const duration_ms = Date.now() - t0;

  // Persist snapshot + history + scan log (non-blocking failures are swallowed)
  await Promise.allSettled([
    fs.writeFile(LATEST_FILE, JSON.stringify(response), "utf-8"),
    appendHistory(top.map(o => ({
      ts: scannedAt, pair_id: o.id, kalshi_ticker: o.kalshi.ticker,
      question: o.question, net_edge_pct: o.netEdgePct,
      edge_cents: o.edgeCents, direction: o.direction,
    }))),
    appendScanLog({
      ts: scannedAt, source, opps_count: top.length,
      kalshi_count: allKalshi.length, illiquid_filtered: totalIlliquid,
      duration_ms,
    }),
  ]);

  return NextResponse.json(response);
}
