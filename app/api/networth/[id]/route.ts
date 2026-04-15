import { deleteNetWorthAccount, updateAccountBalance } from "@/lib/networth";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid id." }, { status: 400 });
    }
    const body = (await request.json()) as { balance?: number };
    const account = await updateAccountBalance(numId, Number(body.balance ?? 0));
    if (!account) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ account });
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
    const deleted = await deleteNetWorthAccount(numId);
    if (!deleted) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
