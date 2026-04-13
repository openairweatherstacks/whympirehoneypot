import { addRecurringExpense, getRecurringExpenses } from "@/lib/recurring";
import type { Frequency } from "@/lib/recurring";

export const runtime = "nodejs";

export async function GET() {
  try {
    const expenses = await getRecurringExpenses();
    return Response.json({ expenses });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      merchant?: string;
      category?: string;
      amount?: number;
      frequency?: Frequency;
      source?: "manual" | "auto";
      member?: string;
    };

    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "").trim();
    const amount = Number(body.amount ?? 0);
    const frequency = (body.frequency ?? "monthly") as Frequency;

    if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
    if (!category) return Response.json({ error: "Category is required." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Amount must be a positive number." }, { status: 400 });

    const expense = await addRecurringExpense({
      name,
      merchant: body.merchant,
      category,
      amount,
      frequency,
      source: body.source ?? "manual",
      member: typeof body.member === "string" ? body.member : "joint"
    });

    return Response.json({ expense });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
