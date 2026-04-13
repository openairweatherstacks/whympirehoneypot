import { AlertCenter } from "@/components/alert-center";
import { ImportReview } from "@/components/import-review";
import { CategoryBreakdown } from "@/components/category-breakdown";
import { DeficitCrusher } from "@/components/deficit-crusher";
import { DeficitIntake } from "@/components/deficit-intake";
import { FinanceChat } from "@/components/finance-chat";
import { HistoricalArchive } from "@/components/historical-archive";
import { InsightFeed } from "@/components/insight-feed";
import { InvestmentCommand } from "@/components/investment-command";
import { InvestmentIntake } from "@/components/investment-intake";
import { MemberFilter } from "@/components/member-filter";
import { MetricCard } from "@/components/metric-card";
import { ModuleRadar } from "@/components/module-radar";
import { PerkAlertCenter } from "@/components/perk-alert-center";
import { PerkIntake } from "@/components/perk-intake";
import { RecurringExpenses } from "@/components/recurring-expenses";
import { SpendTrend } from "@/components/spend-trend";
import { TransactionTable } from "@/components/transaction-table";
import { ManualEntry } from "@/components/manual-entry";
import { UploadPanel } from "@/components/upload-panel";
import { getDeficitDashboard } from "@/lib/deficit";
import { getAiConnectionStatus, getHistoricalDocuments } from "@/lib/documents";
import { formatCurrency, getDashboardSnapshot } from "@/lib/finance";
import { generateFinancialInsights } from "@/lib/intelligence";
import { getInvestmentDashboard } from "@/lib/investing";
import { getPerkDashboard } from "@/lib/perks";
import { getRecurringExpenses, getRecurringSummary } from "@/lib/recurring";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const params = await searchParams;
  const activeMember = params.member === "jay" || params.member === "cicely" ? params.member : "all";

  const [snapshot, insights, deficitDashboard, investmentDashboard, perkDashboard, historicalDocuments, recurringExpenses] = await Promise.all([
    getDashboardSnapshot(activeMember === "all" ? undefined : activeMember),
    generateFinancialInsights(),
    getDeficitDashboard(),
    getInvestmentDashboard(),
    getPerkDashboard(),
    getHistoricalDocuments(),
    getRecurringExpenses()
  ]);

  const aiStatus = getAiConnectionStatus();
  const recurringSummary = getRecurringSummary(recurringExpenses);
  const hasData = snapshot.totals.transactionCount > 0;

  // Debt-free date
  const recommendedStrategy = deficitDashboard.strategies.find(
    (s) => s.id === deficitDashboard.stats.recommendedStrategy
  ) ?? null;
  const monthsToFree = recommendedStrategy?.monthsToDebtFree ?? null;
  const debtFreeLabel = monthsToFree === null
    ? "Increase payments"
    : monthsToFree === 0
      ? "Debt free!"
      : `~${Math.ceil(monthsToFree / 12)} yr${Math.ceil(monthsToFree / 12) === 1 ? "" : "s"} (${monthsToFree} mo)`;

  // Net tone
  const netIsNegative = snapshot.totals.netCents < 0;
  const netTone = netIsNegative ? "critical" : "brand";

  // Expense vs income severity
  const overBudget = snapshot.totals.expenseCents > snapshot.totals.incomeCents && hasData;

  const promptSuggestions = Array.from(
    new Set([
      ...insights.map((i) => i.prompt),
      ...deficitDashboard.alerts.map((a) => a.prompt),
      ...investmentDashboard.alerts.map((a) => a.prompt),
      ...perkDashboard.alerts.map((a) => a.prompt)
    ])
  );

  return (
    <main className="relative overflow-hidden px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* ── TOP BAR: Branding + Member filter ─────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-[rgba(27,107,99,0.18)] bg-[rgba(27,107,99,0.09)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.34em] text-[var(--brand)]">
              Whympire Honey Pot
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
              {activeMember === "all"
                ? "Commonwealth — Jay & Cicely combined"
                : `${activeMember === "jay" ? "Jay" : "Cicely"}'s view + joint accounts`}
            </p>
          </div>
          <MemberFilter current={activeMember} />
        </div>

        {/* ── ROW 1: Financial Snapshot — big numbers, color-coded ───────────── */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            size="hero"
            label="Net position"
            value={formatCurrency(snapshot.totals.netCents)}
            tone={netTone}
            footnote={
              hasData
                ? netIsNegative
                  ? "Expenses exceed income — action required"
                  : `${snapshot.totals.transactionCount} transactions tracked`
                : "Import your first statement to activate"
            }
          />
          <MetricCard
            size="hero"
            label="Income"
            value={formatCurrency(snapshot.totals.incomeCents)}
            tone="brand"
            footnote="Total inflows captured"
          />
          <MetricCard
            size="hero"
            label="Expenses"
            value={formatCurrency(snapshot.totals.expenseCents)}
            tone={overBudget ? "critical" : "heat"}
            footnote={overBudget ? `Over income by ${formatCurrency(snapshot.totals.expenseCents - snapshot.totals.incomeCents)}` : `Top area: ${snapshot.highlights.topCategory}`}
          />
          <MetricCard
            size="hero"
            label="Debt-free estimate"
            value={deficitDashboard.stats.accounts > 0 ? debtFreeLabel : "No debt tracked"}
            tone={monthsToFree === null && deficitDashboard.stats.accounts > 0 ? "critical" : monthsToFree === 0 ? "brand" : "neutral"}
            footnote={deficitDashboard.stats.accounts > 0 ? `${formatCurrency(deficitDashboard.stats.totalBalanceCents)} balance · ${deficitDashboard.stats.weightedAprPercent.toFixed(1)}% avg APR` : "Add debt accounts in Deficit Crusher"}
          />
        </section>

        {/* ── Classification review — only visible when there are pending items */}
        <ImportReview />

        {/* ── ROW 2: Cash flow chart — full width ────────────────────────────── */}
        <SpendTrend points={snapshot.monthTotals} />

        {/* ── ROW 3: Intelligence Brief + Alert Center ───────────────────────── */}
        <div className="grid gap-8 xl:grid-cols-[1fr_1fr]">
          <InsightFeed insights={insights} />
          <AlertCenter
            perkDashboard={perkDashboard}
            investmentDashboard={investmentDashboard}
            expenseCents={snapshot.totals.expenseCents}
            incomeCents={snapshot.totals.incomeCents}
          />
        </div>

        {/* ── ROW 4: Deficit Crusher + ETF Command ───────────────────────────── */}
        <div className="grid gap-8 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <DeficitIntake />
            <DeficitCrusher dashboard={deficitDashboard} />
          </div>
          <div className="space-y-6">
            <InvestmentIntake />
            <InvestmentCommand dashboard={investmentDashboard} />
          </div>
        </div>

        {/* ── ROW 5: Recurring expenses ──────────────────────────────────────── */}
        <RecurringExpenses />

        {/* ── ROW 6: Perks ───────────────────────────────────────────────────── */}
        <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
          <PerkIntake />
          <PerkAlertCenter dashboard={perkDashboard} />
        </div>

        {/* ── ROW 7: Chat + Category breakdown ──────────────────────────────── */}
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <FinanceChat suggestions={promptSuggestions} />
          <CategoryBreakdown categories={snapshot.categoryTotals} />
        </div>

        {/* ── ROW 8: Recent transactions ─────────────────────────────────────── */}
        <TransactionTable transactions={snapshot.recentTransactions} />

        {/* ── ROW 9: Manual entry ───────────────────────────────────────────── */}
        <ManualEntry />

        {/* ── ROW 10: Upload + Historical archive ───────────────────────────── */}
        <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
          <UploadPanel aiStatus={aiStatus} />
          <HistoricalArchive documents={historicalDocuments} />
        </div>

        {/* ── BOTTOM: Import log + Module radar ─────────────────────────────── */}
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">Import Log</p>
            <h2 className="mt-2 text-2xl text-[var(--ink)]">Recent ingestion runs</h2>
            {snapshot.recentImports.length === 0 ? (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm text-[var(--muted)]">
                No import history yet.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {snapshot.recentImports.map((item) => (
                  <article
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-[var(--ink)]">{item.filename}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {item.rowCount} rows · {item.source}
                        {item.member && item.member !== "joint" && (
                          <span className="ml-2 font-semibold capitalize">{item.member}</span>
                        )}
                      </p>
                    </div>
                    <div className="rounded-full bg-[rgba(27,107,99,0.09)] px-3 py-1 text-xs font-semibold text-[var(--brand)]">
                      {new Date(item.importedAt).toLocaleString()}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <ModuleRadar />
        </div>

      </div>
    </main>
  );
}
