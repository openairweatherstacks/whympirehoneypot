import { ensureDb } from "@/lib/db";

export type SavingsGoal = {
  id: number;
  name: string;
  targetCents: number;
  currentCents: number;
  targetDate: string | null;
  emoji: string;
  member: string;
  createdAt: string;
  updatedAt: string;
  // computed
  progressPct: number;
  remainingCents: number;
  monthsRemaining: number | null;
  monthlyNeededCents: number | null;
  isComplete: boolean;
};

function mapRow(row: Record<string, unknown>): SavingsGoal {
  const targetCents = Number(row.target_cents);
  const currentCents = Number(row.current_cents);
  const remainingCents = Math.max(0, targetCents - currentCents);
  const progressPct = targetCents > 0 ? Math.min(100, Math.round((currentCents / targetCents) * 100)) : 0;
  const isComplete = currentCents >= targetCents;

  let monthsRemaining: number | null = null;
  let monthlyNeededCents: number | null = null;

  if (!isComplete && row.target_date && typeof row.target_date === "string") {
    const now = new Date();
    const target = new Date(row.target_date);
    const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    if (months > 0) {
      monthsRemaining = months;
      monthlyNeededCents = Math.ceil(remainingCents / months);
    }
  }

  return {
    id: Number(row.id),
    name: String(row.name),
    targetCents,
    currentCents,
    targetDate: row.target_date ? String(row.target_date) : null,
    emoji: String(row.emoji ?? ""),
    member: String(row.member ?? "joint"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    progressPct,
    remainingCents,
    monthsRemaining,
    monthlyNeededCents,
    isComplete,
  };
}

export async function getSavingsGoals(member?: string): Promise<SavingsGoal[]> {
  const db = await ensureDb();
  const rows = member && member !== "all"
    ? (await db.execute({
        sql: `SELECT * FROM savings_goals WHERE member = ? OR member = 'joint' ORDER BY created_at ASC`,
        args: [member]
      })).rows
    : (await db.execute(`SELECT * FROM savings_goals ORDER BY created_at ASC`)).rows;
  return (rows as unknown as Record<string, unknown>[]).map(mapRow);
}

export async function saveSavingsGoal(input: {
  name: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string | null;
  emoji?: string;
  member?: string;
}): Promise<SavingsGoal> {
  const name = input.name.trim();
  if (!name) throw new Error("Goal name is required.");
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    throw new Error("Target amount must be a positive number.");
  }

  const targetCents = Math.round(input.targetAmount * 100);
  const currentCents = Math.round((input.currentAmount ?? 0) * 100);
  const member = input.member ?? "joint";
  const emoji = input.emoji?.trim() ?? "";
  const targetDate = input.targetDate ?? null;
  const now = new Date().toISOString();

  const db = await ensureDb();
  const result = await db.execute({
    sql: `INSERT INTO savings_goals (name, target_cents, current_cents, target_date, emoji, member, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            target_cents = excluded.target_cents,
            current_cents = excluded.current_cents,
            target_date = excluded.target_date,
            emoji = excluded.emoji,
            member = excluded.member,
            updated_at = excluded.updated_at
          RETURNING *`,
    args: [name, targetCents, currentCents, targetDate, emoji, member, now, now]
  });

  return mapRow(result.rows[0] as unknown as Record<string, unknown>);
}

export async function updateGoalProgress(id: number, currentAmount: number): Promise<SavingsGoal | null> {
  if (!Number.isFinite(currentAmount) || currentAmount < 0) {
    throw new Error("Current amount must be a non-negative number.");
  }
  const currentCents = Math.round(currentAmount * 100);
  const now = new Date().toISOString();
  const db = await ensureDb();
  const result = await db.execute({
    sql: `UPDATE savings_goals SET current_cents = ?, updated_at = ? WHERE id = ? RETURNING *`,
    args: [currentCents, now, id]
  });
  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0] as unknown as Record<string, unknown>);
}

export async function deleteSavingsGoal(id: number): Promise<boolean> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: `DELETE FROM savings_goals WHERE id = ?`,
    args: [id]
  });
  return result.rowsAffected > 0;
}
