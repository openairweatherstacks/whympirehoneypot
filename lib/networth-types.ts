// Shared types and constants — no server-only imports so client components can use them

export type AccountType = "asset" | "liability";

export type AccountCategory =
  | "checking"
  | "savings"
  | "investment"
  | "real_estate"
  | "vehicle"
  | "other_asset"
  | "credit_card"
  | "mortgage"
  | "auto_loan"
  | "student_loan"
  | "other_liability";

export const ASSET_CATEGORIES: AccountCategory[] = [
  "checking",
  "savings",
  "investment",
  "real_estate",
  "vehicle",
  "other_asset",
];

export const LIABILITY_CATEGORIES: AccountCategory[] = [
  "credit_card",
  "mortgage",
  "auto_loan",
  "student_loan",
  "other_liability",
];

export const CATEGORY_LABELS: Record<AccountCategory, string> = {
  checking: "Checking",
  savings: "Savings",
  investment: "Investments",
  real_estate: "Real Estate",
  vehicle: "Vehicle",
  other_asset: "Other Asset",
  credit_card: "Credit Card",
  mortgage: "Mortgage",
  auto_loan: "Auto Loan",
  student_loan: "Student Loan",
  other_liability: "Other Liability",
};
