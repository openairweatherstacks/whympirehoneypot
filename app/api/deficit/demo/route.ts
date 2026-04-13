import { seedDemoDebtAccounts } from "@/lib/deficit";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = seedDemoDebtAccounts();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load sample debt accounts";
    return Response.json({ error: message }, { status: 500 });
  }
}
