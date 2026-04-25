import { type NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const RULES_DIR = path.join(process.cwd(), "..", "executor", "rules");

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const file = path.join(RULES_DIR, `${id}.json`);
  if (!fs.existsSync(file)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const existing = JSON.parse(fs.readFileSync(file, "utf-8"));
    const patch = await request.json();
    const updated = { ...existing, ...patch };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const file = path.join(RULES_DIR, `${id}.json`);
  if (!fs.existsSync(file)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    fs.unlinkSync(file);
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
