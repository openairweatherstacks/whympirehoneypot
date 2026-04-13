import type { FinancialInsight } from "@/lib/intelligence";

type InsightFeedProps = {
  insights: FinancialInsight[];
};

const toneStyles = {
  action: "border-[rgba(212,109,49,0.22)] bg-[rgba(212,109,49,0.1)] text-[var(--heat)]",
  watch: "border-[rgba(23,19,15,0.12)] bg-white/70 text-[var(--ink)]",
  win: "border-[rgba(15,122,67,0.22)] bg-[rgba(15,122,67,0.1)] text-[var(--success)]"
};

export function InsightFeed({ insights }: InsightFeedProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Intelligence Brief
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">What the ledger is telling you now</h2>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[rgba(27,107,99,0.08)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
          Phase 2 live
        </div>
      </div>

      <div className="mt-8 grid gap-4">
        {insights.map((insight) => (
          <article
            key={insight.id}
            className="rounded-[1.6rem] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-5 shadow-[0_18px_48px_rgba(23,19,15,0.05)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl text-[var(--ink)]">{insight.title}</h3>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneStyles[insight.tone]}`}
              >
                {insight.supportingValue}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{insight.body}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
              Ask next: {insight.prompt}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

