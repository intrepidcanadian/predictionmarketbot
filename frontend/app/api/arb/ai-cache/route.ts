import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), "arb-ai-cache.json");
const MAX_ENTRIES = 200;

type AiMatchEntry = {
  score: number;
  verdict: string;
  grade: "H" | "M" | "L";
  usedResolution?: boolean;
  ts: string;
};

async function readCache(): Promise<Record<string, AiMatchEntry>> {
  try {
    const text = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(text) as Record<string, AiMatchEntry>;
  } catch {
    return {};
  }
}

export async function GET() {
  const cache = await readCache();
  return NextResponse.json(cache, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const { id, match } = await req.json() as { id: string; match: AiMatchEntry };
  if (!id || !match) return NextResponse.json({ error: "missing id or match" }, { status: 400 });

  const cache = await readCache();
  cache[id] = { ...match, ts: new Date().toISOString() };

  // Prune to newest MAX_ENTRIES by sorting on ts desc and slicing
  const entries = Object.entries(cache);
  if (entries.length > MAX_ENTRIES) {
    const pruned = entries
      .sort((a, b) => (b[1].ts ?? "").localeCompare(a[1].ts ?? ""))
      .slice(0, MAX_ENTRIES);
    const trimmed = Object.fromEntries(pruned);
    await writeFile(CACHE_FILE, JSON.stringify(trimmed, null, 2));
  } else {
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  }

  return NextResponse.json({ ok: true });
}
