import { ensureDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const db = await ensureDb();
    await db.batch([
      { sql: "DELETE FROM transactions" },
      { sql: "DELETE FROM imports" },
      { sql: "DELETE FROM ingestion_documents" },
      { sql: "DELETE FROM perk_documents" },
      { sql: "DELETE FROM investment_positions" },
      { sql: "DELETE FROM debt_accounts" }
    ], "write");

    return Response.json({ cleared: true, message: "All data cleared." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clear failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
