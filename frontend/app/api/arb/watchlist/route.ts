import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const WATCHLIST_FILE = path.join(process.cwd(), "arb-watchlist.json");

export async function GET() {
  try {
    if (!fs.existsSync(WATCHLIST_FILE)) {
      return NextResponse.json({ ids: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const raw = fs.readFileSync(WATCHLIST_FILE, "utf-8");
    const data = JSON.parse(raw) as { ids: string[] };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ids: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { ids: string[] };
    if (!Array.isArray(body.ids)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }
    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify({ ids: body.ids }, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
