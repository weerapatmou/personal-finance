import Decimal from "decimal.js";

// Configure Decimal.js once at module load. 28 significant digits is more than
// enough for any THB/USD figure we'll see; ROUND_HALF_EVEN is the IEEE banker's
// rounding rule, which avoids systematic upward bias on .5 values.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export type Currency = "THB" | "USD";

export type Money = {
  amount: Decimal;
  currency: Currency;
};

export type FxRow = {
  date: string; // ISO yyyy-mm-dd
  base: Currency;
  quote: Currency;
  rate: string | number | Decimal;
};

export class UnknownCurrencyError extends Error {}
export class MissingFxRateError extends Error {}

const KNOWN: Currency[] = ["THB", "USD"];

function assertKnown(c: string): asserts c is Currency {
  if (!KNOWN.includes(c as Currency)) {
    throw new UnknownCurrencyError(`Unknown currency: ${c}`);
  }
}

export function money(amount: Decimal.Value, currency: Currency): Money {
  assertKnown(currency);
  return { amount: new Decimal(amount), currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} + ${b.currency} without conversion`);
  }
  return { amount: a.amount.plus(b.amount), currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot subtract ${a.currency} - ${b.currency} without conversion`);
  }
  return { amount: a.amount.minus(b.amount), currency: a.currency };
}

export function multiply(a: Money, factor: Decimal.Value): Money {
  return { amount: a.amount.times(factor), currency: a.currency };
}

/**
 * Convert `m` to `to` using `fxRows` for the given trade date.
 *
 * Applies Last-Observation-Carry-Forward: if no row exists for `atDate` exactly,
 * walks back to the most recent prior date with a row. Throws
 * `MissingFxRateError` when no prior row exists.
 *
 * fxRows is passed in (not queried) so this function stays pure and trivially
 * unit-testable.
 */
export function convert(m: Money, to: Currency, atDate: string, fxRows: FxRow[]): Money {
  assertKnown(to);
  if (m.currency === to) return m;

  const candidates = fxRows
    .filter((r) => r.base === m.currency && r.quote === to && r.date <= atDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Try inverse lookup if direct unavailable.
  let rate: Decimal | null = null;
  if (candidates.length > 0) {
    rate = new Decimal(candidates[0]!.rate);
  } else {
    const inverses = fxRows
      .filter((r) => r.base === to && r.quote === m.currency && r.date <= atDate)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (inverses.length > 0) rate = new Decimal(1).dividedBy(new Decimal(inverses[0]!.rate));
  }

  if (rate === null) {
    throw new MissingFxRateError(
      `No FX rate found for ${m.currency}->${to} on or before ${atDate}`,
    );
  }

  return { amount: m.amount.times(rate), currency: to };
}

const FORMATTERS: Record<string, Intl.NumberFormat> = {};

export function format(m: Money, locale: string = "th-TH"): string {
  const key = `${locale}::${m.currency}`;
  const fmt =
    FORMATTERS[key] ??
    (FORMATTERS[key] = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: m.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }));
  return fmt.format(m.amount.toNumber());
}

export function eq(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount.equals(b.amount);
}
