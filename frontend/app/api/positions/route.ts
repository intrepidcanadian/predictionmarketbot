import { NextRequest, NextResponse } from "next/server";

const DATA_API = "https://data-api.polymarket.com";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("user");
  if (!address) {
    return NextResponse.json({ error: "user address required" }, { status: 400 });
  }

  try {
    const url = new URL(`${DATA_API}/positions`);
    url.searchParams.set("user", address);
    url.searchParams.set("sizeThreshold", "0.01");
    url.searchParams.set("limit", "500");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "predictionmarketbot/0.1" },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Polymarket Data API error: ${res.status} ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
