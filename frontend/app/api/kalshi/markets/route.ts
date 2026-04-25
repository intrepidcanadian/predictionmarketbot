import { NextRequest, NextResponse } from "next/server";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const HEADERS = { "User-Agent": "predictionmarketbot/0.1" };

export const ALL_KALSHI_CATEGORIES = ["Politics", "Economics", "Financials", "Crypto", "World", "Finance"] as const;
const DEFAULT_CATEGORIES = new Set<string>(ALL_KALSHI_CATEGORIES);

// Series known to have Polymarket equivalents — always included regardless of category filter
const POLITICAL_SERIES = [
  "KXTRUMPSBA", "KXCORPTAXCUT", "KXCHIPSREPEAL", "KXWITHDRAW",
  "KXGDPUSMIN", "GDPUSMIN", "BTCETHRETURN", "KXSOLETHRATIO",
  "KXARRESTMAMDANI", "KXDJTPOSTMUSK", "KXDEPORTMUSK",
];

const MAX_PAGES = 5;
const ILLIQUID_THRESHOLD = 1.10; // yes_ask + no_ask > this → filtered out

export interface KalshiMarket {
  ticker: string;
  title: string;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  volume: number;
  liquidity: number;
  close_time: string;
  status: string;
  category: string;
}

export interface KalshiResponse {
  markets: KalshiMarket[];
  meta: {
    total_before_filter: number;
    illiquid_filtered: number;
    pages_fetched: number;
  };
}

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const seriesTicker = req.nextUrl.searchParams.get("series") ?? "";
  const categoriesParam = req.nextUrl.searchParams.get("categories") ?? "";
  const activeCategories = categoriesParam
    ? new Set(categoriesParam.split(",").map(c => c.trim()).filter(Boolean))
    : DEFAULT_CATEGORIES;

  try {
    let markets: KalshiMarket[] = [];
    let pages_fetched = 0;

    if (seriesTicker) {
      const url = new URL(`${KALSHI}/markets`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("status", "open");
      url.searchParams.set("series_ticker", seriesTicker);
      const res = await fetch(url.toString(), { headers: HEADERS, next: { revalidate: 30 } });
      if (!res.ok) return NextResponse.json({ error: `Kalshi API ${res.status}` }, { status: res.status });
      const data = await res.json();
      markets = (data.markets ?? []).map((m: Record<string, unknown>) => normalizeMarket(m));
    } else {
      const seen = new Set<string>();

      // Paginate events (cursor-based, up to MAX_PAGES)
      let cursor: string | null = null;
      do {
        const url = new URL(`${KALSHI}/events`);
        url.searchParams.set("limit", "100");
        url.searchParams.set("status", "open");
        url.searchParams.set("with_nested_markets", "true");
        if (cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url.toString(), { headers: HEADERS, next: { revalidate: 30 } });
        if (!res.ok) break;
        const data = await res.json();
        extractFromEvents(data.events ?? [], markets, seen, activeCategories);
        cursor = data.cursor ?? null;
        pages_fetched++;
      } while (cursor && pages_fetched < MAX_PAGES);

      // Supplement with curated political/economic series (always included)
      await Promise.allSettled(
        POLITICAL_SERIES.map(async (series) => {
          const url = `${KALSHI}/markets?limit=20&status=open&series_ticker=${series}`;
          const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } });
          if (!res.ok) return;
          const data = await res.json();
          for (const m of data.markets ?? []) {
            const normalized = normalizeMarket(m);
            if (!seen.has(normalized.ticker) && normalized.yes_ask > 0 && normalized.no_ask > 0) {
              seen.add(normalized.ticker);
              markets.push(normalized);
            }
          }
        })
      );
    }

    // Filter illiquid markets (yes_ask + no_ask > threshold indicates wide spread / low quality)
    const total_before_filter = markets.length;
    const liquid = markets.filter(m => m.yes_ask + m.no_ask <= ILLIQUID_THRESHOLD);
    const illiquid_filtered = total_before_filter - liquid.length;

    // Keyword filter
    const filtered = search
      ? liquid.filter((m) => {
          const q = search.toLowerCase();
          return m.title.toLowerCase().includes(q) || m.ticker.toLowerCase().includes(q);
        })
      : liquid;

    return NextResponse.json({
      markets: filtered,
      meta: { total_before_filter, illiquid_filtered, pages_fetched },
    } satisfies KalshiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractFromEvents(
  events: Record<string, unknown>[],
  out: KalshiMarket[],
  seen: Set<string>,
  activeCategories: Set<string>,
) {
  for (const event of events) {
    const cat = String(event.category ?? "");
    if (!activeCategories.has(cat)) continue;
    const markets = (event.markets as Record<string, unknown>[]) ?? [];
    if (markets.length !== 1) continue;
    const m = markets[0];
    const normalized = { ...normalizeMarket(m), category: cat };
    if (!seen.has(normalized.ticker) && normalized.yes_ask > 0 && normalized.no_ask > 0) {
      seen.add(normalized.ticker);
      out.push(normalized);
    }
  }
}

function normalizeMarket(m: Record<string, unknown>): KalshiMarket {
  return {
    ticker: String(m.ticker ?? ""),
    title: String(m.title ?? ""),
    yes_ask: parseFloat(String(m.yes_ask_dollars ?? "0")),
    yes_bid: parseFloat(String(m.yes_bid_dollars ?? "0")),
    no_ask: parseFloat(String(m.no_ask_dollars ?? "0")),
    no_bid: parseFloat(String(m.no_bid_dollars ?? "0")),
    volume: parseFloat(String(m.volume_fp ?? "0")),
    liquidity: parseFloat(String(m.liquidity_dollars ?? "0")),
    close_time: String(m.close_time ?? ""),
    status: String(m.status ?? ""),
    category: String(m.category ?? ""),
  };
}
