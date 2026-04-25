import fs from "fs";
import path from "path";

const AUDIT_FILE = path.join(process.cwd(), "..", "executor", "audit.jsonl");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);

  if (!fs.existsSync(AUDIT_FILE)) {
    return Response.json([]);
  }

  try {
    const raw = fs.readFileSync(AUDIT_FILE, "utf-8");
    const lines = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // Reverse chronological, limit
    const records = lines.reverse().slice(0, limit);
    return Response.json(records);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
