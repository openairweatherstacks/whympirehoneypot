import { formatCurrency } from "@/lib/finance";
import type { DeficitDashboard } from "@/lib/deficit";

type DeficitCrusherProps = {
  dashboard: DeficitDashboard;
};

const toneStyles = {
  hot: "border-[rgba(212,109,49,0.22)] bg-[rgba(212,109,49,0.1)] text-[var(--heat)]",
  watch: "border-[rgba(27,107,99,0.18)] bg-[rgba(27,107,99,0.1)] text-[var(--brand)]",
  info: "border-[rgba(23,19,15,0.12)] bg-white/70 text-[var(--ink)]"
};

function formatApr(aprPercent: number) {
  return `${aprPercent.toFixed(1)}%`;
}

function formatMonths(months: number | null) {
  if (months === null) {
    return "Needs higher payment";
  }

  if (months === 0) {
    return "Debt free";
  }

  return `${months} mo`;
}

export function DeficitCrusher({ dashboard }: DeficitCrusherProps) {
  const recommendedStrategy =
    dashboard.strategies.find((strategy) => strategy.id === dashboard.stats.recommendedStrategy) ?? null;
  const alternateStrategy = dashboard.strategies.find(
    (strategy) => strategy.id !== dashboard.stats.recommendedStrategy
  );
  const interestAdvantageCents =
    recommendedStrategy && alternateStrategy
      ? alternateStrategy.totalInterestCents - recommendedStrategy.totalInterestCents
      : 0;

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Deficit Crusher
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Debt priority, payoff runway, and call scripts</h2>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[rgba(27,107,99,0.08)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
          Local payoff modeling
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Accounts</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{dashboard.stats.accounts}</p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Debt balance</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatCurrency(dashboard.stats.totalBalanceCents)}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Weighted APR</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatApr(dashboard.stats.weightedAprPercent)}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Minimum due</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatCurrency(dashboard.stats.monthlyMinimumCents)}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(27,107,99,0.08)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Recommended pay</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatCurrency(dashboard.stats.recommendedPaymentCents)}
          </p>
        </article>
      </div>

      {dashboard.stats.accounts === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm leading-6 text-[var(--muted)]">
          No debts tracked yet. Add a balance or load the sample debt stack to unlock avalanche versus
          snowball comparisons, payoff timing, utilization warnings, and negotiation scripts.
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-8 xl:grid-cols-[1.02fr_0.98fr]">
            <div className="space-y-4">
              {dashboard.alerts.map((alert) => (
                <article
                  key={alert.id}
                  className="rounded-[1.6rem] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-5 shadow-[0_18px_48px_rgba(23,19,15,0.05)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl text-[var(--ink)]">{alert.title}</h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneStyles[alert.tone]}`}
                    >
                      {alert.supportingValue}
                    </span>
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
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                    Strategy Compare
                  </p>
                  <h3 className="mt-2 text-xl text-[var(--ink)]">Avalanche versus snowball</h3>
                </div>
                {recommendedStrategy ? (
                  <div className="rounded-full bg-[rgba(27,107,99,0.09)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                    Recommended: {recommendedStrategy.label}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                {dashboard.strategies.map((strategy) => (
                  <article
                    key={strategy.id}
                    className={`rounded-[1.4rem] border p-4 ${
                      strategy.id === dashboard.stats.recommendedStrategy
                        ? "border-[rgba(27,107,99,0.2)] bg-[rgba(27,107,99,0.08)]"
                        : "border-[var(--line)] bg-[rgba(255,255,255,0.72)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--ink)]">{strategy.label}</p>
                        <p className="text-sm text-[var(--muted)]">{strategy.description}</p>
                      </div>
                      <span className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink)]">
                        {formatMonths(strategy.monthsToDebtFree)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.2rem] bg-white/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          Est. interest
                        </p>
                        <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                          {formatCurrency(strategy.totalInterestCents)}
                        </p>
                      </div>
                      <div className="rounded-[1.2rem] bg-white/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          First focus
                        </p>
                        <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                          {strategy.focusAccount ?? "n/a"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                      Payoff order: {strategy.payoffOrder.join(" -> ")}
                    </p>
                  </article>
                ))}
              </div>

              {recommendedStrategy && alternateStrategy ? (
                <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                  The recommended path{" "}
                  {interestAdvantageCents >= 0 ? "saves" : "costs"} about{" "}
                  {formatCurrency(Math.abs(interestAdvantageCents))} in projected interest versus the
                  alternate strategy at the current payment pace.
                </p>
              ) : null}
            </section>
          </div>

          {dashboard.scripts.length > 0 ? (
            <div className="mt-8 grid gap-4 xl:grid-cols-2">
              {dashboard.scripts.map((script) => (
                <article
                  key={script.id}
                  className="rounded-[1.6rem] border border-[var(--line)] bg-[rgba(23,19,15,0.94)] p-5 text-white shadow-[0_18px_48px_rgba(23,19,15,0.12)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">
                    Negotiation play
                  </p>
                  <h3 className="mt-2 text-xl">{script.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/72">{script.reason}</p>
                  <div className="mt-4 rounded-[1.3rem] bg-white/8 p-4 text-sm leading-6 text-white/84">
                    {script.script}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-[1.6rem] border border-[var(--line)]">
            <table className="min-w-full divide-y divide-[var(--line)] text-left">
              <thead className="bg-[rgba(23,19,15,0.04)] text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Debt</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">APR</th>
                  <th className="px-4 py-3">Minimum</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Interest</th>
                  <th className="px-4 py-3">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] bg-white/70">
                {dashboard.accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--ink)]">{account.name}</p>
                      <p className="text-sm text-[var(--muted)]">{account.debtType}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--ink)]">
                      {formatCurrency(account.balanceCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--muted)]">{formatApr(account.aprPercent)}</td>
                    <td className="px-4 py-3 text-sm text-[var(--ink)]">
                      {formatCurrency(account.minimumPaymentCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--ink)]">
                      {formatCurrency(account.targetPaymentCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--heat)]">
                      {formatCurrency(account.estimatedMonthlyInterestCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--muted)]">
                      {account.utilizationRatio === null
                        ? "n/a"
                        : `${Math.round(account.utilizationRatio * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
