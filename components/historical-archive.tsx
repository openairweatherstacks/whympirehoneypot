"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { HistoricalDocument } from "@/lib/documents";

type HistoricalArchiveProps = {
  documents: HistoricalDocument[];
};

const statusStyles: Record<string, string> = {
  "transactions-imported": "bg-[rgba(27,107,99,0.09)] text-[var(--brand)]",
  "archived-only": "bg-[rgba(23,19,15,0.08)] text-[var(--ink)]",
  "archived-awaiting-ai": "bg-[rgba(212,109,49,0.1)] text-[var(--heat)]"
};

export function HistoricalArchive({ documents: initial }: HistoricalArchiveProps) {
  const router = useRouter();
  const [docs, setDocs] = useState(initial);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    setDocs(initial);
  }, [initial]);
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();

  async function handleDelete(id: number, filename: string) {
    if (!window.confirm(`Remove "${filename}" and all its imported transactions? This cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    setMessage("");

    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { deleted?: boolean; transactionsRemoved?: number; error?: string };

      if (!res.ok) {
        setMessage(data.error ?? "Delete failed.");
        return;
      }

      setDocs((prev) => prev.filter((d) => d.id !== id));
      setMessage(`Removed — ${data.transactionsRemoved ?? 0} transaction${data.transactionsRemoved === 1 ? "" : "s"} deleted.`);
      startTransition(() => router.refresh());
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Historical Archive
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Every uploaded document</h2>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-white/60 px-3 py-1 text-xs text-[var(--muted)]">
          {docs.length} document{docs.length === 1 ? "" : "s"}
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-[1.2rem] border border-[var(--line)] bg-white/60 px-4 py-3 text-sm text-[var(--muted)]">
          {message}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm text-[var(--muted)]">
          No documents archived yet. CSV, PDF, and image uploads will appear here.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {docs.map((doc) => (
            <article
              key={doc.id}
              className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--ink)] truncate">{doc.filename}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {doc.documentKind} · {doc.mimeType} · {doc.source}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusStyles[doc.extractionStatus] ?? statusStyles["archived-only"]}`}>
                    {doc.extractionStatus.replace(/-/g, " ")}
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === doc.id}
                    onClick={() => handleDelete(doc.id, doc.filename)}
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--muted)] transition hover:border-red-300 hover:text-red-500 disabled:opacity-40"
                    title="Remove document and its transactions"
                  >
                    {deletingId === doc.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{doc.summary}</p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
                <span className="uppercase tracking-[0.16em]">{doc.transactionRowsInserted} rows</span>
                <span className="uppercase tracking-[0.16em]">{doc.analysisProvider}</span>
                <span>{new Date(doc.importedAt).toLocaleString()}</span>
              </div>

              {doc.notes && (
                <p className="mt-3 text-xs text-[var(--muted)]">Notes: {doc.notes}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
