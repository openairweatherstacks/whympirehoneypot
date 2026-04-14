import { ensureDb } from "@/lib/db";
import { getDashboardSnapshot } from "@/lib/finance";
import { getDeficitDashboard } from "@/lib/deficit";

export const runtime = "nodejs";

export async function GET() {
  const results: Record<string, string> = {};

  try {
    const db = await ensureDb();
    results.db = "ok";

    try {
      await getDashboardSnapshot();
      results.snapshot = "ok";
    } catch (e) {
      results.snapshot = String(e);
    }

    try {
      await getDeficitDashboard();
      results.deficit = "ok";
    } catch (e) {
      results.deficit = String(e);
    }

    try {
      const { generateFinancialInsights } = await import("@/lib/intelligence");
      await generateFinancialInsights();
      results.intelligence = "ok";
    } catch (e) {
      results.intelligence = String(e);
    }

    try {
      const { getInvestmentDashboard } = await import("@/lib/investing");
      await getInvestmentDashboard();
      results.investing = "ok";
    } catch (e) {
      results.investing = String(e);
    }

    try {
      const { getPerkDashboard } = await import("@/lib/perks");
      await getPerkDashboard();
      results.perks = "ok";
    } catch (e) {
      results.perks = String(e);
    }

    try {
      const { getHistoricalDocuments } = await import("@/lib/documents");
      await getHistoricalDocuments();
      results.documents = "ok";
    } catch (e) {
      results.documents = String(e);
    }

    try {
      const { getRecurringExpenses } = await import("@/lib/recurring");
      await getRecurringExpenses();
      results.recurring = "ok";
    } catch (e) {
      results.recurring = String(e);
    }

  } catch (e) {
    results.db = String(e);
  }

  return Response.json(results);
}
