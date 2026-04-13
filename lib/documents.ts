import Anthropic from "@anthropic-ai/sdk";
import { ensureDb } from "@/lib/db";
import { saveImportedTransactions } from "@/lib/finance";
import { parseTransactionsCsv } from "@/lib/ingest";
import type { ParsedTransaction } from "@/lib/ingest";
import { PDFParse } from "pdf-parse";
import { createWorker, PSM } from "tesseract.js";

export type AiConnectionStatus = {
  provider: string;
  model: string;
  anthropicConfigured: boolean;
  liveAnalysisEnabled: boolean;
};

export type HistoricalDocument = {
  id: number;
  filename: string;
  mimeType: string;
  documentKind: string;
  source: string;
  extractionStatus: string;
  analysisProvider: string;
  transactionRowsInserted: number;
  summary: string;
  notes: string;
  importedAt: string;
};

export type UploadedDocumentResult = {
  filename: string;
  mimeType: string;
  mode: "transactions-imported" | "archived-only";
  rowsInserted: number;
  summary: string;
  extractionStatus: string;
};

type AnthropicTransactionCandidate = {
  transactionDate?: string;
  description?: string;
  merchant?: string;
  category?: string;
  rawAmount?: number | string;
};

type AnthropicExtractionPayload = {
  documentKind?: string;
  summary?: string;
  extractedText?: string;
  notes?: string[];
  transactions?: AnthropicTransactionCandidate[];
};

type DocumentAnalysis = {
  documentKind: string;
  summary: string;
  extractedText: string;
  notes: string[];
  transactions: ParsedTransaction[];
  analysisProvider: string;
  extractionStatus: string;
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const PDF_MIME_TYPE = "application/pdf";
const DATE_PATTERN =
  /(?:\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{2,4})?\b)/i;
const AMOUNT_PATTERN =
  /(?:\(?-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?|\(?-?\$?\d+(?:\.\d{2})?\)?)(?:\s?(CR|DR))?/gi;
const SKIP_LINE_PATTERNS = [
  /opening balance/i, /closing balance/i, /available credit/i, /credit limit/i,
  /minimum payment/i, /payment due/i, /new balance/i, /previous balance/i,
  /statement period/i, /account number/i, /total fees/i, /total interest/i,
  /interest charged/i, /page \d+/i, /customer service/i, /www\./i, /www /i
] as const;
const CREDIT_HINTS = /payment|refund|deposit|payroll|salary|direct deposit|credit|reversal|cashback/i;
const DEBIT_HINTS = /purchase|withdrawal|debit|pos|card purchase|recurring/i;

function detectMimeType(file: File) {
  if (file.type) return file.type;
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) return "text/csv";
  if (lowerName.endsWith(".pdf")) return PDF_MIME_TYPE;
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function normalizeTextPreview(text: string, fallback: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 240) : fallback;
}

function toIsoDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function normalizeAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTitleCase(value: string) {
  return value.toLowerCase().split(" ").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function inferMerchant(description: string) {
  return toTitleCase(description.replace(/\s+/g, " ").replace(/\b\d{3,}\b/g, "").trim());
}

function inferCategory(description: string, providedCategory?: string) {
  const cleanedCategory = providedCategory?.trim();
  if (cleanedCategory) return cleanedCategory;
  const normalized = description.toLowerCase();
  if (/payroll|salary|direct deposit|refund|income/.test(normalized)) return "Income";
  if (/rent|mortgage|landlord|property/.test(normalized)) return "Housing";
  if (/uber|lyft|shell|esso|chevron|gas|fuel|transit|metro/.test(normalized)) return "Transportation";
  if (/spotify|netflix|prime|subscription|google one|apple\.com\/bill/.test(normalized)) return "Subscriptions";
  if (/restaurant|cafe|coffee|doordash|ubereats|food|grocer|market/.test(normalized)) return "Food";
  if (/phone|hydro|utility|internet|electric/.test(normalized)) return "Utilities";
  if (/pharmacy|clinic|health|dental|wellness/.test(normalized)) return "Health";
  if (/travel|airbnb|hotel|airlines|flight/.test(normalized)) return "Travel";
  if (/credit card|loan|interest|debt/.test(normalized)) return "Debt";
  if (/amazon|shop|store|retail/.test(normalized)) return "Shopping";
  return "General";
}

function findYearInText(text: string) {
  const match = text.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function normalizeDateWithFallback(value: string, fallbackYear: number) {
  const exact = toIsoDate(value);
  if (exact) {
    if (/^\d{1,2}[/-]\d{1,2}$/.test(value.trim())) return `${fallbackYear}-${exact.slice(5)}`;
    return exact;
  }
  const monthNameMatch = value.match(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\s+(\d{1,2})(?:,\s*(\d{2,4}))?\b/i);
  if (!monthNameMatch) return null;
  const rawYear = monthNameMatch[3] ? (monthNameMatch[3].length === 2 ? `20${monthNameMatch[3]}` : monthNameMatch[3]) : String(fallbackYear);
  return toIsoDate(`${monthNameMatch[1]} ${monthNameMatch[2]}, ${rawYear}`);
}

function cleanDescription(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s\-:|]+/, "").replace(/[\s\-:|]+$/, "").trim();
}

function extractAmountFromLine(line: string) {
  const matches = [...line.matchAll(AMOUNT_PATTERN)];
  if (matches.length === 0) return null;
  const preferredMatch =
    [...matches].reverse().find((m) => line.slice((m.index ?? 0) + m[0].length).trim().length <= 14) ??
    matches[matches.length - 1];
  const token = preferredMatch[0];
  const qualifier = preferredMatch[1]?.toUpperCase();
  const cleaned = token.replace(/\s?(CR|DR)$/i, "").trim();
  const numeric = cleaned.replace(/[$,()\s]/g, "").replace(/^-/, "");
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  const tokenHasNegativeMarker = cleaned.includes("(") || cleaned.includes(")") || cleaned.includes("-");
  if (tokenHasNegativeMarker || qualifier === "DR") return { amount: -Math.abs(parsed), token, index: preferredMatch.index ?? 0 };
  if (qualifier === "CR" || CREDIT_HINTS.test(line)) return { amount: Math.abs(parsed), token, index: preferredMatch.index ?? 0 };
  return { amount: DEBIT_HINTS.test(line) ? -Math.abs(parsed) : -Math.abs(parsed), token, index: preferredMatch.index ?? 0 };
}

function lineLooksSkippable(line: string) {
  return line.length < 8 || SKIP_LINE_PATTERNS.some((p) => p.test(line)) || /^[\d\s./-]+$/.test(line) || !/[a-z]/i.test(line);
}

export function extractTransactionsFromText(text: string) {
  const fallbackYear = findYearInText(text);
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, " ").trim()).filter(Boolean);
  const transactions: ParsedTransaction[] = [];
  const seenKeys = new Set<string>();

  for (const line of lines) {
    if (lineLooksSkippable(line)) continue;
    const dateMatch = line.match(DATE_PATTERN);
    if (!dateMatch) continue;
    const normalizedDate = normalizeDateWithFallback(dateMatch[0], fallbackYear);
    if (!normalizedDate) continue;
    const amountMatch = extractAmountFromLine(line);
    if (!amountMatch) continue;
    const beforeAmount = line.slice(0, amountMatch.index).trim();
    const description = cleanDescription(beforeAmount.replace(dateMatch[0], " "));
    if (!description || description.length < 3 || !/[a-z]/i.test(description)) continue;
    if (/balance|payment due|credit limit|available credit/i.test(description)) continue;
    const merchant = inferMerchant(description);
    const direction = amountMatch.amount > 0 ? "income" : "expense";
    const category = direction === "income" ? "Income" : inferCategory(description);
    const candidate = {
      transactionDate: normalizedDate, description, merchant, category,
      amountCents: Math.round(amountMatch.amount * 100), direction,
      rawAmount: amountMatch.amount, needsReview: false, confidence: "high" as const,
      classificationNote: "Local text extraction"
    } satisfies ParsedTransaction;
    const dedupeKey = `${candidate.transactionDate}|${candidate.description}|${candidate.amountCents}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    transactions.push(candidate);
  }

  return transactions;
}

function normalizeTransactionCandidate(candidate: AnthropicTransactionCandidate) {
  const transactionDate = toIsoDate(candidate.transactionDate);
  const amount = normalizeAmount(candidate.rawAmount);
  const description = String(candidate.description ?? "").trim();
  if (!transactionDate || !description || amount === null || amount === 0) return null;
  const merchant = String(candidate.merchant ?? "").trim() || inferMerchant(description);
  const direction = amount > 0 ? "income" : "expense";
  const category = direction === "income" ? "Income" : inferCategory(description, String(candidate.category ?? ""));
  const needsReview = Boolean((candidate as { needsReview?: boolean }).needsReview);
  const confidence: "high" | "medium" | "low" = needsReview ? "low" : "high";
  return { transactionDate, description, merchant, category, amountCents: Math.round(amount * 100), direction, rawAmount: amount, needsReview, confidence, classificationNote: needsReview ? "Flagged by Claude as ambiguous" : "Claude extraction" } satisfies ParsedTransaction;
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseAnthropicExtraction(text: string): DocumentAnalysis {
  const cleaned = stripCodeFence(text);
  const payload = JSON.parse(cleaned) as AnthropicExtractionPayload;
  const normalizedTransactions = (payload.transactions ?? [])
    .map((c) => normalizeTransactionCandidate(c))
    .filter((c): c is NonNullable<ReturnType<typeof normalizeTransactionCandidate>> => c !== null);
  return {
    documentKind: String(payload.documentKind ?? "statement").trim() || "statement",
    summary: String(payload.summary ?? "").trim(),
    extractedText: String(payload.extractedText ?? "").trim(),
    notes: Array.isArray(payload.notes) ? payload.notes.map((n) => String(n).trim()).filter(Boolean) : [],
    transactions: normalizedTransactions,
    analysisProvider: "anthropic",
    extractionStatus: normalizedTransactions.length > 0 ? "transactions-imported" : "archived-only"
  };
}

async function extractPdfTextLocally(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function getImageOcrWorker() {
  const globalForWorker = globalThis as typeof globalThis & {
    __financeImageOcrWorkerPromise?: Promise<Awaited<ReturnType<typeof createWorker>>>;
  };
  if (!globalForWorker.__financeImageOcrWorkerPromise) {
    globalForWorker.__financeImageOcrWorkerPromise = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
      return worker;
    })();
  }
  return globalForWorker.__financeImageOcrWorkerPromise;
}

async function extractImageTextLocally(buffer: Buffer) {
  const worker = await getImageOcrWorker();
  const result = await worker.recognize(buffer);
  return result.data.text ?? "";
}

async function analyzeDocumentLocally(input: { filename: string; mimeType: string; buffer: Buffer }): Promise<DocumentAnalysis> {
  const extractedText =
    input.mimeType === PDF_MIME_TYPE
      ? await extractPdfTextLocally(input.buffer)
      : await extractImageTextLocally(input.buffer);
  const normalizedText = extractedText.replace(/\u0000/g, "").trim();
  const transactions = extractTransactionsFromText(normalizedText);
  const documentKind = input.mimeType === PDF_MIME_TYPE ? "statement_pdf" : "statement_image";
  const provider = input.mimeType === PDF_MIME_TYPE ? "pdf-parse" : "tesseract";

  if (!normalizedText) {
    return {
      documentKind, summary: "The file was processed locally, but no readable text was extracted.",
      extractedText: "", notes: [input.mimeType === PDF_MIME_TYPE ? "PDF text extraction returned no readable content." : "Local OCR returned no readable content."],
      transactions: [], analysisProvider: provider, extractionStatus: "archived-only"
    };
  }

  return {
    documentKind,
    summary: transactions.length > 0
      ? `Local analysis extracted ${transactions.length} transaction candidate${transactions.length === 1 ? "" : "s"}.`
      : "Local analysis extracted text but did not find reliable transaction rows.",
    extractedText: normalizedText,
    notes: [input.mimeType === PDF_MIME_TYPE ? "PDF text was extracted locally with pdf-parse." : "Image text was OCRed locally with Tesseract.js."],
    transactions, analysisProvider: provider,
    extractionStatus: transactions.length > 0 ? "transactions-imported" : "archived-only"
  };
}

async function analyzeDocumentWithAnthropic(input: { filename: string; mimeType: string; buffer: Buffer }): Promise<DocumentAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key is not configured.");
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const base64Data = input.buffer.toString("base64");
  const documentBlock =
    input.mimeType === PDF_MIME_TYPE
      ? ({ type: "document", source: { type: "base64", media_type: PDF_MIME_TYPE as "application/pdf", data: base64Data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: input.mimeType as "image/png" | "image/jpeg" | "image/webp", data: base64Data } } as const);

  const response = await client.messages.create({
    model, max_tokens: 2000,
    system: `You are a financial document parser. Return strict JSON only — no markdown, no code fences.
Keys required: documentKind, summary, extractedText, notes, transactions, detectedDocumentType.
detectedDocumentType must be one of: "credit_card", "bank", "payroll", "investment", "unknown".
CRITICAL classification rules:
- On CREDIT CARD statements: positive amounts are CHARGES (expenses). Lines like "Payment Received - Thank You" or "Minimum Payment" are bill payments by the cardholder — classify as expense with category "Debt". Negative amounts may be refunds (income) — flag as uncertain.
- On BANK statements: positive credits are income/deposits. Negative debits are expenses. "E-transfer sent" = expense. "Interac e-transfer received" = income unless description suggests a bill payment.
- "Payment Received" from a telecom/utility = expense (they received your payment, not you receiving money).
- If a transaction direction is genuinely ambiguous, set needsReview: true on that transaction object.
transactions array: each item must have transactionDate (YYYY-MM-DD), description, merchant, category, rawAmount (negative for expenses, positive for income), needsReview (boolean).
Omit balance rows, totals, headers, and running balance lines.`,
    messages: [{
      role: "user",
      content: [
        documentBlock,
        { type: "text", text: `Read this uploaded financial file named "${input.filename}". First determine if this is a credit card statement, bank statement, payroll document, or investment statement — this is critical for correct transaction classification. Extract every transaction row with correct income/expense direction. Return JSON only.` }
      ]
    }]
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!responseText) throw new Error("Anthropic returned an empty document analysis.");
  return parseAnthropicExtraction(responseText);
}

async function saveHistoricalDocument(input: {
  filename: string; mimeType: string; documentKind: string; source: string;
  extractionStatus: string; analysisProvider: string; transactionRowsInserted: number;
  extractedText: string; summary: string; notes: string[];
}) {
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO ingestion_documents (
      filename, mime_type, document_kind, source, extraction_status,
      analysis_provider, transaction_rows_inserted, extracted_text,
      summary, notes, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.filename, input.mimeType, input.documentKind, input.source,
      input.extractionStatus, input.analysisProvider, input.transactionRowsInserted,
      input.extractedText, input.summary, input.notes.join(" | "), new Date().toISOString()
    ]
  });
}

export function getAiConnectionStatus(): AiConnectionStatus {
  const provider = process.env.FINANCE_AI_PROVIDER ?? "local";
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const liveAnalysisEnabled = provider !== "local" && anthropicConfigured;
  return { provider, model, anthropicConfigured, liveAnalysisEnabled };
}

export async function deleteDocument(id: number): Promise<{ deleted: boolean; transactionsRemoved: number }> {
  const db = await ensureDb();

  const docRows = (await db.execute({
    sql: "SELECT filename FROM ingestion_documents WHERE id = ?",
    args: [id]
  })).rows as unknown as Array<{ filename: string }>;

  if (docRows.length === 0) return { deleted: false, transactionsRemoved: 0 };
  const filename = docRows[0].filename;

  const matchingImports = (await db.execute({
    sql: "SELECT id FROM imports WHERE filename = ?",
    args: [filename]
  })).rows as unknown as Array<{ id: number }>;

  let transactionsRemoved = 0;

  for (const imp of matchingImports) {
    const result = await db.execute({
      sql: "DELETE FROM transactions WHERE import_id = ?",
      args: [Number(imp.id)]
    });
    transactionsRemoved += result.rowsAffected;
    await db.execute({ sql: "DELETE FROM imports WHERE id = ?", args: [Number(imp.id)] });
  }

  await db.execute({ sql: "DELETE FROM ingestion_documents WHERE id = ?", args: [id] });

  return { deleted: true, transactionsRemoved };
}

export async function getHistoricalDocuments(limit = 8): Promise<HistoricalDocument[]> {
  const db = await ensureDb();
  return (await db.execute({
    sql: `SELECT
      id, filename, mime_type AS mimeType, document_kind AS documentKind,
      source, extraction_status AS extractionStatus,
      analysis_provider AS analysisProvider,
      transaction_rows_inserted AS transactionRowsInserted,
      summary, notes, imported_at AS importedAt
    FROM ingestion_documents
    ORDER BY imported_at DESC
    LIMIT ?`,
    args: [limit]
  })).rows as unknown as HistoricalDocument[];
}

export async function ingestUploadedDocument(file: File, member = "joint"): Promise<UploadedDocumentResult> {
  const mimeType = detectMimeType(file);

  if (mimeType === "text/csv" || file.name.toLowerCase().endsWith(".csv")) {
    const csvText = await file.text();
    const records = await parseTransactionsCsv(csvText);
    if (records.length === 0) throw new Error("No transaction rows were detected in that CSV.");
    const result = await saveImportedTransactions(file.name, records, "csv", member);
    await saveHistoricalDocument({
      filename: file.name, mimeType: "text/csv", documentKind: "transaction_csv", source: "csv",
      extractionStatus: "transactions-imported", analysisProvider: "local",
      transactionRowsInserted: result.rowsInserted, extractedText: csvText,
      summary: `CSV import completed with ${result.rowsInserted} transaction rows.`, notes: []
    });
    return { filename: file.name, mimeType: "text/csv", mode: "transactions-imported", rowsInserted: result.rowsInserted, summary: `Imported ${result.rowsInserted} rows from CSV.`, extractionStatus: "transactions-imported" };
  }

  if (mimeType !== PDF_MIME_TYPE && !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Supported upload types are CSV, PDF, PNG, JPG, and WEBP.");
  }

  const aiStatus = getAiConnectionStatus();
  const buffer = Buffer.from(await file.arrayBuffer());
  const defaultKind = mimeType === PDF_MIME_TYPE ? "pdf_document" : "image_document";
  let analysis: DocumentAnalysis;
  let source = mimeType === PDF_MIME_TYPE ? "pdf-upload" : "image-upload";

  if (aiStatus.liveAnalysisEnabled) {
    try {
      analysis = await analyzeDocumentWithAnthropic({ filename: file.name, mimeType, buffer });
      source = mimeType === PDF_MIME_TYPE ? "anthropic-pdf" : "anthropic-image";
    } catch (anthropicError) {
      const errorMessage = anthropicError instanceof Error ? anthropicError.message : "Anthropic document analysis failed.";
      try {
        analysis = await analyzeDocumentLocally({ filename: file.name, mimeType, buffer });
        analysis.notes.unshift(`Anthropic analysis failed (${errorMessage}), fell back to local extraction.`);
      } catch {
        await saveHistoricalDocument({ filename: file.name, mimeType, documentKind: defaultKind, source: "failed", extractionStatus: "archived-only", analysisProvider: "failed", transactionRowsInserted: 0, extractedText: "", summary: "Both Anthropic and local analysis failed. File archived without extraction.", notes: [errorMessage] });
        return { filename: file.name, mimeType, mode: "archived-only", rowsInserted: 0, summary: "Both Anthropic and local analysis failed. File archived historically.", extractionStatus: "archived-only" };
      }
    }
  } else {
    try {
      analysis = await analyzeDocumentLocally({ filename: file.name, mimeType, buffer });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local document analysis failed.";
      await saveHistoricalDocument({ filename: file.name, mimeType, documentKind: defaultKind, source, extractionStatus: "archived-only", analysisProvider: "local-failed", transactionRowsInserted: 0, extractedText: "", summary: "Document archived historically, but local analysis could not extract text.", notes: [message, "Add ANTHROPIC_API_KEY and FINANCE_AI_PROVIDER=anthropic to activate Claude analysis."] });
      return { filename: file.name, mimeType, mode: "archived-only", rowsInserted: 0, summary: "Archived historically — local analysis could not extract text from this file.", extractionStatus: "archived-only" };
    }
  }

  let rowsInserted = 0;
  let mode: UploadedDocumentResult["mode"] = "archived-only";
  let extractionStatus = "archived-only";

  if (analysis.transactions.length > 0) {
    const result = await saveImportedTransactions(file.name, analysis.transactions, source, member);
    rowsInserted = result.rowsInserted;
    mode = "transactions-imported";
    extractionStatus = "transactions-imported";
  }

  const providerLabel = analysis.analysisProvider === "anthropic" ? "Claude" : analysis.analysisProvider === "pdf-parse" ? "Local PDF parser" : "Local OCR";
  const summary = analysis.summary || (rowsInserted > 0 ? `${providerLabel} extracted ${rowsInserted} transaction rows from the uploaded document.` : `${providerLabel} reviewed the document and archived it historically, but did not find reliable transaction rows.`);

  await saveHistoricalDocument({ filename: file.name, mimeType, documentKind: analysis.documentKind || defaultKind, source, extractionStatus, analysisProvider: analysis.analysisProvider, transactionRowsInserted: rowsInserted, extractedText: analysis.extractedText, summary: normalizeTextPreview(summary, "Document processed."), notes: analysis.notes });

  return { filename: file.name, mimeType, mode, rowsInserted, summary: normalizeTextPreview(summary, "Document processed."), extractionStatus };
}
