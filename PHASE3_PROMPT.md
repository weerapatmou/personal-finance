# Phase 3 — User Prompt (paste into Claude Code)

> Prerequisite: Phases 1 and 2 are merged. The expense ledger works end-to-end;
> users can record planned and actual transactions per month.

---

Build **Phase 3: Portfolio**. This is where the app starts paying for itself —
historical net worth, cost-basis-correct P&L, and the daily price/FX cache
that makes both possible.

**Read `SPEC.md` §2.5, §2.6, §3, §4, §5 before writing code.** The cost-basis
rules in §4 are non-negotiable; encode them as pure functions and unit-test
each one. The `PortfolioDaily` invalidation rule in §5.2 is critical — get it
wrong and the dashboard silently lies.

The deliverable is one PR.

## Hard requirements

### A. Holdings & investment transactions CRUD

1. **`/portfolio/holdings`** lists every `Holding` for the user, grouped by
   `asset_class`. Per-row columns: name, symbol, units (derived), avg cost
   (derived, in native currency), current price, current value (in
   `display_currency`), unrealized P&L (in `display_currency`), %-return.

   "Derived" = computed by replaying `InvestmentTx` via the
   `lib/cost-basis.ts` module from Phase 1. Do not add `units` or `avg_cost`
   columns to `Holding`.

2. **`/portfolio/holdings/new`** creates a Holding. Required fields:
   `account_id`, `asset_class`, `symbol`, `name`, `native_currency`,
   `unit_type`, `quote_source`. Validate `symbol` against the chosen
   `quote_source`:
   - `YAHOO`: try a Yahoo Finance lookup before saving; reject if it returns
     no quote
   - `GOLDTRADERS_TH`: only `MTS-GOLD-9999` is valid for now
   - `MANUAL_NAV`: any string, but warn if it conflicts with an existing
     holding's symbol
   - `NONE`: cash holdings; no symbol required

3. **`/portfolio/holdings/[id]`** detail page:
   - Top: name, symbol, asset_class, account, current snapshot (units,
     avg_cost native, current price native, current value base, unrealized
     P&L base)
   - Middle: a price chart (Recharts `LineChart`) of the last 1 year of
     `PriceCache.close` values, with vertical markers at each `InvestmentTx`
     (BUY = green up-arrow, SELL = red down-arrow, DIVIDEND = gold dot)
   - Bottom: full `InvestmentTx` history, newest first, editable

4. **`/portfolio/transactions`** is the firehose: every `InvestmentTx` across
   all holdings, filterable by date range, type, holding. Same row-level
   editing as the per-holding view.

5. **`InvestmentTx` create/edit form** must support every type from SPEC §4:
   `BUY`, `SELL`, `DIVIDEND`, `FEE`, `SPLIT`, `TRANSFER_IN`, `TRANSFER_OUT`.
   Form fields adapt to the type (e.g., `SPLIT` shows `split_ratio` only;
   `DIVIDEND` shows `amount_native` and a "DRIP?" toggle).

   **Cost-basis preview**: as the user fills in BUY/SELL fields, show a live
   preview of `(new_units, new_avg_cost)` after the transaction would apply,
   computed by `replay()` over (existing txs ∪ this draft). Read-only,
   for confidence.

6. **`CurrencyConvert` form** at `/portfolio/fx-convert`:
   - Fields: `account_id`, `date`, `from_currency`, `from_amount`,
     `to_currency`, `to_amount`, `fees_native`, `note`
   - Computes `effective_rate = to_amount / from_amount` and stores it
   - Optional follow-on: a checkbox "Use this conversion to fund a buy" that,
     when checked, takes the user straight to the BUY form with
     `currency_convert_id` pre-linked

### B. Provident Fund: own/match split

7. **Two `Holding` rows** for the PF account, both pointing at the same
   `account_id` and the same `symbol` (e.g., `ACN-PF-NAV`). Names:
   - `Accenture PF — Own Contribution`
   - `Accenture PF — Employer Match`

   Keep them as two separate Holdings throughout, with their own
   `InvestmentTx` rows. The dashboard renders them as a single combined
   "Accenture PF" line with a tooltip-revealed split.

8. **NAV entry form** at `/portfolio/holdings/[id]/nav` (only shown for
   holdings with `quote_source='MANUAL_NAV'`):
   - One input per month: NAV value, units (or use existing units if
     unchanged), effective date
   - Submitting upserts a `PriceCache` row for the holding's symbol on
     that date with `source='MANUAL_NAV'`
   - The page is the same for both PF holdings — they share NAV by symbol

### C. Price ingestion

9. **Yahoo Finance integration** via `yahoo-finance2` (already in
   `package.json` from Phase 1; if not, install). Wrap it in
   `lib/prices/yahoo.ts`:

   ```
   fetchHistorical(symbol, fromDate, toDate, quoteCurrency): PriceCacheRow[]
   fetchSpot(symbol): { price, asOf, currency } | null
   ```

   Symbols mapped:
   - Stocks/ETFs: `QQQM`, `IYW`, `IHE`, `IVV`, `ACN`, `HUYA` → use as-is
   - Crypto: `BTC-USD` → Yahoo's `BTC-USD`
   - FX: `USDTHB` → Yahoo's `THB=X` (for `FxRate` rows where
     `base='USD' AND quote='THB'`)

   Cache every fetched daily bar in `PriceCache` keyed by
   `(symbol, date)`. Never call Yahoo from a request handler; only crons or
   user-initiated refresh actions hit it.

10. **goldtraders.or.th scraper** in `lib/prices/goldtraders.ts`:
    - Daily fetch of the spot price for "ทองคำแท่ง 96.5%" (gold bar 96.5% —
      this is the standard sold by MTS-GOLD)
    - Note: MTS-GOLD 99.9% is slightly different from goldtraders' 96.5% bar.
      Apply the standard purity ratio (`99.9 / 96.5 = 1.0352`) when storing
      under `MTS-GOLD-9999`. Document this in a comment.
    - Cache in `PriceCache(symbol='MTS-GOLD-9999', quote_currency='THB')`
    - On HTTP failure or parse failure, log and exit cleanly — do not throw.
      The next day's cron retries. Mark the holding `is_stale` if no price
      for >7 days.

11. **Daily price cron** at `app/api/cron/prices/route.ts`, schedule
    `15 17 * * *` UTC (00:15 ICT):
    - For every non-archived `Holding`:
      - Determine the price-fetch range:
        `[max(holding.first_tx_date, last_cached_date+1), yesterday_in_quote_tz]`
      - Cap the range at 1 year of backfill per cron run (multi-year backfills
        spread across nights to keep within Yahoo's unofficial rate budget)
      - Dispatch to the right adapter (Yahoo / goldtraders / manual = skip)
    - Also fetch FX: `USDTHB` Yahoo, write to `FxRate(base='USD',
      quote='THB')`
    - Return `{ holdings_processed, prices_inserted, fx_inserted, errors[] }`

12. **Manual refresh button** on `/portfolio` calls a server action that
    triggers the same cron logic for a single holding (with rate-limiting:
    max 4 manual refreshes per holding per hour).

### D. PortfolioDaily — the source of truth for charts

13. **Daily PortfolioDaily cron** at `app/api/cron/portfolio-daily/route.ts`,
    schedule `30 17 * * *` UTC (00:30 ICT, after the price cron):
    - For each `(user, holding)` pair, find the dirty range:
      - Initial run: `[holding.first_tx_date, yesterday]`
      - Subsequent runs: any `(date, holding_id)` where the
        `PortfolioDaily.computed_at` is older than the latest mutation in
        `InvestmentTx OR PriceCache OR FxRate` affecting that row
    - For each date in the range, compute (per SPEC §5.1):
      ```
      units_held    = replay(InvestmentTx[holding_id], up_to=date).units
      price_native  = PriceCache(symbol, ≤date) close, with LOCF
      fx_to_base    = FxRate(price_currency→user.base_currency, ≤date) LOCF
      value_base    = units_held * price_native * fx_to_base
      is_stale      = price_age > stale_threshold(asset_class)
      ```
    - UPSERT on `(user_id, date, holding_id)`

14. **Invalidation triggers** — when any `InvestmentTx` row is created /
    updated / deleted, mark every `PortfolioDaily(holding_id, date >= tx.date)`
    as dirty. Implement as a Postgres trigger if comfortable; otherwise as
    explicit logic in the server actions that mutate `InvestmentTx`. Do
    **not** rely on the user remembering to refresh.

15. The cron must be **idempotent and incremental**. Re-running it on the
    same day must not duplicate work or change correct rows. Test this.

### E. /portfolio dashboard

16. **`/portfolio` page** showing:

    - **Top KPI strip**: Total net worth (in display_currency), today's change
      (Δ vs yesterday's PortfolioDaily total, % and absolute), MTD change,
      YTD change.

    - **Allocation donut**: 6 wedges (Stock / Gold / Crypto / PF / Cash /
      Emergency). Each wedge labeled with %. Tooltip shows native value
      + base value. Use `Σ value_base` over the latest `PortfolioDaily`
      rows per asset_class.

    - **Net worth time series** (line chart): default range 1Y, toggles for
      3M / 1Y / 5Y / All. Data: `Σ value_base GROUP BY date` from
      `PortfolioDaily`. One line for total; allow toggling per-asset-class
      lines on/off.

    - **Per-holding table**: Holding name, account, units, avg cost (native),
      current price (native), value (base), unrealized P&L (base, %),
      contribution to total return (%). Sortable.

    - **Stale data banner**: if any holding has `is_stale=true`, show a banner
      naming them with a "Refresh now" link.

### F. Tests

17. Vitest tests required:
    - `replay()` cost-basis: every rule in SPEC §4 (already partly covered
      in Phase 1; extend to include `CurrencyConvert` linkage)
    - `PortfolioDaily` re-computation: mutating an old `InvestmentTx`
      correctly invalidates and rewrites all later rows
    - LOCF behavior: a holding with a Saturday `tx.date` correctly uses
      Friday's price for that day's PortfolioDaily row
    - Yahoo adapter: stub the network; assert correct symbols for
      stock/ETF/crypto/FX
    - Goldtraders parser: against a saved HTML fixture, assert the extracted
      price; don't hit the live site in tests
    - PortfolioDaily cron idempotency: run twice, second run inserts zero
      rows

## What this PR does NOT include

- No analytics page (Phase 4)
- No retirement projection (Phase 4)
- No xlsx importer (Phase 4)
- No tax planner (Phase 4)
- No WebAuthn (Phase 4)
- No benchmark overlay on the net-worth chart (Phase 4)

## Decisions to surface in the PR description

1. How you handled the MTS-GOLD 99.9% vs goldtraders 96.5% purity gap.
   Confirm the conversion factor and where it's documented in code.
2. What you chose for `Holding.symbol` of the PF holdings (single shared
   symbol vs distinct per-holding).
3. Yahoo rate-limiting strategy and what happens on prolonged outage.
4. Trigger vs server-action approach for `PortfolioDaily` invalidation.
5. Any chart that hit Recharts limitations and required a workaround.

Branch: `phase-3-portfolio`. Open PR with screenshots of the dashboard at
desktop and mobile breakpoints, plus a screenshot of the per-holding detail
page showing the price chart with transaction markers.

Begin.
