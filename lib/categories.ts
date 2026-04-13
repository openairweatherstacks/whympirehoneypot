export const CATEGORIES = [
  "Food",
  "Housing",
  "Transportation",
  "Subscriptions",
  "Utilities",
  "Health",
  "Travel",
  "Debt",
  "Shopping",
  "Income",
  "General"
] as const;

export type Category = (typeof CATEGORIES)[number];
