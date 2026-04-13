import { answerDebtQuestion, getDeficitDashboard } from "@/lib/deficit";
import { ensureDb } from "@/lib/db";
import { formatCurrency, getDashboardSnapshot } from "@/lib/finance";
import { answerInvestmentQuestion, getInvestmentDashboard } from "@/lib/investing";
import { answerPerkQuestion, getPerkDashboard } from "@/lib/perks";
import { getRecurringExpenses, getRecurringSummary } from "@/lib/recurring";

export type InsightTone = "action" | "watch" | "win";

export type FinancialInsight = {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
  supportingValue: string;
  prompt: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type FinanceChatReply = {
  answer: string;
  source: "local" | "anthropic";
  suggestions: string[];
};

export const DEFAULT_SUGGESTIONS = [
  "Where am I overspending right now?",
  "How much did I spend on food last month?",
  "Can I afford a $300 car payment?",
  "Show me recurring subscriptions.",
  "Which debt should I pay first?",
  "Should I use avalanche or snowball?",
  "What perks am I probably not using?",
  "What ETF should I add to next?"
];

type MonthSummary = {
  month: string;
  label: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
};

type RecurringMerchant = {
  merchant: string;
  category: string;
  averageAmountCents: number;
  activeMonths: number;
  lastSeen: string;
};

type ExpenseRow = {
  description: string;
  merchant: string;
  category: string;
  amountCents: number;
  transactionDate: string;
};

export type FinanceBrain = {
  snapshot: Awaited<ReturnType<typeof getDashboardSnapshot>>;
  latestMonth: MonthSummary | null;
  previousMonth: MonthSummary | null;
  averageMonthlyNetCents: number;
  recurringMerchants: RecurringMerchant[];
  largestExpenses: ExpenseRow[];
  categoryAverageSpend: number;
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  Food: ["food", "groceries", "grocery", "restaurant", "restaurants", "dining", "coffee"],
  Housing: ["housing", "rent", "mortgage", "home"],
  Transportation: ["transport", "transportation", "gas", "fuel", "uber", "lyft", "transit"],
  Subscriptions: ["subscription", "subscriptions", "memberships", "streaming"],
  Utilities: ["utilities", "internet", "phone", "electric", "hydro"],
  Travel: ["travel", "hotel", "airbnb", "flight"],
  Debt: ["debt", "loan", "credit card", "card payment"],
  Shopping: ["shopping", "amazon", "retail"],
  Health: ["health", "pharmacy", "medical", "dental"]
};

export async function getFinanceBrain(): Promise<FinanceBrain> {
  const snapshot = await getDashboardSnapshot();
  const latestMonth = snapshot.monthTotals[snapshot.monthTotals.length - 1] ?? null;
  const previousMonth = snapshot.monthTotals[snapshot.monthTotals.length - 2] ?? null;
  const averageMonthlyNetCents =
    snapshot.monthTotals.length > 0
      ? Math.round(snapshot.monthTotals.reduce((total, month) => total + month.netCents, 0) / snapshot.monthTotals.length)
      : 0;

  const db = await ensureDb();
  const recurringMerchants = (await db.execute(`
    SELECT
      merchant,
      category,
      ROUND(AVG(ABS(amount_cents))) AS averageAmountCents,
      COUNT(DISTINCT posted_month) AS activeMonths,
      MAX(transaction_date) AS lastSeen
    FROM transactions
    WHERE direction = 'expense'
    GROUP BY merchant, category
    HAVING COUNT(*) >= 2 AND COUNT(DISTINCT posted_month) >= 2
    ORDER BY averageAmountCents DESC
    LIMIT 5
  `)).rows as unknown as RecurringMerchant[];

  const largestExpenses = (await db.execute(`
    SELECT
      description,
      merchant,
      category,
      ABS(amount_cents) AS amountCents,
      transaction_date AS transactionDate
    FROM transactions
    WHERE direction = 'expense'
    ORDER BY ABS(amount_cents) DESC
    LIMIT 5
  `)).rows as unknown as ExpenseRow[];

  const categoryAverageSpend =
    snapshot.categoryTotals.length > 0
      ? Math.round(snapshot.categoryTotals.reduce((total, c) => total + c.spendCents, 0) / snapshot.categoryTotals.length)
      : 0;

  return { snapshot, latestMonth, previousMonth, averageMonthlyNetCents, recurringMerchants, largestExpenses, categoryAverageSpend };
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function formatMonthForHumans(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
}

function detectCategory(question: string) {
  const normalized = question.toLowerCase();
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) return category;
  }
  return null;
}

async function getMonthCategorySpend(month: string, category: string) {
  const db = await ensureDb();
  const result = (await db.execute({
    sql: `SELECT COALESCE(SUM(ABS(amount_cents)), 0) AS spendCents FROM transactions WHERE direction = 'expense' AND posted_month = ? AND category = ?`,
    args: [month, category]
  })).rows[0] as unknown as { spendCents: number };
  return Number(result.spendCents);
}

async function getMemberBreakdown() {
  const db = await ensureDb();
  return (await db.execute(`
    SELECT
      member,
      COALESCE(SUM(CASE WHEN direction = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
      COALESCE(SUM(CASE WHEN direction = 'expense' THEN ABS(amount_cents) ELSE 0 END), 0) AS expenseCents
    FROM transactions
    WHERE member IN ('jay', 'cicely', 'joint')
    GROUP BY member
  `)).rows as unknown as Array<{ member: string; incomeCents: number; expenseCents: number }>;
}

export async function summarizeContext(brain: FinanceBrain) {
  const [deficitDashboard, perkDashboard, investmentDashboard, recurringExpenses, memberBreakdown] = await Promise.all([
    getDeficitDashboard(),
    getPerkDashboard(),
    getInvestmentDashboard(),
    getRecurringExpenses(),
    getMemberBreakdown()
  ]);
  const recurringSummary = getRecurringSummary(recurringExpenses);

  if (brain.snapshot.totals.transactionCount === 0) {
    return `No imported transactions yet. Perk guides scanned: ${perkDashboard.stats.documentsScanned}. Ask the user to load demo data or import a CSV first.`;
  }

  const topCategories = brain.snapshot.categoryTotals.slice(0, 3).map((item) => `${item.category}: ${formatCurrency(item.spendCents)}`).join("; ");
  const recurring = brain.recurringMerchants.slice(0, 3).map((item) => `${item.merchant} (${formatCurrency(Number(item.averageAmountCents))})`).join("; ");
  const recurringList = recurringExpenses.slice(0, 5).map((e) => `${e.name} ${formatCurrency(e.amountCents)} ${e.frequency}`).join("; ");

  return [
    `Tracked income: ${formatCurrency(brain.snapshot.totals.incomeCents)}.`,
    `Tracked expenses: ${formatCurrency(brain.snapshot.totals.expenseCents)}.`,
    brain.latestMonth ? `Latest month is ${formatMonthForHumans(brain.latestMonth.month)} with income ${formatCurrency(brain.latestMonth.incomeCents)}, expenses ${formatCurrency(brain.latestMonth.expenseCents)}, and net ${formatCurrency(brain.latestMonth.netCents)}.` : "No monthly summary available.",
    brain.previousMonth ? `Previous month is ${formatMonthForHumans(brain.previousMonth.month)} with expenses ${formatCurrency(brain.previousMonth.expenseCents)}.` : "No prior month available.",
    `Top spend categories: ${topCategories || "none yet"}.`,
    `Recurring merchants from transactions: ${recurring || "none identified"}.`,
    recurringSummary.count > 0 ? `Manually tracked recurring expenses (${recurringSummary.count} total, ${formatCurrency(recurringSummary.monthlyTotalCents)}/mo fixed): ${recurringList}.` : "No manually tracked recurring expenses yet.",
    memberBreakdown.length > 0 ? `Per-member breakdown: ${memberBreakdown.map((m) => `${m.member} — income ${formatCurrency(Number(m.incomeCents))}, expenses ${formatCurrency(Number(m.expenseCents))}`).join("; ")}.` : "No per-member data yet — transactions tagged 'joint' by default.",
    `Debt accounts tracked: ${deficitDashboard.stats.accounts}.`,
    `Debt balance: ${formatCurrency(deficitDashboard.stats.totalBalanceCents)}.`,
    deficitDashboard.stats.recommendedStrategy ? `Debt strategy: ${deficitDashboard.stats.recommendedStrategy}.` : "No debt strategy yet.",
    deficitDashboard.stats.projectedPayoffMonths !== null ? `Projected debt payoff: ${deficitDashboard.stats.projectedPayoffMonths} months.` : "Debt payoff not projected yet.",
    `Perk documents scanned: ${perkDashboard.stats.documentsScanned}.`,
    `Active perk alerts: ${perkDashboard.stats.activeAlerts}.`,
    perkDashboard.alerts[0] ? `Top perk alert: ${perkDashboard.alerts[0].title}.` : "No perk alerts yet.",
    `Investment positions: ${investmentDashboard.stats.positions}.`,
    `Monthly ETF contributions: ${formatCurrency(investmentDashboard.stats.monthlyContributionCents)}.`,
    investmentDashboard.alerts[0] ? `Top investment signal: ${investmentDashboard.alerts[0].title}.` : "No investment signal yet."
  ].join(" ");
}

async function buildFallbackAnswer(question: string, brain: FinanceBrain) {
  const normalized = question.toLowerCase();

  if (brain.snapshot.totals.transactionCount === 0) {
    return { answer: "I don't have any imported transactions yet. Load the starter dataset or import a statement CSV first, then ask again.", suggestions: DEFAULT_SUGGESTIONS };
  }

  const latestMonth = brain.latestMonth;
  const previousMonth = brain.previousMonth;
  const category = detectCategory(normalized);
  const amountMatch = normalized.match(/\$?\s?(\d[\d,]*\.?\d{0,2})/);
  const proposedAmountCents = amountMatch ? Math.round(Number(amountMatch[1].replace(/,/g, "")) * 100) : null;

  if (category && /spend|spent/.test(normalized) && /last month/.test(normalized) && previousMonth) {
    const spendCents = await getMonthCategorySpend(previousMonth.month, category);
    return {
      answer: `In ${formatMonthForHumans(previousMonth.month)}, you spent ${formatCurrency(spendCents)} on ${category.toLowerCase()}.`,
      suggestions: [`How does ${category.toLowerCase()} spending compare to this month?`, "Where am I overspending right now?", "What are my biggest expenses?"]
    };
  }

  if (category && /spend|spent/.test(normalized) && latestMonth) {
    const spendCents = await getMonthCategorySpend(latestMonth.month, category);
    return {
      answer: `In ${formatMonthForHumans(latestMonth.month)}, you've logged ${formatCurrency(spendCents)} in ${category.toLowerCase()} spending.`,
      suggestions: [`How much did I spend on ${category.toLowerCase()} last month?`, "Show me recurring subscriptions.", "Where am I overspending right now?"]
    };
  }

  if ((/overspend|overspending|too much/.test(normalized) || normalized.includes("leaking")) && latestMonth) {
    const topCategory = brain.snapshot.categoryTotals[0];
    const change = previousMonth ? percentChange(latestMonth.expenseCents, previousMonth.expenseCents) : null;
    const previousMonthLabel = previousMonth ? formatMonthForHumans(previousMonth.month) : null;
    const trendSentence =
      change === null || !previousMonthLabel
        ? `You only have one month of trend data so far, so I'd watch ${topCategory?.category ?? "your top category"} first.`
        : change > 0.12
          ? `Expenses climbed ${Math.round(change * 100)}% versus ${previousMonthLabel}.`
          : change < -0.12
            ? `Expenses dropped ${Math.abs(Math.round(change * 100))}% versus ${previousMonthLabel}, which is a good sign.`
            : `Overall spending is fairly steady versus ${previousMonthLabel}.`;

    return {
      answer: `${trendSentence} Your biggest pressure point is ${topCategory?.category ?? "uncategorized spend"}, which accounts for ${formatCurrency(topCategory?.spendCents ?? 0)} of total expenses. I'd start there, then review ${brain.recurringMerchants[0]?.merchant ?? "any recurring subscriptions"} for easy cuts.`,
      suggestions: ["Show me recurring subscriptions.", "What is my largest expense?", "Can I afford a $300 car payment?"]
    };
  }

  if ((normalized.includes("subscription") || normalized.includes("recurring")) && brain.recurringMerchants.length > 0) {
    const list = brain.recurringMerchants.slice(0, 3).map((item) => `${item.merchant} at about ${formatCurrency(Number(item.averageAmountCents))} across ${item.activeMonths} months`).join("; ");
    return {
      answer: `I found recurring-looking charges worth reviewing: ${list}. These are the best candidates for subscription cleanup or benefit review.`,
      suggestions: ["Where am I overspending right now?", "How much did I spend on subscriptions this month?", "What is my largest expense?"]
    };
  }

  if ((normalized.includes("afford") || normalized.includes("car payment")) && proposedAmountCents !== null) {
    const runwayCents = (latestMonth?.netCents ?? 0) - proposedAmountCents;
    const averageRunwayCents = brain.averageMonthlyNetCents - proposedAmountCents;

    if (runwayCents > 0 && averageRunwayCents > 0) {
      return {
        answer: `Based on your current data, a ${formatCurrency(proposedAmountCents)} payment looks manageable. Your latest month still leaves about ${formatCurrency(runwayCents)} after that payment, and your average monthly net would still be around ${formatCurrency(averageRunwayCents)}.`,
        suggestions: ["What are my biggest fixed costs?", "Where am I overspending right now?", "How much did I spend on transportation this month?"]
      };
    }

    return {
      answer: `I'd be cautious about a ${formatCurrency(proposedAmountCents)} payment right now. Your latest month would leave only ${formatCurrency(Math.max(runwayCents, 0))} of margin, and your multi-month average net after that payment would be ${formatCurrency(averageRunwayCents)}. Tightening expenses first would be safer.`,
      suggestions: ["Where am I overspending right now?", "Show me recurring subscriptions.", "What is my largest expense?"]
    };
  }

  if (normalized.includes("largest expense") || normalized.includes("biggest expense")) {
    const biggest = brain.largestExpenses[0] as unknown as { description?: string; amountCents?: number; transactionDate?: string; category?: string } | undefined;
    return {
      answer: biggest
        ? `Your largest expense on record is ${biggest.description} in ${biggest.category} for ${formatCurrency(Number(biggest.amountCents ?? 0))} on ${biggest.transactionDate}.`
        : "I don't have any expense transactions to compare yet.",
      suggestions: ["Where am I overspending right now?", "Show me recurring subscriptions.", "How much did I spend on food last month?"]
    };
  }

  if ((normalized.includes("income") && normalized.includes("expense")) || normalized.includes("summary")) {
    return {
      answer: latestMonth
        ? `In ${formatMonthForHumans(latestMonth.month)}, you logged ${formatCurrency(latestMonth.incomeCents)} of income against ${formatCurrency(latestMonth.expenseCents)} of expenses, for a net of ${formatCurrency(latestMonth.netCents)}.`
        : `You've imported ${brain.snapshot.totals.transactionCount} transactions so far, with ${formatCurrency(brain.snapshot.totals.incomeCents)} of income and ${formatCurrency(brain.snapshot.totals.expenseCents)} of expenses.`,
      suggestions: DEFAULT_SUGGESTIONS
    };
  }

  const topCategory = brain.snapshot.categoryTotals[0];
  return {
    answer: latestMonth
      ? `Here's the quick read: ${formatMonthForHumans(latestMonth.month)} closed with ${formatCurrency(latestMonth.netCents)} net, your heaviest expense category is ${topCategory?.category ?? "not enough data yet"}, and ${brain.recurringMerchants[0]?.merchant ?? "recurring subscriptions"} is worth reviewing next. Ask me about a category, affordability, or overspending and I'll drill in.`
      : `You've imported ${brain.snapshot.totals.transactionCount} transactions. Ask me about a category, affordability, subscriptions, or overspending and I'll break it down.`,
    suggestions: DEFAULT_SUGGESTIONS
  };
}

export async function getLocalAnswer(question: string): Promise<{ answer: string; suggestions: string[] } | null> {
  const debtReply = await answerDebtQuestion(question);
  if (debtReply) return debtReply;

  const investmentReply = await answerInvestmentQuestion(question);
  if (investmentReply) return investmentReply;

  const perkReply = await answerPerkQuestion(question);
  if (perkReply) return perkReply;

  const provider = process.env.FINANCE_AI_PROVIDER ?? "local";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (provider !== "local" && apiKey) return null;

  const brain = await getFinanceBrain();
  return buildFallbackAnswer(question, brain);
}

export async function generateFinancialInsights(): Promise<FinancialInsight[]> {
  const brain = await getFinanceBrain();

  if (brain.snapshot.totals.transactionCount === 0) {
    return [{
      id: "load-data",
      title: "Load real statement data first",
      body: "Phase 2 intelligence is ready, but it needs transactions to reason over. Import a CSV or load the starter dataset to unlock insights and chat.",
      tone: "action" as const,
      supportingValue: "No data yet",
      prompt: "Load the starter dataset"
    }];
  }

  const topCategory = brain.snapshot.categoryTotals[0];
  const expenseShift =
    brain.latestMonth && brain.previousMonth
      ? percentChange(brain.latestMonth.expenseCents, brain.previousMonth.expenseCents)
      : null;
  const recurring = brain.recurringMerchants[0];
  const strongestExpense = brain.largestExpenses[0] as unknown as { description?: string; amountCents?: number } | undefined;
  const deficitDashboard = await getDeficitDashboard();
  const recommendedDebtStrategy = deficitDashboard.strategies.find((s) => s.id === deficitDashboard.stats.recommendedStrategy) ?? null;

  const insights: FinancialInsight[] = [];

  if (brain.latestMonth) {
    insights.push({
      id: "latest-month",
      title: brain.latestMonth.netCents >= 0 ? "You closed the latest month in the green" : "The latest month slipped negative",
      body: brain.latestMonth.netCents >= 0
        ? `${formatMonthForHumans(brain.latestMonth.month)} finished with ${formatCurrency(brain.latestMonth.netCents)} left after expenses. That gives you room to direct more cash toward debt, savings, or investing.`
        : `${formatMonthForHumans(brain.latestMonth.month)} finished ${formatCurrency(Math.abs(brain.latestMonth.netCents))} underwater. I'd pause new commitments and attack the largest categories first.`,
      tone: brain.latestMonth.netCents >= 0 ? "win" : "watch",
      supportingValue: formatCurrency(brain.latestMonth.netCents),
      prompt: "How much margin do I really have each month?"
    });
  }

  if (topCategory) {
    insights.push({
      id: "top-category",
      title: `${topCategory.category} is the biggest spend bucket`,
      body: `${topCategory.category} accounts for ${formatCurrency(topCategory.spendCents)} of tracked expenses. If you want the fastest impact, this is the first category to pressure-test for cuts or optimization.`,
      tone: topCategory.spendCents > brain.categoryAverageSpend * 1.25 ? "action" : "watch",
      supportingValue: formatCurrency(topCategory.spendCents),
      prompt: `How much did I spend on ${topCategory.category.toLowerCase()} last month?`
    });
  }

  if (expenseShift !== null && brain.latestMonth && brain.previousMonth) {
    insights.push({
      id: "expense-trend",
      title: expenseShift > 0 ? `Expenses accelerated in ${formatMonthForHumans(brain.latestMonth.month)}` : `Expenses cooled off in ${formatMonthForHumans(brain.latestMonth.month)}`,
      body: expenseShift > 0
        ? `Your expenses are up ${Math.round(expenseShift * 100)}% compared with ${formatMonthForHumans(brain.previousMonth.month)}. That's the best place to start when asking where cash is leaking.`
        : `Your expenses are down ${Math.abs(Math.round(expenseShift * 100))}% compared with ${formatMonthForHumans(brain.previousMonth.month)}. Whatever changed there is worth preserving.`,
      tone: expenseShift > 0.1 ? "action" : expenseShift < -0.05 ? "win" : "watch",
      supportingValue: `${Math.abs(Math.round(expenseShift * 100))}%`,
      prompt: "Where am I overspending right now?"
    });
  }

  if (recurring) {
    insights.push({
      id: "recurring",
      title: `${recurring.merchant} looks like a recurring charge`,
      body: `I found repeated expenses from ${recurring.merchant} averaging about ${formatCurrency(Number(recurring.averageAmountCents))} across ${recurring.activeMonths} months. That makes it a strong candidate for subscription cleanup or benefit review.`,
      tone: "action",
      supportingValue: formatCurrency(Number(recurring.averageAmountCents)),
      prompt: "Show me recurring subscriptions."
    });
  }

  if (recommendedDebtStrategy && deficitDashboard.stats.accounts > 0) {
    insights.push({
      id: "debt-strategy",
      title: recommendedDebtStrategy.monthsToDebtFree === null ? "Debt payoff needs more breathing room" : `Debt freedom is on a ${recommendedDebtStrategy.monthsToDebtFree}-month runway`,
      body: recommendedDebtStrategy.monthsToDebtFree === null
        ? `Your debt stack needs more than minimums to shrink cleanly. The app is recommending ${formatCurrency(deficitDashboard.stats.recommendedPaymentCents)} per month as the current sustainable payment pace.`
        : `${recommendedDebtStrategy.label} is the lead payoff path right now. It focuses on ${recommendedDebtStrategy.focusAccount ?? "your highest-priority balance"} first and projects about ${formatCurrency(recommendedDebtStrategy.totalInterestCents)} of interest left if you hold the current payment pace.`,
      tone: deficitDashboard.stats.weightedAprPercent >= 15 ? "action" : recommendedDebtStrategy.monthsToDebtFree !== null && recommendedDebtStrategy.monthsToDebtFree <= 24 ? "win" : "watch",
      supportingValue: recommendedDebtStrategy.monthsToDebtFree === null ? formatCurrency(deficitDashboard.stats.recommendedPaymentCents) : `${recommendedDebtStrategy.monthsToDebtFree} mo`,
      prompt: "Which debt should I pay first?"
    });
  }

  if (strongestExpense) {
    insights.push({
      id: "largest-expense",
      title: "One large expense dominates the ledger",
      body: `${strongestExpense.description} is your largest logged expense at ${formatCurrency(Number(strongestExpense.amountCents ?? 0))}. That kind of outlier is worth separating from routine monthly costs when you evaluate affordability.`,
      tone: "watch",
      supportingValue: formatCurrency(Number(strongestExpense.amountCents ?? 0)),
      prompt: "Can I afford a $300 car payment?"
    });
  }

  return insights.slice(0, 4);
}
