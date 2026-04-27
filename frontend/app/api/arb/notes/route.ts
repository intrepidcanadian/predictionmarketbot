import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const NOTES_FILE = path.join(process.cwd(), "arb-notes.json");

async function readNotes(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(NOTES_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function GET() {
  const notes = await readNotes();
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { pair_id?: string; note?: string };
  const { pair_id, note } = body;
  if (!pair_id) return NextResponse.json({ error: "pair_id required" }, { status: 400 });
  const notes = await readNotes();
  if (note && note.trim()) {
    notes[pair_id] = note.trim();
  } else {
    delete notes[pair_id];
  }
  await writeFile(NOTES_FILE, JSON.stringify(notes, null, 2));
  return NextResponse.json(notes);
}
