import { formatCurrency } from "@/lib/finance";
import type { PerkDashboard } from "@/lib/perks";

type PerkAlertCenterProps = {
  dashboard: PerkDashboard;
};

const toneStyles = {
  hot: "border-[rgba(212,109,49,0.22)] bg-[rgba(212,109,49,0.1)] text-[var(--heat)]",
  watch: "border-[rgba(27,107,99,0.18)] bg-[rgba(27,107,99,0.1)] text-[var(--brand)]",
  info: "border-[rgba(23,19,15,0.12)] bg-white/70 text-[var(--ink)]"
};

const urgencyLabel = {
  hot: { text: "Money on the table", style: "bg-[rgba(212,109,49,0.15)] text-[var(--heat)] border-[rgba(212,109,49,0.3)]" },
  watch: { text: "High value", style: "bg-[rgba(27,107,99,0.1)] text-[var(--brand)] border-[rgba(27,107,99,0.2)]" },
  info: { text: "Nice to know", style: "bg-white/60 text-[var(--muted)] border-[var(--line)]" }
};

export function PerkAlertCenter({ dashboard }: PerkAlertCenterProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Hidden Money Radar
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Perk alerts tied to your real spend</h2>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[rgba(212,109,49,0.08)] px-3 py-1 text-xs font-medium text-[var(--heat)]">
          Key differentiator
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Docs</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {dashboard.stats.documentsScanned}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Benefits
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {dashboard.stats.benefitsDetected}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Alerts
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {dashboard.stats.activeAlerts}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(27,107,99,0.08)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Est. monthly value
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatCurrency(dashboard.stats.estimatedMonthlyValueCents)}
          </p>
        </article>
      </div>

      {dashboard.stats.documentsScanned === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm leading-6 text-[var(--muted)]">
          No perk guides have been scanned yet. Paste agreement text or load the sample guides to see
          cashback, credit, travel coverage, and protection alerts light up here.
        </div>
      ) : (
        <div className="mt-8 grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            {dashboard.alerts.map((alert) => (
              <article
                key={alert.id}
                className="rounded-[1.6rem] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-5 shadow-[0_18px_48px_rgba(23,19,15,0.05)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl text-[var(--ink)]">{alert.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${urgencyLabel[alert.tone].style}`}>
                      {urgencyLabel[alert.tone].text}
                    </span>
                    {alert.estimatedValueCents > 0 && (
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneStyles[alert.tone]}`}>
                        {formatCurrency(alert.estimatedValueCents)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{alert.body}</p>
                <p className="mt-4 text-sm font-medium text-[var(--ink)]">Next move: {alert.action}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                  Ask next: {alert.prompt}
                </p>
              </article>
            ))}
          </div>

          <section className="rounded-[1.7rem] border border-[var(--line)] bg-white/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
              Scanned Guides
            </p>
            <div className="mt-5 space-y-4">
              {dashboard.documents.map((document) => (
                <article
                  key={document.id}
                  className="rounded-[1.4rem] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--ink)]">{document.provider}</p>
                      <p className="text-sm text-[var(--muted)]">{document.title}</p>
                    </div>
                    <span className="rounded-full bg-[rgba(27,107,99,0.09)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                      {document.benefitCount} hits
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {document.benefitLabels.map((label) => (
                      <span
                        key={`${document.id}-${label}`}
                        className="rounded-full border border-[var(--line)] bg-[rgba(212,109,49,0.08)] px-3 py-1 text-xs text-[var(--heat)]"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{document.preview}...</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

