import { ensureDb } from "@/lib/db";
import { formatCurrency } from "@/lib/finance";

export type PerkAlertTone = "hot" | "watch" | "info";

export type PerkDocumentSummary = {
  id: number;
  provider: string;
  title: string;
  documentType: string;
  source: string;
  importedAt: string;
  benefitCount: number;
  benefitLabels: string[];
  preview: string;
};

export type PerkAlert = {
  id: string;
  provider: string;
  title: string;
  body: string;
  action: string;
  tone: PerkAlertTone;
  estimatedValueCents: number;
  supportingSpendCents: number;
  prompt: string;
  benefitId: string;
  benefitKind: "cashback" | "credit" | "protection" | "access";
  categories: string[];
};

export type PerkDashboard = {
  stats: {
    documentsScanned: number;
    benefitsDetected: number;
    activeAlerts: number;
    estimatedMonthlyValueCents: number;
  };
  documents: PerkDocumentSummary[];
  alerts: PerkAlert[];
};

type PerkDocumentRow = {
  id: number;
  provider: string;
  title: string;
  documentType: string;
  source: string;
  content: string;
  importedAt: string;
};

type CategorySpendSignal = {
  category: string;
  spendCents: number;
  activeMonths: number;
};

type RecurringMerchantSignal = {
  merchant: string;
  category: string;
  averageAmountCents: number;
  activeMonths: number;
};

type BenefitRule = {
  id: string;
  label: string;
  kind: "cashback" | "credit" | "protection" | "access";
  keywords: string[];
  categories: string[];
  rewardRate?: number;
  monthlyCreditCents?: number;
  action: string;
  prompt: string;
};

type BenefitMatch = BenefitRule & {
  matchedKeywords: string[];
};

const BENEFIT_RULES: BenefitRule[] = [
  { id: "dining-rewards", label: "Dining rewards", kind: "cashback", keywords: ["dining", "restaurant", "restaurants", "food delivery", "takeout"], categories: ["Food"], rewardRate: 0.03, action: "Route restaurant and delivery spend through this product when possible.", prompt: "What perks am I probably not using?" },
  { id: "grocery-rewards", label: "Grocery rewards", kind: "cashback", keywords: ["grocery", "groceries", "supermarket"], categories: ["Food"], rewardRate: 0.02, action: "Use this product for grocery runs if you want to maximize reward yield.", prompt: "Do any of my cards reward food spending?" },
  { id: "streaming-credit", label: "Streaming credit", kind: "credit", keywords: ["streaming credit", "digital entertainment", "netflix", "spotify", "subscription credit"], categories: ["Subscriptions"], monthlyCreditCents: 1500, action: "Make sure at least one eligible streaming subscription bills to this product every month.", prompt: "Do any of my cards offset subscriptions?" },
  { id: "rideshare-credit", label: "Rideshare credit", kind: "credit", keywords: ["rideshare credit", "ride share", "uber cash", "lyft credit"], categories: ["Transportation"], monthlyCreditCents: 1000, action: "Attach this product to Uber or Lyft if you want the monthly rideshare credit to hit.", prompt: "Do I have any transportation perks?" },
  { id: "travel-insurance", label: "Travel insurance", kind: "protection", keywords: ["trip cancellation", "trip interruption", "baggage delay", "travel insurance", "travel accident"], categories: ["Travel"], action: "Book eligible trips on this product so the coverage actually applies.", prompt: "Do any of my cards cover travel?" },
  { id: "rental-car-protection", label: "Rental car coverage", kind: "protection", keywords: ["rental car", "collision damage waiver", "auto rental", "car rental loss"], categories: ["Travel", "Transportation"], action: "Pay for eligible rental cars with this product and decline overlapping rental counter coverage if appropriate.", prompt: "Do any of my cards cover travel?" },
  { id: "phone-protection", label: "Phone protection", kind: "protection", keywords: ["cell phone protection", "mobile device insurance", "phone protection", "wireless bill"], categories: ["Utilities"], action: "If this benefit matters to you, move your wireless bill onto this product and keep the receipts.", prompt: "Do I have phone protection?" },
  { id: "price-protection", label: "Price and purchase protection", kind: "protection", keywords: ["price protection", "purchase protection", "return protection", "extended warranty"], categories: ["Shopping"], action: "Use this product for larger retail purchases so you have price protection and warranty coverage available.", prompt: "Do I have price protection or purchase coverage?" },
  { id: "lounge-access", label: "Airport lounge access", kind: "access", keywords: ["priority pass", "airport lounge", "lounge access"], categories: ["Travel"], action: "Keep the membership activated and carry the membership details before your next trip.", prompt: "Do any of my cards cover travel?" }
];

function detectBenefitMatches(text: string) {
  const normalized = text.toLowerCase();
  return BENEFIT_RULES.flatMap((rule) => {
    const matchedKeywords = rule.keywords.filter((keyword) => normalized.includes(keyword));
    if (matchedKeywords.length === 0) return [];
    return [{ ...rule, matchedKeywords } satisfies BenefitMatch];
  });
}

async function getCategorySpendSignals(): Promise<CategorySpendSignal[]> {
  const db = await ensureDb();
  return (await db.execute(`
    SELECT
      category,
      COALESCE(SUM(ABS(amount_cents)), 0) AS spendCents,
      COUNT(DISTINCT posted_month) AS activeMonths
    FROM transactions
    WHERE direction = 'expense'
    GROUP BY category
  `)).rows as unknown as CategorySpendSignal[];
}

async function getRecurringMerchantSignals(): Promise<RecurringMerchantSignal[]> {
  const db = await ensureDb();
  return (await db.execute(`
    SELECT
      merchant,
      category,
      ROUND(AVG(ABS(amount_cents))) AS averageAmountCents,
      COUNT(DISTINCT posted_month) AS activeMonths
    FROM transactions
    WHERE direction = 'expense'
    GROUP BY merchant, category
    HAVING COUNT(*) >= 2
    ORDER BY averageAmountCents DESC
  `)).rows as unknown as RecurringMerchantSignal[];
}

function sumCategorySpend(signals: CategorySpendSignal[], categories: string[]) {
  return categories.reduce((total, category) => {
    const match = signals.find((s) => s.category === category);
    return total + Number(match?.spendCents ?? 0);
  }, 0);
}

function averageMonthlyCategorySpend(signals: CategorySpendSignal[], categories: string[]) {
  return categories.reduce((total, category) => {
    const match = signals.find((s) => s.category === category);
    if (!match || Number(match.activeMonths) === 0) return total;
    return total + Math.round(Number(match.spendCents) / Number(match.activeMonths));
  }, 0);
}

function toneRank(tone: PerkAlertTone) {
  if (tone === "hot") return 3;
  if (tone === "watch") return 2;
  return 1;
}

function buildPerkAlert(
  document: PerkDocumentRow,
  benefit: BenefitMatch,
  categorySignals: CategorySpendSignal[],
  recurringSignals: RecurringMerchantSignal[]
) {
  const supportingSpendCents = averageMonthlyCategorySpend(categorySignals, benefit.categories);
  const totalSpendCents = sumCategorySpend(categorySignals, benefit.categories);
  const recurringMatch = recurringSignals.find((s) => benefit.categories.includes(s.category));
  const estimatedValueCents = benefit.monthlyCreditCents
    ? Math.min(supportingSpendCents, benefit.monthlyCreditCents)
    : benefit.rewardRate
      ? Math.round(supportingSpendCents * benefit.rewardRate)
      : 0;
  const tone: PerkAlertTone =
    benefit.kind === "cashback" || benefit.kind === "credit"
      ? supportingSpendCents > 0
        ? estimatedValueCents >= 1200 ? "hot" : "watch"
        : "info"
      : totalSpendCents > 0 ? "watch" : "info";

  const spendSentence =
    supportingSpendCents > 0
      ? `You are averaging about ${formatCurrency(supportingSpendCents)} per month in ${benefit.categories.map((c) => c.toLowerCase()).join(" / ")} spend.`
      : `I found the benefit in the agreement, but I do not yet see matching spend strong enough to quantify it.`;
  const recurringSentence = recurringMatch ? ` The recurring pattern from ${recurringMatch.merchant} makes this especially worth activating.` : "";
  const valueSentence = estimatedValueCents > 0 ? ` That puts roughly ${formatCurrency(estimatedValueCents)} of monthly value on the table if it is routed correctly.` : "";

  return {
    id: `${document.id}-${benefit.id}`,
    provider: document.provider,
    title: `${document.provider}: ${benefit.label} looks available`,
    body: `${spendSentence}${valueSentence}${recurringSentence}`,
    action: benefit.action,
    tone,
    estimatedValueCents,
    supportingSpendCents,
    prompt: benefit.prompt,
    benefitId: benefit.id,
    benefitKind: benefit.kind,
    categories: benefit.categories
  } satisfies PerkAlert;
}

export async function savePerkDocument(input: {
  provider: string;
  title: string;
  content: string;
  documentType?: string;
  source?: string;
}) {
  const provider = input.provider.trim();
  const title = input.title.trim();
  const content = input.content.trim();
  const documentType = input.documentType?.trim() || "agreement";
  const source = input.source?.trim() || "manual";

  if (!provider || !title || !content) throw new Error("Provider, title, and agreement text are required.");

  const db = await ensureDb();
  const importedAt = new Date().toISOString();
  const result = await db.execute({
    sql: `INSERT INTO perk_documents (provider, title, document_type, source, content, imported_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [provider, title, documentType, source, content, importedAt]
  });

  const matches = detectBenefitMatches(content);
  return { documentId: Number(result.lastInsertRowid), benefitsDetected: matches.length };
}

export async function getPerkDashboard(): Promise<PerkDashboard> {
  const db = await ensureDb();
  const [categorySignals, recurringSignals] = await Promise.all([
    getCategorySpendSignals(),
    getRecurringMerchantSignals()
  ]);

  const documents = (await db.execute(`
    SELECT id, provider, title, document_type AS documentType, source, content, imported_at AS importedAt
    FROM perk_documents
    ORDER BY imported_at DESC
  `)).rows as unknown as PerkDocumentRow[];

  const documentSummaries = documents.map((document) => {
    const matches = detectBenefitMatches(document.content);
    return {
      id: Number(document.id),
      provider: document.provider,
      title: document.title,
      documentType: document.documentType,
      source: document.source,
      importedAt: document.importedAt,
      benefitCount: matches.length,
      benefitLabels: matches.map((m) => m.label).slice(0, 4),
      preview: document.content.replace(/\s+/g, " ").slice(0, 160)
    } satisfies PerkDocumentSummary;
  });

  const alerts = documents
    .flatMap((document) => {
      const matches = detectBenefitMatches(document.content);
      return matches.map((match) => buildPerkAlert(document, match, categorySignals, recurringSignals));
    })
    .sort((l, r) => {
      const toneDiff = toneRank(r.tone) - toneRank(l.tone);
      if (toneDiff !== 0) return toneDiff;
      return r.estimatedValueCents - l.estimatedValueCents;
    })
    .slice(0, 6);

  const benefitsDetected = documentSummaries.reduce((total, d) => total + d.benefitCount, 0);
  const estimatedMonthlyValueCents = alerts.reduce((total, a) => total + a.estimatedValueCents, 0);

  return {
    stats: { documentsScanned: documentSummaries.length, benefitsDetected, activeAlerts: alerts.length, estimatedMonthlyValueCents },
    documents: documentSummaries,
    alerts
  };
}

export async function seedDemoPerkDocuments() {
  const db = await ensureDb();
  const existingResult = await db.execute("SELECT COUNT(*) AS count FROM perk_documents");
  const existing = existingResult.rows[0] as unknown as { count: number };

  if (Number(existing.count) > 0) return { created: false, documentsInserted: 0 };

  const demoDocuments = [
    {
      provider: "Apex Everyday Rewards Visa",
      title: "Apex Everyday Rewards Visa Benefits Guide",
      documentType: "credit-card-guide",
      source: "demo",
      content: "Earn 4x points on dining and restaurants, 3x points at grocery stores and supermarkets, and a $15 monthly digital entertainment streaming credit when eligible Netflix or Spotify charges are billed to your card. Cell phone protection applies when the wireless bill is paid with the card. Purchase protection and extended warranty apply to eligible retail purchases."
    },
    {
      provider: "Voyage Infinite Travel Card",
      title: "Voyage Infinite Travel Benefits",
      documentType: "credit-card-guide",
      source: "demo",
      content: "This guide includes trip cancellation insurance, trip interruption coverage, baggage delay insurance, rental car collision damage waiver, airport lounge access through Priority Pass, and a $10 monthly rideshare credit for eligible Uber or Lyft purchases. Price protection also applies to eligible purchases."
    }
  ];

  const importedAt = new Date().toISOString();
  await db.batch(
    demoDocuments.map((doc) => ({
      sql: `INSERT INTO perk_documents (provider, title, document_type, source, content, imported_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [doc.provider, doc.title, doc.documentType, doc.source, doc.content, importedAt]
    })),
    "write"
  );

  return { created: true, documentsInserted: demoDocuments.length };
}

export async function answerPerkQuestion(question: string) {
  const normalized = question.toLowerCase();
  const perkIntent = /(perk|benefit|coverage|cash back|cashback|reward|insurance|lounge|phone protection|price protection|purchase protection|travel)/.test(normalized);

  if (!perkIntent) return null;

  const dashboard = await getPerkDashboard();

  if (dashboard.stats.documentsScanned === 0) {
    return {
      answer: "I haven't scanned any agreement or benefit guide text yet, so I can't verify your hidden perks. Paste a card agreement into the Perk Engine or load the sample benefit guides first.",
      suggestions: ["Load sample benefit guides", "What perks am I probably not using?", "Do any of my cards cover travel?"]
    };
  }

  const matchingAlerts = dashboard.alerts.filter((alert) => {
    if (normalized.includes("travel")) return alert.categories.includes("Travel") || alert.benefitId === "lounge-access";
    if (normalized.includes("price") || normalized.includes("purchase protection") || normalized.includes("warranty")) return alert.benefitId === "price-protection";
    if (normalized.includes("phone")) return alert.benefitId === "phone-protection";
    if (normalized.includes("subscription") || normalized.includes("streaming")) return alert.benefitId === "streaming-credit";
    if (normalized.includes("cashback") || normalized.includes("cash back") || normalized.includes("reward")) return alert.benefitKind === "cashback" || alert.benefitKind === "credit";
    return true;
  });

  const topAlerts = (matchingAlerts.length > 0 ? matchingAlerts : dashboard.alerts).slice(0, 3);
  const summary = topAlerts.map((a) => `${a.title}: ${a.body} Next move: ${a.action}`).join(" ");

  return {
    answer: topAlerts.length > 0 ? summary : "I scanned your benefit guides, but I'm not seeing a perk match for that question yet. Try asking about travel, cashback, phone protection, or price protection.",
    suggestions: ["What perks am I probably not using?", "Do any of my cards cover travel?", "Do I have price protection or purchase coverage?"]
  };
}
