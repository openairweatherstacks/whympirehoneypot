import { saveInvestmentPosition } from "@/lib/investing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      symbol?: string;
      name?: string;
      assetClass?: string;
      targetAllocationPercent?: number;
      units?: number;
      avgCost?: number;
      currentPrice?: number;
      week52High?: number;
      week52Low?: number;
      monthlyContribution?: number;
    };

    const result = await saveInvestmentPosition({
      symbol: String(body.symbol ?? ""),
      name: String(body.name ?? ""),
      assetClass: String(body.assetClass ?? ""),
      targetAllocationPercent: Number(body.targetAllocationPercent ?? 0),
      units: Number(body.units ?? 0),
      avgCost: Number(body.avgCost ?? 0),
      currentPrice: Number(body.currentPrice ?? 0),
      week52High: Number(body.week52High ?? 0),
      week52Low: Number(body.week52Low ?? 0),
      monthlyContribution: Number(body.monthlyContribution ?? 0)
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save investment position";
    return Response.json({ error: message }, { status: 400 });
  }
}

