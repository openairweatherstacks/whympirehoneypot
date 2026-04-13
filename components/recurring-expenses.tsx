"use client";

import { useCallback, useEffect, useState } from "react";
import type { Member } from "@/lib/members";
import { MEMBER_LABELS } from "@/lib/members";
import { CATEGORIES } from "@/lib/categories";

type Frequency = "weekly" | "biweekly" | "monthly" | "annual";

const MEMBER_BADGE: Record<Member, string> = {
  jay: "bg-[rgba(27,107,99,0.12)] text-[var(--brand)]",
  cicely: "bg-[rgba(147,51,234,0.12)] text-[#7c3aed]",
  joint: "bg-[rgba(23,19,15,0.06)] text-[var(--muted)]"
};

type RecurringExpense = {
  id: number;
  name: string;
  merchant: string;
  category: string;
  amountCents: number;
  frequency: Frequency;
  source: "manual" | "auto";
  active: boolean;
  member: Member;
  monthlyEquivalentCents: number;
};

type DetectedCandidate = {
  merchant: string;
  category: string;
  avgAmountCents: number;
  activeMonths: number;
  alreadySaved: boolean;
};


const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  annual: "Annual"
};

const FREQUENCY_MULTIPLIER: Record<Frequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  annual: 1 / 12
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function monthlyEquiv(cents: number, freq: Frequency) {
  return Math.round(cents * FREQUENCY_MULTIPLIER[freq]);
}

export function RecurringExpenses() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [candidates, setCandidates] = useState<DetectedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetected, setShowDetected] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    category: "Subscriptions",
    amount: "",
    frequency: "monthly" as Frequency,
    member: "joint" as Member
  });
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, detRes] = await Promise.all([
        fetch("/api/recurring"),
        fetch("/api/recurring/detect")
      ]);
      const expData = (await expRes.json()) as { expenses?: RecurringExpense[] };
      const detData = (await detRes.json()) as { candidates?: DetectedCandidate[] };
      setExpenses(expData.expenses ?? []);
      setCandidates(detData.candidates ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const monthlyTotal = expenses.reduce((sum, e) => sum + e.monthlyEquivalentCents, 0);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const amount = parseFloat(form.amount);
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setFormError("Enter a valid amount."); return; }

    setFormBusy(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), category: form.category, amount, frequency: form.frequency, member: form.member })
      });
      const data = (await res.json()) as { expense?: RecurringExpense; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Failed to add."); return; }
      setExpenses((prev) => [...prev, data.expense!].sort((a, b) => b.amountCents - a.amountCents));
      setForm({ name: "", category: "Subscriptions", amount: "", frequency: "monthly", member: "joint" });
      setShowForm(false);
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/recurring/${id}`, { method: "DELETE" });
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddCandidate(candidate: DetectedCandidate) {
    const res = await fetch("/api/recurring/detect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchant: candidate.merchant, category: candidate.category, amount: candidate.avgAmountCents })
    });
    const data = (await res.json()) as { expense?: RecurringExpense; error?: string };
    if (res.ok && data.expense) {
      setExpenses((prev) => [...prev, data.expense!].sort((a, b) => b.amountCents - a.amountCents));
      setCandidates((prev) =>
        prev.map((c) => c.merchant === candidate.merchant ? { ...c, alreadySaved: true } : c)
      );
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Recurring Expenses
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Monthly fixed costs</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-[1.2rem] border border-[var(--line)] bg-[rgba(27,107,99,0.08)] px-4 py-2 text-center">
            <p className="text-xs text-[var(--muted)]">Monthly total</p>
            <p className="text-lg font-semibold text-[var(--ink)]">{formatCurrency(monthlyTotal)}</p>
          </div>
          <button
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(27,107,99,0.08)]"
            onClick={() => { setShowForm((v) => !v); setFormError(""); }}
            type="button"
          >
            {showForm ? "Cancel" : "+ Add expense"}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="mt-5 rounded-[1.6rem] border border-[var(--line)] bg-white/80 p-5"
        >
          <p className="text-sm font-semibold text-[var(--ink)]">New recurring expense</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)]">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                placeholder="e.g. Netflix, Rent, Gym"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Category</label>
              <select
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Amount ($)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Frequency</label>
              <select
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
              >
                {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                  <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)]">Belongs to</label>
              <div className="mt-1 flex gap-2">
                {(["jay", "cicely", "joint"] as Member[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, member: m }))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      form.member === m
                        ? m === "jay"
                          ? "border-[var(--brand)] bg-[rgba(27,107,99,0.12)] text-[var(--brand)]"
                          : m === "cicely"
                            ? "border-[#7c3aed] bg-[rgba(147,51,234,0.12)] text-[#7c3aed]"
                            : "border-[var(--line)] bg-[var(--ink)] text-white"
                        : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {MEMBER_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {form.amount && Number.isFinite(parseFloat(form.amount)) && parseFloat(form.amount) > 0 && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Monthly equivalent: <span className="font-semibold text-[var(--ink)]">{formatCurrency(monthlyEquiv(Math.round(parseFloat(form.amount) * 100), form.frequency))}</span>
            </p>
          )}

          {formError && <p className="mt-2 text-xs text-[var(--heat)]">{formError}</p>}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={formBusy}
              className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {formBusy ? "Adding…" : "Add expense"}
            </button>
          </div>
        </form>
      )}

      {/* Expense list */}
      {loading ? (
        <div className="mt-6 text-sm text-[var(--muted)]">Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/40 p-6 text-sm text-[var(--muted)]">
          No recurring expenses yet. Add one above or detect them from your imported transactions below.
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {expenses.map((expense) => (
            <article
              key={expense.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-[var(--line)] bg-white/70 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-[var(--ink)]">{expense.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                    <span>{expense.category} · {FREQUENCY_LABELS[expense.frequency]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MEMBER_BADGE[expense.member as Member] ?? MEMBER_BADGE.joint}`}>
                      {MEMBER_LABELS[expense.member as Member] ?? expense.member}
                    </span>
                    {expense.source === "auto" && (
                      <span className="rounded-full bg-[rgba(27,107,99,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">auto-detected</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-semibold text-[var(--ink)]">{formatCurrency(expense.amountCents)}</p>
                  {expense.frequency !== "monthly" && (
                    <p className="text-xs text-[var(--muted)]">{formatCurrency(expense.monthlyEquivalentCents)}/mo</p>
                  )}
                </div>
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:border-red-300 hover:text-red-500 disabled:opacity-40"
                  disabled={deletingId === expense.id}
                  onClick={() => handleDelete(expense.id)}
                  type="button"
                >
                  {deletingId === expense.id ? "…" : "Remove"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Auto-detected from transactions */}
      <div className="mt-6">
        <button
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)] transition hover:text-[var(--ink)]"
          onClick={() => setShowDetected((v) => !v)}
          type="button"
        >
          <span>{showDetected ? "▾" : "▸"}</span>
          Detected from transactions ({candidates.filter((c) => !c.alreadySaved).length} new)
        </button>

        {showDetected && (
          <div className="mt-3 space-y-2">
            {candidates.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Import transaction data to detect recurring patterns.</p>
            ) : (
              candidates.map((candidate) => (
                <article
                  key={candidate.merchant}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border px-4 py-3 ${
                    candidate.alreadySaved
                      ? "border-[rgba(27,107,99,0.15)] bg-[rgba(27,107,99,0.05)]"
                      : "border-[var(--line)] bg-white/50"
                  }`}
                >
                  <div>
                    <p className="font-medium text-[var(--ink)]">{candidate.merchant}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {candidate.category} · avg {formatCurrency(candidate.avgAmountCents)} · seen {candidate.activeMonths} months
                    </p>
                  </div>
                  {candidate.alreadySaved ? (
                    <span className="text-xs font-semibold text-[var(--brand)]">Added</span>
                  ) : (
                    <button
                      className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[rgba(27,107,99,0.08)]"
                      onClick={() => handleAddCandidate(candidate)}
                      type="button"
                    >
                      + Add
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
