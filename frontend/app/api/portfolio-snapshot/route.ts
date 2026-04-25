import { NextRequest, NextResponse } from "next/server";
import { readFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";

const HISTORY_FILE = join(process.cwd(), "portfolio-history.jsonl");

export interface PortfolioSnapshot {
  ts: number;         // unix ms
  value: number;      // total current value of open positions
  pnl: number;        // total unrealised PnL of open positions
  open: number;       // count of open positions
  wallet: string;
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  try {
    if (!existsSync(HISTORY_FILE)) return NextResponse.json([]);
    const lines = readFileSync(HISTORY_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) as PortfolioSnapshot; } catch { return null; }
      })
      .filter((x): x is PortfolioSnapshot => x !== null);

    const filtered = wallet ? lines.filter((s) => s.wallet === wallet) : lines;
    // Return last 500 snapshots
    return NextResponse.json(filtered.slice(-500));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "read failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PortfolioSnapshot;
    if (!body.wallet || typeof body.value !== "number") {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    appendFileSync(HISTORY_FILE, JSON.stringify(body) + "\n", "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "write failed" }, { status: 500 });
  }
}
