import { ensureDb } from "@/lib/db";
import type { ParsedTransaction } from "@/lib/ingest";

export type DashboardSnapshot = {
  totals: {
    incomeCents: number;
    expenseCents: number;
    netCents: number;
    transactionCount: number;
    importCount: number;
  };
  monthTotals: Array<{
    month: string;
    label: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }>;
  categoryTotals: Array<{
    category: string;
    spendCents: number;
    share: number;
  }>;
  recentTransactions: Array<{
    id: number;
    transactionDate: string;
    description: string;
    merchant: string;
    category: string;
    amountCents: number;
    direction: "income" | "expense";
    member: string;
  }>;
  recentImports: Array<{
    id: number;
    filename: string;
    source: string;
    rowCount: number;
    importedAt: string;
    member: string;
  }>;
  highlights: {
    topCategory: string;
    biggestExpenseLabel: string;
    biggestExpenseCents: number;
    currentMonthSpendCents: number;
  };
};

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit"
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric"
});

function formatMonthLabel(month: string) {
  return monthFormatter.format(new Date(`${month}-01T12:00:00`));
}

export function formatCurrency(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amountCents / 100);
}

export function formatShortDate(input: string) {
  return dateFormatter.format(new Date(`${input}T12:00:00`));
}

export async function saveImportedTransactions(
  filename: string,
  records: ParsedTransaction[],
  source = "csv",
  member = "joint"
) {
  const db = await ensureDb();
  const createdAt = new Date().toISOString();

  const importResult = await db.execute({
    sql: `INSERT INTO imports (filename, source, row_count, imported_at, member) VALUES (?, ?, ?, ?, ?)`,
    args: [filename, source, records.length, createdAt, member]
  });
  const importId = Number(importResult.lastInsertRowid);

  if (records.length > 0) {
    await db.batch(
      records.map((record) => ({
        sql: `INSERT INTO transactions (
          import_id, transaction_date, posted_month, description, merchant, category,
          amount_cents, direction, raw_amount, created_at, member,
          needs_review, confidence, classification_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          importId,
          record.transactionDate,
          record.transactionDate.slice(0, 7),
          record.description,
          record.merchant,
          record.category,
          record.amountCents,
          record.direction,
          record.rawAmount,
          createdAt,
          member,
          record.needsReview ? 1 : 0,
          record.confidence ?? "high",
          record.classificationNote ?? ""
        ]
      })),
      "write"
    );
  }

  return { importId, rowsInserted: records.length };
}

export async function getDashboardSnapshot(member?: string): Promise<DashboardSnapshot> {
  const db = await ensureDb();

  const memberClause =
    member && member !== "all"
      ? `WHERE (member = '${member}' OR member = 'joint')`
      : "";
  const memberExpenseClause =
    member && member !== "all"
      ? `WHERE direction = 'expense' AND (member = '${member}' OR member = 'joint')`
      : "WHERE direction = 'expense'";

  const totalsResult = await db.execute(`
    SELECT
      COUNT(*) AS transactionCount,
      COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
      COALESCE(SUM(CASE WHEN direction = 'expense' THEN ABS(amount_cents) ELSE 0 END), 0) AS expenseCents,
      (SELECT COUNT(*) FROM imports) AS importCount
    FROM transactions
    ${memberClause}
  `);
  const totals = totalsResult.rows[0] as unknown as {
    transactionCount: number;
    incomeCents: number;
    expenseCents: number;
    importCount: number;
  };

  const monthRows = (await db.execute(`
    SELECT
      posted_month AS month,
      COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
      COALESCE(SUM(CASE WHEN direction = 'expense' THEN ABS(amount_cents) ELSE 0 END), 0) AS expenseCents
    FROM transactions
    ${memberClause}
    GROUP BY posted_month
    ORDER BY posted_month DESC
    LIMIT 6
  `)).rows as unknown as Array<{ month: string; incomeCents: number; expenseCents: number }>;

  const monthTotals = [...monthRows].reverse().map((row) => ({
    ...row,
    incomeCents: Number(row.incomeCents),
    expenseCents: Number(row.expenseCents),
    netCents: Number(row.incomeCents) - Number(row.expenseCents),
    label: formatMonthLabel(row.month)
  }));

  const totalExpenseCents = Number(totals.expenseCents) || 1;
  const categoryRows = (await db.execute(`
    SELECT
      category,
      COALESCE(SUM(ABS(amount_cents)), 0) AS spendCents
    FROM transactions
    ${memberExpenseClause}
    GROUP BY category
    ORDER BY spendCents DESC
    LIMIT 6
  `)).rows as unknown as Array<{ category: string; spendCents: number }>;

  const categoryTotals = categoryRows.map((row) => ({
    category: row.category,
    spendCents: Number(row.spendCents),
    share: Number(row.spendCents) / totalExpenseCents
  }));

  const recentTransactions = (await db.execute(`
    SELECT
      id,
      transaction_date AS transactionDate,
      description,
      merchant,
      category,
      amount_cents AS amountCents,
      direction,
      member
    FROM transactions
    ${memberClause}
    ORDER BY transaction_date DESC, id DESC
    LIMIT 12
  `)).rows as unknown as DashboardSnapshot["recentTransactions"];

  const recentImports = (await db.execute(`
    SELECT
      id,
      filename,
      source,
      row_count AS rowCount,
      imported_at AS importedAt,
      member
    FROM imports
    ORDER BY imported_at DESC
    LIMIT 4
  `)).rows as unknown as DashboardSnapshot["recentImports"];

  const biggestExpenseRows = (await db.execute(`
    SELECT description, ABS(amount_cents) AS amountCents
    FROM transactions
    ${memberExpenseClause}
    ORDER BY ABS(amount_cents) DESC
    LIMIT 1
  `)).rows as unknown as Array<{ description?: string; amountCents?: number }>;
  const biggestExpense = biggestExpenseRows[0];

  const currentMonth = monthTotals[monthTotals.length - 1];

  return {
    totals: {
      incomeCents: Number(totals.incomeCents),
      expenseCents: Number(totals.expenseCents),
      netCents: Number(totals.incomeCents) - Number(totals.expenseCents),
      transactionCount: Number(totals.transactionCount),
      importCount: Number(totals.importCount)
    },
    monthTotals,
    categoryTotals,
    recentTransactions,
    recentImports,
    highlights: {
      topCategory: categoryTotals[0]?.category ?? "No spend categories yet",
      biggestExpenseLabel: biggestExpense?.description ?? "No expenses imported yet",
      biggestExpenseCents: Number(biggestExpense?.amountCents ?? 0),
      currentMonthSpendCents: currentMonth?.expenseCents ?? 0
    }
  };
}

export async function deleteTransaction(id: number): Promise<boolean> {
  const db = await ensureDb();
  const result = await db.execute({ sql: `DELETE FROM transactions WHERE id = ?`, args: [id] });
  return result.rowsAffected > 0;
}

export async function seedDemoTransactions() {
  const db = await ensureDb();
  const existingResult = await db.execute("SELECT COUNT(*) AS count FROM transactions");
  const existing = existingResult.rows[0] as unknown as { count: number };

  if (Number(existing.count) > 0) {
    return { created: false, rowsInserted: Number(existing.count) };
  }

  const defaults = { needsReview: false, confidence: "high" as const, classificationNote: "Demo data" };
  const starterData: ParsedTransaction[] = [
    { transactionDate: "2026-01-03", description: "Whympire Payroll", merchant: "Whympire Payroll", category: "Income", amountCents: 420000, direction: "income", rawAmount: 4200, ...defaults },
    { transactionDate: "2026-01-05", description: "Rent Transfer", merchant: "Rent Transfer", category: "Housing", amountCents: -145000, direction: "expense", rawAmount: -1450, ...defaults },
    { transactionDate: "2026-01-08", description: "Metro Grocery", merchant: "Metro Grocery", category: "Food", amountCents: -18420, direction: "expense", rawAmount: -184.2, ...defaults },
    { transactionDate: "2026-02-03", description: "Whympire Payroll", merchant: "Whympire Payroll", category: "Income", amountCents: 420000, direction: "income", rawAmount: 4200, ...defaults },
    { transactionDate: "2026-02-12", description: "Rogers Internet", merchant: "Rogers Internet", category: "Utilities", amountCents: -9700, direction: "expense", rawAmount: -97, ...defaults },
    { transactionDate: "2026-02-18", description: "Netflix Subscription", merchant: "Netflix Subscription", category: "Subscriptions", amountCents: -1999, direction: "expense", rawAmount: -19.99, ...defaults },
    { transactionDate: "2026-03-03", description: "Whympire Payroll", merchant: "Whympire Payroll", category: "Income", amountCents: 420000, direction: "income", rawAmount: 4200, ...defaults },
    { transactionDate: "2026-03-11", description: "Shell Gas Station", merchant: "Shell Gas Station", category: "Transportation", amountCents: -8600, direction: "expense", rawAmount: -86, ...defaults },
    { transactionDate: "2026-03-19", description: "Amazon Marketplace", merchant: "Amazon Marketplace", category: "Shopping", amountCents: -13250, direction: "expense", rawAmount: -132.5, ...defaults },
    { transactionDate: "2026-04-03", description: "Whympire Payroll", merchant: "Whympire Payroll", category: "Income", amountCents: 420000, direction: "income", rawAmount: 4200, ...defaults },
    { transactionDate: "2026-04-07", description: "Airbnb Toronto", merchant: "Airbnb Toronto", category: "Travel", amountCents: -28400, direction: "expense", rawAmount: -284, ...defaults },
    { transactionDate: "2026-04-09", description: "TD Credit Card Payment", merchant: "Td Credit Card Payment", category: "Debt", amountCents: -45000, direction: "expense", rawAmount: -450, ...defaults }
  ];

  const result = await saveImportedTransactions("starter-demo-ledger.csv", starterData, "demo");
  return { created: true, rowsInserted: result.rowsInserted };
}
