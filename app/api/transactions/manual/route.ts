import { saveImportedTransactions } from "@/lib/finance";
import { isMember } from "@/lib/members";
import { CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";

const VALID_DIRECTIONS = new Set(["income", "expense"]);
const VALID_CATEGORIES = new Set<string>(CATEGORIES);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      transactionDate?: string;
      description?: string;
      merchant?: string;
      category?: string;
      rawAmount?: number;
      direction?: string;
      member?: string;
    };

    const transactionDate = String(body.transactionDate ?? "").trim();
    const description = String(body.description ?? "").trim();
    const merchant = String(body.merchant ?? description).trim();
    const category = VALID_CATEGORIES.has(body.category ?? "") ? (body.category as string) : "General";
    const direction = VALID_DIRECTIONS.has(body.direction ?? "") ? (body.direction as "income" | "expense") : "expense";
    const rawAmount = typeof body.rawAmount === "number" && Number.isFinite(body.rawAmount) ? body.rawAmount : null;
    const member = isMember(body.member) ? body.member : "joint";

    if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      return Response.json({ error: "A valid transaction date (YYYY-MM-DD) is required." }, { status: 400 });
    }
    if (!description) {
      return Response.json({ error: "A description is required." }, { status: 400 });
    }
    if (rawAmount === null || rawAmount <= 0) {
      return Response.json({ error: "A positive amount is required." }, { status: 400 });
    }

    const signedAmount = direction === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    const amountCents = Math.round(signedAmount * 100);

    const result = saveImportedTransactions(
      "manual-entry",
      [
        {
          transactionDate,
          description,
          merchant: merchant || description,
          category,
          amountCents,
          direction,
          rawAmount: signedAmount,
          needsReview: false,
          confidence: "high",
          classificationNote: "Manual entry"
        }
      ],
      "manual",
      member
    );

    return Response.json({ rowsInserted: result.rowsInserted, importId: result.importId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual entry failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
