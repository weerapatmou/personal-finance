# Phase 1 — User Prompt (paste into Claude Code)

> Paste everything below the horizontal rule into Claude Code as your first
> task message, after `CLAUDE.md` (the system prompt from section 7.1 of the
> design doc) is in place at the repo root and `SPEC.md` (this folder) is
> committed.

---

Build the **Personal Finance Tracker** described in `CLAUDE.md` (system
principles) and `SPEC.md` (data model, business rules, importer). **Read both
before doing anything.** If anything in them contradicts your prior assumptions
from the design doc, `SPEC.md` wins.

This is **Phase 1: Foundation**. The deliverable is one PR.

## Hard requirements

1. **Initialize a Next.js 15 + TypeScript project** using the App Router. Use
   `pnpm` as the package manager. TypeScript strict mode on.

2. **Install:**
   - Tailwind CSS, shadcn/ui (slate base color)
   - Drizzle ORM + `postgres-js` driver
   - Auth.js (`next-auth@beta` for App Router)
   - `next-intl` for Thai/English i18n
   - Recharts (no chart usage in Phase 1, but install for later phases)
   - Zod
   - `decimal.js` (for money math at boundaries)
   - `rrule` (for ICAL RRULE parsing)
   - Vitest + `@testing-library/react`, jsdom
   - `eslint`, `prettier`, `@types/node`

3. **Drizzle schema** in `db/schema.ts`. Implement **every** table in
   `SPEC.md` section 2, including:
   - `User`, `Account`
   - `Category` (with `topic` and `tax_treatment` enums)
   - `BudgetLine` (NOT `MonthlyBudget` — see SPEC §2.2)
   - `MonthlyIncome` (no `Income` topic on Category; see SPEC §2.2)
   - `Transaction` (no `INCOME` type — see SPEC §2.3)
   - `RecurringRule`
   - `Holding` (NO `avg_cost` or `current_units` columns — derived; SPEC §2.5)
   - `InvestmentTx`, `CurrencyConvert`, `Realization`
   - `PriceCache` (with `quote_currency`), `FxRate`
   - `PortfolioDaily` (NOT `PortfolioSnapshot` — see SPEC §5)
   - `ImportRun`, `ImportStaging`, `CategoryAlias`
   - `BackupExport`

   All timestamps are `timestamptz`. All money is `numeric(18,4)`. Use enums via
   Drizzle's `pgEnum` for every `type` / `topic` / `tax_treatment` /
   `mapping_status` field. Generate the initial migration:
   `pnpm drizzle-kit generate`. Commit the SQL.

4. **Seed script** at `db/seed.ts`. It must be idempotent (re-runnable without
   duplicates — use `ON CONFLICT DO NOTHING` patterns).

   **Seed one User** from `SEED_EMAIL` and `SEED_NAME` env vars.

   **Seed seven accounts** (matches the actual workbook, not the original
   design doc's incorrect list):

   | name | type | currency |
   |---|---|---|
   | Dime — Stock (USD) | BROKERAGE | USD |
   | Binance TH — Crypto | WALLET | USD |
   | Binance TH — Cash (THB) | WALLET | THB |
   | Dime — Cash (USD) | CHECKING | USD |
   | Dime FCD — Emergency Fund | EMERGENCY | USD |
   | MTS-GOLD 99.9% | GOLD_VAULT | THB |
   | Accenture PF | PF | THB |

   **Seed Categories** with bilingual names and `tax_treatment`. The list below
   is the corrected version — it differs from the original design doc in seven
   places (see verification notes you can find in the conversation that
   produced `SPEC.md`).

   ```
   topic=FIX:
     ค่าผ่อนรถยนต์                          | Car Loan                       | NONE
     ค่าประกัน + ซ่อมรถยนต์                  | Car Insurance & Repair         | NONE
     ค่าโทรศัพท์                            | Phone                          | NONE
     ค่า Internet                           | Internet                       | NONE
     ค่า Subscription                       | Subscriptions                  | NONE
     ค่า Youtube Premium, iCloud            | YouTube Premium & iCloud       | NONE
     ค่าเช่า Condo                          | Condo Rent                     | NONE

   topic=VARIABLE:
     ค่าน้ำมัน                              | Gas                            | NONE
     ค่าเดินทางสาธารณะ ค่าทางด่วน             | Public Transport / Tolls       | NONE
     ค่าน้ำ                                 | Water                          | NONE
     ค่าไฟ                                  | Electricity                    | NONE
     ค่าอาหาร                                | Food                           | NONE
     ค่าอาหาร Nestle                        | Nestle Food                    | NONE
     ค่าอาหารมื้อพิเศษ                       | Special Meal                   | NONE
     ค่าของใช้ใน Condo                       | Condo Supplies                 | NONE
     ค่าเครื่องแต่งตัว/สำอาง/บำรุงหน้า          | Clothing & Cosmetics           | NONE
     ของรางวัลให้ตัวเอง                      | Personal Reward                | NONE
     ค่าใช้จ่ายพิเศษ                          | Special Expense                | NONE

   topic=INVESTMENT:
     Invest ระยะสั้น                         | Short-Term Investment          | NONE
     Invest ระยะกลาง                         | Medium-Term Investment         | NONE
     Invest ระยะยาว                          | Long-Term Investment           | NONE

   topic=TAX:
     ภาษีทั่วไป                             | General Tax                    | NONE
   ```

   Note: `tax_treatment` is `NONE` at category level. The user marks specific
   *items* (BudgetLines) as deductible — that flag lives in a follow-up table
   (or as a per-BudgetLine override), spec'd in Phase 4 with the Tax Planner.
   Don't try to derive `PIT_DEDUCT` from category names like
   `RMF (ลดหย่อนภาษี)` — those Thai parentheticals are item-level data, not
   category-level.

   **Seed a `CategoryAlias` table** mapping the legacy typo so re-import works:
   ```
   raw_item_name="ค่าอาหาร Neslte" → item_name_th="ค่าอาหาร Nestle"
   ```

5. **Auth.js magic-link** with a single allowlisted email read from
   `ALLOWED_EMAIL` env. Reject any other email at the `signIn` callback.
   Use a Resend-compatible SMTP provider (configurable; default to Resend).

   Wire up:
   - `app/login/page.tsx` — magic-link request form
   - `app/api/auth/[...nextauth]/route.ts` — Auth.js handler
   - `middleware.ts` — protect every route except `/login` and `/api/auth/*`
   - A session-aware `app/layout.tsx` shell

6. **Home page**. After login, `/` shows just:
   - `Hello, {user.name}`
   - `Logout` button
   - The display currency selector (THB / USD), persisted to `User.display_currency`

   This is intentionally minimal — Phase 2 builds the real dashboard.

7. **Money + FX utilities** in `lib/money.ts`:
   - `Money` type: `{ amount: Decimal; currency: 'THB' | 'USD' }`
   - `convert(money, toCurrency, atDate, fxRows): Money` — applies LOCF over
     `fxRows` (don't query DB inside this fn; pass rows in)
   - `format(money, locale)` — locale-aware
   - `add`, `subtract`, `multiply` — Decimal-based, no JS floats

   Vitest tests covering:
   - USD→THB at exact-date FX rate
   - USD→THB with LOCF (request date is a weekend, prior Friday rate is used)
   - Same-currency no-op returns the input value
   - Throws on unknown currency
   - Throws on missing FX rate with no prior row to LOCF to

8. **Cost-basis utility** in `lib/cost-basis.ts`. A pure function
   `replay(txs: InvestmentTx[]): { units: Decimal; avgCost: Decimal }` that
   implements SPEC §4 rules (BUY, SELL, DIVIDEND, FEE, SPLIT). Don't hit the DB.

   Vitest tests covering:
   - Two BUYs at different prices → correct weighted-average avg_cost
   - BUY then SELL of partial units → avg_cost unchanged, units decrease
   - 1:10 reverse SPLIT → units × 0.1, avg_cost ÷ 0.1
   - Fees on a BUY are baked into avg_cost
   - DIVIDEND does not change avg_cost or units

9. **GitHub Actions** at `.github/workflows/ci.yml` running on every PR:
   - `pnpm install --frozen-lockfile`
   - `pnpm typecheck` (`tsc --noEmit`)
   - `pnpm lint`
   - `pnpm test`
   - Drizzle migration check: `pnpm drizzle-kit check` — fail if drift detected

10. **Backup job stub**. Create the route at
    `app/api/cron/backup/route.ts` that:
    - Verifies `Authorization: Bearer ${CRON_SECRET}` header
    - Inserts a `BackupExport` row with `status='SCHEDULED'`
    - For Phase 1, just logs "TODO: pg_dump to S3" and marks the row `SKIPPED`
    - Add a Vercel Cron config at `vercel.json` for `0 20 * * *` (03:00 ICT = 20:00 UTC)

    The actual `pg_dump` integration can land in Phase 2 — but the route, the
    auth, the env vars, and the table must exist now so Phase 2 can fill it in
    without schema churn.

11. **README.md** at the repo root with:
    - One-paragraph summary
    - Required env vars (table: name | example | who reads it):
      `DATABASE_URL`, `DIRECT_URL` (Drizzle), `AUTH_SECRET`, `EMAIL_SERVER`,
      `EMAIL_FROM`, `ALLOWED_EMAIL`, `SEED_EMAIL`, `SEED_NAME`, `CRON_SECRET`,
      `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_KEY`,
      `BACKUP_S3_SECRET`
    - Local dev steps: `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`,
      `pnpm dev`
    - How to deploy to Vercel + Supabase (link the relevant Vercel and
      Supabase docs; do not invent dashboard click-paths)
    - How to run the test suite

## What this PR does NOT include

- No `/months`, no `/portfolio`, no charts, no recurring UI, no importer UI.
  Those are Phases 2–4.
- No actual `pg_dump` implementation in the backup route — stubbed.
- No `tax_treatment` overrides per BudgetLine — Phase 4.
- No PortfolioDaily cron job — Phase 3.

## Decisions to surface in the PR description

When you open the PR, list in the description:

1. Any place where `SPEC.md` was ambiguous and you picked an interpretation.
2. Any package version drift (e.g., shadcn renamed something) you had to work
   around.
3. Any test you wanted to write but couldn't justify in Phase 1.
4. Open questions for me to answer before Phase 2 begins.

Branch name: `phase-1-foundation`. Commit messages: conventional-commits
(`feat:`, `chore:`, `test:`, etc.). Group commits logically — e.g., one for
scaffolding, one for schema, one for auth, one for utilities + tests, one for
CI. Don't squash.

Begin.
