// Pure helper for converting a holding's current value into USD and THB.
// No DB or network — caller passes in price + FX rows. Keeps the function
// trivially unit-testable.

import Decimal from "decimal.js";
import type { Currency } from "@/lib/money";

export type ValuePair = {
  usd: Decimal;
  thb: Decimal;
};

/**
 * Convert a `nativeAmount` in `nativeCurrency` to both USD and THB using the
 * given USD/THB rate (rate = how many THB per 1 USD).
 *
 * Rules:
 *   - If native is USD: thb = usd * rate
 *   - If native is THB: usd = thb / rate
 *   - usdThbRate must be > 0; if not (no FX yet), THB stays as 0 and USD as 0.
 */
export function convertToUsdThb(
  nativeAmount: Decimal.Value,
  nativeCurrency: Currency,
  usdThbRate: Decimal.Value | null,
): ValuePair {
  const amount = new Decimal(nativeAmount);
  const rate = usdThbRate == null ? null : new Decimal(usdThbRate);

  if (rate === null || rate.lessThanOrEqualTo(0)) {
    // Without an FX rate we can only safely report the native side; the other
    // side is unknown. Return the native amount as itself, the other as 0
    // so the dashboard at least shows something useful.
    if (nativeCurrency === "USD") return { usd: amount, thb: new Decimal(0) };
    return { usd: new Decimal(0), thb: amount };
  }

  if (nativeCurrency === "USD") {
    return { usd: amount, thb: amount.times(rate) };
  }
  return { usd: amount.dividedBy(rate), thb: amount };
}

/** Sum a series of ValuePairs into a single total. */
export function sumValues(values: ValuePair[]): ValuePair {
  return values.reduce<ValuePair>(
    (acc, v) => ({ usd: acc.usd.plus(v.usd), thb: acc.thb.plus(v.thb) }),
    { usd: new Decimal(0), thb: new Decimal(0) },
  );
}
