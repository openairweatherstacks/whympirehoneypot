"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PerkIntake() {
  const router = useRouter();
  const [provider, setProvider] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [activeAction, setActiveAction] = useState<"scan" | "demo" | null>(null);
  const [message, setMessage] = useState(
    "Paste benefit guide text from a credit card agreement, membership brochure, or subscription terms."
  );
  const [isPending, startTransition] = useTransition();
  const isBusy = activeAction !== null || isPending;

  async function handleScan() {
    if (!provider.trim() || !title.trim() || !content.trim()) {
      setMessage("Add a provider, document title, and agreement text before scanning.");
      return;
    }

    setActiveAction("scan");

    try {
      const response = await fetch("/api/perks/import", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          provider,
          title,
          content
        })
      });
      const payload = (await response.json()) as {
        benefitsDetected?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Perk scan failed.");
        return;
      }

      setProvider("");
      setTitle("");
      setContent("");
      setMessage(`Agreement scanned. Detected ${payload.benefitsDetected ?? 0} perk signatures.`);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleLoadDemoGuides() {
    setActiveAction("demo");

    try {
      const response = await fetch("/api/perks/demo", {
        method: "POST"
      });
      const payload = (await response.json()) as {
        created?: boolean;
        documentsInserted?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not load sample benefit guides.");
        return;
      }

      setMessage(
        payload.created
          ? `Loaded ${payload.documentsInserted ?? 0} sample benefit guides.`
          : "Benefit guides already exist, so the sample set was left untouched."
      );
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[rgba(23,19,15,0.92)] p-6 text-white shadow-[0_24px_80px_rgba(23,19,15,0.16)]">
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/60">Perk Engine</p>
      <h2 className="mt-2 text-2xl">Scan benefit guides for hidden value</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
        This is the key differentiator layer: ingest agreement text locally, detect benefit language,
        and connect it to real spending patterns so the app can flag perks you may be leaving unused.
      </p>

      <div className="mt-6 grid gap-4">
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => setProvider(event.target.value)}
          placeholder="Provider or product name"
          value={provider}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Document title"
          value={title}
        />
        <textarea
          className="min-h-44 rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => setContent(event.target.value)}
          placeholder="Paste agreement text here. Example: Earn 4x on dining, $15 monthly streaming credit, cell phone protection when the wireless bill is paid with the card..."
          value={content}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={handleScan}
          type="button"
        >
          {activeAction === "scan" ? "Scanning..." : isPending ? "Refreshing..." : "Scan agreement"}
        </button>
        <button
          className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={handleLoadDemoGuides}
          type="button"
        >
          {activeAction === "demo" ? "Loading guides..." : "Load sample benefit guides"}
        </button>
      </div>

      <div className="mt-5 rounded-[1.4rem] bg-white/6 p-4 text-sm text-white/72">{message}</div>
    </section>
  );
}

