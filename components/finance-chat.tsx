"use client";

import { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  source?: "local" | "anthropic";
  streaming?: boolean;
};

type FinanceChatProps = {
  suggestions: string[];
};

export function FinanceChat({ suggestions }: FinanceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ask about overspending, category totals, debt payoff order, hidden perks, ETF allocations, or whether a new payment fits your cash flow. I'll answer from your local data first.",
      source: "local"
    }
  ]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const suggestionPool = suggestions.slice(0, 4);

  async function sendMessage(rawPrompt?: string) {
    const prompt = (rawPrompt ?? draft).trim();
    if (!prompt || isSending) return;

    const userMessage: ChatMessage = { role: "user", content: prompt };
    const conversation = [...messages, userMessage].map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setIsSending(true);

    // Add a streaming placeholder for the assistant reply
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", source: "local", streaming: true }
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: prompt, messages: conversation })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(part.slice(6)) as {
              delta?: string;
              done?: boolean;
              answer?: string;
              source?: "local" | "anthropic";
              error?: string;
              suggestions?: string[];
            };

            if (data.delta) {
              // Streaming token — append to the last message
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                last.content += data.delta!;
                last.source = "anthropic";
                last.streaming = true;
                updated[updated.length - 1] = last;
                return updated;
              });
            } else if (data.done) {
              // Final event — seal the message
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                if (data.answer) last.content = data.answer;
                if (data.source) last.source = data.source;
                last.streaming = false;
                updated[updated.length - 1] = last;
                return updated;
              });
            } else if (data.error) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: `Something went wrong: ${data.error}`,
                  source: "local",
                  streaming: false
                };
                return updated;
              });
            }
          } catch {
            // Ignore malformed SSE event
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content:
            "The chat request failed before I could finish. Try again — the rest of the dashboard is still intact.",
          source: "local",
          streaming: false
        };
        return updated;
      });
    } finally {
      // Ensure streaming flag is cleared
      setMessages((prev) => {
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        last.streaming = false;
        updated[updated.length - 1] = last;
        return updated;
      });
      setIsSending(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[rgba(23,19,15,0.92)] p-6 text-white shadow-[0_24px_80px_rgba(23,19,15,0.16)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/60">Finance Chat</p>
          <h2 className="mt-2 text-2xl">Ask your money questions in plain English</h2>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
          Local-first by default
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {suggestionPool.map((suggestion) => (
          <button
            key={suggestion}
            className="rounded-full border border-white/14 bg-white/6 px-3 py-2 text-sm text-white/82 transition hover:bg-white/12"
            onClick={() => void sendMessage(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4 rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-[1.4rem] px-4 py-3 ${
              message.role === "assistant"
                ? "bg-white/8 text-white"
                : "ml-auto max-w-[85%] bg-white text-[var(--ink)]"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
                {message.role === "assistant" ? "Copilot" : "You"}
              </p>
              {message.source ? (
                <span className="text-[11px] uppercase tracking-[0.16em] opacity-55">
                  {message.source === "anthropic" ? "Claude" : "Local reasoning"}
                </span>
              ) : null}
            </div>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {message.content || (message.streaming ? "" : "")}
              {message.streaming ? (
                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-white/60 align-middle" />
              ) : null}
            </p>

            {!message.content && message.streaming ? (
              <p className="text-sm text-white/40">Thinking through your ledger...</p>
            ) : null}
          </div>
        ))}
      </div>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Try: Which debt should I pay first?"
          value={draft}
        />
        <button
          className="rounded-[1.3rem] bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSending || !draft.trim()}
          type="submit"
        >
          {isSending ? "Thinking..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
