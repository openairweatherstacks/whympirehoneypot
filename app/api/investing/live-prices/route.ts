import { NextRequest, NextResponse } from "next/server";
import { getFinnhubBatch } from "@/lib/finnhub";

// Raymond James ETFs — always included; the client can also pass ?symbols=...
const RJ_ETFS = ["VOO", "VTEB", "IEFA", "IJH", "VO", "IEMG", "HYMB", "IJR"];

export async function GET(req: NextRequest) {
  if (!process.env.FINNHUB_API_KEY) {
    return NextResponse.json({ error: "FINNHUB_API_KEY not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const extra = url.searchParams.get("symbols");
  const extra_symbols = extra ? extra.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : [];

  const symbols = Array.from(new Set([...RJ_ETFS, ...extra_symbols]));

  const result = await getFinnhubBatch(symbols);

  return NextResponse.json(result, {
    headers: {
      // Cache 5 minutes on CDN / ISR — Finnhub free tier is 60 req/min
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
