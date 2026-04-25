import fs from "fs";
import path from "path";
import { type NextRequest } from "next/server";

const PENDING_DIR = path.join(process.cwd(), "..", "executor", "approvals", "pending");
const APPROVED_DIR = path.join(process.cwd(), "..", "executor", "approvals", "approved");

export async function POST(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const srcFile = path.join(PENDING_DIR, `${id}.json`);
  const dstFile = path.join(APPROVED_DIR, `${id}.json`);

  if (!fs.existsSync(srcFile)) {
    return Response.json({ error: "Pending file not found" }, { status: 404 });
  }

  try {
    if (!fs.existsSync(APPROVED_DIR)) fs.mkdirSync(APPROVED_DIR, { recursive: true });
    fs.renameSync(srcFile, dstFile);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const srcFile = path.join(PENDING_DIR, `${id}.json`);

  if (!fs.existsSync(srcFile)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    fs.unlinkSync(srcFile);
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
