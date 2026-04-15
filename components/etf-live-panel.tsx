"use client";

import { useState, useCallback } from "react";
import type { FinnhubLiveData, BuySignal } from "@/lib/finnhub";

const RJ_ETFS = ["VOO", "VTEB", "IEFA", "IJH", "VO", "IEMG", "HYMB", "IJR"];

// Statement cost basis (from Raymond James statement)
const STATEMENT_COST: Record<string, number> = {
  VOO:  636.22,
  VTEB: 50.56,
  IEFA: 94.05,
  IJH:  68.67,
  VO:   296.09,
  IEMG: 72.56,
  HYMB: 25.10,
  IJR:  127.03,
};

const SIGNAL_STYLES: Record<BuySignal, { badge: string; dot: string }> = {
  "strong-buy": {
    badge: "border-[rgba(27,107,99,0.25)] bg-[rgba(27,107,99,0.12)] text-[var(--brand)]",
    dot: "bg-[var(--brand)]",
  },
  "buy": {
    badge: "border-[rgba(27,107,99,0.18)] bg-[rgba(27,107,99,0.08)] text-[var(--brand)]",
    dot: "bg-[var(--brand)]",
  },
  "hold": {
    badge: "border-[rgba(23,19,15,0.12)] bg-white/70 text-[var(--muted)]",
    dot: "bg-[var(--muted)]",
  },
  "wait": {
    badge: "border-[rgba(212,109,49,0.18)] bg-[rgba(212,109,49,0.08)] text-[var(--heat)]",
    dot: "bg-[var(--heat)]",
  },
  "avoid": {
    badge: "border-[rgba(212,109,49,0.25)] bg-[rgba(212,109,49,0.14)] text-[var(--heat)]",
    dot: "bg-[var(--heat)]",
  },
};

function RangeBar({ position }: { position: number }) {
  // position 0–100 in 52-week range
  const clamped = Math.max(0, Math.min(100, position));
  return (
    <div className="relative mt-1 h-1.5 w-full rounded-full bg-[rgba(23,19,15,0.08)]">
      <div
        className="absolute left-0 top-0 h-1.5 rounded-full bg-gradient-to-r from-[var(--brand)] via-[rgba(212,109,49,0.7)] to-[var(--heat)]"
        style={{ width: "100%" }}
      />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--ink)] shadow"
        style={{ left: `${clamped}%` }}
      />
    </div>
  );
}

type RowProps = { live: FinnhubLiveData };

function EtfRow({ live }: RowProps) {
  const cost = STATEMENT_COST[live.symbol];
  const vsStatement = cost ? ((live.currentPrice - cost) / cost) * 100 : null;
  const styles = SIGNAL_STYLES[live.buySignal];

  return (
    <div className="rounded-[1.4rem] border border-[var(--line)] bg-white/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-[var(--ink)]">{live.symbol}</span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${styles.badge}`}
            >
              {live.buySignalLabel}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--muted)]">
            <span className="text-[var(--ink)] font-medium">${live.currentPrice.toFixed(2)}</span>
            <span className={live.changePercent >= 0 ? "text-[var(--brand)]" : "text-[var(--heat)]"}>
              {live.changePercent >= 0 ? "+" : ""}{live.changePercent.toFixed(2)}%
            </span>
            {vsStatement !== null && (
              <span className={vsStatement >= 0 ? "text-[var(--brand)]" : "text-[var(--heat)]"}>
                vs stmt: {vsStatement >= 0 ? "+" : ""}{vsStatement.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          <p>52W H: ${live.week52High.toFixed(2)}</p>
          <p>52W L: ${live.week52Low.toFixed(2)}</p>
        </div>
      </div>

      {/* 52-week range bar */}
      <div className="mt-3">
        <div className="flex justify-between text-[0.65rem] text-[var(--muted)] mb-1">
          <span>52W Low</span>
          <span className="font-medium">{live.rangePosition}% of range</span>
          <span>52W High</span>
        </div>
        <RangeBar position={live.rangePosition} />
      </div>

      {/* Analyst consensus */}
      {live.analystTotal > 0 && (
        <div className="mt-3 flex items-center gap-3 text-xs text-[var(--muted)]">
          <span className="font-semibold text-[var(--ink)]">{live.analystConsensus}</span>
          <span className="text-[var(--brand)]">{live.analystBuy}B</span>
          <span>{live.analystHold}H</span>
          <span className="text-[var(--heat)]">{live.analystSell}S</span>
          <span>({live.analystTotal} analysts)</span>
        </div>
      )}
    </div>
  );
}

type FetchState = "idle" | "loading" | "done" | "error";

export function EtfLivePanel() {
  const [state, setState] = useState<FetchState>("idle");
  const [data, setData] = useState<FinnhubLiveData[]>([]);
  const [errors, setErrors] = useState<{ symbol: string; error: string }[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/investing/live-prices");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as { data: FinnhubLiveData[]; errors: { symbol: string; error: string }[] };
      setData(json.data);
      setErrors(json.errors ?? []);
      setFetchedAt(new Date().toLocaleTimeString());
      setState("done");
    } catch (err) {
      setErrors([{ symbol: "ALL", error: err instanceof Error ? err.message : "Unknown error" }]);
      setState("error");
    }
  }, []);

  // Sort by buy signal strength
  const SIGNAL_ORDER: Record<BuySignal, number> = {
    "strong-buy": 0, "buy": 1, "hold": 2, "wait": 3, "avoid": 4,
  };
  const sorted = [...data].sort((a, b) => SIGNAL_ORDER[a.buySignal] - SIGNAL_ORDER[b.buySignal]);

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Live ETF Signals
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">
            Raymond James — guardianship portfolio
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {RJ_ETFS.join(" · ")} · powered by Finnhub
            {fetchedAt && <span className="ml-2">· refreshed {fetchedAt}</span>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={state === "loading"}
          className="shrink-0 rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--brand)] hover:bg-[rgba(27,107,99,0.08)] transition-colors disabled:opacity-50"
        >
          {state === "loading" ? "Loading…" : state === "done" ? "Refresh" : "Load live prices"}
        </button>
      </div>

      {state === "idle" && (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm leading-6 text-[var(--muted)]">
          Click <span className="font-semibold text-[var(--brand)]">Load live prices</span> to pull real-time quotes from Finnhub and see buy timing recommendations based on 52-week range position and analyst consensus.
        </div>
      )}

      {state === "error" && (
        <div className="mt-6 space-y-2">
          {errors.map((e) => (
            <p key={e.symbol} className="rounded-[1rem] bg-red-50 px-4 py-2 text-sm text-red-600">
              {e.symbol}: {e.error}
            </p>
          ))}
        </div>
      )}

      {state === "loading" && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RJ_ETFS.map((sym) => (
            <div key={sym} className="animate-pulse rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4 h-28" />
          ))}
        </div>
      )}

      {state === "done" && sorted.length > 0 && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {sorted.map((live) => (
              <EtfRow key={live.symbol} live={live} />
            ))}
          </div>

          {errors.length > 0 && (
            <div className="mt-4 space-y-1">
              {errors.map((e) => (
                <p key={e.symbol} className="text-xs text-[var(--muted)]">
                  {e.symbol}: {e.error}
                </p>
              ))}
            </div>
          )}

          {/* Buy order summary */}
          <div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-[rgba(27,107,99,0.04)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)] mb-3">
              Buy priority order — best entries first
            </p>
            <div className="flex flex-wrap gap-2">
              {sorted.filter(l => l.buySignal === "strong-buy" || l.buySignal === "buy").map((l, i) => (
                <span key={l.symbol} className="rounded-full bg-[rgba(27,107,99,0.1)] border border-[rgba(27,107,99,0.18)] px-3 py-1 text-xs font-semibold text-[var(--brand)]">
                  {i + 1}. {l.symbol}
                </span>
              ))}
              {sorted.filter(l => l.buySignal === "hold").map((l) => (
                <span key={l.symbol} className="rounded-full bg-[rgba(23,19,15,0.05)] border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]">
                  {l.symbol} — hold
                </span>
              ))}
              {sorted.filter(l => l.buySignal === "wait" || l.buySignal === "avoid").map((l) => (
                <span key={l.symbol} className="rounded-full bg-[rgba(212,109,49,0.07)] border border-[rgba(212,109,49,0.15)] px-3 py-1 text-xs text-[var(--heat)]">
                  {l.symbol} — {l.buySignal}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
