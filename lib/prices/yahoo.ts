// Yahoo Finance wrapper for stock/ETF search and spot prices.
// All Yahoo calls go through this module so tests can stub it and rate-limit
// concerns stay centralized.

// yahoo-finance2's strict overloads don't always match our call sites; treat
// the import as permissive at this single boundary — return types are typed.
import yahooFinanceTyped from "yahoo-finance2";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = yahooFinanceTyped as any;

export type YahooSearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  type: string; // EQUITY, ETF, INDEX, etc.
};

export type YahooSpot = {
  price: number;
  currency: string;
  asOf: Date;
};

/**
 * Search Yahoo Finance by free-text query. Filters to equities & ETFs only —
 * indices and other quote types create noise in the autocomplete.
 */
export async function searchSymbols(query: string): Promise<YahooSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const result = await yahooFinance.search(query, {
      newsCount: 0,
      quotesCount: 12,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = result?.quotes ?? [];
    return quotes
      .filter((q) => q.symbol && (q.shortname || q.longname))
      .filter((q) => q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "MUTUALFUND")
      .slice(0, 8)
      .map((q) => ({
        symbol: q.symbol as string,
        name: (q.shortname ?? q.longname ?? q.symbol) as string,
        exchange: (q.exchange ?? "") as string,
        currency: (q.currency ?? "USD") as string,
        type: (q.quoteType ?? "EQUITY") as string,
      }));
  } catch {
    return [];
  }
}

/**
 * Fetch current spot price for a Yahoo symbol. Returns null on any error so
 * callers can degrade gracefully (e.g. show "—" in the dashboard).
 */
export async function fetchSpot(symbol: string): Promise<YahooSpot | null> {
  if (!symbol) return null;
  try {
    const q = await yahooFinance.quote(symbol);
    if (!q) return null;
    const price = (q.regularMarketPrice ?? q.bid ?? null) as number | null;
    if (price === null) return null;
    const asOfRaw = q.regularMarketTime;
    const asOf =
      asOfRaw instanceof Date
        ? asOfRaw
        : typeof asOfRaw === "number"
          ? new Date(asOfRaw * 1000)
          : new Date();
    return { price, currency: (q.currency ?? "USD") as string, asOf };
  } catch {
    return null;
  }
}

/**
 * Fetch the USD/THB rate via Yahoo's FX symbol THB=X.
 * Returns null on failure.
 */
export async function fetchUsdThbRate(): Promise<number | null> {
  const spot = await fetchSpot("THB=X");
  return spot?.price ?? null;
}
