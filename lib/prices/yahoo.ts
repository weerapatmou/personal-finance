// Wrapper around yahoo-finance2 with a stable interface for the rest of the app.
// All Yahoo calls go through these functions so:
//   1. tests can mock them by stubbing this module,
//   2. rate-limit / retry concerns are centralized,
//   3. caller code never knows Yahoo's quirky symbol conventions.

// yahoo-finance2 has strict overloads keyed off schema validation that don't
// always match our call sites. Treat the imported binding as a permissive
// shape at this single boundary; downstream code consumes our typed return.
import yahooFinanceTyped from "yahoo-finance2";
const yahooFinance = yahooFinanceTyped as any;

export type DailyBar = {
  date: string; // ISO yyyy-mm-dd
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
};

export type Spot = {
  price: number;
  asOf: string;
  currency: string;
};

/** Maps an internal symbol to Yahoo's ticker. */
export function toYahooSymbol(symbol: string): string {
  // FX pairs: USD/THB → "THB=X"
  if (symbol === "USDTHB") return "THB=X";
  if (symbol === "BTC") return "BTC-USD";
  // Stocks/ETFs use the bare ticker on Yahoo.
  return symbol;
}

export async function fetchHistorical(
  symbol: string,
  fromDate: string,
  toDate: string,
): Promise<DailyBar[]> {
  const yahoo = toYahooSymbol(symbol);
  // Yahoo's `chart` is the modern endpoint; `historical` is deprecated.
  const result = await yahooFinance.chart(yahoo, {
    period1: fromDate,
    period2: toDate,
    interval: "1d",
  });

  type RawQuote = {
    date: Date | string;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
  };
  const quotes: RawQuote[] = result?.quotes ?? [];
  return quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      date: (q.date instanceof Date ? q.date : new Date(q.date)).toISOString().slice(0, 10),
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      close: q.close as number,
    }));
}

export async function fetchSpot(symbol: string): Promise<Spot | null> {
  const yahoo = toYahooSymbol(symbol);
  try {
    const q = await yahooFinance.quote(yahoo);
    if (!q) return null;
    const price = (q.regularMarketPrice ?? q.bid ?? null) as number | null;
    if (price === null) return null;
    return {
      price,
      asOf: (q.regularMarketTime ?? new Date()).toString(),
      currency: q.currency ?? "USD",
    };
  } catch {
    return null;
  }
}
