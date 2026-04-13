import { ingestUploadedDocument } from "@/lib/documents";
import { isMember } from "@/lib/members";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = [
      ...formData.getAll("files"),
      ...formData.getAll("file")
    ].filter((entry): entry is File => entry instanceof File);

    const rawMember = formData.get("member");
    const member = isMember(rawMember) ? rawMember : "joint";

    if (files.length === 0) {
      return Response.json({ error: "No upload files received." }, { status: 400 });
    }

    const imports: Array<{
      filename: string;
      rowsInserted: number;
      summary: string;
      mode: string;
      extractionStatus: string;
    }> = [];
    const failures: Array<{
      filename: string;
      error: string;
    }> = [];

    for (const file of files) {
      try {
        const result = await ingestUploadedDocument(file, member);
        imports.push({
          filename: file.name,
          rowsInserted: result.rowsInserted,
          summary: result.summary,
          mode: result.mode,
          extractionStatus: result.extractionStatus
        });
      } catch (error) {
        failures.push({
          filename: file.name,
          error: error instanceof Error ? error.message : "Import failed"
        });
      }
    }

    const rowsInserted = imports.reduce((total, item) => total + item.rowsInserted, 0);

    if (imports.length === 0) {
      return Response.json(
        {
          error:
            failures[0]?.error ??
            "Bulk import failed. Check the file types and contents, then try again.",
          imports,
          failures,
          filesProcessed: files.length,
          filesImported: 0,
          rowsInserted: 0
        },
        { status: 400 }
      );
    }

    return Response.json({
      imports,
      failures,
      filesProcessed: files.length,
      filesImported: imports.length,
      filesArchivedOnly: imports.filter((item) => item.mode === "archived-only").length,
      rowsInserted
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
