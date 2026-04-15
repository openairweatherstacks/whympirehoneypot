import { createClient, type Client } from "@libsql/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function getLocalDbPath() {
  const dir = process.env.FINANCE_DATA_DIR?.trim() || join(process.cwd(), "data");
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // directory may already exist
    }
  }
  return join(dir, "finance-command-center.db");
}

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;

export function getDb(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL ?? `file:${getLocalDbPath()}`;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    _client = createClient({ url, authToken });
  }
  return _client;
}

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    source TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    imported_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER,
    transaction_date TEXT NOT NULL,
    posted_month TEXT NOT NULL,
    description TEXT NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
    raw_amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(import_id) REFERENCES imports(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(posted_month)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)`,
  `CREATE TABLE IF NOT EXISTS perk_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    imported_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_perk_documents_provider ON perk_documents(provider)`,
  `CREATE INDEX IF NOT EXISTS idx_perk_documents_imported_at ON perk_documents(imported_at)`,
  `CREATE TABLE IF NOT EXISTS investment_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    target_allocation_bp INTEGER NOT NULL,
    units REAL NOT NULL,
    avg_cost_cents INTEGER NOT NULL,
    current_price_cents INTEGER NOT NULL,
    week52_high_cents INTEGER NOT NULL,
    week52_low_cents INTEGER NOT NULL,
    monthly_contribution_cents INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_investment_positions_asset_class ON investment_positions(asset_class)`,
  `CREATE TABLE IF NOT EXISTS debt_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    debt_type TEXT NOT NULL,
    balance_cents INTEGER NOT NULL,
    apr_bp INTEGER NOT NULL,
    minimum_payment_cents INTEGER NOT NULL,
    target_payment_cents INTEGER NOT NULL,
    credit_limit_cents INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_debt_accounts_type ON debt_accounts(debt_type)`,
  `CREATE TABLE IF NOT EXISTS ingestion_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    document_kind TEXT NOT NULL,
    source TEXT NOT NULL,
    extraction_status TEXT NOT NULL,
    analysis_provider TEXT NOT NULL,
    transaction_rows_inserted INTEGER NOT NULL DEFAULT 0,
    extracted_text TEXT NOT NULL,
    summary TEXT NOT NULL,
    notes TEXT NOT NULL,
    imported_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ingestion_documents_imported_at ON ingestion_documents(imported_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ingestion_documents_status ON ingestion_documents(extraction_status)`,
  `CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    source TEXT NOT NULL DEFAULT 'manual',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_expenses_category ON recurring_expenses(category)`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(active)`,
  `CREATE TABLE IF NOT EXISTS classification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    pattern_type TEXT NOT NULL DEFAULT 'contains',
    true_direction TEXT NOT NULL,
    true_category TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'any',
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_classification_rules_pattern ON classification_rules(pattern, document_type)`,
  `CREATE INDEX IF NOT EXISTS idx_classification_rules_direction ON classification_rules(true_direction)`,
  `CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    target_cents INTEGER NOT NULL,
    current_cents INTEGER NOT NULL DEFAULT 0,
    target_date TEXT,
    emoji TEXT NOT NULL DEFAULT '',
    member TEXT NOT NULL DEFAULT 'joint',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_savings_goals_member ON savings_goals(member)`,
  `CREATE TABLE IF NOT EXISTS net_worth_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    account_type TEXT NOT NULL,
    category TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    member TEXT NOT NULL DEFAULT 'joint',
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_net_worth_accounts_type ON net_worth_accounts(account_type)`,
  `CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_month TEXT NOT NULL UNIQUE,
    assets_cents INTEGER NOT NULL DEFAULT 0,
    liabilities_cents INTEGER NOT NULL DEFAULT 0,
    net_worth_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_month ON net_worth_snapshots(snapshot_month)`,
];

// Additive column migrations — silently ignored if column already exists
const MIGRATIONS = [
  `ALTER TABLE transactions ADD COLUMN member TEXT NOT NULL DEFAULT 'joint'`,
  `ALTER TABLE imports ADD COLUMN member TEXT NOT NULL DEFAULT 'joint'`,
  `ALTER TABLE debt_accounts ADD COLUMN member TEXT NOT NULL DEFAULT 'joint'`,
  `ALTER TABLE recurring_expenses ADD COLUMN member TEXT NOT NULL DEFAULT 'joint'`,
  `ALTER TABLE transactions ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE transactions ADD COLUMN confidence TEXT NOT NULL DEFAULT 'high'`,
  `ALTER TABLE transactions ADD COLUMN classification_note TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE imports ADD COLUMN document_type TEXT NOT NULL DEFAULT 'unknown'`,
];

export async function ensureDb(): Promise<Client> {
  const client = getDb();
  if (!_initPromise) {
    _initPromise = (async () => {
      for (const sql of CREATE_TABLES) {
        await client.execute(sql);
      }
      for (const sql of MIGRATIONS) {
        try {
          await client.execute(sql);
        } catch {
          // column/index already exists — safe to ignore
        }
      }
    })();
  }
  await _initPromise;
  return client;
}
