import { NextRequest, NextResponse } from "next/server";

const GAMMA = "https://gamma-api.polymarket.com";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

export interface ResolutionData {
  poly: {
    question: string;
    description: string;
  } | null;
  kalshi: {
    title: string;
    rules_primary: string;
    rules_secondary: string;
  } | null;
}

export async function GET(req: NextRequest) {
  const polySlug = req.nextUrl.searchParams.get("poly_slug") ?? "";
  const kalshiTicker = req.nextUrl.searchParams.get("kalshi_ticker") ?? "";

  const [polyResult, kalshiResult] = await Promise.allSettled([
    polySlug ? fetchPolyResolution(polySlug) : Promise.resolve(null),
    kalshiTicker ? fetchKalshiResolution(kalshiTicker) : Promise.resolve(null),
  ]);

  const data: ResolutionData = {
    poly: polyResult.status === "fulfilled" ? polyResult.value : null,
    kalshi: kalshiResult.status === "fulfilled" ? kalshiResult.value : null,
  };

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
  });
}

async function fetchPolyResolution(slug: string) {
  const url = `${GAMMA}/markets?slug=${encodeURIComponent(slug)}&limit=1`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  const raw = await res.json();
  const markets = Array.isArray(raw) ? raw : raw.data ?? [];
  const m = markets[0];
  if (!m) return null;
  const description =
    String(m.description ?? m.resolution_rules ?? m.resolutionRules ?? "").trim();
  return {
    question: String(m.question ?? ""),
    description,
  };
}

async function fetchKalshiResolution(ticker: string) {
  const url = `${KALSHI}/markets/${encodeURIComponent(ticker)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "predictionmarketbot/0.1" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  const m = raw.market ?? raw;
  return {
    title: String(m.title ?? ""),
    rules_primary: String(m.rules_primary ?? "").trim(),
    rules_secondary: String(m.rules_secondary ?? "").trim(),
  };
}
