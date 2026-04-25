import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

const SCHEMA = readFileSync(join(process.cwd(), "../docs/rule-schema.md"), "utf8");
const EXAMPLES = readFileSync(join(process.cwd(), "../docs/rule-examples.json"), "utf8");

const SYSTEM = `You are a Polymarket trading bot rule generator. Convert a plain-English trading rule description into a valid JSON rule object.

## Schema
${SCHEMA}

## Example rules
${EXAMPLES}

## Requirements
- Return ONLY raw JSON — no markdown code fences, no explanation, no comments
- Set target.condition_id to "REPLACE_ME" and target.token_id to "REPLACE_ME" (user fills from Markets browser)
- Always set guardrails.dry_run to true (safety default)
- Generate a sensible id slug from the rule name
- Include all required fields; omit optional fields unless clearly implied by the description`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set — add it to frontend/.env.local" },
      { status: 503 }
    );
  }

  let description: string;
  try {
    ({ description } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content: `Generate a rule for: ${description.trim()}` }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    // Strip accidental code fences (```json ... ```)
    const cleaned = raw
      .replace(/^```[a-zA-Z]*\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const rule = JSON.parse(cleaned);
    return NextResponse.json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = message.includes("API key") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
