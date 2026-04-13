import { ensureDb } from "@/lib/db";
import { formatCurrency, getDashboardSnapshot } from "@/lib/finance";

export type InvestmentAlertTone = "hot" | "watch" | "info";

export type InvestmentPositionSummary = {
  id: number;
  symbol: string;
  name: string;
  assetClass: string;
  units: number;
  marketValueCents: number;
  targetWeight: number;
  currentWeight: number;
  driftWeight: number;
  avgCostCents: number;
  currentPriceCents: number;
  week52HighCents: number;
  week52LowCents: number;
  monthlyContributionCents: number;
  returnPct: number | null;
  discountFromHighPct: number | null;
  watchlistOnly: boolean;
};

export type InvestmentAlert = {
  id: string;
  symbol: string;
  title: string;
  body: string;
  action: string;
  tone: InvestmentAlertTone;
  prompt: string;
  recommendedContributionCents: number;
};

export type DcaRecommendation = {
  symbol: string;
  name: string;
  recommendedContributionCents: number;
  estimatedShares: number;
  currentWeight: number;
  targetWeight: number;
};

export type InvestmentDashboard = {
  stats: {
    positions: number;
    portfolioValueCents: number;
    monthlyContributionCents: number;
    safeContributionCents: number;
    underweightCount: number;
  };
  positions: InvestmentPositionSummary[];
  alerts: InvestmentAlert[];
  dcaPlan: DcaRecommendation[];
};

type InvestmentPositionRow = {
  id: number;
  symbol: string;
  name: string;
  assetClass: string;
  targetAllocationBp: number;
  units: number;
  avgCostCents: number;
  currentPriceCents: number;
  week52HighCents: number;
  week52LowCents: number;
  monthlyContributionCents: number;
  updatedAt: string;
};

const INVESTMENT_SUGGESTIONS = [
  "What ETF should I add to next?",
  "How should I rebalance my portfolio?",
  "What does my DCA plan look like?",
  "How underweight am I right now?"
];

function toneRank(tone: InvestmentAlertTone) {
  if (tone === "hot") return 3;
  if (tone === "watch") return 2;
  return 1;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildPositionSummary(
  row: InvestmentPositionRow,
  totalPortfolioValueCents: number,
  totalTargetBp: number
) {
  const units = Number(row.units);
  const currentPriceCents = Number(row.currentPriceCents);
  const avgCostCents = Number(row.avgCostCents);
  const week52HighCents = Number(row.week52HighCents);
  const week52LowCents = Number(row.week52LowCents);
  const targetAllocationBp = Number(row.targetAllocationBp);
  const monthlyContributionCents = Number(row.monthlyContributionCents);
  const marketValueCents = Math.round(units * currentPriceCents);
  const currentWeight = totalPortfolioValueCents > 0 ? marketValueCents / totalPortfolioValueCents : 0;
  const targetWeight = totalTargetBp > 0 ? targetAllocationBp / totalTargetBp : 0;
  const driftWeight = currentWeight - targetWeight;
  const returnPct = avgCostCents > 0 ? (currentPriceCents - avgCostCents) / avgCostCents : null;
  const discountFromHighPct = week52HighCents > 0 ? (week52HighCents - currentPriceCents) / week52HighCents : null;

  return {
    id: Number(row.id),
    symbol: row.symbol,
    name: row.name,
    assetClass: row.assetClass,
    units,
    marketValueCents,
    targetWeight,
    currentWeight,
    driftWeight,
    avgCostCents,
    currentPriceCents,
    week52HighCents,
    week52LowCents,
    monthlyContributionCents,
    returnPct,
    discountFromHighPct,
    watchlistOnly: units === 0
  } satisfies InvestmentPositionSummary;
}

export async function saveInvestmentPosition(input: {
  symbol: string;
  name: string;
  assetClass: string;
  targetAllocationPercent: number;
  units: number;
  avgCost: number;
  currentPrice: number;
  week52High: number;
  week52Low: number;
  monthlyContribution: number;
}) {
  const symbol = input.symbol.trim().toUpperCase();
  const name = input.name.trim();
  const assetClass = input.assetClass.trim();

  if (!symbol || !name || !assetClass) throw new Error("Symbol, name, and asset class are required.");
  if (input.targetAllocationPercent < 0 || input.targetAllocationPercent > 100) {
    throw new Error("Target allocation must be between 0 and 100.");
  }

  const db = await ensureDb();
  const updatedAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO investment_positions (
      symbol, name, asset_class, target_allocation_bp, units, avg_cost_cents,
      current_price_cents, week52_high_cents, week52_low_cents, monthly_contribution_cents, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      asset_class = excluded.asset_class,
      target_allocation_bp = excluded.target_allocation_bp,
      units = excluded.units,
      avg_cost_cents = excluded.avg_cost_cents,
      current_price_cents = excluded.current_price_cents,
      week52_high_cents = excluded.week52_high_cents,
      week52_low_cents = excluded.week52_low_cents,
      monthly_contribution_cents = excluded.monthly_contribution_cents,
      updated_at = excluded.updated_at`,
    args: [
      symbol, name, assetClass,
      Math.round(input.targetAllocationPercent * 100),
      input.units,
      Math.round(input.avgCost * 100),
      Math.round(input.currentPrice * 100),
      Math.round(input.week52High * 100),
      Math.round(input.week52Low * 100),
      Math.round(input.monthlyContribution * 100),
      updatedAt
    ]
  });

  return { symbol };
}

export async function getInvestmentDashboard(): Promise<InvestmentDashboard> {
  const db = await ensureDb();
  const rows = (await db.execute(`
    SELECT
      id, symbol, name,
      asset_class AS assetClass,
      target_allocation_bp AS targetAllocationBp,
      units,
      avg_cost_cents AS avgCostCents,
      current_price_cents AS currentPriceCents,
      week52_high_cents AS week52HighCents,
      week52_low_cents AS week52LowCents,
      monthly_contribution_cents AS monthlyContributionCents,
      updated_at AS updatedAt
    FROM investment_positions
    ORDER BY target_allocation_bp DESC, symbol ASC
  `)).rows as unknown as InvestmentPositionRow[];

  const totalPortfolioValueCents = rows.reduce(
    (total, row) => total + Math.round(Number(row.units) * Number(row.currentPriceCents)),
    0
  );
  const totalTargetBp = rows.reduce((total, row) => total + Number(row.targetAllocationBp), 0) || 10000;
  const positions = rows.map((row) => buildPositionSummary(row, totalPortfolioValueCents, totalTargetBp));
  const monthlyContributionCents = positions.reduce((total, p) => total + p.monthlyContributionCents, 0);
  const snapshot = await getDashboardSnapshot();
  const latestMonth = snapshot.monthTotals[snapshot.monthTotals.length - 1] ?? null;
  const safeContributionCents = latestMonth
    ? Math.max(Math.round(latestMonth.netCents * 0.6), 0)
    : monthlyContributionCents;
  const optimizedContributionCents =
    monthlyContributionCents > 0 && safeContributionCents > 0
      ? Math.min(monthlyContributionCents, safeContributionCents)
      : monthlyContributionCents;

  const underweightPositions = positions
    .filter((p) => p.targetWeight - p.currentWeight > 0.025)
    .sort((l, r) => r.targetWeight - r.currentWeight - (l.targetWeight - l.currentWeight));

  const overweightPositions = positions
    .filter((p) => p.currentWeight - p.targetWeight > 0.04)
    .sort((l, r) => r.currentWeight - r.targetWeight - (l.currentWeight - l.targetWeight));

  const allocationSource =
    underweightPositions.length > 0
      ? underweightPositions.map((p) => ({ position: p, share: p.targetWeight - p.currentWeight }))
      : positions.map((p) => ({ position: p, share: p.targetWeight }));
  const totalShare = allocationSource.reduce((total, item) => total + item.share, 0) || 1;

  const dcaPlan = allocationSource
    .map(({ position, share }) => {
      const recommendedContributionCents = Math.round((optimizedContributionCents * share) / totalShare);
      const estimatedShares = position.currentPriceCents > 0 ? recommendedContributionCents / position.currentPriceCents : 0;
      return {
        symbol: position.symbol,
        name: position.name,
        recommendedContributionCents,
        estimatedShares,
        currentWeight: position.currentWeight,
        targetWeight: position.targetWeight
      } satisfies DcaRecommendation;
    })
    .filter((item) => item.recommendedContributionCents > 0)
    .slice(0, 5);

  const alerts: InvestmentAlert[] = [];

  if (monthlyContributionCents > 0 && safeContributionCents > 0 && monthlyContributionCents > safeContributionCents) {
    alerts.push({
      id: "portfolio-dca-budget",
      symbol: "PORT",
      title: "Your current DCA plan may be outrunning free cash flow",
      body: `Your planned monthly ETF contributions total ${formatCurrency(monthlyContributionCents)}, while a safer contribution based on the latest monthly surplus is closer to ${formatCurrency(safeContributionCents)}.`,
      action: "Either trim the automatic contribution or reduce expenses before scaling the plan higher.",
      tone: "watch",
      prompt: "What does my DCA plan look like?",
      recommendedContributionCents: safeContributionCents
    });
  }

  for (const position of underweightPositions.slice(0, 3)) {
    const recommendation = dcaPlan.find((item) => item.symbol === position.symbol);
    alerts.push({
      id: `${position.symbol}-underweight`,
      symbol: position.symbol,
      title: `${position.symbol} is under target allocation`,
      body: `${position.symbol} is at ${formatPercent(position.currentWeight)} of the portfolio versus a ${formatPercent(position.targetWeight)} target. That makes it one of the clearest add candidates right now.`,
      action: `Bias your next contribution toward ${position.symbol} before adding to overweight sleeves.`,
      tone: position.targetWeight - position.currentWeight > 0.06 ? "hot" : "watch",
      prompt: "What ETF should I add to next?",
      recommendedContributionCents: recommendation?.recommendedContributionCents ?? position.monthlyContributionCents
    });
  }

  for (const position of positions) {
    if (position.watchlistOnly) continue;

    if (position.discountFromHighPct !== null && position.discountFromHighPct >= 0.08) {
      alerts.push({
        id: `${position.symbol}-pullback`,
        symbol: position.symbol,
        title: `${position.symbol} is trading off its recent high`,
        body: `${position.symbol} sits about ${formatPercent(position.discountFromHighPct)} below its 52-week high, which makes it worth reviewing as a buy-on-pullback candidate.`,
        action: `Check whether the thesis still holds, then consider using the next DCA slice on ${position.symbol}.`,
        tone: position.discountFromHighPct >= 0.12 ? "hot" : "info",
        prompt: `Is ${position.symbol} a buy right now?`,
        recommendedContributionCents: dcaPlan.find((item) => item.symbol === position.symbol)?.recommendedContributionCents ?? position.monthlyContributionCents
      });
    }

    if (position.returnPct !== null && position.returnPct <= -0.03) {
      alerts.push({
        id: `${position.symbol}-below-cost`,
        symbol: position.symbol,
        title: `${position.symbol} is below your average cost`,
        body: `${position.symbol} is currently ${formatPercent(Math.abs(position.returnPct))} below your average cost basis. For a long-term ETF plan, that can be a disciplined add point if the allocation still belongs in the portfolio.`,
        action: `Use the underweight and DCA plan first, then decide if this is the right sleeve to reinforce.`,
        tone: "watch",
        prompt: `Is ${position.symbol} a buy right now?`,
        recommendedContributionCents: dcaPlan.find((item) => item.symbol === position.symbol)?.recommendedContributionCents ?? position.monthlyContributionCents
      });
    }
  }

  for (const position of overweightPositions.slice(0, 2)) {
    alerts.push({
      id: `${position.symbol}-rebalance`,
      symbol: position.symbol,
      title: `${position.symbol} is overweight versus target`,
      body: `${position.symbol} is running at ${formatPercent(position.currentWeight)} of the portfolio against a ${formatPercent(position.targetWeight)} target. New money probably belongs elsewhere before you add here again.`,
      action: `Redirect fresh contributions away from ${position.symbol} until the gap closes.`,
      tone: "info",
      prompt: "How should I rebalance my portfolio?",
      recommendedContributionCents: 0
    });
  }

  const sortedAlerts = alerts
    .sort((l, r) => {
      const toneDiff = toneRank(r.tone) - toneRank(l.tone);
      if (toneDiff !== 0) return toneDiff;
      return r.recommendedContributionCents - l.recommendedContributionCents;
    })
    .slice(0, 6);

  return {
    stats: { positions: positions.length, portfolioValueCents: totalPortfolioValueCents, monthlyContributionCents, safeContributionCents, underweightCount: underweightPositions.length },
    positions,
    alerts: sortedAlerts,
    dcaPlan
  };
}

export async function seedDemoInvestments() {
  const db = await ensureDb();
  const existingResult = await db.execute("SELECT COUNT(*) AS count FROM investment_positions");
  const existing = existingResult.rows[0] as unknown as { count: number };

  if (Number(existing.count) > 0) return { created: false, positionsInserted: 0 };

  const demoPortfolio = [
    { symbol: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "US Equity", targetAllocationPercent: 45, units: 22, avgCost: 247, currentPrice: 278, week52High: 295, week52Low: 219, monthlyContribution: 250 },
    { symbol: "VXUS", name: "Vanguard Total International Stock ETF", assetClass: "International Equity", targetAllocationPercent: 20, units: 15, avgCost: 58, currentPrice: 62, week52High: 66, week52Low: 52, monthlyContribution: 125 },
    { symbol: "BND", name: "Vanguard Total Bond Market ETF", assetClass: "Bonds", targetAllocationPercent: 20, units: 30, avgCost: 72, currentPrice: 71, week52High: 75, week52Low: 68, monthlyContribution: 100 },
    { symbol: "SCHD", name: "Schwab US Dividend Equity ETF", assetClass: "Dividend Equity", targetAllocationPercent: 10, units: 10, avgCost: 76, currentPrice: 79, week52High: 84, week52Low: 67, monthlyContribution: 50 },
    { symbol: "VNQ", name: "Vanguard Real Estate ETF", assetClass: "REIT", targetAllocationPercent: 5, units: 8, avgCost: 82, currentPrice: 86, week52High: 97, week52Low: 71, monthlyContribution: 25 }
  ];

  for (const position of demoPortfolio) {
    await saveInvestmentPosition(position);
  }

  return { created: true, positionsInserted: demoPortfolio.length };
}

type YahooQuoteResult = {
  symbol: string;
  currentPriceCents: number;
  week52HighCents: number;
  week52LowCents: number;
};

async function fetchYahooQuote(symbol: string): Promise<YahooQuoteResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; finance-dashboard/1.0)" },
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);

  const json = (await response.json()) as {
    chart?: {
      result?: Array<{ meta?: { regularMarketPrice?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number } }>;
      error?: { description?: string } | null;
    };
  };

  if (json.chart?.error) throw new Error(json.chart.error.description ?? `Yahoo Finance error for ${symbol}`);

  const meta = json.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`No price data returned for ${symbol}`);

  return {
    symbol,
    currentPriceCents: Math.round(meta.regularMarketPrice * 100),
    week52HighCents: Math.round((meta.fiftyTwoWeekHigh ?? meta.regularMarketPrice) * 100),
    week52LowCents: Math.round((meta.fiftyTwoWeekLow ?? meta.regularMarketPrice) * 100)
  };
}

export type PriceRefreshResult = {
  updated: string[];
  failed: Array<{ symbol: string; error: string }>;
};

export async function refreshInvestmentPrices(): Promise<PriceRefreshResult> {
  const db = await ensureDb();
  const rows = (await db.execute("SELECT symbol FROM investment_positions ORDER BY symbol ASC")).rows as unknown as { symbol: string }[];

  if (rows.length === 0) return { updated: [], failed: [] };

  const updated: string[] = [];
  const failed: Array<{ symbol: string; error: string }> = [];

  await Promise.allSettled(
    rows.map(async ({ symbol }) => {
      try {
        const quote = await fetchYahooQuote(symbol);
        await db.execute({
          sql: `UPDATE investment_positions
                SET current_price_cents = ?, week52_high_cents = ?, week52_low_cents = ?, updated_at = ?
                WHERE symbol = ?`,
          args: [quote.currentPriceCents, quote.week52HighCents, quote.week52LowCents, new Date().toISOString(), symbol]
        });
        updated.push(symbol);
      } catch (error) {
        failed.push({ symbol, error: error instanceof Error ? error.message : "Unknown error" });
      }
    })
  );

  return { updated, failed };
}

export async function answerInvestmentQuestion(question: string) {
  const normalized = question.toLowerCase();
  const dashboard = await getInvestmentDashboard();
  const symbols = dashboard.positions.map((p) => p.symbol.toLowerCase());
  const investmentIntent =
    /(invest|investment|portfolio|etf|allocation|rebalance|rebalanc|dca|buy|watchlist|holding|holdings|contribution|contributions)/.test(normalized) ||
    symbols.some((symbol) => normalized.includes(symbol));

  if (!investmentIntent) return null;

  if (dashboard.stats.positions === 0) {
    return {
      answer: "I don't have any ETF positions or watchlist entries yet. Load the sample portfolio or add a position in the Investment Command panel first.",
      suggestions: INVESTMENT_SUGGESTIONS
    };
  }

  const matchedPosition = dashboard.positions.find(
    (p) => normalized.includes(p.symbol.toLowerCase()) || normalized.includes(p.name.toLowerCase())
  );

  if (matchedPosition) {
    const recommendation = dashboard.dcaPlan.find((item) => item.symbol === matchedPosition.symbol);
    return {
      answer: `${matchedPosition.symbol} currently represents ${formatPercent(matchedPosition.currentWeight)} of your portfolio against a ${formatPercent(matchedPosition.targetWeight)} target. It is trading at ${formatCurrency(matchedPosition.currentPriceCents)} ${matchedPosition.returnPct !== null ? `and sits ${matchedPosition.returnPct >= 0 ? "above" : "below"} cost basis by ${formatPercent(Math.abs(matchedPosition.returnPct))}` : ""}. ${recommendation ? `Your current DCA plan points about ${formatCurrency(recommendation.recommendedContributionCents)} of the next contribution toward it.` : "It does not currently need fresh capital ahead of the other sleeves."}`,
      suggestions: ["What ETF should I add to next?", "How should I rebalance my portfolio?", "What does my DCA plan look like?"]
    };
  }

  if (normalized.includes("rebalance") || normalized.includes("allocation")) {
    const underweight = dashboard.positions
      .filter((p) => p.targetWeight - p.currentWeight > 0.025)
      .sort((l, r) => r.targetWeight - r.currentWeight - (l.targetWeight - l.currentWeight))[0];
    const overweight = dashboard.positions
      .filter((p) => p.currentWeight - p.targetWeight > 0.04)
      .sort((l, r) => r.currentWeight - r.targetWeight - (l.currentWeight - l.targetWeight))[0];

    return {
      answer: `Your portfolio is worth about ${formatCurrency(dashboard.stats.portfolioValueCents)}. The clearest rebalance move is to direct new money toward ${underweight?.symbol ?? "your underweight sleeves"} and away from ${overweight?.symbol ?? "positions already at target"}. ${underweight ? `${underweight.symbol} is at ${formatPercent(underweight.currentWeight)} versus a ${formatPercent(underweight.targetWeight)} target.` : "No major underweights stand out yet."}`,
      suggestions: ["What ETF should I add to next?", "What does my DCA plan look like?", "How underweight am I right now?"]
    };
  }

  if (normalized.includes("dca") || normalized.includes("monthly") || normalized.includes("contribution")) {
    const plan = dashboard.dcaPlan.slice(0, 3).map((item) => `${item.symbol}: ${formatCurrency(item.recommendedContributionCents)}`).join("; ");
    return {
      answer: `Your current ETF contribution plan totals ${formatCurrency(dashboard.stats.monthlyContributionCents)} per month, and a safer contribution based on recent surplus is about ${formatCurrency(dashboard.stats.safeContributionCents)}. The optimized split right now looks like ${plan}.`,
      suggestions: ["What ETF should I add to next?", "How should I rebalance my portfolio?", "How underweight am I right now?"]
    };
  }

  if (normalized.includes("buy") || normalized.includes("add") || normalized.includes("next")) {
    const alert = dashboard.alerts[0];
    return {
      answer: alert ? `${alert.title}. ${alert.body} Next move: ${alert.action}` : "I don't see a standout buy signal yet, so the best next move is to keep following the target-weight DCA plan.",
      suggestions: ["How should I rebalance my portfolio?", "What does my DCA plan look like?", "How underweight am I right now?"]
    };
  }

  return {
    answer: `You're tracking ${dashboard.stats.positions} ETF positions worth about ${formatCurrency(dashboard.stats.portfolioValueCents)}, with ${formatCurrency(dashboard.stats.monthlyContributionCents)} per month earmarked for investing. ${dashboard.alerts[0] ? `Top signal right now: ${dashboard.alerts[0].title}.` : ""}`,
    suggestions: INVESTMENT_SUGGESTIONS
  };
}
