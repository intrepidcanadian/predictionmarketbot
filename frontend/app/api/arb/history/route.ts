import { type NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const HISTORY_FILE = path.join(process.cwd(), "arb-history.jsonl");
const MAX_ENTRIES_PER_PAIR = 100;
const MAX_TOTAL_ENTRIES = 500;

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

  // Prune: per-pair cap first, then global cap
  const all = await readAll();
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of all) {
    if (!groups.has(e.pair_id)) groups.set(e.pair_id, []);
    groups.get(e.pair_id)!.push(e);
  }
  const anyPairOverCap = [...groups.values()].some(g => g.length > MAX_ENTRIES_PER_PAIR);
  if (all.length > MAX_TOTAL_ENTRIES || anyPairOverCap) {
    const trimmed: HistoryEntry[] = [];
    for (const entries of groups.values()) {
      trimmed.push(...entries.slice(-MAX_ENTRIES_PER_PAIR));
    }
    trimmed.sort((a, b) => a.ts.localeCompare(b.ts));
    const final = trimmed.slice(-MAX_TOTAL_ENTRIES);
    await fs.writeFile(HISTORY_FILE, final.map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8");
  }

  return NextResponse.json({ appended: body.length });
}
