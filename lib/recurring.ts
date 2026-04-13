import { ensureDb } from "@/lib/db";

export type Frequency = "weekly" | "biweekly" | "monthly" | "annual";

export type RecurringExpense = {
  id: number;
  name: string;
  merchant: string;
  category: string;
  amountCents: number;
  frequency: Frequency;
  source: "manual" | "auto";
  active: boolean;
  member: string;
  createdAt: string;
  updatedAt: string;
  // derived
  monthlyEquivalentCents: number;
};

export type DetectedCandidate = {
  merchant: string;
  category: string;
  avgAmountCents: number;
  activeMonths: number;
  alreadySaved: boolean;
};

type RecurringRow = {
  id: number;
  name: string;
  merchant: string;
  category: string;
  amountCents: number;
  frequency: Frequency;
  source: string;
  active: number;
  member: string;
  createdAt: string;
  updatedAt: string;
};

function monthlyEquivalent(amountCents: number, frequency: Frequency): number {
  switch (frequency) {
    case "weekly":   return Math.round(amountCents * 52 / 12);
    case "biweekly": return Math.round(amountCents * 26 / 12);
    case "annual":   return Math.round(amountCents / 12);
    default:         return amountCents; // monthly
  }
}

function mapRow(row: RecurringRow): RecurringExpense {
  return {
    id: Number(row.id),
    name: row.name,
    merchant: row.merchant,
    category: row.category,
    amountCents: Number(row.amountCents),
    frequency: row.frequency,
    source: row.source === "auto" ? "auto" : "manual",
    active: Number(row.active) === 1,
    member: row.member ?? "joint",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    monthlyEquivalentCents: monthlyEquivalent(Number(row.amountCents), row.frequency)
  };
}

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  const db = await ensureDb();
  const rows = (await db.execute(`
    SELECT
      id, name, merchant, category,
      amount_cents AS amountCents,
      frequency, source, active, member,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM recurring_expenses
    ORDER BY amount_cents DESC, name ASC
  `)).rows as unknown as RecurringRow[];

  return rows.map(mapRow);
}

export async function addRecurringExpense(input: {
  name: string;
  merchant?: string;
  category: string;
  amount: number;
  frequency: Frequency;
  source?: "manual" | "auto";
  member?: string;
}): Promise<RecurringExpense> {
  const name = input.name.trim();
  const merchant = (input.merchant ?? input.name).trim();
  const category = input.category.trim();

  if (!name || !category) throw new Error("Name and category are required.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Amount must be a positive number.");

  const db = await ensureDb();
  const now = new Date().toISOString();
  const amountCents = Math.round(input.amount * 100);
  const source = input.source ?? "manual";
  const member = input.member ?? "joint";

  const insertResult = await db.execute({
    sql: `INSERT INTO recurring_expenses (name, merchant, category, amount_cents, frequency, source, active, member, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    args: [name, merchant, category, amountCents, input.frequency, source, member, now, now]
  });
  const newId = Number(insertResult.lastInsertRowid);

  const row = (await db.execute({
    sql: `SELECT id, name, merchant, category,
            amount_cents AS amountCents, frequency, source, active, member,
            created_at AS createdAt, updated_at AS updatedAt
          FROM recurring_expenses WHERE id = ?`,
    args: [newId]
  })).rows[0] as unknown as RecurringRow;

  return mapRow(row);
}

export async function deleteRecurringExpense(id: number): Promise<boolean> {
  const db = await ensureDb();
  const result = await db.execute({ sql: "DELETE FROM recurring_expenses WHERE id = ?", args: [id] });
  return result.rowsAffected > 0;
}

export async function updateRecurringExpense(
  id: number,
  input: { name?: string; category?: string; amount?: number; frequency?: Frequency }
): Promise<RecurringExpense | null> {
  const db = await ensureDb();
  const existingRows = (await db.execute({
    sql: "SELECT * FROM recurring_expenses WHERE id = ?",
    args: [id]
  })).rows as unknown as RecurringRow[];

  if (existingRows.length === 0) return null;
  const existing = existingRows[0];

  const name = input.name?.trim() ?? existing.name;
  const category = input.category?.trim() ?? existing.category;
  const amountCents = input.amount ? Math.round(input.amount * 100) : Number(existing.amountCents);
  const frequency = input.frequency ?? existing.frequency;
  const now = new Date().toISOString();

  await db.execute({
    sql: `UPDATE recurring_expenses
          SET name = ?, category = ?, amount_cents = ?, frequency = ?, updated_at = ?
          WHERE id = ?`,
    args: [name, category, amountCents, frequency, now, id]
  });

  const row = (await db.execute({
    sql: `SELECT id, name, merchant, category,
            amount_cents AS amountCents, frequency, source, active, member,
            created_at AS createdAt, updated_at AS updatedAt
          FROM recurring_expenses WHERE id = ?`,
    args: [id]
  })).rows[0] as unknown as RecurringRow;

  return mapRow(row);
}

export async function detectRecurringFromTransactions(): Promise<DetectedCandidate[]> {
  const db = await ensureDb();

  const detected = (await db.execute(`
    SELECT
      merchant,
      category,
      ROUND(AVG(ABS(amount_cents))) AS avgAmountCents,
      COUNT(DISTINCT posted_month) AS activeMonths
    FROM transactions
    WHERE direction = 'expense'
    GROUP BY merchant, category
    HAVING COUNT(*) >= 2 AND COUNT(DISTINCT posted_month) >= 2
    ORDER BY avgAmountCents DESC
    LIMIT 20
  `)).rows as unknown as { merchant: string; category: string; avgAmountCents: number; activeMonths: number }[];

  const saved = (await db.execute("SELECT merchant FROM recurring_expenses")).rows as unknown as { merchant: string }[];
  const savedMerchants = new Set(saved.map((r) => r.merchant.toLowerCase()));

  return detected.map((row) => ({
    merchant: row.merchant,
    category: row.category,
    avgAmountCents: Number(row.avgAmountCents),
    activeMonths: Number(row.activeMonths),
    alreadySaved: savedMerchants.has(row.merchant.toLowerCase())
  }));
}

export function getRecurringSummary(expenses: RecurringExpense[]) {
  const active = expenses.filter((e) => e.active);
  const monthlyTotalCents = active.reduce((sum, e) => sum + e.monthlyEquivalentCents, 0);
  const byCategory = active.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.monthlyEquivalentCents;
    return acc;
  }, {});

  return { count: active.length, monthlyTotalCents, byCategory };
}
