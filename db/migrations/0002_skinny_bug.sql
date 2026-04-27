ALTER TABLE "budget_lines" ADD COLUMN "tax_treatment_override" "tax_treatment";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" varchar(12) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "retirement_settings" jsonb;