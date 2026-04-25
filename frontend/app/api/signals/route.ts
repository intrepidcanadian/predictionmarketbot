import fs from "fs";
import path from "path";
import { type NextRequest } from "next/server";

const SIGNALS_FILE = path.join(process.cwd(), "..", "executor", "signals.json");

export async function GET() {
  if (!fs.existsSync(SIGNALS_FILE)) {
    return Response.json({});
  }
  try {
    const raw = fs.readFileSync(SIGNALS_FILE, "utf-8");
    return Response.json(JSON.parse(raw));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body !== "object" || Array.isArray(body) || body === null) {
      return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(body, null, 2));
    return Response.json(body);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
