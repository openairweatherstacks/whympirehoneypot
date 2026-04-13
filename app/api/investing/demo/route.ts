import { seedDemoInvestments } from "@/lib/investing";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = seedDemoInvestments();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load sample ETF portfolio";
    return Response.json({ error: message }, { status: 500 });
  }
}

