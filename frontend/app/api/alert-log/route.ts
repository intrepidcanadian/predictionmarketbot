import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "alert-log.jsonl");
const MAX_ENTRIES = 100;

export async function GET() {
  if (!existsSync(LOG_PATH)) return NextResponse.json([]);
  try {
    const text = await readFile(LOG_PATH, "utf-8");
    const entries = text
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .reverse()
      .slice(0, 50);
    return NextResponse.json(entries);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const entry = await req.json();
    const line = JSON.stringify(entry) + "\n";

    let existing: string[] = [];
    if (existsSync(LOG_PATH)) {
      const text = await readFile(LOG_PATH, "utf-8");
      existing = text.split("\n").filter(Boolean);
    }

    existing.push(JSON.stringify(entry));
    if (existing.length > MAX_ENTRIES) {
      existing = existing.slice(existing.length - MAX_ENTRIES);
    }
    await writeFile(LOG_PATH, existing.join("\n") + "\n");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
