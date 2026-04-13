import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_SUGGESTIONS,
  getFinanceBrain,
  getLocalAnswer,
  summarizeContext,
  type ChatMessage
} from "@/lib/intelligence";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You are a careful financial copilot inside a local-first finance dashboard. Use only the supplied local finance context — do not invent transactions, dates, or balances. Keep answers concise, practical, and action-oriented. If the user asks about affordability or risk, speak cautiously and note this is not professional financial advice.";

function sseChunk(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  let question = "";
  let messages: ChatMessage[] = [];

  try {
    const body = (await request.json()) as {
      question?: string;
      messages?: Array<{ role?: string; content?: string }>;
    };

    question = String(body.question ?? "").trim();
    if (!question) {
      return Response.json({ error: "A question is required." }, { status: 400 });
    }

    messages = Array.isArray(body.messages)
      ? body.messages
          .filter(
            (m): m is { role: "user" | "assistant"; content: string } =>
              (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
          )
          .map((m) => ({ role: m.role, content: m.content }))
      : [];
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(sseChunk(data)));
      };

      try {
        // ── 1. Try local domain answerers (debt / investing / perks / fallback) ──
        const localAnswer = getLocalAnswer(question);

        if (localAnswer) {
          send({
            done: true,
            answer: localAnswer.answer,
            source: "local",
            suggestions: localAnswer.suggestions
          });
          controller.close();
          return;
        }

        // ── 2. Stream from Anthropic with prompt caching ──────────────────────
        const apiKey = process.env.ANTHROPIC_API_KEY!;
        const model = process.env.ANTHROPIC_CHAT_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
        const client = new Anthropic({ apiKey });

        const brain = getFinanceBrain();
        const context = summarizeContext(brain);

        // Build the conversation — keep last 6 turns
        const conversationTurns = messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content
        }));

        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 400,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" }
            }
          ],
          messages: [
            // Cached financial context as the first user turn
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Local finance context (use this data to answer all questions): ${context}`,
                  cache_control: { type: "ephemeral" }
                }
              ]
            },
            // Placeholder assistant ack so conversation history parses cleanly
            {
              role: "assistant",
              content: "Understood. I have your financial context loaded. What would you like to know?"
            },
            // Prior conversation history
            ...conversationTurns,
            // Current question
            {
              role: "user",
              content: question
            }
          ]
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta" &&
            event.delta.text
          ) {
            send({ delta: event.delta.text });
          }
        }

        send({ done: true, source: "anthropic", suggestions: DEFAULT_SUGGESTIONS });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chat request failed.";
        send({ error: message });
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
