import { getDb } from "@/lib/db";
import { formatCurrency, getDashboardSnapshot } from "@/lib/finance";

export type DeficitAlertTone = "hot" | "watch" | "info";

export type DebtAccountSummary = {
  id: number;
  name: string;
  debtType: string;
  balanceCents: number;
  aprPercent: number;
  minimumPaymentCents: number;
  targetPaymentCents: number;
  creditLimitCents: number;
  utilizationRatio: number | null;
  estimatedMonthlyInterestCents: number;
  shareOfDebt: number;
};

export type DeficitAlert = {
  id: string;
  title: string;
  body: string;
  action: string;
  tone: DeficitAlertTone;
  prompt: string;
  supportingValue: string;
};

export type PayoffStrategy = {
  id: "avalanche" | "snowball";
  label: string;
  description: string;
  monthlyPaymentCents: number;
  monthsToDebtFree: number | null;
  totalInterestCents: number;
  payoffOrder: string[];
  focusAccount: string | null;
};

export type NegotiationScript = {
  id: string;
  accountName: string;
  title: string;
  reason: string;
  script: string;
};

export type DeficitDashboard = {
  stats: {
    accounts: number;
    totalBalanceCents: number;
    weightedAprPercent: number;
    monthlyMinimumCents: number;
    monthlyPlannedCents: number;
    recommendedPaymentCents: number;
    recommendedStrategy: "avalanche" | "snowball" | null;
    projectedPayoffMonths: number | null;
  };
  accounts: DebtAccountSummary[];
  alerts: DeficitAlert[];
  strategies: PayoffStrategy[];
  scripts: NegotiationScript[];
};

type DebtAccountRow = {
  id: number;
  name: string;
  debtType: string;
  balanceCents: number;
  aprBp: number;
  minimumPaymentCents: number;
  targetPaymentCents: number;
  creditLimitCents: number;
  updatedAt: string;
};

type SimulatedDebt = {
  name: string;
  balanceCents: number;
  aprBp: number;
  minimumPaymentCents: number;
};

const DEBT_SUGGESTIONS = [
  "Which debt should I pay first?",
  "Should I use avalanche or snowball?",
  "How long until I am debt free?",
  "Can I negotiate a lower APR?"
];

function formatApr(aprPercent: number) {
  return `${aprPercent.toFixed(aprPercent >= 10 ? 1 : 2)}%`;
}

function sortByAvalanche(left: SimulatedDebt, right: SimulatedDebt) {
  if (right.aprBp !== left.aprBp) {
    return right.aprBp - left.aprBp;
  }

  return left.balanceCents - right.balanceCents;
}

function sortBySnowball(left: SimulatedDebt, right: SimulatedDebt) {
  if (left.balanceCents !== right.balanceCents) {
    return left.balanceCents - right.balanceCents;
  }

  return right.aprBp - left.aprBp;
}

function getDebtRows() {
  const db = getDb();

  return db
    .prepare(`
      SELECT
        id,
        name,
        debt_type AS debtType,
        balance_cents AS balanceCents,
        apr_bp AS aprBp,
        minimum_payment_cents AS minimumPaymentCents,
        target_payment_cents AS targetPaymentCents,
        credit_limit_cents AS creditLimitCents,
        updated_at AS updatedAt
      FROM debt_accounts
      ORDER BY balance_cents DESC, apr_bp DESC, name ASC
    `)
    .all() as DebtAccountRow[];
}

function buildAccountSummary(row: DebtAccountRow, totalBalanceCents: number) {
  const aprPercent = row.aprBp / 100;
  const estimatedMonthlyInterestCents = Math.round(row.balanceCents * (aprPercent / 100 / 12));
  const utilizationRatio = row.creditLimitCents > 0 ? row.balanceCents / row.creditLimitCents : null;

  return {
    id: row.id,
    name: row.name,
    debtType: row.debtType,
    balanceCents: row.balanceCents,
    aprPercent,
    minimumPaymentCents: row.minimumPaymentCents,
    targetPaymentCents: row.targetPaymentCents,
    creditLimitCents: row.creditLimitCents,
    utilizationRatio,
    estimatedMonthlyInterestCents,
    shareOfDebt: totalBalanceCents > 0 ? row.balanceCents / totalBalanceCents : 0
  } satisfies DebtAccountSummary;
}

function getRecommendedPayment(monthlyMinimumCents: number, monthlyPlannedCents: number) {
  const snapshot = getDashboardSnapshot();
  const latestMonth = snapshot.monthTotals[snapshot.monthTotals.length - 1] ?? null;
  const positiveNets = snapshot.monthTotals
    .map((month) => Math.max(month.netCents, 0))
    .filter((value) => value > 0);
  const averagePositiveNetCents =
    positiveNets.length > 0
      ? Math.round(positiveNets.reduce((total, value) => total + value, 0) / positiveNets.length)
      : 0;
  const latestPositiveNetCents = latestMonth ? Math.max(latestMonth.netCents, 0) : 0;
  const baselineCandidates = [latestPositiveNetCents, averagePositiveNetCents].filter((value) => value > 0);
  const baselineFreeCashCents =
    baselineCandidates.length > 0 ? Math.min(...baselineCandidates) : averagePositiveNetCents;
  const plannedExtraCents = Math.max(monthlyPlannedCents - monthlyMinimumCents, 0);
  const extraBudgetCents =
    snapshot.totals.transactionCount > 0
      ? Math.min(plannedExtraCents, Math.round(baselineFreeCashCents * 0.8))
      : plannedExtraCents;

  return {
    snapshot,
    recommendedPaymentCents: monthlyMinimumCents + Math.max(extraBudgetCents, 0),
    latestMonth
  };
}

function simulateStrategy(rows: DebtAccountRow[], monthlyPaymentCents: number, strategy: PayoffStrategy["id"]) {
  const activeAccounts = rows
    .filter((row) => row.balanceCents > 0)
    .map((row) => ({
      name: row.name,
      balanceCents: row.balanceCents,
      aprBp: row.aprBp,
      minimumPaymentCents: row.minimumPaymentCents
    }));

  if (activeAccounts.length === 0) {
    return {
      monthsToDebtFree: 0,
      totalInterestCents: 0,
      payoffOrder: [],
      focusAccount: null
    };
  }

  const compare = strategy === "avalanche" ? sortByAvalanche : sortBySnowball;
  const payoffOrder = [...activeAccounts].sort(compare).map((account) => account.name);
  const minimumRequiredCents = activeAccounts.reduce(
    (total, account) => total + account.minimumPaymentCents,
    0
  );
  const effectiveMonthlyPaymentCents = Math.max(monthlyPaymentCents, minimumRequiredCents);
  let totalInterestCents = 0;
  let months = 0;

  while (activeAccounts.some((account) => account.balanceCents > 0) && months < 600) {
    months += 1;

    for (const account of activeAccounts) {
      if (account.balanceCents <= 0) {
        continue;
      }

      const monthlyInterest = Math.round(account.balanceCents * ((account.aprBp / 100) / 100 / 12));
      account.balanceCents += monthlyInterest;
      totalInterestCents += monthlyInterest;
    }

    let remainingPaymentCents = effectiveMonthlyPaymentCents;

    for (const account of activeAccounts) {
      if (account.balanceCents <= 0) {
        continue;
      }

      const minimumPaymentCents = Math.min(account.balanceCents, account.minimumPaymentCents);
      account.balanceCents -= minimumPaymentCents;
      remainingPaymentCents -= minimumPaymentCents;
    }

    for (const account of [...activeAccounts].sort(compare)) {
      if (remainingPaymentCents <= 0 || account.balanceCents <= 0) {
        continue;
      }

      const extraPaymentCents = Math.min(account.balanceCents, remainingPaymentCents);
      account.balanceCents -= extraPaymentCents;
      remainingPaymentCents -= extraPaymentCents;
    }
  }

  return {
    monthsToDebtFree: activeAccounts.some((account) => account.balanceCents > 0) ? null : months,
    totalInterestCents,
    payoffOrder,
    focusAccount: payoffOrder[0] ?? null
  };
}

function toneRank(tone: DeficitAlertTone) {
  if (tone === "hot") {
    return 3;
  }

  if (tone === "watch") {
    return 2;
  }

  return 1;
}

function chooseRecommendedStrategy(strategies: PayoffStrategy[]) {
  const avalanche = strategies.find((strategy) => strategy.id === "avalanche");
  const snowball = strategies.find((strategy) => strategy.id === "snowball");

  if (!avalanche) {
    return snowball?.id ?? null;
  }

  if (!snowball) {
    return avalanche.id;
  }

  if (
    avalanche.monthsToDebtFree !== null &&
    snowball.monthsToDebtFree !== null &&
    snowball.monthsToDebtFree + 1 < avalanche.monthsToDebtFree &&
    snowball.totalInterestCents - avalanche.totalInterestCents < 50000
  ) {
    return snowball.id;
  }

  return avalanche.id;
}

function buildNegotiationScripts(accounts: DebtAccountSummary[]) {
  const scripts: NegotiationScript[] = [];
  const highestAprAccount = [...accounts].sort((left, right) => right.aprPercent - left.aprPercent)[0];
  const highUtilizationAccount = accounts.find(
    (account) => account.utilizationRatio !== null && account.utilizationRatio >= 0.65
  );

  if (highestAprAccount) {
    scripts.push({
      id: `${highestAprAccount.id}-apr-script`,
      accountName: highestAprAccount.name,
      title: `APR reduction request for ${highestAprAccount.name}`,
      reason: `${highestAprAccount.name} is carrying ${formatCurrency(
        highestAprAccount.balanceCents
      )} at roughly ${formatApr(highestAprAccount.aprPercent)}.`,
      script: `Hi, I’m calling about my ${highestAprAccount.name} account. I’ve been actively paying this balance down and I want to keep the account in good standing. Can you review the APR and tell me whether I qualify for a lower rate, a hardship plan, or any temporary relief options? I’m comparing repayment options this month and I’d prefer to stay with you if you can help reduce the interest cost.`
    });
  }

  if (highUtilizationAccount) {
    scripts.push({
      id: `${highUtilizationAccount.id}-hardship-script`,
      accountName: highUtilizationAccount.name,
      title: `Hardship or fee-relief ask for ${highUtilizationAccount.name}`,
      reason: `${highUtilizationAccount.name} is using about ${Math.round(
        (highUtilizationAccount.utilizationRatio ?? 0) * 100
      )}% of its credit line, which can pressure both cash flow and utilization.`,
      script: `Hi, I’m working through a structured payoff plan for my ${highUtilizationAccount.name} account and I want to avoid falling behind. Are there any hardship programs, waived fees, payment-plan options, or promotional balance transfer offers available right now? I’m making this call early because I want the account to stay current while I reduce the balance.`
    });
  }

  return scripts.slice(0, 2);
}

export function saveDebtAccount(input: {
  name: string;
  debtType: string;
  balance: number;
  apr: number;
  minimumPayment: number;
  targetPayment: number;
  creditLimit?: number;
}) {
  const name = input.name.trim();
  const debtType = input.debtType.trim();

  if (!name || !debtType) {
    throw new Error("Debt name and debt type are required.");
  }

  const numericValues = [
    input.balance,
    input.apr,
    input.minimumPayment,
    input.targetPayment,
    input.creditLimit ?? 0
  ];

  if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Debt values must be non-negative numbers.");
  }

  const balanceCents = Math.round(input.balance * 100);
  const minimumPaymentCents = Math.round(input.minimumPayment * 100);
  const targetPaymentCents = Math.max(
    minimumPaymentCents,
    Math.round((input.targetPayment || input.minimumPayment) * 100)
  );
  const creditLimitCents = Math.round((input.creditLimit ?? 0) * 100);
  const aprBp = Math.round(input.apr * 100);

  if (balanceCents <= 0) {
    throw new Error("Balance must be greater than zero.");
  }

  if (minimumPaymentCents <= 0) {
    throw new Error("Minimum payment must be greater than zero.");
  }

  const db = getDb();
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO debt_accounts (
      name,
      debt_type,
      balance_cents,
      apr_bp,
      minimum_payment_cents,
      target_payment_cents,
      credit_limit_cents,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      debt_type = excluded.debt_type,
      balance_cents = excluded.balance_cents,
      apr_bp = excluded.apr_bp,
      minimum_payment_cents = excluded.minimum_payment_cents,
      target_payment_cents = excluded.target_payment_cents,
      credit_limit_cents = excluded.credit_limit_cents,
      updated_at = excluded.updated_at
  `).run(
    name,
    debtType,
    balanceCents,
    aprBp,
    minimumPaymentCents,
    targetPaymentCents,
    creditLimitCents,
    updatedAt
  );

  return {
    name
  };
}

export function getDeficitDashboard(): DeficitDashboard {
  const rows = getDebtRows();
  const totalBalanceCents = rows.reduce((total, row) => total + row.balanceCents, 0);
  const accounts = rows.map((row) => buildAccountSummary(row, totalBalanceCents));
  const monthlyMinimumCents = accounts.reduce((total, account) => total + account.minimumPaymentCents, 0);
  const monthlyPlannedCents = accounts.reduce((total, account) => total + account.targetPaymentCents, 0);
  const weightedAprPercent =
    totalBalanceCents > 0
      ? accounts.reduce((total, account) => total + account.balanceCents * account.aprPercent, 0) /
        totalBalanceCents
      : 0;
  const { snapshot, recommendedPaymentCents, latestMonth } = getRecommendedPayment(
    monthlyMinimumCents,
    monthlyPlannedCents
  );

  const strategies: PayoffStrategy[] = [
    {
      id: "avalanche",
      label: "Avalanche",
      description: "Attack the highest APR first to minimize total interest paid.",
      monthlyPaymentCents: recommendedPaymentCents,
      ...simulateStrategy(rows, recommendedPaymentCents, "avalanche")
    },
    {
      id: "snowball",
      label: "Snowball",
      description: "Knock out the smallest balance first to create quick wins and payment momentum.",
      monthlyPaymentCents: recommendedPaymentCents,
      ...simulateStrategy(rows, recommendedPaymentCents, "snowball")
    }
  ];

  const recommendedStrategy = chooseRecommendedStrategy(strategies);
  const primaryStrategy = strategies.find((strategy) => strategy.id === recommendedStrategy) ?? null;
  const highestAprAccount = [...accounts].sort((left, right) => right.aprPercent - left.aprPercent)[0];
  const smallestBalanceAccount = [...accounts].sort((left, right) => left.balanceCents - right.balanceCents)[0];
  const highUtilizationAccount = accounts.find(
    (account) => account.utilizationRatio !== null && account.utilizationRatio >= 0.6
  );
  const alerts: DeficitAlert[] = [];

  if (highestAprAccount) {
    alerts.push({
      id: "highest-apr",
      title: `${highestAprAccount.name} is the most expensive debt`,
      body: `${highestAprAccount.name} is charging about ${formatApr(
        highestAprAccount.aprPercent
      )} on ${formatCurrency(highestAprAccount.balanceCents)}. If you want the fastest mathematical win, this is the balance costing you the most interest every month.`,
      action: `Focus extra payments on ${highestAprAccount.name} once minimums are covered everywhere else.`,
      tone: highestAprAccount.aprPercent >= 18 ? "hot" : "watch",
      prompt: "Which debt should I pay first?",
      supportingValue: formatApr(highestAprAccount.aprPercent)
    });
  }

  if (accounts.length > 0 && snapshot.totals.transactionCount > 0 && monthlyPlannedCents > recommendedPaymentCents) {
    alerts.push({
      id: "cash-flow-gap",
      title: "Your planned payoff pace may be too aggressive for current cash flow",
      body: `Your debt plan totals ${formatCurrency(
        monthlyPlannedCents
      )} per month, but a safer payment based on recent surplus looks closer to ${formatCurrency(
        recommendedPaymentCents
      )}.`,
      action:
        latestMonth && latestMonth.netCents < 0
          ? "Stabilize the monthly deficit first, then scale extra debt payments back up."
          : "Use the recommended payment as your floor and only increase it when monthly surplus holds steady.",
      tone: "watch",
      prompt: "Can I afford my current debt payments?",
      supportingValue: formatCurrency(recommendedPaymentCents)
    });
  }

  if (smallestBalanceAccount && smallestBalanceAccount.balanceCents <= recommendedPaymentCents * 3) {
    alerts.push({
      id: "quick-win",
      title: `${smallestBalanceAccount.name} is close enough for a quick win`,
      body: `${smallestBalanceAccount.name} has the smallest balance at ${formatCurrency(
        smallestBalanceAccount.balanceCents
      )}. If motivation matters, snowballing this one away first could free up a monthly payment quickly.`,
      action: `Decide whether you value the lower-interest avalanche path or the faster psychological win from clearing ${smallestBalanceAccount.name}.`,
      tone: "info",
      prompt: "Should I use avalanche or snowball?",
      supportingValue: formatCurrency(smallestBalanceAccount.balanceCents)
    });
  }

  if (highUtilizationAccount) {
    alerts.push({
      id: "utilization",
      title: `${highUtilizationAccount.name} is running high utilization`,
      body: `${highUtilizationAccount.name} is using about ${Math.round(
        (highUtilizationAccount.utilizationRatio ?? 0) * 100
      )}% of its available credit. That can keep pressure on both score recovery and minimum payments.`,
      action: `Bring ${highUtilizationAccount.name} under 30% utilization as soon as the rest of the plan allows, or ask about hardship and balance-transfer options.`,
      tone: (highUtilizationAccount.utilizationRatio ?? 0) >= 0.8 ? "hot" : "watch",
      prompt: "How can I lower my utilization fast?",
      supportingValue: `${Math.round((highUtilizationAccount.utilizationRatio ?? 0) * 100)}%`
    });
  }

  const scripts = buildNegotiationScripts(accounts);

  return {
    stats: {
      accounts: accounts.length,
      totalBalanceCents,
      weightedAprPercent,
      monthlyMinimumCents,
      monthlyPlannedCents,
      recommendedPaymentCents,
      recommendedStrategy,
      projectedPayoffMonths: primaryStrategy?.monthsToDebtFree ?? null
    },
    accounts,
    alerts: alerts.sort((left, right) => toneRank(right.tone) - toneRank(left.tone)).slice(0, 4),
    strategies,
    scripts
  };
}

export function seedDemoDebtAccounts() {
  const db = getDb();
  const existing = db
    .prepare("SELECT COUNT(*) AS count FROM debt_accounts")
    .get() as { count: number };

  if (existing.count > 0) {
    return {
      created: false,
      accountsInserted: existing.count
    };
  }

  const starterAccounts = [
    {
      name: "Rewards Visa",
      debtType: "Credit Card",
      balance: 6840,
      apr: 24.99,
      minimumPayment: 205,
      targetPayment: 420,
      creditLimit: 9000
    },
    {
      name: "Civic Auto Loan",
      debtType: "Auto Loan",
      balance: 12400,
      apr: 6.4,
      minimumPayment: 318,
      targetPayment: 318,
      creditLimit: 0
    },
    {
      name: "Federal Student Loan",
      debtType: "Student Loan",
      balance: 8700,
      apr: 4.8,
      minimumPayment: 142,
      targetPayment: 180,
      creditLimit: 0
    }
  ];

  for (const account of starterAccounts) {
    saveDebtAccount(account);
  }

  return {
    created: true,
    accountsInserted: starterAccounts.length
  };
}

export function answerDebtQuestion(question: string) {
  const normalized = question.toLowerCase();
  const looksDebtRelated =
    normalized.includes("debt") ||
    normalized.includes("loan") ||
    normalized.includes("apr") ||
    normalized.includes("snowball") ||
    normalized.includes("avalanche") ||
    normalized.includes("utilization") ||
    normalized.includes("credit score") ||
    normalized.includes("pay off") ||
    normalized.includes("debt free") ||
    normalized.includes("balance transfer") ||
    normalized.includes("minimum payment") ||
    normalized.includes("negotiat") ||
    normalized.includes("pay first");

  if (!looksDebtRelated) {
    return null;
  }

  const dashboard = getDeficitDashboard();
  if (dashboard.stats.accounts === 0) {
    return {
      answer:
        "I don’t have any debt accounts saved yet, so I can’t rank payoff priorities or project a debt-free date. Add a debt manually or load the sample debt stack first.",
      suggestions: DEBT_SUGGESTIONS
    };
  }

  const recommendedStrategy =
    dashboard.strategies.find((strategy) => strategy.id === dashboard.stats.recommendedStrategy) ??
    dashboard.strategies[0];
  const alternateStrategy = dashboard.strategies.find(
    (strategy) => strategy.id !== recommendedStrategy?.id
  );
  const highestAprAccount = [...dashboard.accounts].sort((left, right) => right.aprPercent - left.aprPercent)[0];
  const highUtilizationAccount = dashboard.accounts.find(
    (account) => account.utilizationRatio !== null && account.utilizationRatio >= 0.6
  );
  const firstScript = dashboard.scripts[0];

  if (normalized.includes("snowball") || normalized.includes("avalanche")) {
    const interestGapCents = alternateStrategy
      ? alternateStrategy.totalInterestCents - recommendedStrategy.totalInterestCents
      : 0;
    const alternateMonthsToDebtFree = alternateStrategy?.monthsToDebtFree ?? null;
    const recommendedMonthsToDebtFree = recommendedStrategy.monthsToDebtFree;
    const monthGap =
      alternateMonthsToDebtFree !== null && recommendedMonthsToDebtFree !== null
        ? alternateMonthsToDebtFree - recommendedMonthsToDebtFree
        : 0;

    return {
      answer: `${recommendedStrategy.label} is the better fit right now. It points extra cash at ${
        recommendedStrategy.focusAccount ?? "your highest-priority balance"
      } first and projects ${
        recommendedStrategy.monthsToDebtFree === null
          ? "a payoff horizon that still needs a larger payment"
          : `${recommendedStrategy.monthsToDebtFree} months to debt freedom`
      }. ${
        alternateStrategy
          ? `Compared with ${alternateStrategy.label.toLowerCase()}, that is ${Math.abs(monthGap)} month${
              Math.abs(monthGap) === 1 ? "" : "s"
            } different and about ${formatCurrency(Math.abs(interestGapCents))} in interest ${
              interestGapCents >= 0 ? "saved" : "more expensive"
            }.`
          : ""
      }`,
      suggestions: DEBT_SUGGESTIONS
    };
  }

  if (
    normalized.includes("debt free") ||
    normalized.includes("pay off") ||
    normalized.includes("how long")
  ) {
    return {
      answer:
        recommendedStrategy.monthsToDebtFree === null
          ? `At the current recommended payment of ${formatCurrency(
              dashboard.stats.recommendedPaymentCents
            )}, the balances are not paying down fast enough for a clean projection yet. Raising the payment above minimums is the next move.`
          : `If you follow the ${recommendedStrategy.label.toLowerCase()} plan at about ${formatCurrency(
              recommendedStrategy.monthlyPaymentCents
            )} per month, you project to be debt free in roughly ${recommendedStrategy.monthsToDebtFree} months with about ${formatCurrency(
              recommendedStrategy.totalInterestCents
            )} of additional interest from here.`,
      suggestions: DEBT_SUGGESTIONS
    };
  }

  if (normalized.includes("apr") || normalized.includes("interest") || normalized.includes("negotiat")) {
    return {
      answer: firstScript
        ? `${highestAprAccount.name} is the account to pressure first because it is charging about ${formatApr(
            highestAprAccount.aprPercent
          )}. Use this negotiation angle: ${firstScript.script}`
        : `Your most expensive rate right now is on ${highestAprAccount.name} at about ${formatApr(
            highestAprAccount.aprPercent
          )}. That is the first lender worth calling for an APR review or hardship option.`,
      suggestions: [
        "Which debt should I pay first?",
        "Should I use avalanche or snowball?",
        "How long until I am debt free?"
      ]
    };
  }

  if (normalized.includes("utilization") || normalized.includes("credit score")) {
    return {
      answer: highUtilizationAccount
        ? `${highUtilizationAccount.name} is the utilization problem to solve first at about ${Math.round(
            (highUtilizationAccount.utilizationRatio ?? 0) * 100
          )}% usage. Getting that account below 30% utilization will usually help faster than spreading tiny payments across every card.`
        : "None of your tracked accounts currently show a utilization warning because either the balances are installment loans or no credit limits were saved.",
      suggestions: [
        "Which debt should I pay first?",
        "Can I negotiate a lower APR?",
        "How long until I am debt free?"
      ]
    };
  }

  return {
    answer: `${recommendedStrategy.label} is the lead plan right now. Start with ${
      recommendedStrategy.focusAccount ?? highestAprAccount.name
    }, keep paying at least ${formatCurrency(
      dashboard.stats.monthlyMinimumCents
    )} across the rest, and aim for about ${formatCurrency(
      dashboard.stats.recommendedPaymentCents
    )} total each month if cash flow holds.`,
    suggestions: DEBT_SUGGESTIONS
  };
}
