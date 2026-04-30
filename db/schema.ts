import {
  boolean,
  date,
  index,
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

export const assetCategoryEnum = pgEnum("asset_category", ["STOCK", "CRYPTO", "GOLD"]);
export const manualCategoryEnum = pgEnum("manual_category", [
  "PF",
  "CASH",
  "EMERGENCY_FUND",
]);
export const assetQuoteSourceEnum = pgEnum("asset_quote_source", [
  "YAHOO",
  "COINGECKO",
  "GOLDTRADERS_TH",
]);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Identity & accounts
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: varchar("email", { length: 320 }).unique(),
  name: varchar("name", { length: 200 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("THB"),
  displayCurrency: varchar("display_currency", { length: 3 }).notNull().default("THB"),
  locale: varchar("locale", { length: 5 }).notNull().default("th"),
  useBuddhistEra: boolean("use_buddhist_era").notNull().default(false),
  theme: varchar("theme", { length: 12 }).notNull().default("system"),
  retirementSettings: jsonb("retirement_settings"),
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
    manualActual: numeric("manual_actual", { precision: 18, scale: 4 }),
    currency: varchar("currency", { length: 3 }).notNull().default("THB"),
    taxTreatmentOverride: taxTreatmentEnum("tax_treatment_override"),
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

export const budgetLineDetails = pgTable("budget_line_details", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  budgetLineId: uuid("budget_line_id")
    .notNull()
    .references(() => budgetLines.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 500 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("THB"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const transactions = pgTable(
  "transactions",
  {
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
  },
  (t) => ({
    // Phase 2: prevent duplicate transactions when the recurring cron fires twice
    // for the same occurrence (per PHASE2_PROMPT §D step 9).
    recurringUniq: uniqueIndex("transactions_recurring_uniq_idx").on(
      t.recurringRuleId,
      t.date,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Importer staging (per SPEC §7)
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
// 7. Portfolio (redesign — see plan: portfolio-and-holding-mutable-dongarra)
// ─────────────────────────────────────────────────────────────────────────────

// Quantity-tracked holdings: Stock / Crypto / Gold. The (user, category, symbol)
// uniqueness lets the wizard "add to existing" via INSERT ... ON CONFLICT.
export const assetHoldings = pgTable(
  "asset_holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: assetCategoryEnum("category").notNull(),
    symbol: varchar("symbol", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    quoteSource: assetQuoteSourceEnum("quote_source").notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    units: numeric("units", { precision: 28, scale: 10 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCatSymbolUniq: uniqueIndex("asset_holdings_user_category_symbol_idx").on(
      t.userId,
      t.category,
      t.symbol,
    ),
    userIdx: index("asset_holdings_user_id_idx").on(t.userId),
  }),
);

// Manual holdings: PF / Cash / Emergency Fund. Free-form name + amount + currency.
export const manualHoldings = pgTable(
  "manual_holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: manualCategoryEnum("category").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("manual_holdings_user_id_idx").on(t.userId),
  }),
);

// Latest spot price per (symbol, source). No history — see plan rationale.
export const assetPrices = pgTable(
  "asset_prices",
  {
    symbol: varchar("symbol", { length: 64 }).notNull(),
    source: assetQuoteSourceEnum("source").notNull(),
    price: numeric("price", { precision: 18, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.symbol, t.source] }),
  }),
);

// Latest FX rate per (base, quote) pair.
export const currencyRates = pgTable(
  "currency_rates",
  {
    base: varchar("base", { length: 3 }).notNull(),
    quote: varchar("quote", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.base, t.quote] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. Backups
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
export type ImportRun = typeof importRuns.$inferSelect;
export type ImportStagingRow = typeof importStaging.$inferSelect;
export type CategoryAlias = typeof categoryAliases.$inferSelect;
export type BackupExport = typeof backupExports.$inferSelect;
export type BudgetLineDetail = typeof budgetLineDetails.$inferSelect;
export type NewBudgetLineDetail = typeof budgetLineDetails.$inferInsert;
export type AssetHolding = typeof assetHoldings.$inferSelect;
export type NewAssetHolding = typeof assetHoldings.$inferInsert;
export type ManualHolding = typeof manualHoldings.$inferSelect;
export type NewManualHolding = typeof manualHoldings.$inferInsert;
export type AssetPriceRow = typeof assetPrices.$inferSelect;
export type CurrencyRateRow = typeof currencyRates.$inferSelect;
export type AssetCategory = (typeof assetCategoryEnum.enumValues)[number];
export type ManualCategory = (typeof manualCategoryEnum.enumValues)[number];
export type AssetQuoteSource = (typeof assetQuoteSourceEnum.enumValues)[number];

// `sql` is imported solely for use by drizzle-kit when introspecting; reference it
// here so that future migrations or raw queries have a stable import path.
export const __schemaSqlMarker = sql`-- schema marker`;
