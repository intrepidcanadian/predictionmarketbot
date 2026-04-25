import { NextResponse } from "next/server";

// Returns the agent's Polymarket proxy wallet address from env, if configured.
// POLYMARKET_FUNDER is the same var the executor reads (executor/trader.py).
export async function GET() {
  const address = process.env.POLYMARKET_FUNDER ?? null;
  return NextResponse.json({ address });
}
