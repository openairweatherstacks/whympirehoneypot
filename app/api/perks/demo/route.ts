import { seedDemoPerkDocuments } from "@/lib/perks";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await seedDemoPerkDocuments();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load sample benefit guides";
    return Response.json({ error: message }, { status: 500 });
  }
}

