import { type NextRequest } from "next/server";

const GAMMA = "https://gamma-api.polymarket.com";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const params = new URLSearchParams();
  params.set("limit", sp.get("limit") ?? "40");
  params.set("closed", sp.get("closed") ?? "false");
  params.set("active", sp.get("active") ?? "true");
  const q = sp.get("q");
  if (q) params.set("search", q);
  const tag = sp.get("tag");
  if (tag) params.set("tag_slug", tag);
  const offset = sp.get("offset");
  if (offset) params.set("offset", offset);

  const url = `${GAMMA}/markets?${params}`;

  const upstream = await fetch(url, {
    headers: { "User-Agent": "polymarket-bot-ui/0.1" },
    next: { revalidate: 30 },
  });

  if (!upstream.ok) {
    return Response.json(
      { error: `Gamma API error ${upstream.status}` },
      { status: upstream.status }
    );
  }

  const raw = await upstream.json();
  const items: unknown[] = Array.isArray(raw) ? raw : raw.data ?? [];

  function parseJsonField(v: unknown): string[] | null {
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch { return null; }
    }
    return null;
  }

  const data = items.map((m: unknown) => {
    const market = m as Record<string, unknown>;
    return {
      id: market.id,
      question: market.question,
      slug: market.slug,
      conditionId: market.conditionId,
      clobTokenIds: parseJsonField(market.clobTokenIds),
      outcomes: parseJsonField(market.outcomes),
      outcomePrices: parseJsonField(market.outcomePrices),
      endDate: market.endDate,
      volume: market.volume,
      liquidity: market.liquidity,
      active: market.active,
      closed: market.closed,
    };
  });

  return Response.json(data);
}
