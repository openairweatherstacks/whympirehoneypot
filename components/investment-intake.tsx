"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const ASSET_CLASSES = [
  "US Equity",
  "International Equity",
  "Bonds",
  "Dividend Equity",
  "REIT",
  "Cash"
] as const;

export function InvestmentIntake() {
  const router = useRouter();
  const [form, setForm] = useState({
    symbol: "",
    name: "",
    assetClass: "US Equity",
    targetAllocationPercent: "20",
    units: "0",
    avgCost: "0",
    currentPrice: "0",
    week52High: "0",
    week52Low: "0",
    monthlyContribution: "0"
  });
  const [activeAction, setActiveAction] = useState<"save" | "demo" | null>(null);
  const [message, setMessage] = useState(
    "Add ETF positions or watchlist entries manually, or load the sample portfolio."
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
    if (!form.symbol.trim() || !form.name.trim()) {
      setMessage("Symbol and name are required.");
      return;
    }

    setActiveAction("save");

    try {
      const response = await fetch("/api/investing/positions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          symbol: form.symbol,
          name: form.name,
          assetClass: form.assetClass,
          targetAllocationPercent: Number(form.targetAllocationPercent),
          units: Number(form.units),
          avgCost: Number(form.avgCost),
          currentPrice: Number(form.currentPrice),
          week52High: Number(form.week52High),
          week52Low: Number(form.week52Low),
          monthlyContribution: Number(form.monthlyContribution)
        })
      });
      const payload = (await response.json()) as {
        symbol?: string;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not save that ETF position.");
        return;
      }

      setForm({
        symbol: "",
        name: "",
        assetClass: "US Equity",
        targetAllocationPercent: "20",
        units: "0",
        avgCost: "0",
        currentPrice: "0",
        week52High: "0",
        week52Low: "0",
        monthlyContribution: "0"
      });
      setMessage(`${payload.symbol ?? "Position"} saved to the local ETF watchlist.`);
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
      const response = await fetch("/api/investing/demo", {
        method: "POST"
      });
      const payload = (await response.json()) as {
        created?: boolean;
        positionsInserted?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not load the sample ETF portfolio.");
        return;
      }

      setMessage(
        payload.created
          ? `Loaded ${payload.positionsInserted ?? 0} sample ETF positions.`
          : "Investment data already exists, so the sample ETF portfolio was left untouched."
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
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/60">
        Investment Intake
      </p>
      <h2 className="mt-2 text-2xl">Build your ETF command layer</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
        Phase 4 is about turning passive investing into something measurable: watchlist tracking,
        disciplined DCA planning, and portfolio drift detection without any trading integration.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("symbol", event.target.value)}
          placeholder="ETF ticker"
          value={form.symbol}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="ETF name"
          value={form.name}
        />
        <select
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("assetClass", event.target.value)}
          value={form.assetClass}
        >
          {ASSET_CLASSES.map((assetClass) => (
            <option key={assetClass} className="text-[var(--ink)]" value={assetClass}>
              {assetClass}
            </option>
          ))}
        </select>
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("targetAllocationPercent", event.target.value)}
          placeholder="Target allocation %"
          value={form.targetAllocationPercent}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("units", event.target.value)}
          placeholder="Units held"
          value={form.units}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("avgCost", event.target.value)}
          placeholder="Average cost"
          value={form.avgCost}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("currentPrice", event.target.value)}
          placeholder="Current price"
          value={form.currentPrice}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("week52High", event.target.value)}
          placeholder="52-week high"
          value={form.week52High}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("week52Low", event.target.value)}
          placeholder="52-week low"
          value={form.week52Low}
        />
        <input
          className="rounded-[1.3rem] border border-white/14 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-white/42 focus:border-white/28 focus:outline-none"
          onChange={(event) => updateField("monthlyContribution", event.target.value)}
          placeholder="Monthly contribution"
          value={form.monthlyContribution}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={handleSave}
          type="button"
        >
          {activeAction === "save" ? "Saving..." : isPending ? "Refreshing..." : "Save position"}
        </button>
        <button
          className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={handleLoadDemo}
          type="button"
        >
          {activeAction === "demo" ? "Loading sample..." : "Load sample portfolio"}
        </button>
      </div>

      <div className="mt-5 rounded-[1.4rem] bg-white/6 p-4 text-sm text-white/72">{message}</div>
    </section>
  );
}

