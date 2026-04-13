"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, useCallback } from "react";
import type { Member } from "@/lib/members";
import { MEMBER_LABELS } from "@/lib/members";

type UploadPanelProps = {
  aiStatus: {
    provider: string;
    model: string;
    anthropicConfigured: boolean;
    liveAnalysisEnabled: boolean;
  };
};

const ACCEPTED_TYPES = new Set([
  "text/csv",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

function isAccepted(file: File) {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    name.endsWith(".pdf") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp")
  );
}

const MEMBERS: { value: Member; label: string; color: string }[] = [
  { value: "jay", label: "Jay", color: "rgba(27,107,99,0.15)" },
  { value: "cicely", label: "Cicely", color: "rgba(147,51,234,0.15)" },
  { value: "joint", label: "Joint / Shared", color: "rgba(255,255,255,0.08)" }
];

export function UploadPanel({ aiStatus }: UploadPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [member, setMember] = useState<Member>("joint");
  const [activeAction, setActiveAction] = useState<"import" | "demo" | "clear" | "sheets" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [showSheets, setShowSheets] = useState(false);
  const isBusy = activeAction !== null || isPending;
  const hasFiles = selectedFiles.length > 0;

  // ── Import ────────────────────────────────────────────────────────────────
  async function runImport(files: File[]) {
    if (files.length === 0) return;

    setActiveAction("import");
    setMessage(`Uploading for ${MEMBER_LABELS[member]}…`);

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    formData.append("member", member);

    try {
      const response = await fetch("/api/transactions/import", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as {
        error?: string;
        rowsInserted?: number;
        filesImported?: number;
        filesProcessed?: number;
        filesArchivedOnly?: number;
        imports?: Array<{ filename: string; summary: string; extractionStatus: string }>;
        failures?: Array<{ filename: string; error: string }>;
      };

      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (!response.ok) {
        setMessage(payload.error ?? "Import failed. Check the file and try again.");
        return;
      }

      const failureCount = payload.failures?.length ?? 0;
      const archivedOnlyCount = payload.filesArchivedOnly ?? 0;
      const leadSummary = payload.imports?.[0]?.summary;
      const memberLabel = MEMBER_LABELS[member];

      setMessage(
        failureCount > 0
          ? `Processed ${payload.filesImported ?? 0} of ${payload.filesProcessed ?? files.length} files for ${memberLabel} — ${payload.rowsInserted ?? 0} rows imported, ${archivedOnlyCount} archived. ${failureCount} failed.`
          : leadSummary
            ? `[${memberLabel}] ${leadSummary}`
            : `[${memberLabel}] ${payload.filesImported ?? files.length} file${(payload.filesImported ?? files.length) === 1 ? "" : "s"} imported — ${payload.rowsInserted ?? 0} rows added.`
      );
      startTransition(() => router.refresh());
    } finally {
      setActiveAction(null);
    }
  }

  async function handleImportClick() {
    if (!hasFiles) {
      setMessage("Select or drop files first.");
      return;
    }
    await runImport(selectedFiles);
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  async function handleSheetsImport() {
    if (!sheetsUrl.trim()) {
      setMessage("Paste a Google Sheets URL first.");
      return;
    }
    setActiveAction("sheets");
    setMessage(`Fetching sheet for ${MEMBER_LABELS[member]}…`);
    try {
      const response = await fetch("/api/google-sheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: sheetsUrl.trim(), member })
      });
      const payload = (await response.json()) as {
        rowsInserted?: number;
        summary?: string;
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not import the sheet.");
        return;
      }
      setMessage(`[${MEMBER_LABELS[member]}] ${payload.summary ?? `${payload.rowsInserted ?? 0} rows imported from Google Sheets.`}`);
      setSheetsUrl("");
      setShowSheets(false);
      startTransition(() => router.refresh());
    } finally {
      setActiveAction(null);
    }
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (isBusy) return;

      const dropped = Array.from(e.dataTransfer.files).filter(isAccepted);
      if (dropped.length === 0) {
        setMessage("Only CSV, PDF, PNG, JPG, or WEBP files are accepted.");
        return;
      }

      setSelectedFiles(dropped);
      await runImport(dropped);
    },
    [isBusy, member]
  );

  // ── Clear data ────────────────────────────────────────────────────────────
  async function handleClearData() {
    if (!window.confirm("This will delete ALL transactions, imports, perk documents, investments, and debt accounts. Cannot be undone. Continue?")) {
      return;
    }

    setActiveAction("clear");
    setMessage("Clearing all data…");

    try {
      const response = await fetch("/api/data/clear", { method: "POST" });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Clear failed.");
        return;
      }

      setMessage("All data cleared. Ready for a fresh import.");
      window.location.reload();
    } finally {
      setActiveAction(null);
    }
  }

  // ── Load demo ─────────────────────────────────────────────────────────────
  async function handleSeedDemo() {
    setActiveAction("demo");
    setMessage("Loading starter dataset…");

    try {
      const response = await fetch("/api/demo", { method: "POST" });
      const payload = (await response.json()) as {
        created?: boolean;
        transactionRowsInserted?: number;
        perkDocumentsInserted?: number;
        investmentPositionsInserted?: number;
        debtAccountsInserted?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not load the starter dataset.");
        return;
      }

      setMessage(
        payload.created
          ? `Starter workspace loaded — ${payload.transactionRowsInserted ?? 0} transactions, ${payload.perkDocumentsInserted ?? 0} perk guides, ${payload.investmentPositionsInserted ?? 0} ETF positions, ${payload.debtAccountsInserted ?? 0} debt accounts.`
          : "Existing data detected — starter sample was left untouched."
      );
      startTransition(() => router.refresh());
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[rgba(23,19,15,0.92)] p-6 text-white shadow-[0_24px_80px_rgba(23,19,15,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/60">Ingestion Bay</p>
          <h2 className="mt-2 text-2xl">Bring your statement data in</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
            Tag each upload to Jay, Cicely, or Joint before importing. Drop CSV, PDF, or image files — or paste a Google Sheets link.
          </p>
        </div>
        <button
          className="shrink-0 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-red-400/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isBusy}
          onClick={handleClearData}
          type="button"
          title="Delete all data and start fresh"
        >
          {activeAction === "clear" ? "Clearing…" : "Clear all data"}
        </button>
      </div>

      {/* Member selector */}
      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/50 mb-2">Importing for</p>
        <div className="flex gap-2">
          {MEMBERS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMember(m.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition border ${
                member === m.value
                  ? "border-white/40 bg-white/16 text-white"
                  : "border-white/14 bg-white/4 text-white/56 hover:bg-white/10"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI status */}
      <div className="mt-5 rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/84">
            {aiStatus.liveAnalysisEnabled
              ? `Claude is active on ${aiStatus.model}. Every PDF and image goes to Claude first.`
              : "Anthropic not connected. Add your API key to have Claude read every document."}
          </p>
          <div className="rounded-full border border-white/12 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/76">
            {aiStatus.liveAnalysisEnabled ? "Claude Ready" : "Local Only"}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`mt-6 rounded-[1.6rem] border-2 border-dashed p-6 transition-colors ${
          isDragging
            ? "border-white/60 bg-white/12"
            : "border-white/20 bg-white/5"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label
          className="flex cursor-pointer flex-col items-center gap-3 text-center"
          htmlFor="statement-files"
        >
          <div className="rounded-full border border-white/20 bg-white/8 px-5 py-2 text-sm font-medium text-white/80">
            {isDragging ? "Drop to upload" : "Choose files"}
          </div>
          <p className="text-xs text-white/50">
            {hasFiles
              ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected: ${selectedFiles.slice(0, 3).map((f) => f.name).join(", ")}${selectedFiles.length > 3 ? "…" : ""}`
              : "or drag and drop CSV, PDF, PNG, JPG here"}
          </p>
        </label>

        <input
          id="statement-files"
          ref={fileInputRef}
          type="file"
          accept=".csv,.pdf,.png,.jpg,.jpeg,.webp,text/csv,application/pdf,image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
        />

        {hasFiles && (
          <button
            className="mt-5 w-full rounded-[1.3rem] bg-white py-3 text-sm font-semibold text-[var(--ink)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
            onClick={handleImportClick}
            type="button"
          >
            {activeAction === "import" || isPending
              ? "Uploading…"
              : `Upload ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} for ${MEMBER_LABELS[member]}`}
          </button>
        )}
      </div>

      {/* Google Sheets */}
      <div className="mt-4">
        <button
          type="button"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/50 transition hover:text-white/80"
          onClick={() => setShowSheets((v) => !v)}
        >
          <span>{showSheets ? "▾" : "▸"}</span>
          Import from Google Sheets
        </button>

        {showSheets && (
          <div className="mt-3 rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
            <p className="text-xs text-white/60 mb-2">
              Share the sheet as "Anyone with the link can view", then paste the URL below.
            </p>
            <input
              type="url"
              className="w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
              placeholder="https://docs.google.com/spreadsheets/d/…"
              value={sheetsUrl}
              onChange={(e) => setSheetsUrl(e.target.value)}
            />
            <button
              type="button"
              disabled={isBusy || !sheetsUrl.trim()}
              onClick={handleSheetsImport}
              className="mt-3 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
            >
              {activeAction === "sheets" ? "Importing…" : `Import for ${MEMBER_LABELS[member]}`}
            </button>
          </div>
        )}
      </div>

      {/* Secondary actions */}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={handleSeedDemo}
          type="button"
        >
          {activeAction === "demo" ? "Loading…" : "Load starter dataset"}
        </button>
      </div>

      {/* Status message */}
      {message ? (
        <div className="mt-4 rounded-[1.4rem] bg-white/6 p-4 text-sm text-white/72">{message}</div>
      ) : null}
    </section>
  );
}
