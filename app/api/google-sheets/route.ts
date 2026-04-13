import { ingestUploadedDocument } from "@/lib/documents";
import { isMember } from "@/lib/members";

export const runtime = "nodejs";

function sheetUrlToCsvUrl(url: string): string {
  // Handles formats:
  // https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=SHEET_GID
  // https://docs.google.com/spreadsheets/d/SHEET_ID/edit?gid=SHEET_GID
  // https://docs.google.com/spreadsheets/d/SHEET_ID/pub?output=csv
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Not a valid Google Sheets URL.");

  const spreadsheetId = match[1];
  const gidMatch = url.match(/[#?&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      member?: string;
    };

    const url = String(body.url ?? "").trim();
    if (!url) {
      return Response.json({ error: "A Google Sheets URL is required." }, { status: 400 });
    }

    const member = isMember(body.member) ? body.member : "joint";

    let csvUrl: string;
    try {
      csvUrl = sheetUrlToCsvUrl(url);
    } catch {
      return Response.json({ error: "Could not parse that URL as a Google Sheets link." }, { status: 400 });
    }

    // Fetch the CSV from Google
    let csvText: string;
    try {
      const response = await fetch(csvUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; finance-dashboard/1.0)" }
      });
      if (!response.ok) {
        return Response.json(
          { error: `Google returned ${response.status}. Make sure the sheet is shared as "Anyone with the link can view".` },
          { status: 400 }
        );
      }
      csvText = await response.text();
    } catch {
      return Response.json({ error: "Could not fetch the sheet. Check the URL and sharing settings." }, { status: 400 });
    }

    if (!csvText.trim()) {
      return Response.json({ error: "The sheet appears to be empty." }, { status: 400 });
    }

    // Create a File object and run through the normal ingestion pipeline
    const file = new File([csvText], "google-sheet.csv", { type: "text/csv" });
    const result = await ingestUploadedDocument(file, member);

    return Response.json({
      rowsInserted: result.rowsInserted,
      summary: result.summary,
      extractionStatus: result.extractionStatus
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
