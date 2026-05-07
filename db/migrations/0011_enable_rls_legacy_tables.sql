-- Enable RLS on legacy tables that still exist in Supabase but were dropped
-- from the Drizzle schema during the portfolio redesign and earlier
-- currency-cache rewrites. Supabase's linter still flags them because the
-- physical tables were never dropped.
--
-- `IF EXISTS` keeps this idempotent: in any environment where these tables
-- have already been dropped (e.g. fresh install from current schema only),
-- the statement is a no-op.

ALTER TABLE IF EXISTS "fx_rates"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "price_cache"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "currency_converts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "holdings"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "investment_txs"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "portfolio_daily"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "realizations"      ENABLE ROW LEVEL SECURITY;
