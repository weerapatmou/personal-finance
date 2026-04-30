// Shared price-refresh logic used by both the cron route and the user-
// triggered "Refresh prices" server action. Iterates the given symbols,
// fetches each from the appropriate upstream, and upserts asset_prices.
// FX rates are refreshed in the same pass.

import { db } from "@/db";
import { assetHoldings, assetPrices, currencyRates } from "@/db/schema";
import { fetchStockSpot } from "@/lib/prices/stooq";
import { fetchSpot as coingeckoSpot } from "@/lib/prices/coingecko";
import { fetchTodayGold } from "@/lib/prices/goldtraders";
import { fetchFxRate } from "@/lib/prices/erapi";
import { eq } from "drizzle-orm";
import type { AssetQuoteSource } from "@/db/schema";

export type RefreshSummary = {
  pricesUpdated: number;
  fxUpdated: number;
  errors: string[];
};

type SymbolJob = { symbol: string; source: AssetQuoteSource };

/**
 * Fetches latest spot for each provided symbol/source pair and the USD/THB FX
 * rate. Errors per symbol are collected, not thrown — partial success is the
 * normal case (e.g. one bad ticker shouldn't fail the whole refresh).
 */
export async function refreshPricesForSymbols(jobs: SymbolJob[]): Promise<RefreshSummary> {
  const summary: RefreshSummary = { pricesUpdated: 0, fxUpdated: 0, errors: [] };

  // Dedupe — multiple holdings can share a symbol/source.
  const seen = new Set<string>();
  const dedup = jobs.filter((j) => {
    const k = `${j.source}::${j.symbol}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  for (const { symbol, source } of dedup) {
    try {
      let price: number | null = null;
      let currency = "USD";
      if (source === "YAHOO") {
        // Symbols stored as bare Yahoo tickers (e.g. "QQQM"); Stooq wants
        // ".US" suffix — fetchStockSpot handles that mapping.
        const s = await fetchStockSpot(symbol);
        if (s) {
          price = s.price;
          // Stooq US data is always USD-quoted.
          currency = "USD";
        }
      } else if (source === "COINGECKO") {
        const s = await coingeckoSpot(symbol);
        if (s) {
          price = s.priceUsd;
          currency = "USD";
        }
      } else if (source === "GOLDTRADERS_TH") {
        const g = await fetchTodayGold();
        if (g) {
          price = g.bahtWeight999PriceTHB;
          currency = "THB";
        }
      }
      if (price === null) {
        summary.errors.push(`${source}:${symbol} — no price returned`);
        continue;
      }
      await db
        .insert(assetPrices)
        .values({ symbol, source, price: String(price), currency })
        .onConflictDoUpdate({
          target: [assetPrices.symbol, assetPrices.source],
          set: { price: String(price), currency, fetchedAt: new Date() },
        });
      summary.pricesUpdated++;
    } catch (err) {
      summary.errors.push(
        `${source}:${symbol} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Always refresh USD/THB — the dashboard needs it for every USD holding.
  try {
    const fx = await fetchFxRate("USD", "THB");
    if (fx) {
      await db
        .insert(currencyRates)
        .values({ base: "USD", quote: "THB", rate: String(fx.rate) })
        .onConflictDoUpdate({
          target: [currencyRates.base, currencyRates.quote],
          set: { rate: String(fx.rate), fetchedAt: new Date() },
        });
      summary.fxUpdated++;
    } else {
      summary.errors.push("USD/THB — no rate returned");
    }
  } catch (err) {
    summary.errors.push(`USD/THB — ${err instanceof Error ? err.message : String(err)}`);
  }

  return summary;
}

/**
 * Convenience: refresh every distinct (symbol, source) for a single user.
 * Used by the "Refresh prices" button on the dashboard.
 */
export async function refreshPricesForUser(userId: string): Promise<RefreshSummary> {
  const rows = await db
    .select({ symbol: assetHoldings.symbol, source: assetHoldings.quoteSource })
    .from(assetHoldings)
    .where(eq(assetHoldings.userId, userId));
  return refreshPricesForSymbols(rows);
}

/** Refresh every distinct (symbol, source) across all users — used by cron. */
export async function refreshPricesForAll(): Promise<RefreshSummary> {
  const rows = await db
    .select({ symbol: assetHoldings.symbol, source: assetHoldings.quoteSource })
    .from(assetHoldings);
  return refreshPricesForSymbols(rows);
}
