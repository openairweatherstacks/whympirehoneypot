import { formatCurrency } from "@/lib/finance";
import type { InvestmentDashboard } from "@/lib/investing";
import { PriceRefreshButton } from "@/components/price-refresh-button";

type InvestmentCommandProps = {
  dashboard: InvestmentDashboard;
};

const toneStyles = {
  hot: "border-[rgba(212,109,49,0.22)] bg-[rgba(212,109,49,0.1)] text-[var(--heat)]",
  watch: "border-[rgba(27,107,99,0.18)] bg-[rgba(27,107,99,0.1)] text-[var(--brand)]",
  info: "border-[rgba(23,19,15,0.12)] bg-white/70 text-[var(--ink)]"
};

function formatPercent(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
}

export function InvestmentCommand({ dashboard }: InvestmentCommandProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Investment Command
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">ETF watchlist, DCA plan, and buy signals</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-[var(--line)] bg-[rgba(27,107,99,0.08)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
            Manual execution only
          </div>
          <PriceRefreshButton />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Positions
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{dashboard.stats.positions}</p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Portfolio value
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatCurrency(dashboard.stats.portfolioValueCents)}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Planned DCA
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatCurrency(dashboard.stats.monthlyContributionCents)}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(27,107,99,0.08)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Safer DCA cap
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {formatCurrency(dashboard.stats.safeContributionCents)}
          </p>
        </article>
      </div>

      {dashboard.stats.positions === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm leading-6 text-[var(--muted)]">
          No ETF positions yet. Load the sample portfolio or add a holding to activate allocation
          guidance, rebalancing alerts, and DCA recommendations.
        </div>
      ) : (
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
                    {alert.recommendedContributionCents > 0
                      ? formatCurrency(alert.recommendedContributionCents)
                      : alert.tone}
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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
              DCA and Allocation
            </p>
            <div className="mt-5 space-y-4">
              {dashboard.dcaPlan.map((item) => (
                <article
                  key={item.symbol}
                  className="rounded-[1.4rem] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--ink)]">{item.symbol}</p>
                      <p className="text-sm text-[var(--muted)]">{item.name}</p>
                    </div>
                    <span className="rounded-full bg-[rgba(27,107,99,0.09)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                      {formatCurrency(item.recommendedContributionCents)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    Weight is {(item.currentWeight * 100).toFixed(1)}% versus a {(item.targetWeight * 100).toFixed(1)}%
                    target. At current prices, this contribution buys about {item.estimatedShares.toFixed(2)} shares.
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {dashboard.positions.length > 0 ? (
        <div className="mt-8 overflow-hidden rounded-[1.6rem] border border-[var(--line)]">
          <table className="min-w-full divide-y divide-[var(--line)] text-left">
            <thead className="bg-[rgba(23,19,15,0.04)] text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">ETF</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Weight</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">52W Pullback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-white/70">
              {dashboard.positions.map((position) => (
                <tr key={position.symbol}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink)]">{position.symbol}</p>
                    <p className="text-sm text-[var(--muted)]">{position.assetClass}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--ink)]">
                    {formatCurrency(position.marketValueCents)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    {(position.currentWeight * 100).toFixed(1)}% / {(position.targetWeight * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--ink)]">
                    {formatCurrency(position.currentPriceCents)}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm ${
                      position.returnPct !== null && position.returnPct >= 0
                        ? "text-[var(--success)]"
                        : "text-[var(--heat)]"
                    }`}
                  >
                    {formatPercent(position.returnPct)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    {formatPercent(position.discountFromHighPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

