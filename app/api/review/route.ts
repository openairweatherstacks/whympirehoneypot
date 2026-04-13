import {
  confirmTransactionClassification,
  correctTransactionClassification,
  getPendingReviews
} from "@/lib/classification";

export const runtime = "nodejs";

export async function GET() {
  try {
    const reviews = getPendingReviews();
    return Response.json({ reviews, count: reviews.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: number;
      action?: "confirm" | "correct";
      direction?: "income" | "expense";
      category?: string;
      saveRule?: boolean;
    };

    const id = Number(body.id ?? 0);
    if (!id || id <= 0) {
      return Response.json({ error: "Transaction id is required." }, { status: 400 });
    }

    if (body.action === "confirm") {
      confirmTransactionClassification(id);
      return Response.json({ ok: true });
    }

    if (body.action === "correct") {
      if (!body.direction || !body.category) {
        return Response.json({ error: "direction and category are required for corrections." }, { status: 400 });
      }
      correctTransactionClassification(id, {
        direction: body.direction,
        category: body.category,
        saveRule: body.saveRule ?? true
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "action must be 'confirm' or 'correct'." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
