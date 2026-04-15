import { ensureDb } from "@/lib/db";
export type { AccountType, AccountCategory } from "@/lib/networth-types";
export { ASSET_CATEGORIES, LIABILITY_CATEGORIES, CATEGORY_LABELS } from "@/lib/networth-types";
import type { AccountType, AccountCategory } from "@/lib/networth-types";
import { CATEGORY_LABELS } from "@/lib/networth-types";

export type NetWorthAccount = {
  id: number;
  name: string;
  accountType: AccountType;
  category: AccountCategory;
  balanceCents: number;
  member: string;
  updatedAt: string;
};

export type NetWorthSnapshot = {
  id: number;
  snapshotMonth: string;
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  createdAt: string;
};

export type NetWorthDashboard = {
  accounts: NetWorthAccount[];
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  snapshots: NetWorthSnapshot[];
  changeFromLastMonthCents: number | null;
  changePct: number | null;
  byCategory: Record<string, number>;
};

function mapAccount(row: Record<string, unknown>): NetWorthAccount {
  return {
    id: Number(row.id),
    name: String(row.name),
    accountType: String(row.account_type) as AccountType,
    category: String(row.category) as AccountCategory,
    balanceCents: Number(row.balance_cents),
    member: String(row.member ?? "joint"),
    updatedAt: String(row.updated_at),
  };
}

function mapSnapshot(row: Record<string, unknown>): NetWorthSnapshot {
  return {
    id: Number(row.id),
    snapshotMonth: String(row.snapshot_month),
    assetsCents: Number(row.assets_cents),
    liabilitiesCents: Number(row.liabilities_cents),
    netWorthCents: Number(row.net_worth_cents),
    createdAt: String(row.created_at),
  };
}

export async function getNetWorthDashboard(): Promise<NetWorthDashboard> {
  const db = await ensureDb();

  const accounts = (await db.execute(
    `SELECT * FROM net_worth_accounts ORDER BY account_type ASC, category ASC, name ASC`
  )).rows as unknown as Record<string, unknown>[];

  const snapshots = (await db.execute(
    `SELECT * FROM net_worth_snapshots ORDER BY snapshot_month ASC LIMIT 24`
  )).rows as unknown as Record<string, unknown>[];

  const mapped = accounts.map(mapAccount);
  const totalAssetsCents = mapped
    .filter((a) => a.accountType === "asset")
    .reduce((s, a) => s + a.balanceCents, 0);
  const totalLiabilitiesCents = mapped
    .filter((a) => a.accountType === "liability")
    .reduce((s, a) => s + a.balanceCents, 0);
  const netWorthCents = totalAssetsCents - totalLiabilitiesCents;

  const mappedSnapshots = snapshots.map(mapSnapshot);
  const lastTwo = mappedSnapshots.slice(-2);
  const changeFromLastMonthCents =
    lastTwo.length === 2 ? lastTwo[1].netWorthCents - lastTwo[0].netWorthCents : null;
  const changePct =
    changeFromLastMonthCents !== null && lastTwo[0].netWorthCents !== 0
      ? Math.round((changeFromLastMonthCents / Math.abs(lastTwo[0].netWorthCents)) * 1000) / 10
      : null;

  const byCategory: Record<string, number> = {};
  for (const acc of mapped) {
    const label = CATEGORY_LABELS[acc.category] ?? acc.category;
    const val = acc.accountType === "asset" ? acc.balanceCents : -acc.balanceCents;
    byCategory[label] = (byCategory[label] ?? 0) + val;
  }

  return {
    accounts: mapped,
    totalAssetsCents,
    totalLiabilitiesCents,
    netWorthCents,
    snapshots: mappedSnapshots,
    changeFromLastMonthCents,
    changePct,
    byCategory,
  };
}

export async function saveNetWorthAccount(input: {
  name: string;
  accountType: AccountType;
  category: AccountCategory;
  balance: number;
  member?: string;
}): Promise<NetWorthAccount> {
  const name = input.name.trim();
  if (!name) throw new Error("Account name is required.");
  if (!Number.isFinite(input.balance) || input.balance < 0) {
    throw new Error("Balance must be a non-negative number.");
  }

  const balanceCents = Math.round(input.balance * 100);
  const member = input.member ?? "joint";
  const now = new Date().toISOString();
  const db = await ensureDb();

  const result = await db.execute({
    sql: `INSERT INTO net_worth_accounts (name, account_type, category, balance_cents, member, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            account_type = excluded.account_type,
            category = excluded.category,
            balance_cents = excluded.balance_cents,
            member = excluded.member,
            updated_at = excluded.updated_at
          RETURNING *`,
    args: [name, input.accountType, input.category, balanceCents, member, now],
  });

  return mapAccount(result.rows[0] as unknown as Record<string, unknown>);
}

export async function updateAccountBalance(id: number, balance: number): Promise<NetWorthAccount | null> {
  if (!Number.isFinite(balance) || balance < 0) throw new Error("Balance must be non-negative.");
  const balanceCents = Math.round(balance * 100);
  const now = new Date().toISOString();
  const db = await ensureDb();
  const result = await db.execute({
    sql: `UPDATE net_worth_accounts SET balance_cents = ?, updated_at = ? WHERE id = ? RETURNING *`,
    args: [balanceCents, now, id],
  });
  if (result.rows.length === 0) return null;
  return mapAccount(result.rows[0] as unknown as Record<string, unknown>);
}

export async function deleteNetWorthAccount(id: number): Promise<boolean> {
  const db = await ensureDb();
  const result = await db.execute({ sql: `DELETE FROM net_worth_accounts WHERE id = ?`, args: [id] });
  return result.rowsAffected > 0;
}

export async function recordNetWorthSnapshot(): Promise<NetWorthSnapshot> {
  const dash = await getNetWorthDashboard();
  const month = new Date().toISOString().slice(0, 7);
  const now = new Date().toISOString();
  const db = await ensureDb();

  const result = await db.execute({
    sql: `INSERT INTO net_worth_snapshots (snapshot_month, assets_cents, liabilities_cents, net_worth_cents, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(snapshot_month) DO UPDATE SET
            assets_cents = excluded.assets_cents,
            liabilities_cents = excluded.liabilities_cents,
            net_worth_cents = excluded.net_worth_cents
          RETURNING *`,
    args: [month, dash.totalAssetsCents, dash.totalLiabilitiesCents, dash.netWorthCents, now],
  });

  return mapSnapshot(result.rows[0] as unknown as Record<string, unknown>);
}
