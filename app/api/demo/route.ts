import { seedDemoDebtAccounts } from "@/lib/deficit";
import { seedDemoTransactions } from "@/lib/finance";
import { seedDemoInvestments } from "@/lib/investing";
import { seedDemoPerkDocuments } from "@/lib/perks";

export const runtime = "nodejs";

export async function POST() {
  try {
    const transactions = seedDemoTransactions();
    const perks = seedDemoPerkDocuments();
    const investments = seedDemoInvestments();
    const debts = seedDemoDebtAccounts();
    return Response.json({
      created: transactions.created || perks.created || investments.created || debts.created,
      transactionRowsInserted: transactions.created ? transactions.rowsInserted : 0,
      perkDocumentsInserted: perks.documentsInserted,
      investmentPositionsInserted: investments.positionsInserted,
      debtAccountsInserted: debts.accountsInserted
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load starter data";
    return Response.json({ error: message }, { status: 500 });
  }
}
