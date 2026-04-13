import { addRecurringExpense, detectRecurringFromTransactions } from "@/lib/recurring";

export const runtime = "nodejs";

export async function GET() {
  try {
    const candidates = await detectRecurringFromTransactions();
    return Response.json({ candidates });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      merchant?: string;
      category?: string;
      amount?: number;
    };

    const merchant = String(body.merchant ?? "").trim();
    const category = String(body.category ?? "").trim();
    const amount = Number(body.amount ?? 0);

    if (!merchant || !category || !amount) {
      return Response.json({ error: "merchant, category, and amount are required." }, { status: 400 });
    }

    const expense = await addRecurringExpense({
      name: merchant,
      merchant,
      category,
      amount: amount / 100, // comes in as cents
      frequency: "monthly",
      source: "auto"
    });

    return Response.json({ expense });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
