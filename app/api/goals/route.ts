import { getSavingsGoals, saveSavingsGoal } from "@/lib/goals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const member = searchParams.get("member") ?? undefined;
    const goals = await getSavingsGoals(member);
    return Response.json({ goals });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      targetAmount?: number;
      currentAmount?: number;
      targetDate?: string | null;
      emoji?: string;
      member?: string;
    };

    const goal = await saveSavingsGoal({
      name: String(body.name ?? "").trim(),
      targetAmount: Number(body.targetAmount ?? 0),
      currentAmount: body.currentAmount !== undefined ? Number(body.currentAmount) : 0,
      targetDate: body.targetDate ?? null,
      emoji: body.emoji,
      member: body.member,
    });

    return Response.json({ goal });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 400 });
  }
}
