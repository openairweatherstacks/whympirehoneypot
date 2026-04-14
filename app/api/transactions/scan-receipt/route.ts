import Anthropic from "@anthropic-ai/sdk";
import { detectDocumentType } from "@/lib/classification";
import { extractTransactionsFromText } from "@/lib/documents";
type PDFParseType = { getText(): Promise<{ text: string }>; destroy(): Promise<void> };
type PDFParseConstructor = new (options: { data: Buffer }) => PDFParseType;

export const runtime = "nodejs";

type ScanResult = {
  transactionDate: string | null;
  description: string | null;
  merchant: string | null;
  category: string | null;
  rawAmount: number | null;
  direction: "income" | "expense" | null;
  confidence: "high" | "medium" | "low";
  note: string;
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const PDF_MIME = "application/pdf";

function detectMime(file: File) {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".csv")) return "text/csv";
  if (n.endsWith(".pdf")) return PDF_MIME;
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function scanWithClaude(file: File, mimeType: string, buffer: Buffer): Promise<ScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey });
  const base64 = buffer.toString("base64");

  const documentBlock =
    mimeType === PDF_MIME
      ? ({
          type: "document",
          source: { type: "base64", media_type: PDF_MIME as "application/pdf", data: base64 }
        } as const)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/png" | "image/jpeg" | "image/webp",
            data: base64
          }
        } as const);

  const response = await client.messages.create({
    model,
    max_tokens: 400,
    system:
      "You are a receipt scanner. Return strict JSON only — no markdown, no code fences. " +
      "Keys: transactionDate (YYYY-MM-DD or null), description (merchant name / item), merchant, " +
      "category (one of: Food, Housing, Transportation, Subscriptions, Utilities, Health, Travel, Debt, Shopping, Income, General), " +
      "rawAmount (positive number, no sign), direction (\"expense\" or \"income\"). " +
      "If any field cannot be determined, set it to null.",
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: `Scan this receipt or financial document named "${file.name}". Extract the single transaction it represents. Return JSON only.`
          }
        ]
      }
    ]
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text.trim())
    .join("");

  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const payload = JSON.parse(cleaned) as Partial<ScanResult>;

  return {
    transactionDate: typeof payload.transactionDate === "string" ? payload.transactionDate : null,
    description: typeof payload.description === "string" ? payload.description : null,
    merchant: typeof payload.merchant === "string" ? payload.merchant : null,
    category: typeof payload.category === "string" ? payload.category : null,
    rawAmount: typeof payload.rawAmount === "number" ? payload.rawAmount : null,
    direction: payload.direction === "income" || payload.direction === "expense" ? payload.direction : "expense",
    confidence: "high",
    note: "Scanned by Claude"
  };
}

async function scanLocally(file: File, mimeType: string, buffer: Buffer): Promise<ScanResult> {
  let text = "";

  if (mimeType === PDF_MIME) {
    const { PDFParse } = await import("pdf-parse") as unknown as { PDFParse: PDFParseConstructor };
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text ?? "";
    } finally {
      await parser.destroy();
    }
  } else {
    // For images without Claude, we can't OCR without tesseract — return empty
    return {
      transactionDate: todayIso(),
      description: null,
      merchant: null,
      category: null,
      rawAmount: null,
      direction: "expense",
      confidence: "low",
      note: "Add an Anthropic API key to scan images automatically"
    };
  }

  const transactions = extractTransactionsFromText(text);
  const first = transactions[0];

  if (!first) {
    return {
      transactionDate: todayIso(),
      description: null,
      merchant: null,
      category: null,
      rawAmount: null,
      direction: "expense",
      confidence: "low",
      note: "Could not extract transaction from document — fill in manually"
    };
  }

  const docType = detectDocumentType(text);
  const direction = docType === "credit_card" ? "expense" : first.direction;

  return {
    transactionDate: first.transactionDate,
    description: first.description,
    merchant: first.merchant,
    category: first.category,
    rawAmount: Math.abs(first.rawAmount),
    direction,
    confidence: first.confidence,
    note: "Extracted locally from PDF"
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("receipt");

    if (!(file instanceof File)) {
      return Response.json({ error: "No receipt file provided." }, { status: 400 });
    }

    const mimeType = detectMime(file);
    if (mimeType !== PDF_MIME && !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      return Response.json({ error: "Only PDF, PNG, JPG, or WEBP receipts are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const provider = process.env.FINANCE_AI_PROVIDER ?? "local";
    const useAnthropic = Boolean(apiKey) && provider !== "local";

    const result = useAnthropic
      ? await scanWithClaude(file, mimeType, buffer)
      : await scanLocally(file, mimeType, buffer);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt scan failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
