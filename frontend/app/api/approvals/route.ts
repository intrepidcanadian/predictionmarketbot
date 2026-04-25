import fs from "fs";
import path from "path";

const PENDING_DIR = path.join(process.cwd(), "..", "executor", "approvals", "pending");
const APPROVED_DIR = path.join(process.cwd(), "..", "executor", "approvals", "approved");

export async function GET() {
  if (!fs.existsSync(PENDING_DIR)) {
    return Response.json([]);
  }
  try {
    const files = fs.readdirSync(PENDING_DIR).filter((f) => f.endsWith(".json"));
    const items = files.map((file) => {
      const raw = fs.readFileSync(path.join(PENDING_DIR, file), "utf-8");
      let data: unknown = null;
      try { data = JSON.parse(raw); } catch { data = raw; }
      return { id: file.replace(/\.json$/, ""), file, data };
    });
    return Response.json(items);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
