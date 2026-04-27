// Re-exports of the schema enum literal types so call sites can import them
// without pulling in the entire Drizzle schema graph.

export type Topic = "FIX" | "VARIABLE" | "INVESTMENT" | "TAX";

export type TaxTreatment = "NONE" | "PIT_DEDUCT" | "SSO_CONTRIB" | "PF_CONTRIB";

export type TransactionType = "EXPENSE" | "TRANSFER";

export type RecurringScope = "BUDGET_LINE" | "TRANSACTION";

export type AssetClass =
  | "STOCK"
  | "ETF"
  | "CRYPTO"
  | "GOLD"
  | "FUND"
  | "CASH"
  | "PF"
  | "OTHER";

export type InvestmentTxType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "FEE"
  | "SPLIT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export type Currency = "THB" | "USD";

export const TOPIC_LABEL_EN: Record<Topic, string> = {
  FIX: "Fix Cost",
  VARIABLE: "Variable Cost",
  INVESTMENT: "Investment",
  TAX: "Tax",
};

export const TOPIC_LABEL_TH: Record<Topic, string> = {
  FIX: "Fix Cost",
  VARIABLE: "Variable Cost",
  INVESTMENT: "Investment",
  TAX: "Tax",
};
