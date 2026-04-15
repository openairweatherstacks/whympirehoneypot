"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatShortDate } from "@/lib/finance";

type Transaction = {
  id: number;
  transactionDate: string;
  description: string;
  merchant: string;
  category: string;
  amountCents: number;
  direction: "income" | "expense";
  member: string;
};

type TransactionTableProps = {
  transactions: Transaction[];
};

type RowAction = "tagging" | "deleting" | null;

function TransactionRow({ tx }: { tx: Transaction }) {
  const router = useRouter();
  const [action, setAction] = useState<RowAction>(null);
  const [tagged, setTagged] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [, startTransition] = useTransition();

  async function handleTagRecurring() {
    setAction("tagging");
    try {
      await fetch("/api/recurring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: tx.description,
          merchant: tx.merchant || tx.description,
          category: tx.category,
          amount: Math.abs(tx.amountCents) / 100,
          frequency: "monthly",
          source: "manual",
          member: tx.member,
        }),
      });
      setTagged(true);
      startTransition(() => router.refresh());
    } finally {
      setAction(null);
    }
  }

  async function handleDelete() {
    setAction("deleting");
    try {
      await fetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
      setDeleted(true);
      startTransition(() => router.refresh());
    } finally {
      setAction(null);
    }
  }

  if (deleted) return null;

  return (
    <tr className="group transition-colors hover:bg-[rgba(27,107,99,0.03)]">
      <td className="px-4 py-3 text-sm text-[var(--muted)]">
        {formatShortDate(tx.transactionDate)}
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-[var(--ink)]">{tx.description}</p>
        <p className="text-sm text-[var(--muted)]">{tx.merchant}</p>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-[rgba(27,107,99,0.09)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
          {tx.category}
        </span>
      </td>
      <td
        className={`px-4 py-3 text-right font-semibold ${
          tx.direction === "income" ? "text-[var(--success)]" : "text-[var(--heat)]"
        }`}
      >
        {tx.direction === "income" ? "+" : "-"}
        {formatCurrency(Math.abs(tx.amountCents))}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Tag as recurring */}
          {tx.direction === "expense" && (
            tagged ? (
              <span className="rounded-full bg-[rgba(27,107,99,0.1)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">
                Recurring ✓
              </span>
            ) : (
              <button
                onClick={handleTagRecurring}
                disabled={action !== null}
                title="Add to Recurring Expenses"
                className="rounded-full border border-[rgba(27,107,99,0.25)] bg-[rgba(27,107,99,0.06)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)] transition hover:bg-[rgba(27,107,99,0.14)] disabled:opacity-40"
              >
                {action === "tagging" ? "Adding…" : "↻ Monthly"}
              </button>
            )
          )}

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={action !== null}
            title="Delete transaction"
            aria-label="Delete transaction"
            className="rounded-full p-1.5 text-[var(--muted)] transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

export function TransactionTable({ transactions }: TransactionTableProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Recent Ledger
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Latest imported transactions</h2>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1 text-xs text-[var(--muted)]">
          12 most recent rows
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm text-[var(--muted)]">
          No transactions yet. Upload a CSV with headers like <code>date,description,amount</code> to
          start.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-[var(--line)]">
          <table className="min-w-full divide-y divide-[var(--line)] text-left">
            <thead className="bg-[rgba(23,19,15,0.04)] text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-white/70">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-[var(--muted)]">
        Hover a row to tag it as a monthly recurring expense or delete it.
      </p>
    </section>
  );
}
