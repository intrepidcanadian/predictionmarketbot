import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You are a prediction market analyst. Your job is to assess whether two prediction markets from different platforms resolve on the same underlying event.

Rules:
- Score 100 if they resolve identically (same event, same date, same threshold)
- Score 70–99 if they are very similar but differ in minor ways (slightly different dates, thresholds, or phrasing)
- Score 40–69 if there is topical overlap but meaningfully different resolution criteria
- Score 0–39 if they are different events despite sharing keywords

Always return valid JSON with no explanation outside the JSON object.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set — add it to frontend/.env.local" },
      { status: 503 }
    );
  }

  let poly_question: string, kalshi_title: string;
  try {
    ({ poly_question, kalshi_title } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!poly_question?.trim() || !kalshi_title?.trim()) {
    return NextResponse.json({ error: "poly_question and kalshi_title are required" }, { status: 400 });
  }

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: [
        {
          type: "text",
          text: SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ] as Parameters<typeof client.messages.create>[0]["system"],
      messages: [
        {
          role: "user",
          content: `Polymarket: "${poly_question.trim()}"\n\nKalshi: "${kalshi_title.trim()}"\n\nRespond with JSON only:\n{"score": <0-100>, "verdict": "<one sentence, max 20 words>"}`,
        },
      ],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const cleaned = raw
      .replace(/^```[a-zA-Z]*\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score))));
    const verdict = String(parsed.verdict ?? "").slice(0, 120);
    const grade: "H" | "M" | "L" = score >= 70 ? "H" : score >= 40 ? "M" : "L";

    return NextResponse.json({ score, verdict, grade });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scoring failed";
    const status = message.includes("API key") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
