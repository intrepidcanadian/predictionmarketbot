import { type NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const HISTORY_FILE = path.join(process.cwd(), "arb-history.jsonl");
const MAX_ENTRIES_PER_PAIR = 100;

export interface HistoryEntry {
  ts: string;
  pair_id: string;
  kalshi_ticker: string;
  question: string;
  net_edge_pct: number;
  edge_cents: number;
  direction: string;
}

async function readAll(): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(l => {
        try { return JSON.parse(l) as HistoryEntry; } catch { return null; }
      })
      .filter((e): e is HistoryEntry => e !== null);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const pairId = req.nextUrl.searchParams.get("pair_id");
  const all = await readAll();
  const filtered = pairId ? all.filter(e => e.pair_id === pairId) : all;
  // newest first, cap at MAX_ENTRIES_PER_PAIR
  return NextResponse.json(filtered.slice(-MAX_ENTRIES_PER_PAIR).reverse());
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HistoryEntry[];
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ appended: 0 });
  }
  const lines = body.map(e => JSON.stringify(e)).join("\n") + "\n";
  await fs.appendFile(HISTORY_FILE, lines, "utf-8");
  return NextResponse.json({ appended: body.length });
}
