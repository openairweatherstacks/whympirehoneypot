import { formatCurrency } from "@/lib/finance";

type SpendTrendProps = {
  points: Array<{
    label: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }>;
};

export function SpendTrend({ points }: SpendTrendProps) {
  const maxValue = Math.max(
    ...points.flatMap((p) => [p.incomeCents, p.expenseCents]),
    1
  );

  const hasNegative = points.some((p) => p.netCents < 0);

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Cash Flow Pulse
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Income vs spend, month by month</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
            Income
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--heat)]" />
            Expenses
          </div>
          {hasNegative && (
            <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
              Deficit months detected
            </div>
          )}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-8 text-center text-sm text-[var(--muted)]">
          Import a CSV or load the starter dataset to see your financial rhythm take shape here.
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="mt-8 flex items-end gap-3" style={{ height: "220px" }}>
            {points.map((point, i) => {
              const incomeH = Math.max((point.incomeCents / maxValue) * 100, 4);
              const expenseH = Math.max((point.expenseCents / maxValue) * 100, 4);
              const isDeficit = point.netCents < 0;

              return (
                <div key={i} className="group relative flex flex-1 flex-col items-center gap-1">
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-10 hidden min-w-[140px] rounded-[1rem] border border-[var(--line)] bg-white p-3 shadow-lg group-hover:block">
                    <p className="text-xs font-semibold text-[var(--ink)]">{point.label}</p>
                    <p className="mt-1 text-xs text-[var(--brand)]">In: {formatCurrency(point.incomeCents)}</p>
                    <p className="text-xs text-[var(--heat)]">Out: {formatCurrency(point.expenseCents)}</p>
                    <p className={`mt-1 text-xs font-bold ${isDeficit ? "text-red-600" : "text-[var(--brand)]"}`}>
                      Net: {formatCurrency(point.netCents)}
                    </p>
                  </div>

                  {/* Bars */}
                  <div className="flex w-full items-end gap-1" style={{ height: "180px" }}>
                    <div
                      className="flex-1 rounded-t-lg bg-[var(--brand)] opacity-80 transition-all duration-500 group-hover:opacity-100"
                      style={{ height: `${incomeH}%` }}
                    />
                    <div
                      className={`flex-1 rounded-t-lg transition-all duration-500 group-hover:opacity-100 ${
                        isDeficit ? "bg-red-500 opacity-90" : "bg-[var(--heat)] opacity-70"
                      }`}
                      style={{ height: `${expenseH}%` }}
                    />
                  </div>

                  {/* Month label + net badge */}
                  <p className="mt-1 text-xs font-medium text-[var(--muted)]">{point.label}</p>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isDeficit
                        ? "bg-red-100 text-red-600"
                        : "bg-[rgba(27,107,99,0.1)] text-[var(--brand)]"
                    }`}
                  >
                    {isDeficit ? "-" : "+"}{formatCurrency(Math.abs(point.netCents))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Summary row */}
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-5">
            <div>
              <p className="text-xs text-[var(--muted)]">Total income</p>
              <p className="mt-1 text-lg font-semibold text-[var(--brand)]">
                {formatCurrency(points.reduce((s, p) => s + p.incomeCents, 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Total expenses</p>
              <p className="mt-1 text-lg font-semibold text-[var(--heat)]">
                {formatCurrency(points.reduce((s, p) => s + p.expenseCents, 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Net over period</p>
              {(() => {
                const net = points.reduce((s, p) => s + p.netCents, 0);
                return (
                  <p className={`mt-1 text-lg font-bold ${net < 0 ? "text-red-600" : "text-[var(--brand)]"}`}>
                    {formatCurrency(net)}
                  </p>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
