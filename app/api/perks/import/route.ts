import { savePerkDocument } from "@/lib/perks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: string;
      title?: string;
      content?: string;
      documentType?: string;
    };

    const result = savePerkDocument({
      provider: String(body.provider ?? ""),
      title: String(body.title ?? ""),
      content: String(body.content ?? ""),
      documentType: typeof body.documentType === "string" ? body.documentType : undefined
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Perk import failed";
    return Response.json({ error: message }, { status: 400 });
  }
}

