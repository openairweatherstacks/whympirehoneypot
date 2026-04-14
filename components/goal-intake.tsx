"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Member } from "@/lib/members";

const MEMBERS: { value: Member; label: string }[] = [
  { value: "jay", label: "Jay" },
  { value: "cicely", label: "Cicely" },
  { value: "joint", label: "Joint" },
];

const SUGGESTED_GOALS = [
  { emoji: "🏠", name: "House down payment" },
  { emoji: "🚨", name: "Emergency fund" },
  { emoji: "✈️", name: "Vacation" },
  { emoji: "🚗", name: "New car" },
  { emoji: "🎓", name: "Education" },
  { emoji: "💍", name: "Wedding" },
];

export function GoalIntake() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "",
    emoji: "",
    targetAmount: "",
    currentAmount: "",
    targetDate: "",
    member: "joint" as Member,
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  function applySuggestion(s: { emoji: string; name: string }) {
    setForm((f) => ({ ...f, name: s.name, emoji: s.emoji }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const name = form.name.trim();
    const targetAmount = parseFloat(form.targetAmount);
    const currentAmount = form.currentAmount ? parseFloat(form.currentAmount) : 0;

    if (!name) { setError("Goal name is required."); return; }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) { setError("Target amount must be a positive number."); return; }
    if (!Number.isFinite(currentAmount) || currentAmount < 0) { setError("Current amount must be a non-negative number."); return; }

    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        emoji: form.emoji.trim() || undefined,
        targetAmount,
        currentAmount,
        targetDate: form.targetDate || null,
        member: form.member,
      }),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }

    setSuccess(`"${name}" goal added!`);
    setForm({ name: "", emoji: "", targetAmount: "", currentAmount: "", targetDate: "", member: "joint" });
    setTimeout(() => setSuccess(""), 3000);
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">Goal Intake</p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Add a savings goal</h2>
        </div>
        <span className="text-2xl text-[var(--muted)]">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Suggested goals */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Quick pick</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_GOALS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors"
                >
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Emoji</label>
              <input
                type="text"
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                placeholder="🏠"
                maxLength={2}
                className="w-16 rounded-[1.3rem] border border-[var(--line)] bg-white px-3 py-2.5 text-center text-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Goal name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="House down payment"
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Target amount ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.targetAmount}
                onChange={(e) => set("targetAmount", e.target.value)}
                placeholder="20000"
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Already saved ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.currentAmount}
                onChange={(e) => set("currentAmount", e.target.value)}
                placeholder="0"
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Target date (optional)</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">For</label>
              <select
                value={form.member}
                onChange={(e) => set("member", e.target.value)}
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              >
                {MEMBERS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="rounded-[1rem] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
          {success && <p className="rounded-[1rem] bg-[rgba(27,107,99,0.08)] px-4 py-2 text-sm font-semibold text-[var(--brand)]">{success}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-[1.3rem] bg-[var(--brand)] py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(27,107,99,0.28)] transition hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Add goal"}
          </button>
        </form>
      )}
    </section>
  );
}
