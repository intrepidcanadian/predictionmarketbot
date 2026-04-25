import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user") ?? "";
  if (!user) return NextResponse.json({ error: "user param required" }, { status: 400 });

  try {
    const url = new URL("https://data-api.polymarket.com/activity");
    url.searchParams.set("user", user);
    url.searchParams.set("limit", "500");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "predictionmarketbot/0.1" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Upstream ${res.status}: ${text}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fetch failed" }, { status: 500 });
  }
}
