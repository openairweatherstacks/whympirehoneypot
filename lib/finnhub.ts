// Finnhub API integration — server-side only, never import from client components

const API_KEY = process.env.FINNHUB_API_KEY ?? "";
const BASE = "https://finnhub.io/api/v1";

function hdr() {
  return { "X-Finnhub-Token": API_KEY } as HeadersInit;
}

// ── Raw Finnhub response types ──────────────────────────────────────────────

type FinnhubQuote = {
  c: number;   // current price
  h: number;   // high of day
  l: number;   // low of day
  o: number;   // open
  pc: number;  // previous close
  t: number;   // timestamp (unix)
};

type FinnhubMetrics = {
  metric: {
    "52WeekHigh"?: number;
    "52WeekLow"?: number;
    "52WeekHighDate"?: string;
    "52WeekLowDate"?: string;
    beta?: number;
    rsi?: number;
    roeTTM?: number;
    "10DayAverageTradingVolume"?: number;
  };
};

type FinnhubRecommendation = {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
};

// ── Public return types ─────────────────────────────────────────────────────

export type BuySignal = "strong-buy" | "buy" | "hold" | "wait" | "avoid";

export type FinnhubLiveData = {
  symbol: string;
  currentPrice: number;          // USD
  prevClose: number;             // USD
  changePercent: number;         // e.g. -1.23
  week52High: number;            // USD
  week52Low: number;             // USD
  rangePosition: number;         // 0–100 (where in 52-wk range)
  buySignal: BuySignal;
  buySignalLabel: string;        // human-friendly
  analystBuy: number;            // count of buy+strongBuy
  analystHold: number;
  analystSell: number;
  analystTotal: number;
  analystConsensus: string;      // "Strong Buy" | "Buy" | "Hold" | "Sell"
  fetchedAt: string;             // ISO timestamp
};

// ── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchQuote(symbol: string): Promise<FinnhubQuote> {
  const res = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}`, {
    headers: hdr(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Finnhub quote ${symbol}: HTTP ${res.status}`);
  return res.json();
}

async function fetchMetrics(symbol: string): Promise<FinnhubMetrics> {
  const res = await fetch(
    `${BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`,
    { headers: hdr(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Finnhub metrics ${symbol}: HTTP ${res.status}`);
  return res.json();
}

async function fetchRecommendations(symbol: string): Promise<FinnhubRecommendation[]> {
  const res = await fetch(
    `${BASE}/stock/recommendation?symbol=${encodeURIComponent(symbol)}`,
    { headers: hdr(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Finnhub recommendations ${symbol}: HTTP ${res.status}`);
  return res.json();
}

// ── Signal calculation ──────────────────────────────────────────────────────

function calcRangePosition(current: number, low: number, high: number): number {
  if (high <= low) return 50;
  return Math.round(((current - low) / (high - low)) * 100);
}

function calcBuySignal(rangePos: number, analystConsensus: string): BuySignal {
  // Weight 52-week range position heavily — best entry is near lows
  if (rangePos <= 15) return "strong-buy";
  if (rangePos <= 35) return "buy";
  if (rangePos <= 60) {
    // Let analyst consensus break the tie in the middle zone
    if (analystConsensus === "Strong Buy" || analystConsensus === "Buy") return "buy";
    return "hold";
  }
  if (rangePos <= 80) return "wait";
  return "avoid";
}

const SIGNAL_LABELS: Record<BuySignal, string> = {
  "strong-buy": "Strong Buy — near 52-wk low",
  "buy":        "Buy — favorable entry",
  "hold":       "Hold — fair value zone",
  "wait":       "Wait — elevated price",
  "avoid":      "Avoid — near 52-wk high",
};

function calcAnalystConsensus(recs: FinnhubRecommendation[]): {
  buy: number; hold: number; sell: number; total: number; label: string;
} {
  if (recs.length === 0) return { buy: 0, hold: 0, sell: 0, total: 0, label: "No data" };

  const latest = recs[0]; // sorted newest first by Finnhub
  const buy = (latest.buy ?? 0) + (latest.strongBuy ?? 0);
  const hold = latest.hold ?? 0;
  const sell = (latest.sell ?? 0) + (latest.strongSell ?? 0);
  const total = buy + hold + sell;

  if (total === 0) return { buy: 0, hold: 0, sell: 0, total: 0, label: "No data" };

  const buyPct = buy / total;
  const sellPct = sell / total;

  let label: string;
  if (buyPct >= 0.6) label = "Strong Buy";
  else if (buyPct >= 0.4) label = "Buy";
  else if (sellPct >= 0.4) label = "Sell";
  else label = "Hold";

  return { buy, hold, sell, total, label };
}

// ── Main export ─────────────────────────────────────────────────────────────

export async function getFinnhubLiveData(symbol: string): Promise<FinnhubLiveData> {
  const [quote, metrics, recs] = await Promise.all([
    fetchQuote(symbol),
    fetchMetrics(symbol),
    fetchRecommendations(symbol),
  ]);

  const current = quote.c;
  const prevClose = quote.pc;
  const changePercent = prevClose > 0 ? ((current - prevClose) / prevClose) * 100 : 0;

  const high52 = metrics.metric["52WeekHigh"] ?? current * 1.1;
  const low52 = metrics.metric["52WeekLow"] ?? current * 0.9;

  const rangePosition = calcRangePosition(current, low52, high52);
  const analyst = calcAnalystConsensus(recs);
  const buySignal = calcBuySignal(rangePosition, analyst.label);

  return {
    symbol,
    currentPrice: current,
    prevClose,
    changePercent: Math.round(changePercent * 100) / 100,
    week52High: high52,
    week52Low: low52,
    rangePosition,
    buySignal,
    buySignalLabel: SIGNAL_LABELS[buySignal],
    analystBuy: analyst.buy,
    analystHold: analyst.hold,
    analystSell: analyst.sell,
    analystTotal: analyst.total,
    analystConsensus: analyst.label,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getFinnhubBatch(
  symbols: string[]
): Promise<{ data: FinnhubLiveData[]; errors: { symbol: string; error: string }[] }> {
  const data: FinnhubLiveData[] = [];
  const errors: { symbol: string; error: string }[] = [];

  // Finnhub free tier: 60 req/min — run sequentially to stay under the limit
  for (const symbol of symbols) {
    try {
      const live = await getFinnhubLiveData(symbol);
      data.push(live);
    } catch (err) {
      errors.push({ symbol, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { data, errors };
}
