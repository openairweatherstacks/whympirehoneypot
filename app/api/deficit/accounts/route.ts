import { saveDebtAccount } from "@/lib/deficit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      debtType?: string;
      balance?: number;
      apr?: number;
      minimumPayment?: number;
      targetPayment?: number;
      creditLimit?: number;
    };

    const result = await saveDebtAccount({
      name: String(body.name ?? ""),
      debtType: String(body.debtType ?? ""),
      balance: Number(body.balance ?? 0),
      apr: Number(body.apr ?? 0),
      minimumPayment: Number(body.minimumPayment ?? 0),
      targetPayment: Number(body.targetPayment ?? 0),
      creditLimit: Number(body.creditLimit ?? 0)
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save debt account";
    return Response.json({ error: message }, { status: 400 });
  }
}
