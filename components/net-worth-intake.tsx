"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Member } from "@/lib/members";
import {
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  CATEGORY_LABELS,
  type AccountType,
  type AccountCategory,
} from "@/lib/networth-types";

const MEMBERS: { value: Member; label: string }[] = [
  { value: "jay", label: "Jay" },
  { value: "cicely", label: "Cicely" },
  { value: "joint", label: "Joint" },
];

export function NetWorthIntake() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "",
    accountType: "asset" as AccountType,
    category: "checking" as AccountCategory,
    balance: "",
    member: "joint" as Member,
  });

  function set(field: string, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Auto-switch category when type changes
      if (field === "accountType") {
        next.category = value === "asset" ? "checking" : "credit_card";
      }
      return next;
    });
    setError("");
  }

  const categories = form.accountType === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = form.name.trim();
    const balance = parseFloat(form.balance);
    if (!name) { setError("Account name is required."); return; }
    if (!Number.isFinite(balance) || balance < 0) { setError("Balance must be a non-negative number."); return; }

    const res = await fetch("/api/networth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        accountType: form.accountType,
        category: form.category,
        balance,
        member: form.member,
      }),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }

    setSuccess(`"${name}" added!`);
    setForm({ name: "", accountType: "asset", category: "checking", balance: "", member: "joint" });
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
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">Account Intake</p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Add asset or liability</h2>
        </div>
        <span className="text-2xl text-[var(--muted)]">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Asset / Liability toggle */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Type</label>
            <div className="flex gap-2">
              {(["asset", "liability"] as AccountType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("accountType", t)}
                  className={`flex-1 rounded-[1.3rem] border py-2.5 text-sm font-semibold transition-colors capitalize ${
                    form.accountType === t
                      ? t === "asset"
                        ? "border-[var(--brand)] bg-[rgba(27,107,99,0.1)] text-[var(--brand)]"
                        : "border-[var(--heat)] bg-[rgba(212,109,49,0.1)] text-[var(--heat)]"
                      : "border-[var(--line)] bg-white text-[var(--muted)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Account name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={form.accountType === "asset" ? "TD Savings Account" : "Visa Credit Card"}
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
                {form.accountType === "asset" ? "Current balance ($)" : "Amount owed ($)"}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.balance}
                onChange={(e) => set("balance", e.target.value)}
                placeholder="0.00"
                className="w-full rounded-[1.3rem] border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Owner</label>
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
            {isPending ? "Saving…" : `Add ${form.accountType}`}
          </button>
        </form>
      )}
    </section>
  );
}
