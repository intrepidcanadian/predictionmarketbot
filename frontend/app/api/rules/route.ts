import { type NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const RULES_DIR = path.join(process.cwd(), "..", "executor", "rules");

export async function GET() {
  try {
    const files = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith(".json"));
    const rules = files.map((file) => {
      const raw = fs.readFileSync(path.join(RULES_DIR, file), "utf-8");
      return JSON.parse(raw);
    });
    return Response.json(rules);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id || typeof body.id !== "string") {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    const file = path.join(RULES_DIR, `${body.id}.json`);
    if (fs.existsSync(file)) {
      return Response.json({ error: "Rule already exists" }, { status: 409 });
    }
    fs.writeFileSync(file, JSON.stringify(body, null, 2));
    return Response.json(body, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
