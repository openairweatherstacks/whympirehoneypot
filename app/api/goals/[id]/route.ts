import { deleteSavingsGoal, saveSavingsGoal, updateGoalProgress } from "@/lib/goals";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid id." }, { status: 400 });
    }

    const body = (await request.json()) as {
      currentAmount?: number;
      name?: string;
      targetAmount?: number;
      targetDate?: string | null;
      emoji?: string;
      member?: string;
    };

    // Progress-only update (just saving current amount)
    if (body.currentAmount !== undefined && Object.keys(body).length === 1) {
      const goal = await updateGoalProgress(numId, Number(body.currentAmount));
      if (!goal) return Response.json({ error: "Not found." }, { status: 404 });
      return Response.json({ goal });
    }

    // Full update — re-save with new values
    const goal = await saveSavingsGoal({
      name: String(body.name ?? "").trim(),
      targetAmount: Number(body.targetAmount ?? 0),
      currentAmount: body.currentAmount !== undefined ? Number(body.currentAmount) : undefined,
      targetDate: body.targetDate ?? null,
      emoji: body.emoji,
      member: body.member,
    });

    return Response.json({ goal });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid id." }, { status: 400 });
    }
    const deleted = await deleteSavingsGoal(numId);
    if (!deleted) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
