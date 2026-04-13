import { refreshInvestmentPrices } from "@/lib/investing";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await refreshInvestmentPrices();

    if (result.updated.length === 0 && result.failed.length === 0) {
      return Response.json({ message: "No investment positions to refresh." });
    }

    return Response.json({
      updated: result.updated,
      failed: result.failed,
      message:
        result.updated.length > 0
          ? `Updated prices for ${result.updated.join(", ")}.${result.failed.length > 0 ? ` Failed: ${result.failed.map((f) => f.symbol).join(", ")}.` : ""}`
          : `All price fetches failed. Check network access or try again.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price refresh failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
