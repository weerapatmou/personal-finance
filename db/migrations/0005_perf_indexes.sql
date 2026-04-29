-- Performance indexes: foreign keys and date columns that are filtered on
-- every page load but have no index. Full-table scans grow with data.

-- transactions: user + date are on every page query
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx"        ON "transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "transactions_date_idx"           ON "transactions" ("date");
CREATE INDEX IF NOT EXISTS "transactions_category_id_idx"    ON "transactions" ("category_id");
CREATE INDEX IF NOT EXISTS "transactions_budget_line_id_idx" ON "transactions" ("budget_line_id");

-- investment_txs: user + holding are filtered in portfolio pages
CREATE INDEX IF NOT EXISTS "investment_txs_user_id_idx"    ON "investment_txs" ("user_id");
CREATE INDEX IF NOT EXISTS "investment_txs_holding_id_idx" ON "investment_txs" ("holding_id");
CREATE INDEX IF NOT EXISTS "investment_txs_date_idx"       ON "investment_txs" ("date");

-- holdings: filtered by user on every portfolio page
CREATE INDEX IF NOT EXISTS "holdings_user_id_idx"    ON "holdings" ("user_id");
CREATE INDEX IF NOT EXISTS "holdings_account_id_idx" ON "holdings" ("account_id");

-- categories: joined in analytics + tax
CREATE INDEX IF NOT EXISTS "categories_user_id_idx" ON "categories" ("user_id");

-- budget_lines: filtered by user + (year, month) in months pages
CREATE INDEX IF NOT EXISTS "budget_lines_user_id_idx"          ON "budget_lines" ("user_id");
CREATE INDEX IF NOT EXISTS "budget_lines_user_year_month_idx"  ON "budget_lines" ("user_id", "year", "month");

-- accounts: filtered by user in new holding wizard
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" ("user_id");

-- portfolio_daily: DISTINCT ON (holding_id) ORDER BY date DESC — needs compound index
CREATE INDEX IF NOT EXISTS "portfolio_daily_user_holding_date_idx"
    ON "portfolio_daily" ("user_id", "holding_id", "date" DESC);

-- monthly_income: filtered by user + (year, month) on dashboard + months
CREATE INDEX IF NOT EXISTS "monthly_income_user_year_month_idx"
    ON "monthly_income" ("user_id", "year", "month");

-- price_cache: PK is (symbol, date) — already indexed. No extra needed.
