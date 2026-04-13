import { getDb } from "@/lib/db";

export type DocumentType = "bank" | "credit_card" | "investment" | "payroll" | "unknown";

export type Confidence = "high" | "medium" | "low";

export type ClassificationRule = {
  id: number;
  pattern: string;
  patternType: "contains" | "exact" | "regex";
  trueDirection: "income" | "expense";
  trueCategory: string;
  documentType: DocumentType | "any";
  hitCount: number;
  createdAt: string;
};

type RuleRow = {
  id: number;
  pattern: string;
  pattern_type: string;
  true_direction: string;
  true_category: string;
  document_type: string;
  hit_count: number;
  created_at: string;
};

// ── Patterns that look like income but are almost always bill payments ─────
const BILL_PAYMENT_PATTERNS = [
  /payment\s+received/i,
  /thank\s+you\s+for\s+your\s+payment/i,
  /thank\s+you/i,
  /pymnt\s+rcvd/i,
  /bill\s+payment/i,
  /online\s+payment/i,
  /payment\s+-\s+thank/i,
  /auto[\s-]?pay/i,
  /autopayment/i,
  /minimum\s+payment/i,
  /statement\s+balance/i,
];

// ── Patterns always ambiguous regardless of amount sign ────────────────────
const AMBIGUOUS_PATTERNS = [
  /\btransfer\b/i,
  /\brefund\b/i,
  /\bcredit\s+adjustment\b/i,
  /\breversal\b/i,
  /\bcashback\b/i,
  /interac\s+e[\s-]?transfer/i,
  /\be-transfer\b/i,
];

// ── Known service providers that should NEVER be income ────────────────────
const KNOWN_SERVICE_PROVIDERS = [
  /rogers|bell\s+canada|telus|fido|koodo|freedom\s+mobile|public\s+mobile/i,
  /hydro|enbridge|fortis|atco|ontario\s+power/i,
  /rbc\s+(royal|bank)|td\s+(bank|canada)|bmo|cibc|scotiabank|desjardins/i,
  /visa|mastercard|amex|american\s+express/i,
  /manulife|sunlife|co-operators|intact|aviva/i,
  /netflix|spotify|apple\.com|google\s+one|amazon\s+prime|disney\+/i,
];

// ── Document type detection from raw text ─────────────────────────────────
export function detectDocumentType(text: string): DocumentType {
  const lower = text.toLowerCase();

  if (
    /credit\s+card|visa\s+statement|mastercard|amex|statement\s+balance|minimum\s+payment\s+due|credit\s+limit/.test(lower)
  ) {
    return "credit_card";
  }

  if (/chequing|checking|savings\s+account|bank\s+statement|account\s+summary/.test(lower)) {
    return "bank";
  }

  if (/payroll|pay\s+stub|earnings|gross\s+pay|net\s+pay|deductions/.test(lower)) {
    return "payroll";
  }

  if (/portfolio|investment|brokerage|rrsp|tfsa|holdings|dividends/.test(lower)) {
    return "investment";
  }

  return "unknown";
}

// ── Classify a single transaction — returns direction, confidence, note ────
export function classifyTransaction(
  description: string,
  rawAmount: number,
  documentType: DocumentType,
  learnedRules: ClassificationRule[]
): {
  direction: "income" | "expense";
  confidence: Confidence;
  needsReview: boolean;
  note: string;
} {
  // 1. Apply learned user rules first (highest priority)
  for (const rule of learnedRules) {
    let matches = false;
    if (rule.patternType === "contains") {
      matches = description.toLowerCase().includes(rule.pattern.toLowerCase());
    } else if (rule.patternType === "exact") {
      matches = description.toLowerCase() === rule.pattern.toLowerCase();
    } else if (rule.patternType === "regex") {
      try {
        matches = new RegExp(rule.pattern, "i").test(description);
      } catch {
        // bad regex — skip
      }
    }

    if (matches && (rule.documentType === "any" || rule.documentType === documentType)) {
      return {
        direction: rule.trueDirection as "income" | "expense",
        confidence: "high",
        needsReview: false,
        note: `Matched learned rule: "${rule.pattern}"`
      };
    }
  }

  // 2. Credit card logic — positive = charge (expense), negative/payment = expense (bill pay)
  if (documentType === "credit_card") {
    // On a credit card statement, positive amounts are charges — expenses
    // "Payment received" lines are also expenses (you're paying the card)
    if (rawAmount > 0) {
      return {
        direction: "expense",
        confidence: "high",
        needsReview: false,
        note: "Credit card charge"
      };
    }

    // Negative on credit card = payment or credit — ambiguous
    if (rawAmount < 0) {
      const isBillPay = BILL_PAYMENT_PATTERNS.some((p) => p.test(description));
      if (isBillPay) {
        return {
          direction: "expense",
          confidence: "medium",
          needsReview: true,
          note: "Payment to credit card — classified as expense (bill pay)"
        };
      }
      // Could be a refund / genuine income
      return {
        direction: "income",
        confidence: "low",
        needsReview: true,
        note: "Negative amount on credit card — could be refund or credit"
      };
    }
  }

  // 3. Bank account logic — positive = income/deposit, negative = expense
  // But check for ambiguous payment patterns
  if (rawAmount > 0) {
    // Check if description looks like a bill payment despite being positive
    const isBillPayment = BILL_PAYMENT_PATTERNS.some((p) => p.test(description));
    if (isBillPayment) {
      return {
        direction: "expense",
        confidence: "low",
        needsReview: true,
        note: "Positive amount but looks like a bill payment — needs confirmation"
      };
    }

    // Check if it's from a known service provider (suspicious income)
    const isServiceProvider = KNOWN_SERVICE_PROVIDERS.some((p) => p.test(description));
    if (isServiceProvider) {
      return {
        direction: "expense",
        confidence: "low",
        needsReview: true,
        note: "Known service provider — unusual for this to be income, please confirm"
      };
    }

    // Check for transfers — ambiguous direction
    const isTransfer = AMBIGUOUS_PATTERNS.some((p) => p.test(description));
    if (isTransfer) {
      return {
        direction: "income",
        confidence: "medium",
        needsReview: true,
        note: "Transfer or ambiguous transaction — confirm direction"
      };
    }

    return {
      direction: "income",
      confidence: "high",
      needsReview: false,
      note: "Positive deposit"
    };
  }

  // Negative amount — almost certainly an expense
  const isTransfer = AMBIGUOUS_PATTERNS.some((p) => p.test(description));
  if (isTransfer) {
    return {
      direction: "expense",
      confidence: "medium",
      needsReview: true,
      note: "Outgoing transfer — confirm this is an expense, not an account move"
    };
  }

  return {
    direction: "expense",
    confidence: "high",
    needsReview: false,
    note: "Standard expense"
  };
}

// ── CRUD for classification rules ──────────────────────────────────────────
export function getClassificationRules(): ClassificationRule[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT id, pattern, pattern_type, true_direction, true_category,
             document_type, hit_count, created_at
      FROM classification_rules
      ORDER BY hit_count DESC, created_at DESC
    `)
    .all() as RuleRow[];

  return rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    patternType: r.pattern_type as ClassificationRule["patternType"],
    trueDirection: r.true_direction as "income" | "expense",
    trueCategory: r.true_category,
    documentType: r.document_type as ClassificationRule["documentType"],
    hitCount: r.hit_count,
    createdAt: r.created_at
  }));
}

export function addClassificationRule(input: {
  pattern: string;
  patternType?: "contains" | "exact" | "regex";
  trueDirection: "income" | "expense";
  trueCategory: string;
  documentType?: DocumentType | "any";
}): ClassificationRule {
  const db = getDb();
  const now = new Date().toISOString();

  // Upsert by pattern + document_type
  const existing = db
    .prepare("SELECT id FROM classification_rules WHERE pattern = ? AND document_type = ?")
    .get(input.pattern, input.documentType ?? "any") as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE classification_rules
      SET true_direction = ?, true_category = ?, pattern_type = ?,
          hit_count = hit_count + 1, created_at = ?
      WHERE id = ?
    `).run(
      input.trueDirection,
      input.trueCategory,
      input.patternType ?? "contains",
      now,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO classification_rules
        (pattern, pattern_type, true_direction, true_category, document_type, hit_count, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(
      input.pattern,
      input.patternType ?? "contains",
      input.trueDirection,
      input.trueCategory,
      input.documentType ?? "any",
      now
    );
  }

  const row = db
    .prepare("SELECT id, pattern, pattern_type, true_direction, true_category, document_type, hit_count, created_at FROM classification_rules WHERE pattern = ? AND document_type = ?")
    .get(input.pattern, input.documentType ?? "any") as RuleRow;

  return {
    id: row.id,
    pattern: row.pattern,
    patternType: row.pattern_type as ClassificationRule["patternType"],
    trueDirection: row.true_direction as "income" | "expense",
    trueCategory: row.true_category,
    documentType: row.document_type as ClassificationRule["documentType"],
    hitCount: row.hit_count,
    createdAt: row.created_at
  };
}

// ── Pending review transactions ────────────────────────────────────────────
export type PendingReview = {
  id: number;
  transactionDate: string;
  description: string;
  merchant: string;
  amountCents: number;
  currentDirection: "income" | "expense";
  currentCategory: string;
  classificationNote: string;
  confidence: Confidence;
};

export function getPendingReviews(): PendingReview[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT id, transaction_date, description, merchant,
             amount_cents, direction, category,
             classification_note, confidence
      FROM transactions
      WHERE needs_review = 1
      ORDER BY transaction_date DESC
      LIMIT 50
    `)
    .all() as Array<{
    id: number;
    transaction_date: string;
    description: string;
    merchant: string;
    amount_cents: number;
    direction: string;
    category: string;
    classification_note: string;
    confidence: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    transactionDate: r.transaction_date,
    description: r.description,
    merchant: r.merchant,
    amountCents: r.amount_cents,
    currentDirection: r.direction as "income" | "expense",
    currentCategory: r.category,
    classificationNote: r.classification_note,
    confidence: r.confidence as Confidence
  }));
}

export function confirmTransactionClassification(id: number): void {
  const db = getDb();
  db.prepare("UPDATE transactions SET needs_review = 0 WHERE id = ?").run(id);
}

export function correctTransactionClassification(
  id: number,
  correction: { direction: "income" | "expense"; category: string; saveRule: boolean }
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE transactions
    SET direction = ?, category = ?, needs_review = 0, updated_at = ?
    WHERE id = ?
  `).run(correction.direction, correction.category, now, id);

  if (correction.saveRule) {
    const tx = db
      .prepare("SELECT description FROM transactions WHERE id = ?")
      .get(id) as { description: string } | undefined;

    if (tx) {
      addClassificationRule({
        pattern: tx.description,
        patternType: "exact",
        trueDirection: correction.direction,
        trueCategory: correction.category,
        documentType: "any"
      });
    }
  }
}
