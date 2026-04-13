import { deleteRecurringExpense, updateRecurringExpense } from "@/lib/recurring";
import type { Frequency } from "@/lib/recurring";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid id." }, { status: 400 });
    }
    const deleted = await deleteRecurringExpense(numId);
    if (!deleted) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid id." }, { status: 400 });
    }

    const body = (await request.json()) as {
      name?: string;
      category?: string;
      amount?: number;
      frequency?: Frequency;
    };

    const updated = await updateRecurringExpense(numId, body);
    if (!updated) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ expense: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
