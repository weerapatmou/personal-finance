// Yahoo Finance wrapper for stock/ETF search and spot prices.
//
// We call Yahoo's public endpoints directly via fetch instead of using
// `yahoo-finance2`. The library performs an upfront "crumb" cookie handshake
// against the Yahoo consent page that's flaky in serverless environments
// (returns 401 ~50% of the time, silently). The endpoints below don't need
// a crumb — they're the same ones Yahoo's own web UI calls.
//
//   v1/finance/search       — symbol search, public, no crumb
//   v8/finance/chart/{sym}  — current price + meta, public, no crumb

const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const TIMEOUT_MS = 8000;

// Yahoo blocks default fetch user-agents; pretend to be a browser.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
} as const;

export type YahooSearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  type: string; // EQUITY, ETF, MUTUALFUND, INDEX, etc.
};

export type YahooSpot = {
  price: number;
  currency: string;
  asOf: Date;
};

/** Distinguishes "Yahoo said no" from "transport failed" so callers can react. */
export class YahooRateLimitError extends Error {
  constructor() {
    super("Yahoo Finance rate limit hit — wait a few minutes and try again.");
    this.name = "YahooRateLimitError";
  }
}

async function jsonFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) throw new YahooRateLimitError();
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof YahooRateLimitError) throw e;
    return null;
  }
}

// In-memory search cache. Most user-facing search hits Yahoo 4-8x in a burst
// as they type letter-by-letter — this collapses repeats. Per-instance only;
// in serverless that's still useful because typing happens within one session.
const SEARCH_CACHE = new Map<string, { at: number; results: YahooSearchResult[] }>();
const SEARCH_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MAX = 200;

/**
 * Search Yahoo Finance by free-text query. Filters to equities, ETFs, and
 * mutual funds — indices/futures/currencies create noise in the autocomplete.
 */
export async function searchSymbols(query: string): Promise<YahooSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Cache hit?
  const hit = SEARCH_CACHE.get(q);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.results;

  type Raw = {
    quotes?: Array<{
      symbol?: string;
      shortname?: string;
      longname?: string;
      exchange?: string;
      exchDisp?: string;
      currency?: string;
      quoteType?: string;
    }>;
  };

  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`;
  const data = await jsonFetch<Raw>(url);
  if (!data?.quotes) return [];

  const results = data.quotes
    .filter((r) => r.symbol && (r.shortname || r.longname))
    .filter(
      (r) =>
        r.quoteType === "EQUITY" ||
        r.quoteType === "ETF" ||
        r.quoteType === "MUTUALFUND",
    )
    .slice(0, 8)
    .map((r) => ({
      symbol: r.symbol as string,
      name: (r.shortname ?? r.longname ?? r.symbol) as string,
      exchange: (r.exchDisp ?? r.exchange ?? "") as string,
      currency: (r.currency ?? "USD") as string,
      type: (r.quoteType ?? "EQUITY") as string,
    }));

  // Cache + simple cap (FIFO eviction — fine for our volume).
  if (SEARCH_CACHE.size >= SEARCH_CACHE_MAX) {
    const oldest = SEARCH_CACHE.keys().next().value;
    if (oldest) SEARCH_CACHE.delete(oldest);
  }
  SEARCH_CACHE.set(q, { at: Date.now(), results });
  return results;
}

/**
 * Fetch current spot price via the chart endpoint's `meta` block.
 * Returns null on any failure so callers degrade gracefully.
 */
export async function fetchSpot(symbol: string): Promise<YahooSpot | null> {
  if (!symbol) return null;

  type Raw = {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          chartPreviousClose?: number;
          previousClose?: number;
          currency?: string;
          regularMarketTime?: number;
        };
      }>;
      error?: unknown;
    };
  };

  const url = `${CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const data = await jsonFetch<Raw>(url);
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price =
    meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose ?? null;
  if (price == null || !Number.isFinite(price)) return null;

  const asOf =
    typeof meta.regularMarketTime === "number"
      ? new Date(meta.regularMarketTime * 1000)
      : new Date();

  return { price, currency: meta.currency ?? "USD", asOf };
}

/** USD/THB rate via Yahoo's THB=X FX symbol. */
export async function fetchUsdThbRate(): Promise<number | null> {
  const spot = await fetchSpot("THB=X");
  return spot?.price ?? null;
}
