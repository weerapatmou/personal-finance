// Yahoo Finance wrapper — symbol SEARCH only.
//
// We used to also fetch spot prices and FX rates here, but Yahoo's
// query1/query2 endpoints aggressively rate-limit our IP after even
// modest use. Spot prices now come from Stooq (lib/prices/stooq.ts) and
// FX rates from open.er-api.com (lib/prices/erapi.ts) — both no-key,
// no-crumb, and dramatically more tolerant. Yahoo's value to us now is
// just the rich symbol-search index.

const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";
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

