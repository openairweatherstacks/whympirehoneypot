"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const DEBT_TYPES = ["Credit Card", "Auto Loan", "Student Loan", "Personal Loan", "Line of Credit"] as const;

export function DeficitIntake() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    debtType: "Credit Card",
    balance: "",
    apr: "",
    minimumPayment: "",
    targetPayment: "",
    creditLimit: ""
  });
  const [activeAction, setActiveAction] = useState<"save" | "demo" | null>(null);
  const [message, setMessage] = useState(
    "Add your balances manually or load the sample debt stack to activate payoff modeling."
  );
  const [isPending, startTransition] = useTransition();
  const isBusy = activeAction !== null || isPending;

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setMessage("Debt name is required.");
      return;
    }

    setActiveAction("save");

    try {
      const response = await fetch("/api/deficit/accounts", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: form.name,
          debtType: form.debtType,
          balance: Number(form.balance),
          apr: Number(form.apr),
          minimumPayment: Number(form.minimumPayment),
          targetPayment: Number(form.targetPayment || form.minimumPayment),
          creditLimit: Number(form.creditLimit || 0)
        })
      });
      const payload = (await response.json()) as {
        name?: string;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not save that debt account.");
        return;
      }

      setForm({
        name: "",
        debtType: "Credit Card",
        balance: "",
        apr: "",
        minimumPayment: "",
        targetPayment: "",
        creditLimit: ""
      });
      setMessage(`${payload.name ?? "Debt account"} saved to the Deficit Crusher.`);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleLoadDemo() {
    setActiveAction("demo");

    try {
      const response = await fetch("/api/deficit/demo", {
        method: "POST"
      });
      const payload = (await response.json()) as {
        created?: boolean;
        accountsInserted?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not load the sample debt stack.");
        return;
      }

      setMessage(
        payload.created
          ? `Loaded ${payload.accountsInserted ?? 0} sample debt accounts.`
          : "Debt accounts already exist, so the sample stack was left untouched."
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
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/60">Deficit Intake</p>
      <h2 className="mt-2 text-2xl">Map the balances you want to kill off next</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
        This is the debt layer: capture balances, interest rates, and payment targets locally so the
        app can rank what to attack first and estimate how long the payoff path really is.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Debt name"
          value={form.name}
        />
        <select
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("debtType", event.target.value)}
          value={form.debtType}
        >
          {DEBT_TYPES.map((debtType) => (
            <option key={debtType} className="text-[var(--ink)]" value={debtType}>
              {debtType}
            </option>
          ))}
        </select>
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("balance", event.target.value)}
          placeholder="Current balance"
          value={form.balance}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("apr", event.target.value)}
          placeholder="APR %"
          value={form.apr}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("minimumPayment", event.target.value)}
          placeholder="Minimum monthly payment"
          value={form.minimumPayment}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("targetPayment", event.target.value)}
          placeholder="Target monthly payment"
          value={form.targetPayment}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none md:col-span-2"
          onChange={(event) => updateField("creditLimit", event.target.value)}
          placeholder="Credit limit (optional, for utilization)"
          value={form.creditLimit}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={handleSave}
          type="button"
        >
          {activeAction === "save" ? "Saving..." : isPending ? "Refreshing..." : "Save debt"}
        </button>
        <button
          className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={handleLoadDemo}
          type="button"
        >
          {activeAction === "demo" ? "Loading sample..." : "Load sample debt stack"}
        </button>
      </div>

      <div className="mt-5 rounded-[1.4rem] bg-white/6 p-4 text-sm text-white/72">{message}</div>
    </section>
  );
}
