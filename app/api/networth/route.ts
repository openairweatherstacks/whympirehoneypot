import { getNetWorthDashboard, recordNetWorthSnapshot, saveNetWorthAccount } from "@/lib/networth";
import type { AccountCategory, AccountType } from "@/lib/networth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const dashboard = await getNetWorthDashboard();
    return Response.json({ dashboard });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      name?: string;
      accountType?: AccountType;
      category?: AccountCategory;
      balance?: number;
      member?: string;
    };

    if (body.action === "snapshot") {
      const snapshot = await recordNetWorthSnapshot();
      return Response.json({ snapshot });
    }

    const account = await saveNetWorthAccount({
      name: String(body.name ?? "").trim(),
      accountType: body.accountType ?? "asset",
      category: body.category ?? "checking",
      balance: Number(body.balance ?? 0),
      member: body.member,
    });

    return Response.json({ account });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 400 });
  }
}
