"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Member } from "@/lib/members";
import { MEMBER_LABELS } from "@/lib/members";
import { CATEGORIES } from "@/lib/categories";

const MEMBERS: { value: Member; label: string }[] = [
  { value: "jay", label: "Jay" },
  { value: "cicely", label: "Cicely" },
  { value: "joint", label: "Joint" }
];

type FormState = {
  transactionDate: string;
  description: string;
  merchant: string;
  category: string;
  rawAmount: string;
  direction: "income" | "expense";
  member: Member;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return {
    transactionDate: todayIso(),
    description: "",
    merchant: "",
    category: "General",
    rawAmount: "",
    direction: "expense",
    member: "joint"
  };
}

const inputClass =
  "w-full rounded-xl border border-white/14 bg-white/[0.07] px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition";

export function ManualEntry() {
  const router = useRouter();
  const receiptRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [, startTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setMessage({ text: "Scanning receipt…", ok: true });
    setScanning(true);

    try {
      const fd = new FormData();
      fd.append("receipt", file);
      const res = await fetch("/api/transactions/scan-receipt", { method: "POST", body: fd });
      const data = (await res.json()) as {
        transactionDate?: string | null;
        description?: string | null;
        merchant?: string | null;
        category?: string | null;
        rawAmount?: number | null;
        direction?: "income" | "expense" | null;
        note?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        setMessage({ text: data.error ?? "Scan failed — fill in manually.", ok: false });
        return;
      }

      setForm((prev) => ({
        ...prev,
        transactionDate: data.transactionDate ?? prev.transactionDate,
        description: data.description ?? prev.description,
        merchant: data.merchant ?? prev.merchant,
        category: (CATEGORIES as readonly string[]).includes(data.category ?? "") ? (data.category as string) : prev.category,
        rawAmount: data.rawAmount != null ? String(data.rawAmount) : prev.rawAmount,
        direction: data.direction ?? prev.direction
      }));
      setMessage({ text: data.note ?? "Receipt scanned — review and save.", ok: true });
    } catch {
      setMessage({ text: "Scan failed — fill in manually.", ok: false });
    } finally {
      setScanning(false);
    }
  }

  async function handleSave() {
    const amount = Number(form.rawAmount);
    if (!form.transactionDate || !form.description || !amount || amount <= 0) {
      setMessage({ text: "Date, description, and a positive amount are required.", ok: false });
      return;
    }

    setSaving(true);
    setMessage({ text: "Saving…", ok: true });

    try {
      const res = await fetch("/api/transactions/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionDate: form.transactionDate,
          description: form.description,
          merchant: form.merchant || form.description,
          category: form.category,
          rawAmount: amount,
          direction: form.direction,
          member: form.member
        })
      });
      const data = (await res.json()) as { rowsInserted?: number; error?: string };

      if (!res.ok || data.error) {
        setMessage({ text: data.error ?? "Save failed.", ok: false });
        return;
      }

      setMessage({ text: `Transaction saved for ${MEMBER_LABELS[form.member]}.`, ok: true });
      setForm(emptyForm());
      setReceiptFile(null);
      if (receiptRef.current) receiptRef.current.value = "";
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm(emptyForm());
    setReceiptFile(null);
    setMessage(null);
    if (receiptRef.current) receiptRef.current.value = "";
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[rgba(23,19,15,0.92)] p-6 text-white shadow-[0_24px_80px_rgba(23,19,15,0.16)]">

      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/50">Manual Entry</p>
          <h2 className="mt-1.5 text-2xl font-semibold">Add a transaction</h2>
        </div>
        <span className="shrink-0 rounded-full border border-white/14 bg-white/6 px-3 py-1 text-xs text-white/40 transition hover:bg-white/10">
          {open ? "Close" : "Open"}
        </span>
      </button>

      {open && (
        <div className="mt-6">

          {/* ── Row 1: Receipt + Member ─────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-5 py-4">

            {/* Receipt upload */}
            <div className="flex items-center gap-3">
              <label
                htmlFor="receipt-upload"
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition ${
                  scanning
                    ? "border-white/20 text-white/40 cursor-wait"
                    : receiptFile
                    ? "border-[rgba(27,107,99,0.5)] bg-[rgba(27,107,99,0.12)] text-[var(--brand)]"
                    : "border-white/20 bg-white/8 text-white/70 hover:bg-white/12"
                }`}
              >
                {scanning ? "Scanning…" : receiptFile ? `✓ ${receiptFile.name}` : "Attach receipt"}
              </label>
              {receiptFile && !scanning && (
                <button
                  type="button"
                  onClick={() => { setReceiptFile(null); if (receiptRef.current) receiptRef.current.value = ""; }}
                  className="text-xs text-white/36 transition hover:text-white/60"
                >
                  Remove
                </button>
              )}
              {!receiptFile && (
                <span className="text-xs text-white/30">PDF · PNG · JPG · WEBP</span>
              )}
              <input
                id="receipt-upload"
                ref={receiptRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleReceiptChange}
              />
            </div>

            {/* Member pills */}
            <div className="flex gap-2">
              {MEMBERS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, member: m.value }))}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all border ${
                    form.member === m.value
                      ? "border-white bg-white text-[rgba(23,19,15,0.92)]"
                      : "border-white/20 bg-transparent text-white/50 hover:border-white/40 hover:text-white/80"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Row 2: Date · Direction · Amount ───────────────── */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-white/44" htmlFor="me-date">
                Date
              </label>
              <input
                id="me-date"
                type="date"
                value={form.transactionDate}
                onChange={(e) => set("transactionDate", e.target.value)}
                style={{ colorScheme: "dark" }}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/44">Type</p>
              <div className="flex gap-2 h-[42px]">
                {(["expense", "income"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("direction", d)}
                    className={`flex-1 rounded-xl text-sm font-semibold transition border capitalize ${
                      form.direction === d
                        ? d === "expense"
                          ? "border-red-400/30 bg-red-400/10 text-red-300"
                          : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-white/12 bg-white/[0.04] text-white/44 hover:bg-white/8"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-white/44" htmlFor="me-amount">
                Amount ($)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/36">$</span>
                <input
                  id="me-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={form.rawAmount}
                  onChange={(e) => set("rawAmount", e.target.value)}
                  className={`${inputClass} pl-7`}
                />
              </div>
            </div>
          </div>

          {/* ── Row 3: Description · Merchant · Category ────────── */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-white/44" htmlFor="me-desc">
                Description
              </label>
              <input
                id="me-desc"
                type="text"
                placeholder="e.g. Starbucks Coffee"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-white/44" htmlFor="me-merchant">
                Merchant
              </label>
              <input
                id="me-merchant"
                type="text"
                placeholder="Optional"
                value={form.merchant}
                onChange={(e) => set("merchant", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-white/44" htmlFor="me-category">
                Category
              </label>
              <select
                id="me-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                style={{ colorScheme: "dark" }}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Row 4: Actions + feedback ───────────────────────── */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || scanning}
              className="rounded-[1.2rem] bg-white px-6 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save transaction"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="rounded-full border border-white/16 px-5 py-2.5 text-sm font-semibold text-white/56 transition hover:bg-white/8 disabled:opacity-40"
            >
              Reset
            </button>

            {message && (
              <p className={`ml-1 text-sm ${message.ok ? "text-white/60" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
