// Stooq.com CSV endpoint. Free, no API key, no aggressive rate limiting —
// the right primary source for spot prices when Yahoo is throttling us.
//
// CSV format:
//   Symbol,Date,Time,Open,High,Low,Close,Volume
//   QQQM.US,2026-04-29,22:00:19,271.165,272.43,270.35,272.39,2600282
//
// Symbol conventions:
//   US stocks/ETFs: append ".US"  → AAPL → AAPL.US
//   Gold spot:      "XAUUSD"
//   FX pair:        e.g. "USDTHB"

const STOOQ_URL = "https://stooq.com/q/l/";
const TIMEOUT_MS = 8000;
const HEADERS = { "User-Agent": "finance-app/1.0 (+personal)" } as const;

export type StooqSpot = {
  price: number;
  asOf: Date;
};

async function csvFetch(symbol: string): Promise<StooqSpot | null> {
  try {
    const url = `${STOOQ_URL}?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    // Stooq returns "N/D" for unknown symbols
    if (lines[1]!.includes("N/D")) return null;
    const cols = lines[1]!.split(",");
    // [Symbol, Date, Time, Open, High, Low, Close, Volume]
    const date = cols[1];
    const time = cols[2];
    const close = Number(cols[6]);
    if (!Number.isFinite(close) || close <= 0) return null;
    const asOf = date && time ? new Date(`${date}T${time}Z`) : new Date();
    return { price: close, asOf };
  } catch {
    return null;
  }
}

/**
 * Fetch spot price for a US stock/ETF. The wizard stores symbols without
 * any suffix (e.g. "QQQM"); we append ".US" for the Stooq query.
 */
export async function fetchStockSpot(symbol: string): Promise<StooqSpot | null> {
  if (!symbol) return null;
  // If the caller already supplied a Stooq-style suffix, trust it.
  const stooqSym = symbol.includes(".") ? symbol : `${symbol}.US`;
  return csvFetch(stooqSym);
}

/** Fetch international gold spot (XAU/USD per troy oz). */
export async function fetchGoldSpotUsd(): Promise<StooqSpot | null> {
  return csvFetch("XAUUSD");
}
