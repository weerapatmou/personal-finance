import Decimal from "decimal.js";
import { replay, type InvestmentTxInput } from "@/lib/cost-basis";
import { locf, ageDays } from "@/lib/portfolio/locf";
import type { AssetClass } from "@/lib/types";

/**
 * Compute one PortfolioDaily row per (holding, date) for the requested range.
 * The caller supplies all transactions, prices, and FX rates as plain
 * arrays — this function never touches a database.
 *
 * Per SPEC §5.1:
 *   units_held(D)   = replay(InvestmentTx, up_to=D).units
 *   price_native(D) = PriceCache(symbol, ≤D).close, with LOCF
 *   fx_to_base(D)   = FxRate(price_currency→base_currency, ≤D), with LOCF
 *   value_base(D)   = units_held * price_native * fx_to_base
 *   is_stale        = price_age > stale_threshold(asset_class)
 */
export type DailyComputation = {
  date: string;
  unitsHeld: Decimal;
  priceNative: Decimal;
  priceCurrency: string;
  fxToBase: Decimal;
  valueBase: Decimal;
  isStale: boolean;
};

export type DailyInput = {
  baseCurrency: string;
  holding: {
    id: string;
    assetClass: AssetClass;
    nativeCurrency: string;
    quoteCurrency: string;
  };
  txs: InvestmentTxInput[];
  prices: Array<{ date: string; close: string | number }>;
  fxRates: Array<{ date: string; base: string; quote: string; rate: string | number }>;
  dateRange: string[]; // ISO yyyy-mm-dd, sorted ascending
};

/** Threshold (days) beyond which a price is considered stale. SPEC §5.1. */
function staleThreshold(assetClass: AssetClass): number {
  switch (assetClass) {
    case "STOCK":
    case "ETF":
    case "CRYPTO":
      return 3;
    case "GOLD":
      return 7;
    case "FUND":
    case "PF":
      return 35;
    default:
      return 30;
  }
}

export function computeDaily(input: DailyInput): DailyComputation[] {
  const out: DailyComputation[] = [];
  const sortedTxs = [...input.txs].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  // For efficiency, recompute units only when a tx falls in the range.
  // Naïve replay per date is fine at the dataset size we expect; revisit
  // if cron exceeds the function-timeout budget.
  for (const date of input.dateRange) {
    const eligibleTxs = sortedTxs.filter((t) => t.date <= date);
    const unitsHeld = replay(eligibleTxs).units;

    const priceRow = locf(input.prices, date);
    const priceNative = priceRow ? new Decimal(priceRow.close) : new Decimal(0);

    let fx = new Decimal(1);
    if (input.holding.quoteCurrency !== input.baseCurrency) {
      const fxRow = locf(
        input.fxRates.filter(
          (r) => r.base === input.holding.quoteCurrency && r.quote === input.baseCurrency,
        ),
        date,
      );
      if (fxRow) fx = new Decimal(fxRow.rate);
      else {
        // Try inverse direction.
        const inv = locf(
          input.fxRates.filter(
            (r) => r.base === input.baseCurrency && r.quote === input.holding.quoteCurrency,
          ),
          date,
        );
        if (inv) fx = new Decimal(1).dividedBy(new Decimal(inv.rate));
      }
    }

    const valueBase = unitsHeld.times(priceNative).times(fx);
    const isStale = priceRow
      ? ageDays(priceRow.date, date) > staleThreshold(input.holding.assetClass)
      : true;

    out.push({
      date,
      unitsHeld,
      priceNative,
      priceCurrency: input.holding.quoteCurrency,
      fxToBase: fx,
      valueBase,
      isStale,
    });
  }
  return out;
}
