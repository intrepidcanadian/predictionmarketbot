import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const SCAN_LOG_FILE = path.join(process.cwd(), "scan-log.jsonl");
const MAX_RETURN = 50;

interface ScanLogEntry {
  ts: string; source: string; opps_count: number;
  kalshi_count: number; illiquid_filtered: number; duration_ms: number;
}

export async function GET() {
  try {
    const raw = await fs.readFile(SCAN_LOG_FILE, "utf-8");
    const entries = raw.trim().split("\n").filter(Boolean)
      .map(l => { try { return JSON.parse(l) as ScanLogEntry; } catch { return null; } })
      .filter((e): e is ScanLogEntry => e !== null)
      .reverse()
      .slice(0, MAX_RETURN);
    return NextResponse.json(entries, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }
}
