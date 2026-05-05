-- DCA tracker: ledger of cost-averaging buys + per-user UI settings & goals.
-- Currency-agnostic: each entry carries its own fiat currency. Pinned to an
-- (asset_symbol, asset_source) so the live mark price is read from the
-- existing asset_prices cache (no API calls on the request path).

CREATE TABLE "dca_entries" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "asset_symbol"   varchar(64) NOT NULL DEFAULT 'bitcoin',
  "asset_source"   asset_quote_source NOT NULL DEFAULT 'COINGECKO',
  "date"           date NOT NULL,
  "fiat_amount"    numeric(18, 4) NOT NULL CHECK ("fiat_amount" > 0),
  "fiat_currency"  varchar(3) NOT NULL,
  "units"          numeric(28, 10) NOT NULL CHECK ("units" > 0),
  "unit_price"     numeric(18, 4) NOT NULL CHECK ("unit_price" > 0),
  "note"           text,
  "created_at"     timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"     timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "dca_entries_user_asset_date_idx"
  ON "dca_entries" ("user_id", "asset_symbol", "asset_source", "date");
CREATE INDEX "dca_entries_user_id_idx" ON "dca_entries" ("user_id");

CREATE TABLE "dca_settings" (
  "user_id"            uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "theme"              varchar(8)  NOT NULL DEFAULT 'light',
  "accent"             varchar(32) NOT NULL DEFAULT 'orange',
  "graph_range"        varchar(8)  NOT NULL DEFAULT '30D',
  "goal_fiat"          numeric(18, 4),
  "goal_fiat_currency" varchar(3),
  "goal_units"         numeric(28, 10),
  "updated_at"         timestamptz NOT NULL DEFAULT NOW()
);
