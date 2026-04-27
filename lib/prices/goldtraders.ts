// Scraper for goldtraders.or.th. The site publishes Thai gold-bar spot prices
// (96.5% purity, baht-weight) on its homepage as a small HTML table.
//
// MTS-GOLD 99.9% is slightly different — the standard purity conversion is
// 99.9 / 96.5 ≈ 1.0352. This module fetches the 96.5% bar price and applies
// the conversion before returning, so callers store a single canonical value
// per day.

const PURITY_FACTOR_996_TO_999 = 99.9 / 96.5; // ≈ 1.03523316

export type GoldPrice = {
  date: string; // ISO yyyy-mm-dd
  bahtWeight999PriceTHB: number;
  source: string;
};

export class GoldtradersFetchError extends Error {}

const GOLDTRADERS_URL = "https://www.goldtraders.or.th/";

/**
 * Fetch today's MTS-GOLD-99.9% spot price from goldtraders.or.th.
 *
 * Returns `null` on transient HTTP failures so callers can keep yesterday's
 * price (per SPEC §5.3 stale-data semantics) without throwing the cron route.
 */
export async function fetchTodayGold(): Promise<GoldPrice | null> {
  let html: string;
  try {
    const res = await fetch(GOLDTRADERS_URL, {
      headers: { "User-Agent": "finance-app/1.0 (+personal use)" },
      // 8s timeout; never hold the cron hostage.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const sellPrice = parseSell965BarPrice(html);
  if (sellPrice == null) return null;

  return {
    date: new Date().toISOString().slice(0, 10),
    bahtWeight999PriceTHB: Math.round(sellPrice * PURITY_FACTOR_996_TO_999 * 100) / 100,
    source: "goldtraders.or.th",
  };
}

/**
 * Extracts the 96.5% gold-bar SELL price (per baht weight) from the
 * goldtraders.or.th homepage HTML. Exported so the parser can be unit-tested
 * against a saved fixture without hitting the live site.
 */
export function parseSell965BarPrice(html: string): number | null {
  // The page has a row that, when stripped of HTML, contains
  // "ทองคำแท่ง 96.5%" followed by buy/sell prices.
  // Strategy: find that label, advance past the "96.5%" tail, then pull the
  // next two numeric tokens (buy then sell). The "96.5" inside the label is
  // skipped so it doesn't get counted as a price.
  const labelMatch = html.match(/ทองคำแท่ง[^<]*?96\.5\s*%?/);
  if (!labelMatch || labelMatch.index === undefined) return null;

  const start = labelMatch.index + labelMatch[0].length;
  const after = html.slice(start);

  // Match numbers that look like gold prices: ≥ 4 digits or comma-grouped.
  // This excludes the leftover "96.5" if it bled past the label and any
  // small integers in surrounding markup.
  const numbers = [
    ...after.matchAll(
      /([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{4,}(?:\.[0-9]+)?)/g,
    ),
  ];
  if (numbers.length < 2) return null;

  // Conventional layout: [buy, sell] in the next two cells.
  const sellRaw = numbers[1]![1]!.replace(/,/g, "");
  const sell = Number(sellRaw);
  if (!Number.isFinite(sell) || sell <= 0) return null;
  return sell;
}
