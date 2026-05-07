-- Enable Row-Level Security on every public table.
--
-- Supabase exposes the `public` schema through PostgREST using the `anon` and
-- `authenticated` roles. Without RLS, anyone with the project URL + anon key
-- can read/write these tables. The app itself does NOT use the Supabase REST
-- API — it connects directly via DATABASE_URL using the `postgres` role,
-- which has BYPASSRLS. Enabling RLS without policies therefore:
--   • Blocks all PostgREST access (fixes the Supabase security warnings).
--   • Leaves server-side Drizzle queries unaffected.
--
-- If a table is ever exposed to anon/authenticated in the future, a CREATE
-- POLICY statement must be added explicitly per table.

ALTER TABLE "users"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget_lines"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget_line_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monthly_income"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_rules"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_runs"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_staging"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category_aliases"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_holdings"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_holdings"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_prices"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "currency_rates"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dca_entries"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dca_settings"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "backup_exports"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_accounts"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;
