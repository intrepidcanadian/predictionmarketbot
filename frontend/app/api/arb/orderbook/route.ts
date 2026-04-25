import { type NextRequest } from "next/server";

const CLOB   = "https://clob.polymarket.com";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

export async function GET(request: NextRequest) {
  const sp           = request.nextUrl.searchParams;
  const tokenId      = sp.get("token_id") ?? "";
  const kalshiTicker = sp.get("kalshi_ticker") ?? "";

  const [polyRes, kalshiRes] = await Promise.allSettled([
    tokenId
      ? fetch(`${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`, {
          headers: { "User-Agent": "predictionmarketbot/0.1" },
          next: { revalidate: 10 },
        }).then(r => (r.ok ? r.json() : null))
      : Promise.resolve(null),
    kalshiTicker
      ? fetch(`${KALSHI}/markets/${encodeURIComponent(kalshiTicker)}`, {
          headers: { "User-Agent": "predictionmarketbot/0.1" },
          next: { revalidate: 10 },
        }).then(r => (r.ok ? r.json() : null))
      : Promise.resolve(null),
  ]);

  const polyData = polyRes.status === "fulfilled" ? polyRes.value : null;
  const poly = polyData
    ? {
        bids: ((polyData.bids ?? []) as Record<string, string>[])
          .slice(0, 5)
          .map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) })),
        asks: ((polyData.asks ?? []) as Record<string, string>[])
          .slice(0, 5)
          .map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) })),
      }
    : null;

  const km =
    kalshiRes.status === "fulfilled" && kalshiRes.value
      ? ((kalshiRes.value.market ?? {}) as Record<string, unknown>)
      : null;

  const kalshi = km
    ? {
        yes_bid: parseFloat(String(km.yes_bid_dollars ?? "0")),
        yes_ask: parseFloat(String(km.yes_ask_dollars ?? "0")),
        no_bid:  parseFloat(String(km.no_bid_dollars  ?? "0")),
        no_ask:  parseFloat(String(km.no_ask_dollars  ?? "0")),
      }
    : null;

  return Response.json({ poly, kalshi });
}
