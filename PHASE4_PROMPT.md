# Phase 4 — User Prompt (paste into Claude Code)

> Prerequisite: Phases 1, 2, and 3 are merged. The expense ledger and portfolio
> dashboards are functional. The user has been entering data manually since
> Phase 2; now we backfill 2+ years of history from the legacy xlsx and ship
> the analytics that justify the project.

---

Build **Phase 4: Analytics, Importer, Tax Planner, Retirement, Polish.** This
is the final scheduled phase. Anything not shipped here gets deprioritized
into a backlog.

**Read `SPEC.md` §6, §7, §8, §9 before writing code.** The two-stage importer
in §7 is the longest-running risk in the project — do it carefully, with
fixtures and tests, not vibes.

The deliverable is one PR.

## Hard requirements

### A. xlsx / CSV importer (the big one)

1. **`/settings/import`** lets the user upload an `.xlsx` file (the legacy
   `Personal Finance.xlsx`). Server accepts up to 50 MB, validates the file
   is a real xlsx (zip with `xl/workbook.xml`), creates an `ImportRun` row,
   then runs **Stage 1** (parse → staging) inline and redirects to the
   mapping page.

2. **Stage 1 parser** in `lib/import/xlsx-parser.ts`. Implement exactly as
   specified in SPEC §7.1:
   - Skip non-month sheets: `Investment Summary`, `Plan Personal Finance`,
     `COMPOUND`, `Template Finance Detail`
   - Resolve sheet name → `(year, month)` via the regex/decision tree
     covering all 22 historical naming styles in SPEC §7.1
   - For 2-digit-year sheets (`Mar 26`), interpret yy as `2000+yy` only when
     yy ∈ [20..40]
   - For each topic group, carry topic forward
   - Handle the column-shift quirk: when a row's category cell is blank, the
     plan amount is in column C (not D) and actual is in column E
   - Inherit category from the most recent same-topic row that had one
     explicit
   - Read formula cells via the cached `<v>` element; if missing, write
     `parse_warnings: ['NO_CACHED_VALUE']` and skip
   - Detect Income row by scanning for the "Income" shared-string label;
     write to staging as a special row with `raw_topic='_INCOME_'`
   - Default `Transaction.date` to the last day of the inferred month
   - Apply the `CategoryAlias` typo map (e.g., `Neslte → Nestle`)

3. **Stage 1 must use** `exceljs` or `@e965/xlsx` — do not write your own
   xlsx parser. The verification work that produced this spec used a custom
   parser as a one-shot; production import deserves a maintained library.

4. **Stage 2 — mapping UI** at `/settings/import/[run_id]`:

   ```
   Header:    Apr 27 2026 — import of "Personal Finance.xlsx"
              ImportRun status: STAGED  (412 rows, 18 unique items unmapped)
   ----------------------------------------------------------------
   Filter: [ All | Unmapped | Ambiguous | Mapped | Skipped ]
   ----------------------------------------------------------------
   raw_topic    raw_category       raw_item_name             →  mapped to
   ----------------------------------------------------------------
   Fix Cost     Transportation     ค่าผ่อนรถยนต์            →  [select]
   Fix Cost     Living             ค่าโทรศัพท์              →  [auto: Phone]
   Variable     Food               ค่าอาหาร Neslte         →  [auto: Nestle Food]
   ...
   ```

   Each row has a category dropdown (filtered by topic) and an item-name
   input prefilled from `CategoryAlias` matches. Save mapping → updates
   `ImportStaging.mapped_*` AND inserts/updates a `CategoryAlias` row so
   future imports auto-suggest.

5. **Commit button** on the mapping UI (enabled only when every row is
   `MAPPED` or `SKIPPED`):
   - Wrap in a single Postgres transaction
   - For each `MAPPED` row: upsert `BudgetLine(year, month, category_id,
     item_name_th, planned_amount=raw_plan)`
   - For each row with non-zero `raw_actual`: insert
     `Transaction(date=last-of-month, category_id, budget_line_id,
     amount=raw_actual, currency='THB', type='EXPENSE',
     note='imported from {sheet_name}')`
   - For each `_INCOME_` staging row: upsert `MonthlyIncome(year, month,
     amount=raw_actual)`
   - Update `ImportRun.status='COMMITTED'`, write summary
   - On any error: roll back, set `ImportRun.status='FAILED'` with the error;
     do NOT leave the database half-imported

6. **Importer tests** with real fixtures:
   - Commit a sanitized fixture xlsx to `lib/import/__fixtures__/sample.xlsx`
     containing one Fix Cost row, one Variable row with the column-shift
     quirk, one Investment row, one Tax row, plus the Income cell. Use
     made-up category names to avoid leaking the user's real finances into
     test fixtures.
   - Test: parse fixture → assert exact `ImportStaging` rows produced
   - Test: mapping commit → assert exact `BudgetLine` and `Transaction` rows
   - Test: re-running the same import after partial commit doesn't duplicate
     (idempotency)
   - Test: column-shift quirk — a row with blank category gets plan from
     column C, not D

### B. Analytics page

7. **`/analytics`** with these charts (Recharts):

   - **12-month spend trend** (stacked bar, x = month, stack = topic) —
     uses summed `Transaction.amount` per (month, topic), converted to
     display_currency at each transaction's date

   - **Category drill-down** (treemap or bar): top 15 categories by total
     actual spend in selected window (default last 90 days)

   - **Plan vs Actual variance** (diverging bar, x = category, y = variance
     as %): shows over/underspend per category for the selected month range

   - **Monthly contribution vs market gain** (stacked bar):
     - x = month
     - "Contribution" stack = `Σ InvestmentTx of type BUY units * price_native
       * fx_to_base@tx.date` (in display_currency)
     - "Market gain" stack = (`PortfolioDaily.value_base @ month_end`) −
       (`PortfolioDaily.value_base @ prev_month_end`) − contribution
     - Negative market gain renders below the axis
     - This is the answer to "did my balance grow because I added money or
       because the market moved?" — the chart the user actually cares about

   - **Benchmark overlay**: on the net-worth chart from `/portfolio`, allow
     overlaying `% return since selected start date` of the user's
     portfolio vs `% return of QQQM` (or any benchmark symbol the user
     enters). Use `PriceCache(QQQM)` for the benchmark series.

8. **All charts share a date-range picker** at the top of the page:
   `1M | 3M | YTD | 1Y | All | Custom`. Default `1Y`.

### C. Tax planner

9. **Per-BudgetLine tax_treatment override.** Add a column
   `BudgetLine.tax_treatment_override tax_treatment_enum NULL` in a new
   migration. Effective `tax_treatment` resolution:
   1. `BudgetLine.tax_treatment_override` if set
   2. else `Category.tax_treatment`
   3. else `NONE`

   Surface this on the BudgetLine edit form as "Tax treatment" with options
   matching the enum.

10. **`/tax`** page showing for the selected tax year:
    - Editable `Assessable Income` field (defaults to `Σ MonthlyIncome` for
      the year)
    - Per-bucket totals and caps:
      - **PF (own contribution)**: `Σ Transaction WHERE
        effective_tax_treatment='PF_CONTRIB'`. Cap: `min(15% * income,
        ฿500,000 combined cap)`. Show used / cap / headroom.
      - **RMF**: `Σ Transaction WHERE effective_tax_treatment='PIT_DEDUCT'
        AND category.name_th LIKE '%RMF%'`. Cap: `min(30% * income,
        ฿500,000 combined cap)`.
      - **SSF**: similar; cap `min(30% * income, ฿200,000)`.
      - **General donations**: cap `10%` of (assessable - other deductions);
        flag x2 deductions for education/sports if user adds metadata
      - **Social Security (SSO)**: cap `฿9,000` (฿750/month)
    - Combined `RMF + SSF + PF + others` cap warning: ฿500,000 total
    - Each row has a "see contributing transactions" expander

    Make the matching logic data-driven: a `lib/tax/buckets.ts` file with
    explicit predicates, not hard-coded SQL. Future tax rule changes should
    require editing that file, not the page.

### D. Retirement projection

11. **`/retirement`** rebuilds the broken `COMPOUND` sheet correctly. Inputs
    (default values come from `User` columns; persist them via a new
    `UserSettings.retirement` jsonb column added in a migration):
    - Current age (years)
    - Retirement age
    - Current net worth (auto-fills from latest `PortfolioDaily`, editable)
    - Monthly savings (auto-fills from last 6 months' `Σ Investment topic
      actual`, editable)
    - Expected real return %, default 5%
    - Expected inflation %, default 3%
    - Target monthly expense in retirement (in today's THB)
    - "Years of expense increase pre-retirement" — user can specify
      end-of-career step-ups

12. **Outputs**:
    - **Balance-by-age line chart** (current age → 100), real-THB Y-axis.
      One line for "current path" (saving rate held), optionally one for
      "saving +20%" overlay.
    - **Single-stat cards**: "money runs out at age N" (or "never" if
      perpetual), "FIRE number" (`target_monthly * 12 * 25`), "shortfall vs
      FIRE at retirement age"
    - All math in `lib/retirement/projection.ts` — pure function, fully
      unit-tested. No `Math.random()`, no Monte Carlo for now (note in the
      PR description that MC is a possible v2 enhancement).

### E. WebAuthn / passkey

13. **Add passkey enrollment** at `/settings/security`:
    - Button "Add passkey on this device" — runs WebAuthn registration
      ceremony via `@simplewebauthn/server` and `@simplewebauthn/browser`
    - Stores credentials in a new `WebAuthnCredential` table (created by
      Auth.js's WebAuthn adapter)
    - Shows enrolled credentials with last-used timestamp and a remove
      button

14. **Authentication flow**:
    - On `/login`, if the email is the allowlisted one, prompt for passkey
      first; fall back to magic-link if the user clicks "Email me a link"
    - After 3 magic-link sends in 1 hour, throttle to 1 per hour (rate-limit
      via the `BackupExport`-style insert pattern, or with `upstash/ratelimit`
      if convenient)
    - All this is per the SPEC §9 plan

### F. Dark mode + i18n polish

15. **Theme toggle** in the user menu — Light / Dark / System. Persist to
    `User.theme` (add column in migration). Honor `prefers-color-scheme`
    when "System".

16. **Locale toggle** in the user menu — Thai / English. Persist to
    `User.locale`. Re-render the page; do not full-reload.

17. **Audit every page** for hard-coded strings — they all need to go through
    next-intl. CI lint rule (or a quick grep test) that fails if any
    `app/**/*.tsx` contains a non-trivial string literal in JSX text content
    not wrapped by `t()`.

### G. Mobile polish

18. Pass over every page on a 375×667 viewport. Acceptance bar:
    - No horizontal scroll except in the per-holding price chart (which is
      acceptable to scroll horizontally)
    - All actions (edit, delete, add tx, refresh) reachable without zoom
    - The month detail page collapses topic groups into accordions on
      mobile, expanded by default

### H. Tests

19. Add tests:
    - Importer fixture-based tests (item A.6)
    - Tax bucket math: every cap and overlap rule, with at least one case
      that hits the combined ฿500k cap exactly
    - Retirement projection: edge cases (already retired, runs out at
      exactly retirement age, infinite balance with high return)
    - WebAuthn enrollment happy path (mock the credential)
    - i18n string-coverage lint test passes on the merged branch

## What this PR does NOT include

- Monte Carlo retirement (note as backlog)
- Bank/brokerage auto-sync (out of scope per original design)
- Multi-user / shared budgets (out of scope per original design)
- Receipt photo attach (was on the original wishlist; defer unless trivial)
- Mobile native app (web-first; PWA install prompt is fine but no Capacitor)

## Decisions to surface in the PR description

1. xlsx parser library chosen and why; size of the parser bundle on the
   server.
2. Any importer fixture rows that didn't behave as expected and the
   workaround.
3. WebAuthn library and any browser-compat caveats.
4. Tax cap interpretations where Thai law has gray areas — cite the source
   you used; don't invent.
5. Anything in the original `COMPOUND` sheet you couldn't reproduce because
   of underlying logic gaps (the `#REF!` errors are why we're rebuilding,
   but call out anything intentional that we're choosing not to carry over).

Branch: `phase-4-analytics-and-polish`. Open PR with:
- Screenshots of `/analytics`, `/tax`, `/retirement` on desktop
- A short screen recording (or animated gif) of the import flow end-to-end
- Mobile screenshots of the month detail accordion
- Test coverage report

Begin.
