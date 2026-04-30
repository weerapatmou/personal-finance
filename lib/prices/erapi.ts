// open.er-api.com — free FX rates, no API key required.
// One request returns all rates for a base currency.
// Example: https://open.er-api.com/v6/latest/USD → { rates: { THB: 32.74, ... } }

const BASE = "https://open.er-api.com/v6/latest";
const TIMEOUT_MS = 8000;

export type FxResult = {
  rate: number;
  asOf: Date;
};

/**
 * Fetch the spot rate for `base → quote`. Returns null on any failure so
 * callers can fall back to a different source.
 */
export async function fetchFxRate(base: string, quote: string): Promise<FxResult | null> {
  if (!base || !quote || base === quote) return null;
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(base)}`, {
      headers: { "User-Agent": "finance-app/1.0 (+personal)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    type Raw = {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
    };
    const data = (await res.json()) as Raw;
    if (data.result !== "success") return null;
    const rate = data.rates?.[quote];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    const asOf =
      typeof data.time_last_update_unix === "number"
        ? new Date(data.time_last_update_unix * 1000)
        : new Date();
    return { rate, asOf };
  } catch {
    return null;
  }
}
