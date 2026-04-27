# Phase 2 — User Prompt (paste into Claude Code)

> Prerequisite: Phase 1 PR is merged. The schema, auth, money utilities, and
> CI are all in place. `CLAUDE.md` and `SPEC.md` are the canonical references.

---

Build **Phase 2: Expense Tracking** for the Personal Finance Tracker. This is
the part of the app the user will interact with daily — the monthly ledger
that replaces their per-month Excel sheets.

**Read `SPEC.md` §2.2, §2.3, §2.4, §3 before writing code.** If anything you
remember from Phase 1 contradicts SPEC.md, SPEC.md wins.

The deliverable is one PR.

## Hard requirements

### A. Months index

1. **`/months` page** lists every month that has any data
   (`BudgetLine` OR `Transaction` OR `MonthlyIncome`), newest first. Each row
   is a card with:
   - Month label (e.g., "Apr 2026")
   - Income amount (in `display_currency`, converted from THB if needed)
   - Total planned cost
   - Total actual cost
   - Net = Income − Actual (color: green if positive, red if negative)
   - A "View" link to `/months/[yyyy-mm]`

2. **"New month" action** at the top: a button that opens a dialog with
   - Year/month picker (defaults to next-month-after-latest)
   - "Copy plan from {prev-month}" toggle, default ON
   - "Apply recurring rules" toggle, default ON
   - Submit → POST `/api/months` (server action) which creates the
     `BudgetLine` rows for the new month per the toggles, then redirects to
     `/months/[yyyy-mm]`.

   Idempotent: if the month already exists, return 409 and link to it.

### B. Month detail page

3. **`/months/[yyyy-mm]`** is the daily-driver view. The layout mirrors the
   workbook so the user's mental model carries over. Top-level structure:

   ```
   Header:    [Apr 2026]   Income: ฿XX,XXX  ✏️   |   Net: ฿X,XXX
   ----------------------------------------------------------------
   FIX COST                                       Plan        Actual
     Transportation
       ค่าผ่อนรถยนต์                              5,000        5,000
       ค่าประกัน + ซ่อมรถยนต์                     1,500        1,500
     Living
       ค่าโทรศัพท์                                  430          427
       ...
     Subtotal — Fix Cost                          13,185      13,182
   ----------------------------------------------------------------
   VARIABLE COST  ...                            (similar)
   INVESTMENT     ...
   TAX            ...
   ----------------------------------------------------------------
   TOTAL COST                                    63,722      69,582
   NET                                                       11,043
   ```

   Per-row controls (icon-only on desktop, swipe-actions on mobile):
   - ✏️ edit BudgetLine (plan amount, item name)
   - ➕ add a Transaction against this BudgetLine
   - 🗑 delete BudgetLine (warns if it has linked Transactions)

4. **Plan vs Actual cell rules:**
   - "Plan" = `BudgetLine.planned_amount`, in `display_currency`
   - "Actual" = `Σ Transaction.amount` for that month + category +
     `budget_line_id`, plus any uncategorized-but-same-category transactions
     (show those as a separate "Uncategorized" row at the bottom of each topic)
   - Highlight any row where `actual > plan * (1 + over_budget_threshold)` —
     threshold defaults to 10%, configurable in `/settings` (default for now is
     fine; expose the env var `OVER_BUDGET_THRESHOLD_PCT` and read it)
   - Subtotals are computed in the page, not a database view — Postgres can
     sum at query time and the dataset is small.

5. **Income** (`MonthlyIncome` row) is editable inline at the top of the page.
   No category breakdown — single number, single currency (default THB).

### C. CRUD

6. **Server actions** in `app/months/actions.ts`:

   ```
   createBudgetLine(input)       upsertMonthlyIncome(input)
   updateBudgetLine(id, input)   createMonth(input)
   deleteBudgetLine(id)          copyPlanFromPreviousMonth(year, month)
   createTransaction(input)
   updateTransaction(id, input)
   deleteTransaction(id)
   ```

   Every input validated with Zod. Money fields parsed with `decimal.js`.
   No JS-float arithmetic anywhere.

7. **No `INCOME` transaction type.** `MonthlyIncome` is a separate table per
   SPEC §2.2. If a code reviewer asks why income isn't a Transaction with
   `type='INCOME'`, point them to SPEC §2.2.

### D. Recurring rules

8. **`RecurringRule` CRUD** at `/settings/recurring`:
   - Form to create a rule with: scope (`BUDGET_LINE` or `TRANSACTION`),
     RRULE string (with a friendly builder UI: "Every month on the 1st",
     "Every Monday", custom RRULE), start_date, end_date (optional),
     `template_json` (the BudgetLine or Transaction shape to clone)
   - List view with active/paused toggle, last fired timestamp, next-fire
     preview (compute next 3 occurrences)
   - Use the `rrule` library installed in Phase 1 — do not write your own
     recurrence math.

9. **Recurring cron** at `app/api/cron/recurring/route.ts`:
   - Runs daily at 00:05 ICT (`5 17 * * *` UTC)
   - For each active rule, compute occurrences in
     `(last_fired_at, now]` using `rrule.between()`
   - For each occurrence:
     - If scope = `BUDGET_LINE`: upsert a `BudgetLine` for the occurrence's
       month, source the fields from `template_json`. Skip if a BudgetLine for
       the same `(year, month, category_id, item_name_th)` already exists.
     - If scope = `TRANSACTION`: insert a `Transaction` with `date = occurrence`,
       fields from `template_json`. Idempotent via a `recurring_rule_id +
       date` unique constraint — add this constraint in a new migration.
   - Update `last_fired_at`
   - Return JSON `{ rules_processed, transactions_created, budget_lines_created }`

   Auth: `Authorization: Bearer ${CRON_SECRET}`.

   Add the migration adding the unique index on `(recurring_rule_id, date)`
   to `Transaction`. Drizzle migrations are append-only — never edit a prior
   one.

### E. Backup body

10. **Fill in the backup route stubbed in Phase 1.**
    `app/api/cron/backup/route.ts`:
    - Spawn `pg_dump --format=custom $DATABASE_URL` (use `node:child_process`
      or stream `pg_dump`'s stdout directly)
    - Stream the output to S3 via `@aws-sdk/client-s3` `Upload` (multipart);
      key = `backups/${userId}/${ISO-date}.dump`
    - Update the `BackupExport` row with `status='OK'`, `byte_size`, `location_uri`
    - On error, set `status='FAILED'` with `error` set to the truncated stderr
    - Retention: after a successful upload, list objects in the prefix and
      delete any older than 30 days
    - Vercel deploy needs `pg_dump` available at runtime — use the
      `@neondatabase/serverless`-compatible binary or vendor it via a
      Vercel build hook. Document the deployment quirk in `README.md`.

### F. Mobile

11. The transaction-add form must be usable on a phone — full-screen modal,
    big tap targets, keyboard `inputMode="decimal"` for amounts, currency
    selector defaults to the holding/account currency. Test on a 375×667
    viewport before declaring done.

### G. i18n

12. Wire `next-intl` for `en` and `th`. Locale comes from
    `User.locale`. All user-facing strings (labels, button text, toasts,
    validation errors) go through the i18n layer.
    `Category.name_th` / `name_en` are read directly based on locale.

13. Format numbers and dates per locale: `Intl.NumberFormat('th-TH')` for THB,
    `Intl.NumberFormat('en-US')` for USD. Use Buddhist Era for Thai dates only
    if the user opts in (`User.use_buddhist_era` — add this column in a new
    migration; default `false`).

### H. Tests

14. Vitest tests required (no skipped tests; if you can't write one, say why
    in the PR description):
    - `copyPlanFromPreviousMonth` — happy path, missing previous month error,
      idempotency on repeat call (no duplicate BudgetLines)
    - Plan-vs-Actual aggregation — multiple transactions across multiple
      categories, with one transaction at month boundary at exactly 23:59 ICT
      (must bucket into the correct month)
    - Recurring cron — RRULE `FREQ=MONTHLY;BYMONTHDAY=1` fires correctly when
      cron runs after a long gap (last_fired = 60 days ago → 2 BudgetLines)
    - The `recurring_rule_id + date` unique constraint blocks duplicates

## What this PR does NOT include

- No portfolio / holdings UI (Phase 3)
- No analytics, retirement, or import (Phase 4)
- No tax-deduction overrides per BudgetLine (Phase 4)
- No WebAuthn / passkey (Phase 4)
- No dark mode toggle UI (Phase 4) — but ensure shadcn's dark CSS variables are
  not removed; the app should respect `prefers-color-scheme` already

## Decisions to surface in the PR description

1. RRULE-builder UX choices and any rules you couldn't express in the simple
   builder (escape hatch to raw RRULE string is fine).
2. How `Transaction.date` interacts with timezone — confirm everything is
   stored as `date` (no time component) and bucketed to ICT month boundaries.
3. `pg_dump` deployment approach (vendored binary vs Neon-compatible vs
   self-hosted runner).
4. Anything in the workbook layout you couldn't faithfully reproduce.

Branch: `phase-2-expense-tracking`. Conventional-commit messages, logical
grouping, no squash. Open PR with screenshots of the month detail page on
desktop and mobile.

Begin.
