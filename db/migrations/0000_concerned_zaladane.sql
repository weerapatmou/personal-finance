CREATE TYPE "public"."account_type" AS ENUM('CHECKING', 'SAVINGS', 'CREDIT', 'BROKERAGE', 'WALLET', 'PF', 'EMERGENCY', 'GOLD_VAULT');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('STOCK', 'ETF', 'CRYPTO', 'GOLD', 'FUND', 'CASH', 'PF', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."backup_kind" AS ENUM('NIGHTLY_JSON', 'ON_DEMAND', 'PG_DUMP');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('SCHEDULED', 'RUNNING', 'OK', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('STAGED', 'MAPPING', 'COMMITTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."investment_tx_type" AS ENUM('BUY', 'SELL', 'DIVIDEND', 'FEE', 'SPLIT', 'TRANSFER_IN', 'TRANSFER_OUT');--> statement-breakpoint
CREATE TYPE "public"."mapping_status" AS ENUM('UNMAPPED', 'AMBIGUOUS', 'MAPPED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."quote_source" AS ENUM('YAHOO', 'GOLDTRADERS_TH', 'MANUAL_NAV', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."recurring_scope" AS ENUM('BUDGET_LINE', 'TRANSACTION');--> statement-breakpoint
CREATE TYPE "public"."tax_treatment" AS ENUM('NONE', 'PIT_DEDUCT', 'SSO_CONTRIB', 'PF_CONTRIB');--> statement-breakpoint
CREATE TYPE "public"."topic" AS ENUM('FIX', 'VARIABLE', 'INVESTMENT', 'TAX');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('EXPENSE', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('SHARES', 'COINS', 'BAHT_WEIGHT', 'TROY_OZ', 'THB', 'USD');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_accounts" (
	"userId" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backup_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "backup_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "backup_status" DEFAULT 'SCHEDULED' NOT NULL,
	"location_uri" text,
	"byte_size" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"category_id" uuid NOT NULL,
	"item_name_th" varchar(200) NOT NULL,
	"item_name_en" varchar(200),
	"planned_amount" numeric(18, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'THB' NOT NULL,
	"recurring_template_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" "topic" NOT NULL,
	"name_th" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"tax_treatment" "tax_treatment" DEFAULT 'NONE' NOT NULL,
	"color" varchar(16),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_topic" varchar(100),
	"raw_category" varchar(200),
	"raw_item_name" varchar(300) NOT NULL,
	"category_id" uuid,
	"item_name_th" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "currency_converts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"from_currency" varchar(3) NOT NULL,
	"from_amount" numeric(18, 4) NOT NULL,
	"to_currency" varchar(3) NOT NULL,
	"to_amount" numeric(18, 4) NOT NULL,
	"effective_rate" numeric(18, 8) NOT NULL,
	"fees_native" numeric(18, 4) DEFAULT '0' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fx_rates" (
	"date" date NOT NULL,
	"base" varchar(3) NOT NULL,
	"quote" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" varchar(32) NOT NULL,
	CONSTRAINT "fx_rates_date_base_quote_pk" PRIMARY KEY("date","base","quote")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"symbol" varchar(64),
	"name" varchar(200) NOT NULL,
	"native_currency" varchar(3) NOT NULL,
	"unit_type" "unit_type" DEFAULT 'SHARES' NOT NULL,
	"quote_source" "quote_source" DEFAULT 'YAHOO' NOT NULL,
	"notes" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_filename" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "import_status" DEFAULT 'STAGED' NOT NULL,
	"summary_json" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_staging" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_run_id" uuid NOT NULL,
	"sheet_name" varchar(100) NOT NULL,
	"row_index" integer NOT NULL,
	"raw_topic" varchar(100),
	"raw_item_name" varchar(300),
	"raw_category" varchar(200),
	"raw_plan" numeric(18, 4),
	"raw_actual" numeric(18, 4),
	"inferred_year" integer,
	"inferred_month" integer,
	"parse_warnings" jsonb,
	"mapping_status" "mapping_status" DEFAULT 'UNMAPPED' NOT NULL,
	"mapped_topic" "topic",
	"mapped_category_id" uuid,
	"mapped_item_name_th" varchar(200),
	"imported_budget_line_id" uuid,
	"imported_transactions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_txs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"holding_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" "investment_tx_type" NOT NULL,
	"units" numeric(28, 10),
	"price_native" numeric(18, 8),
	"fees_native" numeric(18, 4) DEFAULT '0' NOT NULL,
	"amount_native" numeric(18, 4),
	"currency_convert_id" uuid,
	"split_ratio" numeric(10, 6),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_income" (
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'THB' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_income_user_id_year_month_pk" PRIMARY KEY("user_id","year","month")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_daily" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"holding_id" uuid NOT NULL,
	"units_held" numeric(28, 10) NOT NULL,
	"price_native" numeric(18, 8) NOT NULL,
	"price_currency" varchar(3) NOT NULL,
	"fx_to_base" numeric(18, 8) NOT NULL,
	"value_base" numeric(18, 4) NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_daily_user_id_date_holding_id_pk" PRIMARY KEY("user_id","date","holding_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_cache" (
	"symbol" varchar(64) NOT NULL,
	"date" date NOT NULL,
	"quote_currency" varchar(3) NOT NULL,
	"open" numeric(18, 8),
	"high" numeric(18, 8),
	"low" numeric(18, 8),
	"close" numeric(18, 8) NOT NULL,
	"source" varchar(32) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_cache_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "realizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"holding_id" uuid NOT NULL,
	"sell_tx_id" uuid NOT NULL,
	"date" date NOT NULL,
	"units" numeric(28, 10) NOT NULL,
	"proceeds_native" numeric(18, 4) NOT NULL,
	"cost_basis_native" numeric(18, 4) NOT NULL,
	"realized_native" numeric(18, 4) NOT NULL,
	"fx_to_base" numeric(18, 8) NOT NULL,
	"realized_base" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" "recurring_scope" NOT NULL,
	"rrule_string" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"template_json" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"budget_line_id" uuid,
	"date" date NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"type" "transaction_type" DEFAULT 'EXPENSE' NOT NULL,
	"note" text,
	"recurring_rule_id" uuid,
	"transfer_group_id" uuid,
	"attachment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200) NOT NULL,
	"base_currency" varchar(3) DEFAULT 'THB' NOT NULL,
	"display_currency" varchar(3) DEFAULT 'THB' NOT NULL,
	"locale" varchar(5) DEFAULT 'th' NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backup_exports" ADD CONSTRAINT "backup_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_aliases" ADD CONSTRAINT "category_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "category_aliases" ADD CONSTRAINT "category_aliases_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "currency_converts" ADD CONSTRAINT "currency_converts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "currency_converts" ADD CONSTRAINT "currency_converts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_staging" ADD CONSTRAINT "import_staging_import_run_id_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_staging" ADD CONSTRAINT "import_staging_mapped_category_id_categories_id_fk" FOREIGN KEY ("mapped_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_staging" ADD CONSTRAINT "import_staging_imported_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("imported_budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_txs" ADD CONSTRAINT "investment_txs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_txs" ADD CONSTRAINT "investment_txs_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investment_txs" ADD CONSTRAINT "investment_txs_currency_convert_id_currency_converts_id_fk" FOREIGN KEY ("currency_convert_id") REFERENCES "public"."currency_converts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monthly_income" ADD CONSTRAINT "monthly_income_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_daily" ADD CONSTRAINT "portfolio_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_daily" ADD CONSTRAINT "portfolio_daily_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realizations" ADD CONSTRAINT "realizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realizations" ADD CONSTRAINT "realizations_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realizations" ADD CONSTRAINT "realizations_sell_tx_id_investment_txs_id_fk" FOREIGN KEY ("sell_tx_id") REFERENCES "public"."investment_txs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_lines_unique_idx" ON "budget_lines" USING btree ("user_id","year","month","category_id","item_name_th");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_user_topic_name_th_idx" ON "categories" USING btree ("user_id","topic","name_th");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "category_aliases_user_raw_idx" ON "category_aliases" USING btree ("user_id","raw_topic","raw_category","raw_item_name");