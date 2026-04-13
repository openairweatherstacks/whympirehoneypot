import { deleteDocument } from "@/lib/documents";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid id." }, { status: 400 });
    }

    const result = deleteDocument(numId);
    if (!result.deleted) {
      return Response.json({ error: "Document not found." }, { status: 404 });
    }

    return Response.json({
      deleted: true,
      transactionsRemoved: result.transactionsRemoved
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 500 }
    );
  }
}
