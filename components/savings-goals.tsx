"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SavingsGoal } from "@/lib/goals";

const MEMBER_BADGE: Record<string, string> = {
  jay: "bg-[rgba(27,107,99,0.12)] text-[var(--brand)]",
  cicely: "bg-[rgba(147,51,234,0.12)] text-[#7c3aed]",
  joint: "bg-[rgba(23,19,15,0.06)] text-[var(--muted)]",
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function GoalCard({ goal }: { goal: SavingsGoal }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [newAmount, setNewAmount] = useState(String((goal.currentCents / 100).toFixed(2)));
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!confirm(`Delete "${goal.name}"?`)) return;
    await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  async function handleProgressSave() {
    const amount = parseFloat(newAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError("");
    await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentAmount: amount }),
    });
    setEditing(false);
    startTransition(() => router.refresh());
  }

  const barColor = goal.isComplete
    ? "bg-[var(--brand)]"
    : goal.progressPct >= 75
    ? "bg-[var(--brand)]"
    : goal.progressPct >= 40
    ? "bg-amber-400"
    : "bg-[var(--heat)]";

  return (
    <article className="rounded-[1.6rem] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-5 shadow-[0_18px_48px_rgba(23,19,15,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {goal.emoji && <span className="text-xl leading-none">{goal.emoji}</span>}
          <div className="min-w-0">
            <p className="font-semibold text-[var(--ink)] truncate">{goal.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${MEMBER_BADGE[goal.member] ?? MEMBER_BADGE.joint}`}>
                {goal.member}
              </span>
              {goal.targetDate && (
                <span className="text-xs text-[var(--muted)]">
                  by {new Date(goal.targetDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="shrink-0 rounded-full p-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
          aria-label="Delete goal"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-[var(--muted)] mb-1.5">
          <span>{formatCurrency(goal.currentCents)} saved</span>
          <span>{goal.progressPct}% of {formatCurrency(goal.targetCents)}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-[rgba(23,19,15,0.07)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${goal.progressPct}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {!goal.isComplete && (
          <span className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1 text-[var(--ink)]">
            {formatCurrency(goal.remainingCents)} to go
          </span>
        )}
        {goal.isComplete && (
          <span className="rounded-full border border-[var(--brand)] bg-[rgba(27,107,99,0.09)] px-3 py-1 font-semibold text-[var(--brand)]">
            Goal reached!
          </span>
        )}
        {goal.monthlyNeededCents !== null && !goal.isComplete && (
          <span className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1 text-[var(--ink)]">
            {formatCurrency(goal.monthlyNeededCents)}/mo needed
          </span>
        )}
        {goal.monthsRemaining !== null && !goal.isComplete && (
          <span className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1 text-[var(--muted)]">
            {goal.monthsRemaining} mo left
          </span>
        )}
      </div>

      {/* Update progress */}
      <div className="mt-4">
        {editing ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="number"
                min="0"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="w-full rounded-[1rem] border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                placeholder="Current saved amount"
              />
              {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
            </div>
            <button
              onClick={handleProgressSave}
              disabled={isPending}
              className="rounded-[1rem] bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setError(""); }}
              className="rounded-[1rem] border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-[var(--brand)] hover:underline"
          >
            Update progress
          </button>
        )}
      </div>
    </article>
  );
}

export function SavingsGoals({ goals }: { goals: SavingsGoal[] }) {
  const totalTargetCents = goals.reduce((s, g) => s + g.targetCents, 0);
  const totalSavedCents = goals.reduce((s, g) => s + g.currentCents, 0);
  const completed = goals.filter((g) => g.isComplete).length;

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">Savings Goals</p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">What you&apos;re building toward</h2>
        </div>
        {goals.length > 0 && (
          <div className="rounded-full border border-[var(--line)] bg-[rgba(27,107,99,0.08)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
            {completed}/{goals.length} complete
          </div>
        )}
      </div>

      {goals.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Goals</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{goals.length}</p>
          </article>
          <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Total saved</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{formatCurrency(totalSavedCents)}</p>
          </article>
          <article className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(27,107,99,0.08)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Total target</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{formatCurrency(totalTargetCents)}</p>
          </article>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm leading-6 text-[var(--muted)]">
          No savings goals yet. Add your first goal — house down payment, emergency fund, vacation, car — and track exactly how much you need to save each month to hit it.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </section>
  );
}
