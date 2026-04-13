"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";

type PendingReview = {
  id: number;
  transactionDate: string;
  description: string;
  merchant: string;
  amountCents: number;
  currentDirection: "income" | "expense";
  currentCategory: string;
  classificationNote: string;
  confidence: "high" | "medium" | "low";
};

const confidenceStyle = {
  high: "bg-[rgba(27,107,99,0.1)] text-[var(--brand)] border-[rgba(27,107,99,0.2)]",
  medium: "bg-[rgba(212,109,49,0.1)] text-[var(--heat)] border-[rgba(212,109,49,0.2)]",
  low: "bg-red-50 text-red-600 border-red-200"
};

const confidenceLabel = {
  high: "High confidence",
  medium: "Needs check",
  low: "Uncertain — please review"
};

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Math.abs(cents) / 100);
}

export function ImportReview() {
  const router = useRouter();
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [correcting, setCorrecting] = useState<number | null>(null);
  const [correctionForm, setCorrectionForm] = useState<{
    direction: "income" | "expense";
    category: string;
    saveRule: boolean;
  }>({ direction: "expense", category: "General", saveRule: true });
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/review");
      const data = (await res.json()) as { reviews?: PendingReview[] };
      setReviews(data.reviews ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleConfirm(id: number) {
    setBusy(id);
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "confirm" })
      });
      setReviews((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleCorrect(id: number) {
    setBusy(id);
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          action: "correct",
          direction: correctionForm.direction,
          category: correctionForm.category,
          saveRule: correctionForm.saveRule
        })
      });
      setReviews((prev) => prev.filter((r) => r.id !== id));
      setCorrecting(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;
  if (reviews.length === 0) return null;

  return (
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-6 shadow-[0_24px_80px_rgba(212,109,49,0.12)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-amber-600">
            Classification Review
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">
            {reviews.length} transaction{reviews.length === 1 ? "" : "s"} need your confirmation
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            These were flagged as ambiguous. Confirm the AI got it right, or correct it — your answer teaches the system.
          </p>
        </div>
        <div className="rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
          {reviews.length} pending
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {reviews.map((review) => {
          const isCorrectingThis = correcting === review.id;
          const isBusy = busy === review.id;
          const isPositive = review.amountCents > 0;

          return (
            <article
              key={review.id}
              className="rounded-[1.6rem] border border-amber-200 bg-white/90 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[var(--ink)]">{review.description}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${confidenceStyle[review.confidence]}`}>
                      {confidenceLabel[review.confidence]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{review.transactionDate}</p>
                  <p className="mt-2 text-sm text-[var(--muted)] italic">"{review.classificationNote}"</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                      review.currentDirection === "income"
                        ? "border-[rgba(27,107,99,0.2)] bg-[rgba(27,107,99,0.08)] text-[var(--brand)]"
                        : "border-[rgba(212,109,49,0.2)] bg-[rgba(212,109,49,0.08)] text-[var(--heat)]"
                    }`}>
                      Classified as: {review.currentDirection === "income" ? "↑ Income" : "↓ Expense"}
                    </div>
                    <span className="text-sm text-[var(--muted)]">{review.currentCategory}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className={`text-2xl font-bold ${isPositive ? "text-[var(--brand)]" : "text-[var(--heat)]"}`}>
                    {isPositive ? "+" : "-"}{formatCents(review.amountCents)}
                  </p>
                </div>
              </div>

              {/* Correction form */}
              {isCorrectingThis && (
                <div className="mt-4 rounded-[1.3rem] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold text-amber-700 mb-3">Correct this transaction</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs text-[var(--muted)]">Direction</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                        value={correctionForm.direction}
                        onChange={(e) => setCorrectionForm((f) => ({ ...f, direction: e.target.value as "income" | "expense" }))}
                      >
                        <option value="income">↑ Income</option>
                        <option value="expense">↓ Expense</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--muted)]">Category</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                        value={correctionForm.category}
                        onChange={(e) => setCorrectionForm((f) => ({ ...f, category: e.target.value }))}
                      >
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={correctionForm.saveRule}
                          onChange={(e) => setCorrectionForm((f) => ({ ...f, saveRule: e.target.checked }))}
                          className="rounded"
                        />
                        Remember for future imports
                      </label>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleCorrect(review.id)}
                      className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {isBusy ? "Saving…" : "Save correction"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorrecting(null)}
                      className="rounded-full border border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {!isCorrectingThis && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleConfirm(review.id)}
                    className="rounded-full border border-[rgba(27,107,99,0.3)] bg-[rgba(27,107,99,0.08)] px-4 py-2 text-xs font-semibold text-[var(--brand)] transition hover:bg-[rgba(27,107,99,0.15)] disabled:opacity-50"
                  >
                    {isBusy ? "…" : "✓ Correct"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCorrecting(review.id);
                      setCorrectionForm({
                        direction: review.currentDirection === "income" ? "expense" : "income",
                        category: review.currentCategory,
                        saveRule: true
                      });
                    }}
                    className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                  >
                    ✗ Wrong — fix it
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
