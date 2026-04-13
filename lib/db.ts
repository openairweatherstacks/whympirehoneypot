import Database from "better-sqlite3";
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
) {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureWritableDirectory(directory: string) {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  accessSync(directory, constants.W_OK);
  return directory;
}

function getDatabaseDirectory() {
  const explicitDirectory = process.env.FINANCE_DATA_DIR?.trim();
  if (explicitDirectory) {
    return ensureWritableDirectory(explicitDirectory);
  }

  const projectDataDirectory = join(process.cwd(), "data");
  try {
    return ensureWritableDirectory(projectDataDirectory);
  } catch {
    const tempRoot = process.env.TMPDIR?.trim() || "/tmp";
    return ensureWritableDirectory(join(tempRoot, "whympire-honeypot-data"));
  }
}

function getDatabasePath() {
  return join(getDatabaseDirectory(), "finance-command-center.db");
}

function initializeDatabase(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      source TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
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
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(posted_month);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);

    CREATE TABLE IF NOT EXISTS perk_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      title TEXT NOT NULL,
      document_type TEXT NOT NULL,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_perk_documents_provider ON perk_documents(provider);
    CREATE INDEX IF NOT EXISTS idx_perk_documents_imported_at ON perk_documents(imported_at);

    CREATE TABLE IF NOT EXISTS investment_positions (
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
    );

    CREATE INDEX IF NOT EXISTS idx_investment_positions_asset_class ON investment_positions(asset_class);

    CREATE TABLE IF NOT EXISTS debt_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      debt_type TEXT NOT NULL,
      balance_cents INTEGER NOT NULL,
      apr_bp INTEGER NOT NULL,
      minimum_payment_cents INTEGER NOT NULL,
      target_payment_cents INTEGER NOT NULL,
      credit_limit_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_debt_accounts_type ON debt_accounts(debt_type);

    CREATE TABLE IF NOT EXISTS ingestion_documents (
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
    );

    CREATE INDEX IF NOT EXISTS idx_ingestion_documents_imported_at ON ingestion_documents(imported_at);
    CREATE INDEX IF NOT EXISTS idx_ingestion_documents_status ON ingestion_documents(extraction_status);

    CREATE TABLE IF NOT EXISTS recurring_expenses (
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
    );

    CREATE INDEX IF NOT EXISTS idx_recurring_expenses_category ON recurring_expenses(category);
    CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(active);

    CREATE TABLE IF NOT EXISTS classification_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      pattern_type TEXT NOT NULL DEFAULT 'contains',
      true_direction TEXT NOT NULL,
      true_category TEXT NOT NULL,
      document_type TEXT NOT NULL DEFAULT 'any',
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_classification_rules_pattern ON classification_rules(pattern, document_type);
    CREATE INDEX IF NOT EXISTS idx_classification_rules_direction ON classification_rules(true_direction);
  `);

  // Additive migrations — member column on existing tables
  addColumnIfMissing(db, "transactions", "member", "TEXT NOT NULL DEFAULT 'joint'");
  addColumnIfMissing(db, "imports", "member", "TEXT NOT NULL DEFAULT 'joint'");
  addColumnIfMissing(db, "debt_accounts", "member", "TEXT NOT NULL DEFAULT 'joint'");
  addColumnIfMissing(db, "recurring_expenses", "member", "TEXT NOT NULL DEFAULT 'joint'");

  // Classification columns on transactions
  addColumnIfMissing(db, "transactions", "needs_review", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "transactions", "confidence", "TEXT NOT NULL DEFAULT 'high'");
  addColumnIfMissing(db, "transactions", "classification_note", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "transactions", "updated_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "imports", "document_type", "TEXT NOT NULL DEFAULT 'unknown'");
}

export function getDb() {
  const globalForDb = globalThis as typeof globalThis & {
    __financeCommandCenterDb?: Database.Database;
  };

  if (!globalForDb.__financeCommandCenterDb) {
    const db = new Database(getDatabasePath());
    globalForDb.__financeCommandCenterDb = db;
  }

  initializeDatabase(globalForDb.__financeCommandCenterDb);
  return globalForDb.__financeCommandCenterDb;
}
