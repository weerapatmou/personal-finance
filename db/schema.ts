import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const accountTypeEnum = pgEnum("account_type", [
  "CHECKING",
  "SAVINGS",
  "CREDIT",
  "BROKERAGE",
  "WALLET",
  "PF",
  "EMERGENCY",
  "GOLD_VAULT",
]);

export const topicEnum = pgEnum("topic", ["FIX", "VARIABLE", "INVESTMENT", "TAX"]);

export const taxTreatmentEnum = pgEnum("tax_treatment", [
  "NONE",
  "PIT_DEDUCT",
  "SSO_CONTRIB",
  "PF_CONTRIB",
]);

export const transactionTypeEnum = pgEnum("transaction_type", ["EXPENSE", "TRANSFER"]);

export const recurringScopeEnum = pgEnum("recurring_scope", ["BUDGET_LINE", "TRANSACTION"]);

export const assetClassEnum = pgEnum("asset_class", [
  "STOCK",
  "ETF",
  "CRYPTO",
  "GOLD",
  "FUND",
  "CASH",
  "PF",
  "OTHER",
]);

export const unitTypeEnum = pgEnum("unit_type", [
  "SHARES",
  "COINS",
  "BAHT_WEIGHT",
  "TROY_OZ",
  "THB",
  "USD",
]);

export const quoteSourceEnum = pgEnum("quote_source", [
  "YAHOO",
  "GOLDTRADERS_TH",
  "MANUAL_NAV",
  "NONE",
]);

export const investmentTxTypeEnum = pgEnum("investment_tx_type", [
  "BUY",
  "SELL",
  "DIVIDEND",
  "FEE",
  "SPLIT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
]);

export const importStatusEnum = pgEnum("import_status", [
  "STAGED",
  "MAPPING",
  "COMMITTED",
  "FAILED",
]);

export const mappingStatusEnum = pgEnum("mapping_status", [
  "UNMAPPED",
  "AMBIGUOUS",
  "MAPPED",
  "SKIPPED",
]);

export const backupKindEnum = pgEnum("backup_kind", ["NIGHTLY_JSON", "ON_DEMAND", "PG_DUMP"]);
export const backupStatusEnum = pgEnum("backup_status", [
  "SCHEDULED",
  "RUNNING",
  "OK",
  "FAILED",
  "SKIPPED",
]);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Identity & accounts
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("THB"),
  displayCurrency: varchar("display_currency", { length: 3 }).notNull().default("THB"),
  locale: varchar("locale", { length: 5 }).notNull().default("th"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  type: accountTypeEnum("type").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Categorization (per SPEC §2.2)
// ─────────────────────────────────────────────────────────────────────────────

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: topicEnum("topic").notNull(),
    nameTh: varchar("name_th", { length: 200 }).notNull(),
    nameEn: varchar("name_en", { length: 200 }).notNull(),
    taxTreatment: taxTreatmentEnum("tax_treatment").notNull().default("NONE"),
    color: varchar("color", { length: 16 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTopicNameTh: uniqueIndex("categories_user_topic_name_th_idx").on(
      t.userId,
      t.topic,
      t.nameTh,
    ),
  }),
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    itemNameTh: varchar("item_name_th", { length: 200 }).notNull(),
    itemNameEn: varchar("item_name_en", { length: 200 }),
    plannedAmount: numeric("planned_amount", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("THB"),
    recurringTemplateId: uuid("recurring_template_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("budget_lines_unique_idx").on(
      t.userId,
      t.year,
      t.month,
      t.categoryId,
      t.itemNameTh,
    ),
  }),
);

export const monthlyIncome = pgTable(
  "monthly_income",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("THB"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.year, t.month] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Day-to-day transactions
// ─────────────────────────────────────────────────────────────────────────────

export const recurringRules = pgTable("recurring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scope: recurringScopeEnum("scope").notNull(),
  rruleString: text("rrule_string").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  templateJson: jsonb("template_json").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  budgetLineId: uuid("budget_line_id").references(() => budgetLines.id, {
    onDelete: "set null",
  }),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  type: transactionTypeEnum("type").notNull().default("EXPENSE"),
  note: text("note"),
  recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, {
    onDelete: "set null",
  }),
  transferGroupId: uuid("transfer_group_id"),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Investments (per SPEC §2.5)
// ─────────────────────────────────────────────────────────────────────────────

export const holdings = pgTable("holdings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  assetClass: assetClassEnum("asset_class").notNull(),
  symbol: varchar("symbol", { length: 64 }),
  name: varchar("name", { length: 200 }).notNull(),
  nativeCurrency: varchar("native_currency", { length: 3 }).notNull(),
  unitType: unitTypeEnum("unit_type").notNull().default("SHARES"),
  quoteSource: quoteSourceEnum("quote_source").notNull().default("YAHOO"),
  notes: text("notes"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const currencyConverts = pgTable("currency_converts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  fromCurrency: varchar("from_currency", { length: 3 }).notNull(),
  fromAmount: numeric("from_amount", { precision: 18, scale: 4 }).notNull(),
  toCurrency: varchar("to_currency", { length: 3 }).notNull(),
  toAmount: numeric("to_amount", { precision: 18, scale: 4 }).notNull(),
  effectiveRate: numeric("effective_rate", { precision: 18, scale: 8 }).notNull(),
  feesNative: numeric("fees_native", { precision: 18, scale: 4 }).notNull().default("0"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const investmentTxs = pgTable("investment_txs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  holdingId: uuid("holding_id")
    .notNull()
    .references(() => holdings.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: investmentTxTypeEnum("type").notNull(),
  units: numeric("units", { precision: 28, scale: 10 }),
  priceNative: numeric("price_native", { precision: 18, scale: 8 }),
  feesNative: numeric("fees_native", { precision: 18, scale: 4 }).notNull().default("0"),
  amountNative: numeric("amount_native", { precision: 18, scale: 4 }),
  currencyConvertId: uuid("currency_convert_id").references(() => currencyConverts.id, {
    onDelete: "set null",
  }),
  splitRatio: numeric("split_ratio", { precision: 10, scale: 6 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const realizations = pgTable("realizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  holdingId: uuid("holding_id")
    .notNull()
    .references(() => holdings.id, { onDelete: "cascade" }),
  sellTxId: uuid("sell_tx_id")
    .notNull()
    .references(() => investmentTxs.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  units: numeric("units", { precision: 28, scale: 10 }).notNull(),
  proceedsNative: numeric("proceeds_native", { precision: 18, scale: 4 }).notNull(),
  costBasisNative: numeric("cost_basis_native", { precision: 18, scale: 4 }).notNull(),
  realizedNative: numeric("realized_native", { precision: 18, scale: 4 }).notNull(),
  fxToBase: numeric("fx_to_base", { precision: 18, scale: 8 }).notNull(),
  realizedBase: numeric("realized_base", { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Prices, FX, and the daily portfolio view (per SPEC §2.6)
// ─────────────────────────────────────────────────────────────────────────────

export const priceCache = pgTable(
  "price_cache",
  {
    symbol: varchar("symbol", { length: 64 }).notNull(),
    date: date("date").notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    open: numeric("open", { precision: 18, scale: 8 }),
    high: numeric("high", { precision: 18, scale: 8 }),
    low: numeric("low", { precision: 18, scale: 8 }),
    close: numeric("close", { precision: 18, scale: 8 }).notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.symbol, t.date] }),
  }),
);

export const fxRates = pgTable(
  "fx_rates",
  {
    date: date("date").notNull(),
    base: varchar("base", { length: 3 }).notNull(),
    quote: varchar("quote", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: varchar("source", { length: 32 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.base, t.quote] }),
  }),
);

export const portfolioDaily = pgTable(
  "portfolio_daily",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id, { onDelete: "cascade" }),
    unitsHeld: numeric("units_held", { precision: 28, scale: 10 }).notNull(),
    priceNative: numeric("price_native", { precision: 18, scale: 8 }).notNull(),
    priceCurrency: varchar("price_currency", { length: 3 }).notNull(),
    fxToBase: numeric("fx_to_base", { precision: 18, scale: 8 }).notNull(),
    valueBase: numeric("value_base", { precision: 18, scale: 4 }).notNull(),
    isStale: boolean("is_stale").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.date, t.holdingId] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Importer staging (per SPEC §7)
// ─────────────────────────────────────────────────────────────────────────────

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceFilename: text("source_filename").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: importStatusEnum("status").notNull().default("STAGED"),
  summaryJson: jsonb("summary_json"),
});

export const importStaging = pgTable("import_staging", {
  id: uuid("id").primaryKey().defaultRandom(),
  importRunId: uuid("import_run_id")
    .notNull()
    .references(() => importRuns.id, { onDelete: "cascade" }),
  sheetName: varchar("sheet_name", { length: 100 }).notNull(),
  rowIndex: integer("row_index").notNull(),
  rawTopic: varchar("raw_topic", { length: 100 }),
  rawItemName: varchar("raw_item_name", { length: 300 }),
  rawCategory: varchar("raw_category", { length: 200 }),
  rawPlan: numeric("raw_plan", { precision: 18, scale: 4 }),
  rawActual: numeric("raw_actual", { precision: 18, scale: 4 }),
  inferredYear: integer("inferred_year"),
  inferredMonth: integer("inferred_month"),
  parseWarnings: jsonb("parse_warnings"),
  mappingStatus: mappingStatusEnum("mapping_status").notNull().default("UNMAPPED"),
  mappedTopic: topicEnum("mapped_topic"),
  mappedCategoryId: uuid("mapped_category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  mappedItemNameTh: varchar("mapped_item_name_th", { length: 200 }),
  importedBudgetLineId: uuid("imported_budget_line_id").references(() => budgetLines.id, {
    onDelete: "set null",
  }),
  importedTransactions: integer("imported_transactions").notNull().default(0),
});

export const categoryAliases = pgTable(
  "category_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawTopic: varchar("raw_topic", { length: 100 }),
    rawCategory: varchar("raw_category", { length: 200 }),
    rawItemName: varchar("raw_item_name", { length: 300 }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    itemNameTh: varchar("item_name_th", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("category_aliases_user_raw_idx").on(
      t.userId,
      t.rawTopic,
      t.rawCategory,
      t.rawItemName,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. Backups
// ─────────────────────────────────────────────────────────────────────────────

export const backupExports = pgTable("backup_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: backupKindEnum("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: backupStatusEnum("status").notNull().default("SCHEDULED"),
  locationUri: text("location_uri"),
  byteSize: integer("byte_size"),
  error: text("error"),
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Auth.js tables (drizzle-adapter requires these)
// ─────────────────────────────────────────────────────────────────────────────

// Auth.js drizzle-adapter expects snake_case JS property names that match the
// Postgres column names exactly. Don't rename to camelCase even though the rest
// of the schema does.
export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  budgetLines: many(budgetLines),
  transactions: many(transactions),
  holdings: many(holdings),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  budgetLine: one(budgetLines, {
    fields: [transactions.budgetLineId],
    references: [budgetLines.id],
  }),
}));

export const holdingsRelations = relations(holdings, ({ one, many }) => ({
  user: one(users, { fields: [holdings.userId], references: [users.id] }),
  account: one(accounts, { fields: [holdings.accountId], references: [accounts.id] }),
  txs: many(investmentTxs),
}));

export const investmentTxsRelations = relations(investmentTxs, ({ one }) => ({
  holding: one(holdings, { fields: [investmentTxs.holdingId], references: [holdings.id] }),
  currencyConvert: one(currencyConverts, {
    fields: [investmentTxs.currencyConvertId],
    references: [currencyConverts.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type BudgetLine = typeof budgetLines.$inferSelect;
export type MonthlyIncomeRow = typeof monthlyIncome.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type InvestmentTx = typeof investmentTxs.$inferSelect;
export type NewInvestmentTx = typeof investmentTxs.$inferInsert;
export type CurrencyConvert = typeof currencyConverts.$inferSelect;
export type Realization = typeof realizations.$inferSelect;
export type PriceCacheRow = typeof priceCache.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type PortfolioDailyRow = typeof portfolioDaily.$inferSelect;
export type ImportRun = typeof importRuns.$inferSelect;
export type ImportStagingRow = typeof importStaging.$inferSelect;
export type CategoryAlias = typeof categoryAliases.$inferSelect;
export type BackupExport = typeof backupExports.$inferSelect;

// `sql` is imported solely for use by drizzle-kit when introspecting; reference it
// here so that future migrations or raw queries have a stable import path.
export const __schemaSqlMarker = sql`-- schema marker`;
