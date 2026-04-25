import { NextRequest, NextResponse } from "next/server";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

const ARB_CATEGORIES = new Set(["Politics", "Economics", "Financials", "Crypto", "World", "Finance"]);

// Series known to have Polymarket equivalents — fetched in addition to events sweep
const POLITICAL_SERIES = [
  "KXTRUMPSBA", "KXCORPTAXCUT", "KXCHIPSREPEAL", "KXWITHDRAW",
  "KXGDPUSMIN", "GDPUSMIN", "BTCETHRETURN", "KXSOLETHRATIO",
  "KXARRESTMAMDANI", "KXDJTPOSTMUSK", "KXDEPORTMUSK",
];

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

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const seriesTicker = req.nextUrl.searchParams.get("series") ?? "";

  try {
    let markets: KalshiMarket[] = [];

    if (seriesTicker) {
      // Targeted series fetch
      const url = new URL(`${KALSHI}/markets`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("status", "open");
      url.searchParams.set("series_ticker", seriesTicker);
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "predictionmarketbot/0.1" },
        next: { revalidate: 30 },
      });
      if (!res.ok) return NextResponse.json({ error: `Kalshi API ${res.status}` }, { status: res.status });
      const data = await res.json();
      markets = (data.markets ?? []).map((m: Record<string, unknown>) => normalizeMarket(m));
    } else {
      // Sweep events (2 pages) + supplement with political series
      const seen = new Set<string>();

      // Page 1 of events
      const eventsUrl = `${KALSHI}/events?limit=100&status=open&with_nested_markets=true`;
      const res1 = await fetch(eventsUrl, {
        headers: { "User-Agent": "predictionmarketbot/0.1" },
        next: { revalidate: 30 },
      });
      if (res1.ok) {
        const data1 = await res1.json();
        extractFromEvents(data1.events ?? [], markets, seen);

        // Page 2 using cursor
        if (data1.cursor) {
          const res2 = await fetch(`${eventsUrl}&cursor=${data1.cursor}`, {
            headers: { "User-Agent": "predictionmarketbot/0.1" },
            next: { revalidate: 30 },
          });
          if (res2.ok) {
            const data2 = await res2.json();
            extractFromEvents(data2.events ?? [], markets, seen);
          }
        }
      }

      // Supplement with curated political/economic series
      await Promise.allSettled(
        POLITICAL_SERIES.map(async (series) => {
          const url = `${KALSHI}/markets?limit=20&status=open&series_ticker=${series}`;
          const res = await fetch(url, {
            headers: { "User-Agent": "predictionmarketbot/0.1" },
            next: { revalidate: 30 },
          });
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

    // Keyword filter
    const filtered = search
      ? markets.filter((m) => {
          const q = search.toLowerCase();
          return m.title.toLowerCase().includes(q) || m.ticker.toLowerCase().includes(q);
        })
      : markets.filter((m) => m.yes_ask > 0 && m.no_ask > 0);

    return NextResponse.json(filtered);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractFromEvents(
  events: Record<string, unknown>[],
  out: KalshiMarket[],
  seen: Set<string>
) {
  for (const event of events) {
    const cat = String(event.category ?? "");
    if (!ARB_CATEGORIES.has(cat)) continue;
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
