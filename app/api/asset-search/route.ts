import { auth } from "@/lib/auth";
import { searchSymbols } from "@/lib/prices/tradingview";
import { searchCoins } from "@/lib/prices/coingecko";

// Unified search proxy. The wizard's autocomplete hits this single endpoint
// and routes by category — keeps the client agnostic of the upstream API.
//
// Auth-gated so random callers can't drain quota for us.

export type AssetSearchHit =
  | {
      kind: "stock";
      symbol: string; // ticker (e.g. "AAPL"), already stripped of any markup
      name: string;
      exchange: string;
      currency: string;
      type: string; // EQUITY | ETF
    }
  | {
      kind: "crypto";
      symbol: string; // CoinGecko id (e.g. "bitcoin")
      name: string;
      ticker: string; // ticker like "btc" — for display only
      thumb: string | null;
    };

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "";
  if (q.length < 1) return Response.json([]);

  if (category === "stock") {
    const results = await searchSymbols(q);
    const hits: AssetSearchHit[] = results.map((r) => ({
      kind: "stock",
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange,
      currency: r.currency,
      type: r.type,
    }));
    return Response.json(hits);
  }

  if (category === "crypto") {
    const coins = await searchCoins(q);
    const hits: AssetSearchHit[] = coins.map((c) => ({
      kind: "crypto",
      symbol: c.id,
      name: c.name,
      ticker: c.symbol,
      thumb: c.thumb,
    }));
    return Response.json(hits);
  }

  return Response.json([], { status: 400 });
}
