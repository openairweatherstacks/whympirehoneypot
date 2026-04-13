import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const db = getDb();

    db.exec(`
      DELETE FROM transactions;
      DELETE FROM imports;
      DELETE FROM ingestion_documents;
      DELETE FROM perk_documents;
      DELETE FROM investment_positions;
      DELETE FROM debt_accounts;
    `);

    return Response.json({ cleared: true, message: "All data cleared." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clear failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
