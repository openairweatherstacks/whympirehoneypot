"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PriceRefreshButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const isBusy = status === "loading" || isPending;

  async function handleRefresh() {
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/investing/refresh-prices", { method: "POST" });
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        updated?: string[];
        failed?: Array<{ symbol: string; error: string }>;
      };

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "Price refresh failed.");
        return;
      }

      setStatus("done");
      setMessage(payload.message ?? "Prices updated.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setStatus("error");
      setMessage("Network error — check connection and try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isBusy}
        onClick={handleRefresh}
        type="button"
      >
        {status === "loading" || isPending ? "Refreshing..." : "Refresh prices"}
      </button>

      {message ? (
        <p
          className={`text-right text-[11px] leading-5 ${
            status === "error" ? "text-[var(--heat)]" : "text-[var(--muted)]"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
