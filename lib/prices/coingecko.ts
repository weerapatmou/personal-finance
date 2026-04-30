// CoinGecko free public API. No auth needed for low-volume personal use
// (limit ~30 req/min). Symbols stored in the DB are CoinGecko IDs (e.g.
// "bitcoin", "ethereum") — these are the canonical identifiers their API
// uses everywhere, not market tickers like "BTC".

const BASE = "https://api.coingecko.com/api/v3";
const TIMEOUT_MS = 8000;

export type CoinSearchResult = {
  id: string; // CoinGecko canonical id, e.g. "bitcoin"
  symbol: string; // ticker symbol, e.g. "btc"
  name: string; // human name, e.g. "Bitcoin"
  thumb: string | null;
  marketCapRank: number | null;
};

export type CoinSpot = {
  priceUsd: number;
  asOf: Date;
};

async function jsonFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "finance-app/1.0 (+personal)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function searchCoins(query: string): Promise<CoinSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  type Raw = {
    coins: Array<{
      id: string;
      symbol: string;
      name: string;
      thumb?: string;
      market_cap_rank?: number | null;
    }>;
  };
  const data = await jsonFetch<Raw>(`${BASE}/search?query=${encodeURIComponent(q)}`);
  if (!data) return [];
  return data.coins.slice(0, 8).map((c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    thumb: c.thumb ?? null,
    marketCapRank: c.market_cap_rank ?? null,
  }));
}

/**
 * Fetch current USD spot price for a CoinGecko id. CoinGecko returns prices
 * in any vs_currency; we fix to USD because that's the canonical reference
 * for the dashboard.
 */
export async function fetchSpot(id: string): Promise<CoinSpot | null> {
  if (!id) return null;
  type Raw = Record<string, { usd?: number; last_updated_at?: number }>;
  const data = await jsonFetch<Raw>(
    `${BASE}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true`,
  );
  if (!data) return null;
  const entry = data[id];
  if (!entry || typeof entry.usd !== "number") return null;
  const asOf =
    typeof entry.last_updated_at === "number"
      ? new Date(entry.last_updated_at * 1000)
      : new Date();
  return { priceUsd: entry.usd, asOf };
}
