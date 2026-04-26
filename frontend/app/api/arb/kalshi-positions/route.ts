import { NextResponse } from "next/server";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

export async function GET() {
  const apiKey = process.env.KALSHI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "KALSHI_API_KEY not set" }, { status: 503 });
  }

  try {
    const res = await fetch(`${KALSHI}/portfolio/positions`, {
      headers: {
        Authorization: `Token ${apiKey}`,
        "User-Agent": "predictionmarketbot/0.1",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Kalshi API ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { positions?: unknown[] };
    return NextResponse.json({ positions: data.positions ?? [] });
  } catch {
    return NextResponse.json({ error: "Network error" }, { status: 502 });
  }
}
