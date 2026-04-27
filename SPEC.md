# Personal Finance Tracker — Technical Spec

This document is the source of truth for the data model, business rules, and the
xlsx import strategy. It supersedes section 5 and parts of section 7.2 of the
original design doc. Every phase of work must read this before changing schemas
or business logic.

---

## 1. Project context

Single-user replacement for a 2+ year-old Excel workbook (`Personal Finance.xlsx`,
26 sheets). The user is bilingual Thai/English; primary currency is THB; secondary
is USD (stocks, crypto, USD cash). Six asset classes: stocks/ETFs, gold,
crypto, provident fund, THB cash, USD emergency fund.

The workbook has documented pain points the new app must fix:

1. Spot-only price fetch (`GOOGLEFINANCE`) — no historical price for monthly P&L curves.
2. A single `Current USD/THB` cell at `Investment Summary!C2` re-values every past
   USD position at today's rate, corrupting historical valuations.
3. `#REF!` errors in the hidden `COMPOUND` retirement projection sheet.
4. No cross-month aggregation.
5. No realized-P&L tracking — only end-state holdings.
6. Manual NAV entry for the provident fund (still required — no API).

---

## 2. Data model

All identifiers are UUIDs unless stated. All timestamps are `timestamptz`. All
money is stored as `numeric(18,4)` in the **native currency of the row**, with
an explicit `currency` column. Never store base-currency values; convert at read
time using `FxRate` dated to the transaction.

### 2.1 Identity & accounts

```
User(
  id, email, name, base_currency='THB', display_currency='THB',
  locale='th', created_at, updated_at
)

Account(
  id, user_id, name, type, currency,
  is_archived bool default false, sort_order int,
  created_at, updated_at
)
-- type: CHECKING | SAVINGS | CREDIT | BROKERAGE | WALLET | PF | EMERGENCY | GOLD_VAULT
```

### 2.2 Categorization (corrected from original design)

The workbook has **three layers** of categorization, not two. The original design
collapsed these. Keep them separate:

```
Category(
  id, user_id, topic, name_th, name_en,
  tax_treatment default 'NONE',
  color, sort_order, is_archived bool default false,
  created_at, updated_at,
  UNIQUE(user_id, topic, name_th)
)
-- topic: FIX | VARIABLE | INVESTMENT | TAX
-- tax_treatment: NONE | PIT_DEDUCT | SSO_CONTRIB | PF_CONTRIB
--   PIT_DEDUCT = personal income tax deductible (RMF, donations, SSF)
--   SSO_CONTRIB = social security contributions
--   PF_CONTRIB = provident fund contributions (own portion only)

BudgetLine(
  id, user_id, year int, month int, category_id,
  item_name_th, item_name_en, planned_amount numeric(18,4),
  currency default 'THB',
  recurring_template_id NULL,    -- if seeded from a recurring template
  sort_order, created_at, updated_at,
  UNIQUE(user_id, year, month, category_id, item_name_th)
)
-- A BudgetLine is one row in the monthly sheet's plan column.
-- Replaces the original MonthlyBudget; differs by carrying item_name explicitly.
```

There is **NO** `Income` topic. In the workbook, income is a single number per
month at the bottom of the sheet (`E32`/`E33`). Model it as:

```
MonthlyIncome(
  user_id, year, month, amount numeric(18,4),
  currency default 'THB', note,
  PRIMARY KEY (user_id, year, month)
)
```

If the user later wants to break income down (Salary / Passive / Bonus), add an
`IncomeLine` table at that point. Don't seed Income as Categories.

### 2.3 Day-to-day transactions

```
Transaction(
  id, user_id, account_id, category_id, budget_line_id NULL,
  date date, amount numeric(18,4), currency,
  type, note,
  recurring_rule_id NULL,
  attachment_url NULL,
  created_at, updated_at
)
-- type: EXPENSE | TRANSFER
-- budget_line_id is optional: links the actual spend to a planned line item
```

Income is intentionally not a Transaction `type` — it lives on `MonthlyIncome`.
Transfers between user-owned accounts use `type=TRANSFER` with a paired
`Transaction` referencing the other account (use a shared `transfer_group_id`).

### 2.4 Recurring rules

```
RecurringRule(
  id, user_id, scope,
  rrule_string text NOT NULL,    -- ICAL RFC-5545 RRULE
  start_date date, end_date date NULL,
  template_json jsonb,           -- carries the data to copy on each fire
  is_active bool default true
)
-- scope: BUDGET_LINE | TRANSACTION
-- BUDGET_LINE: each fire creates a BudgetLine for the new month
-- TRANSACTION: each fire creates a Transaction (e.g., auto-pay rent)
```

Use ICAL RRULE strings (`FREQ=MONTHLY;BYMONTHDAY=1`) — every library and locale
handles them consistently; reinventing this is a footgun.

### 2.5 Investments

```
Holding(
  id, user_id, account_id, asset_class,
  symbol, name, native_currency,
  unit_type default 'SHARES',
  quote_source default 'YAHOO',
  notes,
  is_archived bool default false,
  created_at, updated_at
)
-- asset_class: STOCK | ETF | CRYPTO | GOLD | FUND | CASH | PF | OTHER
-- unit_type:   SHARES | COINS | BAHT_WEIGHT | TROY_OZ | THB | USD
-- quote_source: YAHOO | GOLDTRADERS_TH | MANUAL_NAV | NONE
```

Note: **`avg_cost` and `current_units` are NOT stored on Holding.** They are
derived by replaying `InvestmentTx` on read. This avoids drift bugs when a
historical transaction is corrected.

```
InvestmentTx(
  id, user_id, holding_id, date date, type,
  units numeric(28,10),                 -- positive for BUY/DIVIDEND-DRIP, negative for SELL
  price_native numeric(18,8) NULL,      -- price per unit in holding.native_currency
  fees_native numeric(18,4) default 0,
  amount_native numeric(18,4) NULL,     -- for DIVIDEND/FEE: the cash value
  currency_convert_id NULL,             -- pairs the BUY/SELL with its FX swap
  split_ratio numeric(10,6) NULL,       -- for SPLIT
  note,
  created_at, updated_at
)
-- type: BUY | SELL | DIVIDEND | FEE | SPLIT | TRANSFER_IN | TRANSFER_OUT

CurrencyConvert(
  id, user_id, account_id, date date,
  from_currency, from_amount numeric(18,4),
  to_currency,   to_amount   numeric(18,4),
  effective_rate numeric(18,8),         -- to_amount / from_amount
  fees_native numeric(18,4) default 0,
  note,
  created_at
)
-- Models a Dime/Wise FX swap. Pair with an InvestmentTx via InvestmentTx.currency_convert_id.

Realization(
  id, user_id, holding_id, sell_tx_id, date date,
  units numeric(28,10),
  proceeds_native numeric(18,4),        -- (price * units - fees), in native currency
  cost_basis_native numeric(18,4),      -- avg_cost at sale × units sold
  realized_native numeric(18,4),        -- proceeds - cost_basis
  fx_to_base numeric(18,8),             -- FxRate on sell date
  realized_base numeric(18,4),
  created_at
)
-- Written by trigger / app code on every SELL. Denormalized for fast tax reports.
```

### 2.6 Prices, FX, and the daily portfolio view

```
PriceCache(
  symbol, date, quote_currency,
  open numeric(18,8), high numeric(18,8), low numeric(18,8), close numeric(18,8),
  source, fetched_at,
  PRIMARY KEY (symbol, date)
)
-- quote_currency is REQUIRED. Gold = THB, BTC = USD, QQQM = USD, PF = THB.

FxRate(
  date date, base, quote, rate numeric(18,8), source,
  PRIMARY KEY (date, base, quote)
)
-- Read with Last-Observation-Carry-Forward: if no row for date D,
-- use the most recent prior row.

PortfolioDaily(
  user_id, date, holding_id,
  units_held numeric(28,10),
  price_native numeric(18,8),
  price_currency,
  fx_to_base numeric(18,8),
  value_base numeric(18,4),
  is_stale bool,
  computed_at,
  PRIMARY KEY (user_id, date, holding_id)
)
-- Replaces the original PortfolioSnapshot.
-- Daily resolution. Idempotently UPSERTed by a daily cron.
-- Recompute the affected date range whenever an InvestmentTx or PriceCache row
-- in that range is mutated.
```

### 2.7 Backups

```
BackupExport(
  id, user_id, kind, started_at, finished_at, status, location_uri, byte_size, error
)
-- kind: NIGHTLY_JSON | ON_DEMAND
```

---

## 3. Currency & FX rules

1. Every monetary column is in its own row's currency. Never write base-currency
   amounts to the source-of-truth tables.
2. Conversion to base currency happens at **read time**, using the `FxRate` for
   the row's `date`. Apply LOCF — if no rate exists for date D, walk back to the
   most recent prior date with a rate. Document this rule in the codebase comments.
3. The FX cron writes one rate per business day. It does **not** pre-fill weekends;
   LOCF at read time handles them. This keeps the cache compact and its semantics
   honest.
4. Gold is THB-quoted, by **baht weight** (บาท). 1 baht = 15.244 g = ~0.4854 troy oz.
   `Holding.unit_type = 'BAHT_WEIGHT'` for the user's MTS-GOLD position. Don't
   mix with troy-oz international gold without a separate holding.

---

## 4. Cost-basis rules (canonical)

These rules are non-negotiable. Encode them as pure functions and unit-test each.

1. **Native currency**: `avg_cost` is computed and stored (when materialized in
   views) in the holding's `native_currency`. THB equivalent is derived at read
   time using `FxRate@buy_date`.

2. **BUY**:
   ```
   new_units    = old_units + buy_units
   new_avg_cost = (old_units * old_avg_cost + buy_units * buy_price + buy_fees)
                  / new_units
   ```
   Fees are baked into the basis.

3. **SELL** (units negative on the InvestmentTx row, but use absolute units in
   the formulas):
   ```
   proceeds      = sell_price * |sell_units| - sell_fees
   cost_basis    = avg_cost_at_sale * |sell_units|
   realized      = proceeds - cost_basis
   ```
   `avg_cost` is **unchanged** by SELL. Write a `Realization` row.

4. **DIVIDEND**: income event, does not affect `avg_cost`. Cash credit equal to
   `amount_native` (or `units * price_native` if DRIP, where it then becomes a
   BUY at that price with zero fees).

5. **FEE** (standalone, e.g., custody fee): expense event, does not affect
   `avg_cost`.

6. **SPLIT(ratio r)**:
   ```
   new_units    = old_units * r
   new_avg_cost = old_avg_cost / r
   ```
   For a 1:10 reverse split, r = 0.1. Apply on the split's effective date when
   replaying.

7. **CURRENCY_CONVERT**: not an InvestmentTx. Recorded in `CurrencyConvert` and
   linked to a follow-on BUY via `InvestmentTx.currency_convert_id`. The follow-on
   BUY's native price is in the holding's currency; the THB cost basis is derived
   from `effective_rate` on the swap, **not** from the public FX market rate that
   day. This preserves the user's actual purchasing power.

8. **Provident Fund — split into two holdings**: seed both
   - `Accenture PF — Own Contribution`
   - `Accenture PF — Employer Match`

   Both reference the same `account_id` and the same NAV `symbol`, but their
   cost-basis behavior differs: own-contribution treats employer match as a
   non-event; employer-match treats own-contribution likewise. This lets the
   dashboard show the three-line split (your money / employer's money / market gain)
   that the original workbook can't compute.

---

## 5. Portfolio valuation (replaces PortfolioSnapshot)

`PortfolioDaily` is the canonical historical net-worth source. It is **derived**
and recomputable.

### 5.1 Population

A daily cron at 02:30 ICT does the following per holding, per date in
`[max(holding.first_tx_date, last_clean_date+1), yesterday]`:

```
units_held(D)   = Σ InvestmentTx.units up to D, with SPLIT applied
price_native(D) = PriceCache(symbol, D).close, with LOCF
fx_to_base(D)   = FxRate(price_currency → user.base_currency, D), with LOCF
value_base(D)   = units_held(D) * price_native(D) * fx_to_base(D)
is_stale        = (price_age > 3 business days for STOCK/ETF/CRYPTO,
                   > 35 days for FUND/PF, > 7 days for GOLD)
```

UPSERT on `(user_id, date, holding_id)`. Idempotent.

### 5.2 Invalidation

When an `InvestmentTx` is created/updated/deleted, mark every `PortfolioDaily` row
with `date >= tx.date AND holding_id = tx.holding_id` as `dirty`. The next cron
run recomputes the dirty range.

When a `PriceCache` row is updated (rare, but happens on data corrections),
likewise mark the affected `(holding, date)` rows dirty.

### 5.3 Manual NAV positions (Provident Fund)

PF NAV arrives roughly mid-month and is entered manually via a UI form. Between
two entries, `PriceCache` rows are populated by LOCF — i.e., the price for D is
the most recent NAV ≤ D. Mark `is_stale=true` if NAV is older than 35 days.

### 5.4 No `PortfolioSnapshot`

Drop it from the schema entirely. Daily granularity at ~10 holdings × 730 days ×
2 years = 14.6K rows, which Postgres handles trivially. Monthly aggregation for
charts is a `date_trunc('month', date)` query, not a separate table.

---

## 6. Tax & deduction tracking

`Category.tax_treatment` is the source of truth. The Tax Planner page sums:

- `tax_treatment='PIT_DEDUCT'` BudgetLines and Transactions → checked against
  Thai PIT caps:
  - RMF: 30% of assessable income, max ฿500,000 combined with SSF/PF/etc.
  - SSF: 30% of assessable income, max ฿200,000.
  - Donations: 10% of assessable income after deductions (general); 2x for
    education/sports.
- `tax_treatment='SSO_CONTRIB'` → Social Security 5% capped at ฿750/month.
- `tax_treatment='PF_CONTRIB'` (own portion) → up to 15% of salary, max ฿500,000
  combined cap.

Let the user override "assessable income" in the Tax Planner page (defaults to
`Σ MonthlyIncome` for the year).

---

## 7. CSV / xlsx importer (two-stage)

The user has 18 historical sheets with significant naming and layout drift. A
naive single-pass importer will silently corrupt data. Use a staging table.

### 7.1 Stage 1 — extract to staging (idempotent, re-runnable)

```
ImportRun(id, user_id, source_filename, started_at, finished_at, status, summary_json)

ImportStaging(
  id, import_run_id, sheet_name, row_index int,
  raw_topic, raw_item_name, raw_category, raw_plan, raw_actual,
  inferred_year int, inferred_month int,
  parse_warnings jsonb,
  mapping_status default 'UNMAPPED',
  mapped_topic, mapped_category_id NULL, mapped_item_name_th NULL,
  imported_budget_line_id NULL, imported_transactions int default 0
)
-- mapping_status: UNMAPPED | AMBIGUOUS | MAPPED | SKIPPED
```

The parser must:

1. Resolve sheet name → (year, month) via heuristics. The 18 historical sheets
   use these formats — match all with a single regex/decision tree:
   ```
   "JUL2024", "JULY 2024", "AUG2024",
   "Oct 2024", "Nov 2024", "DEC 2024",
   "JAN 2025", "FEB 2025", "Mar 2025", "Apr 2025", "May 2025",
   "June 2025", "July 2025", "Aug 2025", "Sep 2025", "Oct 2025",
   "Nov 2025", "Dec 2025",
   "Jan 2026", "Feb 2026", "Mar 26", "Apr 26"
   ```
   Note the "Mar 26" / "Apr 26" two-digit-year style — interpret 2-digit as
   `2000 + yy` only when yy ∈ [20..40] to avoid ambiguity with day numbers.
   Skip non-month sheets (`Investment Summary`, `Plan Personal Finance`,
   `COMPOUND`, `Template Finance Detail`).

2. Carry the topic forward. Each topic group's first row has the topic in
   column A and the item in column B. Subsequent rows in the same group have
   the item in column A and **column B is empty**, so columns shift: plan
   value sits in column C and actual in column E (not D and E). The parser
   must:
   - Detect group boundaries (new topic in column A).
   - For non-leading rows, read item from A, plan from C, actual from E
     (with the category column treated as blank).
   - Inherit the category from the most recent row in the same topic that
     had an explicit category.

3. Treat `=...` formulas as their evaluated cached value (the `<v>` element in
   the xlsx XML). If no cached value, log a `parse_warnings` entry and skip
   the row.

4. Default `Transaction.date` to the **last day of the inferred month** for
   imported rows. This preserves correct month bucketing under any timezone.

5. Strip whitespace, normalize Thai spacing (NFC). Map known typos:
   - `ค่าอาหาร Neslte` → `ค่าอาหาร Nestle` (used Jul 2024–Feb 2025).
   - `ค่าอาหาร Nestle` → kept as-is.
   - `DeFI` → kept as-is (don't auto-correct casing; let the user decide).

6. Don't write to live tables yet. Everything goes to `ImportStaging`.

### 7.2 Stage 2 — interactive mapping UI

`/settings/import/[run_id]` shows a table of every distinct
`(raw_topic, raw_category, raw_item_name)` triple in the staging set. The user
maps each to a `(topic, category, item_name_th)`. Mappings are persisted in a
`CategoryAlias(user_id, raw_topic, raw_category, raw_item_name, category_id, item_name_th)`
table so a re-import (e.g., after fixing a typo in the source xlsx) reuses
prior mappings without manual rework.

When all rows are `MAPPED` or `SKIPPED`, a "Commit" button:

1. Inserts/updates `BudgetLine(year, month, category_id, item_name_th, planned_amount)`
   for each mapped row with a non-zero plan.
2. Inserts a `Transaction(date=last-of-month, category_id, budget_line_id, amount=actual,
   currency='THB', type='EXPENSE')` for each mapped row with a non-zero actual.
3. Updates `MonthlyIncome` from the per-sheet income cell (`E32` or `E33` —
   detect by which row contains the `Income` shared-string label).
4. Marks the `ImportRun` as `COMMITTED`.

Phase 4 ships this importer. Phase 1 only needs to ensure the schema supports it.

---

## 8. Backups

Phase 1 ships a nightly `pg_dump` to a private S3 bucket (or Backblaze B2 if
cheaper) at 03:00 ICT, retained for 30 days. Independent of Supabase backups —
the user owns 2+ years of irreplaceable personal data. Surface backup status
on `/settings`.

The backup job is a Vercel Cron route that streams `pg_dump --format=custom` to
the configured object store. Credentials in env vars:
`BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET`.

---

## 9. Auth

Phase 1: Auth.js magic-link, single email allowlist via `ALLOWED_EMAIL` env.
Phase 4 polish: add WebAuthn / passkey as a primary authenticator, magic-link
as fallback. After first passkey enrollment, magic-link is rate-limited (1 per
hour) to discourage routine use.
