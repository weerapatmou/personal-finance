// TradingView's symbol-search endpoint. Used by their public web UI; returns
// rich JSON with description, exchange, currency, type, and ISIN/CUSIP.
//
// Coverage is broader and rate limits much higher than Yahoo's. The endpoint
// is unauthenticated but requires browser-like Origin/Referer headers — it
// returns 403 to plain `curl` calls.
//
// Endpoint:
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=...&hl=1
//     &exchange=&lang=en&search_type=undefined&domain=production&sort_by_country=US

const URL_BASE = "https://symbol-search.tradingview.com/symbol_search/v3/";
const TIMEOUT_MS = 8000;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  Origin: "https://www.tradingview.com",
  Referer: "https://www.tradingview.com/",
} as const;

export type TradingViewResult = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  type: string; // "stock" | "fund" | etc.
};

// In-memory cache. Same rationale as the old Yahoo cache — typing letter
// by letter shouldn't burst the upstream once for every keystroke.
const CACHE = new Map<string, { at: number; results: TradingViewResult[] }>();
const TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

/** Strip the `<em>...</em>` highlight markup TradingView wraps matches in. */
function stripEm(s: string | undefined): string {
  return (s ?? "").replace(/<\/?em>/g, "");
}

export async function searchSymbols(query: string): Promise<TradingViewResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hit = CACHE.get(q);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.results;

  type Raw = {
    symbols?: Array<{
      symbol?: string;
      description?: string;
      exchange?: string;
      currency_code?: string;
      type?: string;
      typespecs?: string[];
      country?: string;
    }>;
  };

  const url =
    `${URL_BASE}?text=${encodeURIComponent(q)}` +
    `&hl=1&exchange=&lang=en&search_type=undefined&domain=production&sort_by_country=US`;

  let data: Raw | null = null;
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    data = (await res.json()) as Raw;
  } catch {
    return [];
  }

  const symbols = data?.symbols ?? [];
  const mapped: TradingViewResult[] = symbols
    // Stocks, ETFs, and mutual funds. Skip indices/futures/crypto/economic.
    .filter((s) => s.type === "stock" || s.type === "fund")
    .map((s) => ({
      symbol: stripEm(s.symbol),
      name: stripEm(s.description),
      exchange: s.exchange ?? "",
      currency: s.currency_code ?? "USD",
      type: s.type === "fund" ? "ETF" : "EQUITY",
    }))
    .filter((r) => r.symbol && r.name);

  // Dedupe by symbol: TradingView returns the same ticker once per exchange
  // it's listed on (NASDAQ, BMV, BIVA, etc). Keep only the first — the API
  // already sorts US listings to the front via sort_by_country=US.
  const seen = new Set<string>();
  const results: TradingViewResult[] = [];
  for (const r of mapped) {
    const key = r.symbol.toLowerCase().replace(/\.us$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(r);
    if (results.length >= 8) break;
  }

  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest) CACHE.delete(oldest);
  }
  CACHE.set(q, { at: Date.now(), results });
  return results;
}
