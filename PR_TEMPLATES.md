# PR description templates

One template per phase. When opening a PR, copy the relevant phase's block
into the PR body and fill in. Sections marked **(required)** must not be
deleted — they make review and rollback predictable. Sections marked
**(if applicable)** can be removed when empty.

The shared `## Cross-cutting checks` block at the bottom applies to every PR
and should be appended to all phase descriptions.

---

## Phase 1 — Foundation

```markdown
## Summary (required)
<1–2 sentences: what shipped, what's now possible that wasn't before.>

## Schema (required)
**Migrations added** (filenames):
- `db/migrations/0001_init.sql` — <one-line description>
- ...

**Tables created**: User, Account, Category, BudgetLine, MonthlyIncome,
Transaction, RecurringRule, Holding, InvestmentTx, CurrencyConvert,
Realization, PriceCache, FxRate, PortfolioDaily, ImportRun, ImportStaging,
CategoryAlias, BackupExport.

**Confirm absent** (these were intentionally NOT created — flag if any slipped in):
- [ ] No `MonthlyBudget` table (replaced by `BudgetLine`)
- [ ] No `PortfolioSnapshot` table (replaced by `PortfolioDaily`)
- [ ] No `avg_cost` or `current_units` columns on `Holding` (derived)
- [ ] No `INCOME` value in the `Transaction.type` enum (Income lives on `MonthlyIncome`)
- [ ] No `INCOME` topic in the `Category.topic` enum

## Seed data (required)
- [ ] One `User` row from `SEED_EMAIL` / `SEED_NAME`
- [ ] 7 `Account` rows (Dime — Stock USD, Binance TH — Crypto, Binance TH —
      Cash THB, Dime — Cash USD, Dime FCD — Emergency, MTS-GOLD 99.9%,
      Accenture PF)
- [ ] 22 `Category` rows across topics FIX (7), VARIABLE (11), INVESTMENT (3),
      TAX (1)
- [ ] 1 `CategoryAlias` row mapping `ค่าอาหาร Neslte` → `ค่าอาหาร Nestle`
- [ ] Seed script is idempotent — re-running creates no duplicates

## Auth (required)
- [ ] Magic-link flow works end-to-end with the allowlisted email
- [ ] Non-allowlisted email is rejected at the `signIn` callback (not after)
- [ ] `/login` is reachable without a session; everything else redirects
- [ ] `/api/auth/[...nextauth]` route present and not protected by middleware

## Utilities (required)
- [ ] `lib/money.ts` exports `Money`, `convert`, `format`, `add`, `subtract`,
      `multiply`. All Decimal-based.
- [ ] `lib/cost-basis.ts` exports `replay()` implementing every rule in SPEC §4.
- [ ] No `Number` arithmetic on money anywhere in `lib/` or `app/`.

## Tests (required)
- [ ] Money: USD→THB exact-date, USD→THB with weekend LOCF, same-currency
      no-op, unknown-currency throws, missing-FX-with-no-LOCF throws
- [ ] Cost-basis: weighted-avg BUY, partial SELL, 1:10 reverse split, fees
      baked into BUY basis, DIVIDEND no-op on basis
- [ ] All tests run in `pnpm test` and pass in CI

## CI (required)
- [ ] `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile`,
      `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm drizzle-kit check`
- [ ] CI passes on this branch

## Backup stub (required)
- [ ] `app/api/cron/backup/route.ts` exists, requires
      `Authorization: Bearer ${CRON_SECRET}`, writes a `BackupExport` row,
      currently marked `SKIPPED` (real `pg_dump` body lands in Phase 2)
- [ ] `vercel.json` has the cron entry `0 20 * * *`

## README (required)
- [ ] Env-var table is accurate
- [ ] `pnpm dev` works from a clean clone after `pnpm install` +
      `pnpm db:migrate` + `pnpm db:seed`
- [ ] Deploy steps reference Vercel + Supabase docs (not invented click-paths)

## Decisions surfaced (required)
<List each ambiguity in SPEC.md you resolved, with the choice and the
reason. Examples to fill in:>
- <SPEC was silent on X; chose Y because Z>
- <Package version drift: shadcn renamed component foo → bar in v0.x; updated>
- <Test I wanted to write but couldn't: ...>

## Open questions for Phase 2 kickoff (required)
- <Question 1>
- <Question 2>

## Screenshots (if applicable)
<Login page, post-login `/` showing "Hello, {name}", currency selector.>
```

---

## Phase 2 — Expense Tracking

```markdown
## Summary (required)
<1–2 sentences: e.g., "Monthly ledger replaces the per-month Excel sheets:
add/edit/delete transactions and budget lines, copy plan from previous month,
recurring rules, full pg_dump backup.">

## Migrations (required)
- `db/migrations/000X_recurring_unique_index.sql` — adds
  `UNIQUE (recurring_rule_id, date)` on `Transaction`
- `db/migrations/000X_buddhist_era.sql` — adds `User.use_buddhist_era`
- <any others>

## Pages added (required)
- [ ] `/months` — index of every month with data
- [ ] `/months/[yyyy-mm]` — full ledger detail, plan-vs-actual table
- [ ] `/months/[yyyy-mm]/new` — mobile-friendly tx-add (or modal from index)
- [ ] `/settings/recurring` — RecurringRule CRUD

## Server actions (required)
- [ ] `createBudgetLine`, `updateBudgetLine`, `deleteBudgetLine`
- [ ] `createTransaction`, `updateTransaction`, `deleteTransaction`
- [ ] `upsertMonthlyIncome`
- [ ] `createMonth`, `copyPlanFromPreviousMonth`
- [ ] All inputs validated with Zod; money parsed via `decimal.js`

## Workbook fidelity (required)
- [ ] Topic groups render in the order FIX → VARIABLE → INVESTMENT → TAX
- [ ] Subtotals per topic match the Apr 2026 sheet's H-column formulas
      against a sample dataset (paste numbers below)
- [ ] Income / Total / Net trio at the bottom matches workbook layout
- [ ] Category-bilingual rendering switches with `User.locale` without reload

## Recurring (required)
- [ ] `RRULE` strings parsed with the `rrule` library (no custom recurrence math)
- [ ] Cron at `5 17 * * *` UTC (00:05 ICT) processes every active rule
- [ ] Long-gap test: rule with `last_fired_at = 60 days ago` produces 2
      BudgetLines on next run
- [ ] Idempotency: re-running cron in the same UTC day produces zero new
      Transactions (unique-index enforces)

## Backup body (required)
- [ ] `pg_dump --format=custom` streams to S3-compatible store
- [ ] `BackupExport.status` transitions: SCHEDULED → OK / FAILED
- [ ] Retention deletes objects > 30 days old after a successful upload
- [ ] Manual run (curl with `CRON_SECRET`) produces a downloadable backup
      (verify `pg_restore --list` works)

## Mobile (required)
- [ ] Tx-add form usable on 375×667 viewport (full-screen modal,
      `inputMode="decimal"`)
- [ ] Tap targets ≥ 44×44 px

## i18n (required)
- [ ] All visible strings on `/months`, `/months/[yyyy-mm]`, `/settings/recurring`
      go through `next-intl`
- [ ] Numbers formatted via `Intl.NumberFormat` with the right locale
- [ ] Buddhist Era toggle works (off by default)

## Tests (required)
- [ ] `copyPlanFromPreviousMonth` happy / missing-prev / idempotency
- [ ] Plan-vs-Actual aggregation across categories with month-boundary tx
- [ ] Recurring cron long-gap and uniqueness tests
- [ ] Backup route returns 401 without `CRON_SECRET`

## Decisions surfaced (required)
- <RRULE-builder UX choices and any rules you couldn't express>
- <Timezone confirmation for Transaction.date bucketing>
- <pg_dump deployment approach (vendored binary / Neon / runner)>
- <Workbook layout details you couldn't faithfully reproduce>

## Open questions for Phase 3 kickoff (required)
- <Question 1>
- <Question 2>

## Screenshots (required)
- Month detail (desktop, light mode)
- Month detail (mobile, accordion collapsed)
- `/settings/recurring` list view
- A sample backup file's `pg_restore --list` output (copy/paste in a code
  block — verifies the dump is real)
```

---

## Phase 3 — Portfolio

```markdown
## Summary (required)
<1–2 sentences: e.g., "Portfolio dashboard with daily-resolution net worth,
cost-basis-correct P&L, Yahoo + goldtraders price ingestion, and the
PortfolioDaily invalidation pipeline.">

## Migrations (required)
- `db/migrations/000X_portfolio_daily_indexes.sql` — composite indexes
  for the daily cron's range queries
- <any others; e.g., trigger for InvestmentTx invalidation if you went that route>

## Pages added (required)
- [ ] `/portfolio` — dashboard
- [ ] `/portfolio/holdings` — list grouped by asset class
- [ ] `/portfolio/holdings/new` — create holding (with symbol validation)
- [ ] `/portfolio/holdings/[id]` — per-holding detail with price chart + tx history
- [ ] `/portfolio/holdings/[id]/nav` — manual NAV entry (only for `MANUAL_NAV` holdings)
- [ ] `/portfolio/transactions` — global InvestmentTx list
- [ ] `/portfolio/fx-convert` — CurrencyConvert form

## Cost-basis correctness (required)
- [ ] `lib/cost-basis.ts replay()` covers all of: BUY, SELL, DIVIDEND, FEE,
      SPLIT, TRANSFER_IN, TRANSFER_OUT, plus CurrencyConvert linkage
- [ ] No `avg_cost` or `units` column added to `Holding` (still derived)
- [ ] HUYA reverse-split fixture passes (1:10 split correctly halves `avg_cost`)
- [ ] Realization rows written on every SELL with both native and base values

## PortfolioDaily pipeline (required)
- [ ] Daily cron at `30 17 * * *` UTC (00:30 ICT) populates the dirty range
- [ ] Initial population for a holding with N years of history completes
      within Vercel function-timeout limits (or batch across runs — explain
      below if you batched)
- [ ] Mutating an `InvestmentTx` invalidates downstream `PortfolioDaily` rows;
      next cron run rewrites them
- [ ] Re-running the cron on the same day inserts zero rows (idempotency test)
- [ ] Stale-data flag set correctly per asset_class threshold

## Price ingestion (required)
- [ ] `lib/prices/yahoo.ts` handles stocks (QQQM, IYW, IHE, IVV, ACN, HUYA),
      crypto (BTC-USD), FX (THB=X)
- [ ] `lib/prices/goldtraders.ts` parses the spot price for "ทองคำแท่ง 96.5%"
      and converts to MTS-GOLD-9999 via the documented purity factor
- [ ] Backfill cap of 1 year per cron run is enforced
- [ ] Manual refresh button on `/portfolio` is rate-limited (4/hour/holding)

## Dashboard math (required)
- [ ] Top KPI strip: Total NW, today's Δ, MTD Δ, YTD Δ — values match a
      hand-computed sample (paste numbers in a code block)
- [ ] Allocation donut sums to 100% (with tolerance ±0.5%)
- [ ] Per-holding %-return uses (current_value_native − cost_basis_native) /
      cost_basis_native — NOT base-currency division (which would mix in
      FX move)

## Provident Fund split (required)
- [ ] Two `Holding` rows: "Accenture PF — Own Contribution" and
      "Accenture PF — Employer Match"
- [ ] Same `account_id`, same `symbol` for shared NAV
- [ ] Dashboard renders combined PF line with tooltip-revealed split

## Tests (required)
- [ ] Cost-basis: every rule in SPEC §4 (extends Phase 1's coverage)
- [ ] PortfolioDaily: invalidate-and-rewrite, LOCF for weekend tx dates,
      idempotent re-runs
- [ ] Yahoo adapter: stubbed network, correct symbols dispatched per asset_class
- [ ] Goldtraders parser: against a saved HTML fixture (no live HTTP in tests)

## Decisions surfaced (required)
- <MTS-GOLD 99.9% vs goldtraders 96.5% purity factor and where it lives in code>
- <Single shared `Holding.symbol` for both PF holdings, or distinct?>
- <Yahoo rate-limit strategy / outage behavior>
- <Trigger vs server-action for PortfolioDaily invalidation>
- <Recharts limitations and workarounds>

## Open questions for Phase 4 kickoff (required)
- <Question 1>
- <Question 2>

## Screenshots (required)
- `/portfolio` dashboard (desktop)
- `/portfolio` dashboard (mobile)
- Per-holding detail with price chart + tx markers
- A short asciinema or screenshot of `pnpm test:portfolio` output showing
  the cost-basis suite passing
```

---

## Phase 4 — Analytics, Importer, Tax, Retirement, Polish

```markdown
## Summary (required)
<1–2 sentences: e.g., "Backfill 2+ years of history via the two-stage xlsx
importer; ship analytics, tax planner, retirement projection, dark mode,
passkey enrollment, and final mobile polish.">

## Migrations (required)
- `db/migrations/000X_budget_line_tax_override.sql` — adds
  `BudgetLine.tax_treatment_override`
- `db/migrations/000X_user_settings.sql` — adds `User.theme`,
  `UserSettings.retirement` jsonb
- `db/migrations/000X_webauthn.sql` — Auth.js WebAuthn-adapter tables
- <any others>

## Importer (required)
- [ ] `lib/import/xlsx-parser.ts` uses `exceljs` or `@e965/xlsx` (named here)
- [ ] All 22 historical sheet-name styles resolve to (year, month) correctly
- [ ] Column-shift quirk handled (blank category → plan in C, actual in E)
- [ ] Topic carry-forward implemented
- [ ] Income row detected via the `Income` shared-string label
- [ ] Default Transaction.date = last day of inferred month
- [ ] CategoryAlias auto-suggest in Stage 2 mapping UI
- [ ] Commit step is single-transaction; rollback on any failure
- [ ] Re-import idempotency: identical commit produces no duplicates
- [ ] Fixture xlsx in `lib/import/__fixtures__/sample.xlsx` (sanitized — no
      real user data)

## Analytics (required)
- [ ] `/analytics` — 12-month spend trend (stacked bar), category drill-down,
      Plan-vs-Actual variance, monthly contribution vs market gain stacked bar
- [ ] Benchmark overlay on `/portfolio` net-worth chart vs QQQM
- [ ] Date-range picker (1M / 3M / YTD / 1Y / All / Custom) shared across charts
- [ ] All conversions to display_currency use trade-day FX (not today's rate)

## Tax planner (required)
- [ ] `/tax` page with editable assessable income
- [ ] Buckets: PF own, RMF, SSF, donations (general & 2x), SSO
- [ ] Combined ฿500k cap warning across PF + RMF + SSF + others
- [ ] Per-bucket "see contributing transactions" expander
- [ ] Tax math lives in `lib/tax/buckets.ts` (data-driven predicates)
- [ ] Effective tax_treatment resolution: BudgetLine override →
      Category default → NONE

## Retirement (required)
- [ ] `/retirement` rebuilds the broken COMPOUND sheet with correct math
- [ ] Inputs auto-fill from PortfolioDaily and last-6-months Investment topic
- [ ] Balance-by-age line chart with optional "+20% saving" overlay
- [ ] Single-stat cards: runs-out-at-age, FIRE number, shortfall vs FIRE
- [ ] All math in `lib/retirement/projection.ts` — pure function, fully tested

## WebAuthn (required)
- [ ] `/settings/security` — enroll passkey, list credentials, remove
- [ ] Login flow prompts passkey first, magic-link fallback
- [ ] Magic-link rate-limited to 1/hour after 3 sends in a window
- [ ] Removing the last passkey reverts to magic-link only (no lockout)

## Theme + i18n (required)
- [ ] Light / Dark / System toggle in user menu, persisted to `User.theme`
- [ ] Locale toggle (Thai / English) without full reload
- [ ] CI check or test that fails on hard-coded JSX strings outside `t()`

## Mobile polish (required)
- [ ] Every page audited at 375×667; no horizontal scroll except per-holding
      price chart
- [ ] Month detail collapses topic groups into accordions on mobile
- [ ] All actions reachable without zoom

## Tests (required)
- [ ] Importer fixture-based: parse → exact ImportStaging rows; commit →
      exact BudgetLine + Transaction rows
- [ ] Importer column-shift quirk
- [ ] Tax: every cap and overlap rule, including the combined ฿500k case
- [ ] Retirement: edge cases (already retired, runs out at retirement age,
      infinite balance with high return)
- [ ] WebAuthn enrollment happy path (mocked credential)
- [ ] i18n string-coverage lint passes

## Decisions surfaced (required)
- <xlsx library chosen and rough server bundle size impact>
- <Importer fixture rows that surprised you and the workaround>
- <WebAuthn library + browser-compat caveats>
- <Thai tax-cap interpretations where the law has gray areas, with sources>
- <COMPOUND-sheet behaviors intentionally NOT carried over>

## Backlog (required — accumulated dropped items)
- <Monte Carlo retirement>
- <Receipt photo attach>
- <Bank/brokerage auto-sync>
- <Multi-user / shared budgets>
- <PWA install / native shell>
- <Anything else deferred>

## Screenshots (required)
- `/analytics` desktop
- `/tax` desktop with sample year populated
- `/retirement` desktop with sample inputs
- Mobile screenshots: month detail accordion, `/portfolio`, `/analytics`
- Short screen recording / animated gif of the import flow end-to-end
- Test coverage report (paste the summary line, e.g.,
  `Statements: 87.3% (2114/2421)`)
```

---

## Cross-cutting checks (append to every phase PR)

```markdown
## Cross-cutting checks (required, all phases)

### Schema discipline
- [ ] Every new migration is checked in; no migrations were edited after
      being applied to any environment
- [ ] `pnpm drizzle-kit check` shows no drift

### Money & FX
- [ ] No `Number` arithmetic on monetary values in any new code
- [ ] All money columns are `numeric(18,4)` and carry an explicit currency
- [ ] Any new conversion path uses the trade-date FX rate, not today's

### Type safety
- [ ] No new `any` without a comment justifying it
- [ ] All new server actions and API routes validate input with Zod
- [ ] No data is sent to the client that includes secrets, full email
      addresses of other users, or any base-currency materialization that
      should have been done client-side

### Accessibility
- [ ] Every new form control has a label
- [ ] No new color-only signal (e.g., red text without an icon or "−" prefix)
- [ ] Keyboard navigation works for every new interactive element
- [ ] Tested with VoiceOver or NVDA on at least one screen this phase added

### Performance
- [ ] No N+1 queries on any page added this phase (run with
      `DEBUG_QUERY_LOG=1` and paste the count if non-trivial)
- [ ] No request-path call to an external API (Yahoo / goldtraders) — all
      external calls happen in crons or rate-limited user-initiated actions
- [ ] First contentful paint on the heaviest new page < 2s on a throttled
      Fast 3G profile

### Security
- [ ] No env var added without `README.md` documentation
- [ ] No new public route reachable without `middleware.ts` auth check
- [ ] All cron routes verify `Authorization: Bearer ${CRON_SECRET}`
- [ ] No new dependency with > 5 MB unpacked size without a "why" in the
      decisions section

### CI
- [ ] CI passes on this branch
- [ ] No new test marked `.skip` or `.only`
- [ ] Test runtime < 60s (otherwise call it out)
```
