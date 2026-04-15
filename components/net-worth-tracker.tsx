"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { NetWorthDashboard, NetWorthAccount } from "@/lib/networth";
import { CATEGORY_LABELS } from "@/lib/networth-types";

function formatCurrency(cents: number, signed = false) {
  const abs = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(cents) / 100);
  if (signed && cents > 0) return `+${abs}`;
  if (cents < 0) return `-${abs}`;
  return abs;
}

const MEMBER_BADGE: Record<string, string> = {
  jay: "bg-[rgba(27,107,99,0.12)] text-[var(--brand)]",
  cicely: "bg-[rgba(147,51,234,0.12)] text-[#7c3aed]",
  joint: "bg-[rgba(23,19,15,0.06)] text-[var(--muted)]",
};

function AccountRow({ account }: { account: NetWorthAccount }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String((account.balanceCents / 100).toFixed(2)));
  const [error, setError] = useState("");

  async function handleSave() {
    const bal = parseFloat(value);
    if (!Number.isFinite(bal) || bal < 0) { setError("Enter a valid amount."); return; }
    setError("");
    await fetch(`/api/networth/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balance: bal }),
    });
    setEditing(false);
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    if (!confirm(`Remove "${account.name}"?`)) return;
    await fetch(`/api/networth/${account.id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.3rem] border border-[var(--line)] bg-white/70 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-[var(--ink)] truncate">{account.name}</p>
          <span className="text-xs text-[var(--muted)]">{CATEGORY_LABELS[account.category] ?? account.category}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${MEMBER_BADGE[account.member] ?? MEMBER_BADGE.joint}`}>
            {account.member}
          </span>
        </div>
        {editing ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              className="w-36 rounded-[0.8rem] border border-[var(--line)] bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
            <button onClick={handleSave} disabled={isPending} className="rounded-[0.8rem] bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save</button>
            <button onClick={() => { setEditing(false); setError(""); }} className="rounded-[0.8rem] border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)]">Cancel</button>
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="mt-0.5 text-xs font-semibold text-[var(--brand)] hover:underline">
            Update balance
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-base font-semibold ${account.accountType === "asset" ? "text-[var(--brand)]" : "text-[var(--heat)]"}`}>
          {account.accountType === "liability" ? "-" : ""}{formatCurrency(account.balanceCents)}
        </span>
        <button onClick={handleDelete} disabled={isPending} className="rounded-full p-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Remove">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function MiniChart({ snapshots }: { snapshots: NetWorthDashboard["snapshots"] }) {
  if (snapshots.length < 2) return null;

  const values = snapshots.map((s) => s.netWorthCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 280;
  const H = 60;
  const pad = 8;

  const points = snapshots.map((s, i) => {
    const x = pad + (i / (snapshots.length - 1)) * (W - pad * 2);
    const y = H - pad - ((s.netWorthCents - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  });

  const lastVal = values[values.length - 1];
  const isPositive = lastVal >= (values[values.length - 2] ?? 0);

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Net worth over time</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={isPositive ? "var(--brand)" : "var(--heat)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {snapshots.map((s, i) => {
          const [x, y] = points[i].split(",").map(Number);
          return <circle key={i} cx={x} cy={y} r="3" fill={isPositive ? "var(--brand)" : "var(--heat)"} />;
        })}
      </svg>
      <div className="flex justify-between text-xs text-[var(--muted)] mt-1">
        <span>{snapshots[0].snapshotMonth}</span>
        <span>{snapshots[snapshots.length - 1].snapshotMonth}</span>
      </div>
    </div>
  );
}

export function NetWorthTracker({ dashboard }: { dashboard: NetWorthDashboard }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [snapshotMsg, setSnapshotMsg] = useState("");

  const assets = dashboard.accounts.filter((a) => a.accountType === "asset");
  const liabilities = dashboard.accounts.filter((a) => a.accountType === "liability");
  const nwPositive = dashboard.netWorthCents >= 0;

  async function handleSnapshot() {
    await fetch("/api/networth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "snapshot" }),
    });
    setSnapshotMsg("Snapshot saved!");
    setTimeout(() => setSnapshotMsg(""), 3000);
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">Net Worth</p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Assets minus liabilities</h2>
        </div>
        {dashboard.accounts.length > 0 && (
          <button
            onClick={handleSnapshot}
            disabled={isPending}
            className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--brand)] hover:bg-[rgba(27,107,99,0.08)] transition-colors disabled:opacity-50"
          >
            {snapshotMsg || "Save snapshot"}
          </button>
        )}
      </div>

      {dashboard.accounts.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm leading-6 text-[var(--muted)]">
          Add your accounts — checking, savings, investments, mortgage, car loan — and see your true net worth in one number. Track it monthly to watch it grow.
        </div>
      ) : (
        <>
          {/* Big numbers */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Total assets</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--brand)]">{formatCurrency(dashboard.totalAssetsCents)}</p>
            </article>
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Total liabilities</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--heat)]">{formatCurrency(dashboard.totalLiabilitiesCents)}</p>
            </article>
            <article className={`rounded-[1.5rem] border p-4 ${nwPositive ? "border-[var(--brand)] bg-[rgba(27,107,99,0.08)]" : "border-[var(--heat)] bg-[rgba(212,109,49,0.08)]"}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Net worth</p>
              <p className={`mt-2 text-2xl font-semibold ${nwPositive ? "text-[var(--brand)]" : "text-[var(--heat)]"}`}>
                {formatCurrency(dashboard.netWorthCents)}
              </p>
              {dashboard.changeFromLastMonthCents !== null && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {formatCurrency(dashboard.changeFromLastMonthCents, true)} vs last month
                  {dashboard.changePct !== null && ` (${dashboard.changePct > 0 ? "+" : ""}${dashboard.changePct}%)`}
                </p>
              )}
            </article>
          </div>

          {/* Chart */}
          <MiniChart snapshots={dashboard.snapshots} />

          {/* Account lists */}
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Assets ({assets.length})
              </p>
              {assets.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No assets added yet.</p>
              ) : (
                <div className="space-y-2">
                  {assets.map((a) => <AccountRow key={a.id} account={a} />)}
                </div>
              )}
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--heat)]">
                Liabilities ({liabilities.length})
              </p>
              {liabilities.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No liabilities added yet.</p>
              ) : (
                <div className="space-y-2">
                  {liabilities.map((a) => <AccountRow key={a.id} account={a} />)}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
