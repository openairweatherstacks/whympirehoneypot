import { formatCurrency } from "@/lib/finance";
import type { PerkDashboard } from "@/lib/perks";
import type { InvestmentDashboard } from "@/lib/investing";

type AlertCenterProps = {
  perkDashboard: PerkDashboard;
  investmentDashboard: InvestmentDashboard;
  expenseCents: number;
  incomeCents: number;
};

type UnifiedAlert = {
  id: string;
  urgency: "critical" | "high" | "info";
  category: "perk" | "invest" | "cashflow";
  title: string;
  body: string;
  value?: string;
  action: string;
};

const urgencyConfig = {
  critical: {
    badge: "bg-red-100 border-red-300 text-red-700",
    dot: "bg-red-500",
    label: "Urgent"
  },
  high: {
    badge: "bg-[rgba(212,109,49,0.12)] border-[rgba(212,109,49,0.3)] text-[var(--heat)]",
    dot: "bg-[var(--heat)]",
    label: "High value"
  },
  info: {
    badge: "bg-[rgba(27,107,99,0.08)] border-[rgba(27,107,99,0.2)] text-[var(--brand)]",
    dot: "bg-[var(--brand)]",
    label: "Note"
  }
};

export function AlertCenter({ perkDashboard, investmentDashboard, expenseCents, incomeCents }: AlertCenterProps) {
  const alerts: UnifiedAlert[] = [];

  // Cash flow alert — spending exceeds income
  if (expenseCents > incomeCents && incomeCents > 0) {
    const overage = expenseCents - incomeCents;
    alerts.push({
      id: "cashflow-deficit",
      urgency: "critical",
      category: "cashflow",
      title: "Expenses exceed income",
      body: `You're spending ${formatCurrency(overage)} more than you're bringing in. Every month this continues compounds the deficit.`,
      value: `−${formatCurrency(overage)}`,
      action: "Review the cash flow chart and find the largest reducible expense."
    });
  }

  // Perk alerts — hot = critical, watch = high, info = info
  for (const alert of perkDashboard.alerts.slice(0, 4)) {
    alerts.push({
      id: `perk-${alert.id}`,
      urgency: alert.tone === "hot" ? "high" : alert.tone === "watch" ? "high" : "info",
      category: "perk",
      title: alert.title,
      body: alert.body,
      value: alert.estimatedValueCents > 0 ? formatCurrency(alert.estimatedValueCents) : undefined,
      action: alert.action
    });
  }

  // Investment alerts — hot = high, watch = info
  for (const alert of investmentDashboard.alerts.slice(0, 3)) {
    alerts.push({
      id: `invest-${alert.id}`,
      urgency: alert.tone === "hot" ? "high" : "info",
      category: "invest",
      title: alert.title,
      body: alert.body,
      value: alert.tone === "hot" ? "Buy signal" : undefined,
      action: alert.action
    });
  }

  // Sort: critical first, then high, then info
  const order = { critical: 0, high: 1, info: 2 };
  alerts.sort((a, b) => order[a.urgency] - order[b.urgency]);

  const criticalCount = alerts.filter((a) => a.urgency === "critical").length;
  const highCount = alerts.filter((a) => a.urgency === "high").length;

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Alert Center
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">What needs your attention now</h2>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-100 border border-red-300 px-3 py-1 text-xs font-bold text-red-700">
              {criticalCount} urgent
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded-full bg-[rgba(212,109,49,0.12)] border border-[rgba(212,109,49,0.3)] px-3 py-1 text-xs font-bold text-[var(--heat)]">
              {highCount} high value
            </span>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/40 p-6 text-sm text-[var(--muted)]">
          No alerts right now. Import transactions and scan perk guides to activate the alert engine.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {alerts.map((alert) => {
            const cfg = urgencyConfig[alert.urgency];
            const categoryIcon = alert.category === "perk" ? "◆" : alert.category === "invest" ? "▲" : "●";
            return (
              <article
                key={alert.id}
                className="rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--ink)]">{alert.title}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        {categoryIcon} {alert.category}
                      </span>
                      {alert.value && (
                        <span className="ml-auto text-sm font-bold text-[var(--ink)]">{alert.value}</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-5 text-[var(--muted)]">{alert.body}</p>
                    <p className="mt-2 text-xs font-semibold text-[var(--brand)]">→ {alert.action}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
