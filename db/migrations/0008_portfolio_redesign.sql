-- Portfolio redesign: simpler quantity-tracked + manual-amount holdings.
-- Old tables (holdings, investment_txs, price_cache, fx_rates, portfolio_daily,
-- currency_converts, realizations) are intentionally NOT dropped here — they're
-- orphaned but harmless. Drop manually later if their data isn't needed.

CREATE TYPE "asset_category" AS ENUM ('STOCK', 'CRYPTO', 'GOLD');
CREATE TYPE "manual_category" AS ENUM ('PF', 'CASH', 'EMERGENCY_FUND');
CREATE TYPE "asset_quote_source" AS ENUM ('YAHOO', 'COINGECKO', 'GOLDTRADERS_TH');

-- Quantity-tracked: Stock / Crypto / Gold. One row per (user, category, symbol).
CREATE TABLE "asset_holdings" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category"       asset_category NOT NULL,
  "symbol"         varchar(64) NOT NULL,
  "display_name"   varchar(200) NOT NULL,
  "quote_source"   asset_quote_source NOT NULL,
  "quote_currency" varchar(3) NOT NULL,
  "units"          numeric(28, 10) NOT NULL,
  "notes"          text,
  "created_at"     timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"     timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "asset_holdings_user_category_symbol_idx"
  ON "asset_holdings" ("user_id", "category", "symbol");
CREATE INDEX "asset_holdings_user_id_idx" ON "asset_holdings" ("user_id");

-- Manual-amount: PF / Cash / Emergency Fund.
CREATE TABLE "manual_holdings" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category"    manual_category NOT NULL,
  "name"        varchar(200) NOT NULL,
  "amount"      numeric(18, 4) NOT NULL,
  "currency"    varchar(3) NOT NULL,
  "notes"       text,
  "created_at"  timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "manual_holdings_user_id_idx" ON "manual_holdings" ("user_id");

-- Spot prices, latest only (no history).
CREATE TABLE "asset_prices" (
  "symbol"      varchar(64) NOT NULL,
  "source"      asset_quote_source NOT NULL,
  "price"       numeric(18, 8) NOT NULL,
  "currency"    varchar(3) NOT NULL,
  "fetched_at"  timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("symbol", "source")
);

-- Latest FX rates (one row per currency pair).
CREATE TABLE "currency_rates" (
  "base"        varchar(3) NOT NULL,
  "quote"       varchar(3) NOT NULL,
  "rate"        numeric(18, 8) NOT NULL,
  "fetched_at"  timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("base", "quote")
);
