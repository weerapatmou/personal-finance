// Last-Observation-Carry-Forward helpers. Used both for price lookups
// (PriceCache) and FX lookups (FxRate) when the requested date doesn't
// have a row.

export type DateKeyed<T> = T & { date: string };

/**
 * Returns the most recent row whose date <= `targetDate`, or null if none.
 * `rows` may be in any order; this function sorts internally.
 */
export function locf<T extends { date: string }>(
  rows: T[],
  targetDate: string,
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.date > targetDate) continue;
    if (best === null || r.date > best.date) best = r;
  }
  return best;
}

export function ageDays(rowDate: string, asOf: string): number {
  const a = Date.parse(rowDate + "T00:00:00Z");
  const b = Date.parse(asOf + "T00:00:00Z");
  return Math.floor((b - a) / 86_400_000);
}
