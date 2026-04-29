-- Add EMERGENCY_FUND as a separate asset class for the portfolio dashboard.
-- Postgres requires ALTER TYPE ADD VALUE outside a transaction in some setups,
-- but Drizzle's migrator handles this fine for enum additions.

ALTER TYPE "asset_class" ADD VALUE IF NOT EXISTS 'EMERGENCY_FUND';
