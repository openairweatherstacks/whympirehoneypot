import { parse } from "csv-parse/sync";
import { classifyTransaction, getClassificationRules, type DocumentType } from "@/lib/classification";

export type Direction = "income" | "expense";

export type ParsedTransaction = {
  transactionDate: string;
  description: string;
  merchant: string;
  category: string;
  amountCents: number;
  direction: Direction;
  rawAmount: number;
  needsReview: boolean;
  confidence: "high" | "medium" | "low";
  classificationNote: string;
};

const HEADER_CANDIDATES = {
  date: ["date", "posteddate", "transactiondate", "transdate"],
  description: ["description", "merchant", "details", "name", "memo", "transaction"],
  amount: ["amount", "transactionamount", "value", "netamount"],
  debit: ["debit", "withdrawal", "outflow", "charge"],
  credit: ["credit", "deposit", "inflow", "payment"],
  category: ["category", "type", "class", "group"]
};

const CATEGORY_RULES: Array<{ match: RegExp; category: string }> = [
  { match: /payroll|salary|direct deposit|income|refund/i, category: "Income" },
  { match: /rent|mortgage|property|landlord/i, category: "Housing" },
  { match: /uber|lyft|shell|esso|chevron|gas|fuel|transit|metro/i, category: "Transportation" },
  { match: /spotify|netflix|apple\.com\/bill|google one|prime|subscription/i, category: "Subscriptions" },
  { match: /restaurant|cafe|coffee|doordash|ubereats|food|grocer|market/i, category: "Food" },
  { match: /phone|hydro|utility|internet|electric/i, category: "Utilities" },
  { match: /pharmacy|clinic|health|dental|wellness/i, category: "Health" },
  { match: /travel|airbnb|hotel|airlines|flight/i, category: "Travel" },
  { match: /credit card|loan|interest|debt/i, category: "Debt" },
  { match: /amazon|shop|store|retail/i, category: "Shopping" }
];

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findMatchingKey(headers: string[], candidates: string[]) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));

  for (const candidate of candidates) {
    const match = normalized.get(candidate);
    if (match) {
      return match;
    }
  }

  return null;
}

function parseCurrencyValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }

  const isNegative = raw.includes("(") && raw.includes(")");
  const cleaned = raw.replace(/[$,()\s]/g, "");
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    return NaN;
  }

  return isNegative ? -Math.abs(parsed) : parsed;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error("Missing transaction date");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid transaction date: ${raw}`);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toTitleCase(input: string) {
  return input
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferMerchant(description: string) {
  return toTitleCase(
    description
      .replace(/\s+/g, " ")
      .replace(/\b\d{3,}\b/g, "")
      .trim()
  );
}

function inferCategory(description: string, direction: Direction, providedCategory?: string) {
  const cleanedCategory = providedCategory?.trim();
  if (cleanedCategory) {
    return cleanedCategory;
  }

  if (direction === "income") {
    return "Income";
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.match.test(description)) {
      return rule.category;
    }
  }

  return "General";
}

export function parseTransactionsCsv(
  csvText: string,
  documentType: DocumentType = "unknown"
) {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  if (records.length === 0) {
    return [];
  }

  const headers = Object.keys(records[0]);
  const dateKey = findMatchingKey(headers, HEADER_CANDIDATES.date);
  const descriptionKey = findMatchingKey(headers, HEADER_CANDIDATES.description);
  const amountKey = findMatchingKey(headers, HEADER_CANDIDATES.amount);
  const debitKey = findMatchingKey(headers, HEADER_CANDIDATES.debit);
  const creditKey = findMatchingKey(headers, HEADER_CANDIDATES.credit);
  const categoryKey = findMatchingKey(headers, HEADER_CANDIDATES.category);

  if (!dateKey || !descriptionKey || (!amountKey && !debitKey && !creditKey)) {
    throw new Error(
      "CSV headers must include date + description, plus either amount or debit/credit columns."
    );
  }

  // Load learned classification rules once for the whole batch
  const learnedRules = getClassificationRules();

  return records
    .map((row) => {
      const description = String(row[descriptionKey] ?? "").trim();
      if (!description) {
        return null;
      }

      const credit = creditKey ? parseCurrencyValue(row[creditKey]) : 0;
      const debit = debitKey ? parseCurrencyValue(row[debitKey]) : 0;
      const rawAmount = amountKey ? parseCurrencyValue(row[amountKey]) : credit - Math.abs(debit);

      if (!Number.isFinite(rawAmount) || rawAmount === 0) {
        return null;
      }

      // If CSV has explicit debit/credit columns, trust them (high confidence)
      let direction: Direction;
      let needsReview = false;
      let confidence: "high" | "medium" | "low" = "high";
      let classificationNote = "";

      if (debitKey && creditKey) {
        // Explicit debit/credit columns — high confidence
        direction = credit > 0 ? "income" : "expense";
        classificationNote = "Explicit debit/credit columns";
      } else {
        // Use classification engine
        const result = classifyTransaction(description, rawAmount, documentType, learnedRules);
        direction = result.direction;
        needsReview = result.needsReview;
        confidence = result.confidence;
        classificationNote = result.note;
      }

      // Override with CSV-provided category if available, else infer
      const category = inferCategory(description, direction, categoryKey ? row[categoryKey] : undefined);

      return {
        transactionDate: normalizeDate(row[dateKey]),
        description,
        merchant: inferMerchant(description),
        category,
        amountCents: Math.round(rawAmount * 100),
        direction,
        rawAmount,
        needsReview,
        confidence,
        classificationNote
      } satisfies ParsedTransaction;
    })
    .filter((row): row is ParsedTransaction => row !== null);
}

