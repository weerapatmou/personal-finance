"use server";

import { db } from "@/db";
import {
  holdings,
  investmentTxs,
  currencyConverts,
  priceCache,
  portfolioDaily,
  fxRates,
} from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { fetchSpot } from "@/lib/prices/yahoo";
import { fetchTodayGold } from "@/lib/prices/goldtraders";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

const decimalString = z
  .string()
  .min(1)
  .regex(/^-?\d+(\.\d+)?$/, "Must be a numeric string");

// ─── Holdings CRUD ───────────────────────────────────────────────────────────

const holdingInput = z.object({
  accountId: z.string().uuid(),
  assetClass: z.enum(["STOCK", "ETF", "CRYPTO", "GOLD", "FUND", "CASH", "PF", "OTHER"]),
  symbol: z.string().max(64).optional().nullable(),
  name: z.string().min(1).max(200),
  nativeCurrency: z.enum(["THB", "USD"]),
  unitType: z
    .enum(["SHARES", "COINS", "BAHT_WEIGHT", "TROY_OZ", "THB", "USD"])
    .default("SHARES"),
  quoteSource: z.enum(["YAHOO", "GOLDTRADERS_TH", "MANUAL_NAV", "NONE"]).default("YAHOO"),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createHolding(input: unknown) {
  const userId = await requireUserId();
  const data = holdingInput.parse(input);
  const [row] = await db
    .insert(holdings)
    .values({
      userId,
      accountId: data.accountId,
      assetClass: data.assetClass,
      symbol: data.symbol ?? null,
      name: data.name,
      nativeCurrency: data.nativeCurrency,
      unitType: data.unitType,
      quoteSource: data.quoteSource,
      notes: data.notes ?? null,
    })
    .returning();
  revalidatePath("/portfolio");
  revalidatePath("/portfolio/holdings");
  return row;
}

// ─── InvestmentTx CRUD ───────────────────────────────────────────────────────

const txInput = z.object({
  holdingId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["BUY", "SELL", "DIVIDEND", "FEE", "SPLIT", "TRANSFER_IN", "TRANSFER_OUT"]),
  units: decimalString.optional().nullable(),
  priceNative: decimalString.optional().nullable(),
  feesNative: decimalString.default("0"),
  amountNative: decimalString.optional().nullable(),
  currencyConvertId: z.string().uuid().optional().nullable(),
  splitRatio: decimalString.optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export async function createInvestmentTx(input: unknown) {
  const userId = await requireUserId();
  const data = txInput.parse(input);

  // Verify holding belongs to user.
  const h = await db.query.holdings.findFirst({
    where: and(eq(holdings.id, data.holdingId), eq(holdings.userId, userId)),
  });
  if (!h) throw new Error("Holding not found");

  await db.insert(investmentTxs).values({
    userId,
    holdingId: data.holdingId,
    date: data.date,
    type: data.type,
    units: data.units ?? null,
    priceNative: data.priceNative ?? null,
    feesNative: data.feesNative,
    amountNative: data.amountNative ?? null,
    currencyConvertId: data.currencyConvertId ?? null,
    splitRatio: data.splitRatio ?? null,
    note: data.note ?? null,
  });

  // Invalidate downstream PortfolioDaily rows from this date forward.
  await db
    .delete(portfolioDaily)
    .where(
      and(
        eq(portfolioDaily.userId, userId),
        eq(portfolioDaily.holdingId, data.holdingId),
        gte(portfolioDaily.date, data.date),
      ),
    );

  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/holdings/${data.holdingId}`);
  revalidatePath("/portfolio/transactions");
}

export async function deleteInvestmentTx(id: string) {
  const userId = await requireUserId();
  const tx = await db.query.investmentTxs.findFirst({
    where: and(eq(investmentTxs.id, id), eq(investmentTxs.userId, userId)),
  });
  if (!tx) throw new Error("Tx not found");
  await db.delete(investmentTxs).where(eq(investmentTxs.id, id));
  await db
    .delete(portfolioDaily)
    .where(
      and(
        eq(portfolioDaily.userId, userId),
        eq(portfolioDaily.holdingId, tx.holdingId),
        gte(portfolioDaily.date, tx.date),
      ),
    );
  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/holdings/${tx.holdingId}`);
}

// ─── CurrencyConvert ─────────────────────────────────────────────────────────

const fxConvertInput = z.object({
  accountId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromCurrency: z.enum(["THB", "USD"]),
  fromAmount: decimalString,
  toCurrency: z.enum(["THB", "USD"]),
  toAmount: decimalString,
  feesNative: decimalString.default("0"),
  note: z.string().max(2000).optional().nullable(),
});

export async function createCurrencyConvert(input: unknown) {
  const userId = await requireUserId();
  const data = fxConvertInput.parse(input);
  const effectiveRate =
    Number(data.toAmount) / Math.max(Number(data.fromAmount), Number.EPSILON);

  const [row] = await db
    .insert(currencyConverts)
    .values({
      userId,
      accountId: data.accountId,
      date: data.date,
      fromCurrency: data.fromCurrency,
      fromAmount: data.fromAmount,
      toCurrency: data.toCurrency,
      toAmount: data.toAmount,
      effectiveRate: String(effectiveRate),
      feesNative: data.feesNative,
      note: data.note ?? null,
    })
    .returning();
  revalidatePath("/portfolio/transactions");
  return row;
}

// ─── Manual NAV upsert (Provident Fund etc.) ─────────────────────────────────

const navInput = z.object({
  symbol: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nav: decimalString,
});

export async function upsertManualNav(input: unknown) {
  await requireUserId();
  const data = navInput.parse(input);
  await db
    .insert(priceCache)
    .values({
      symbol: data.symbol,
      date: data.date,
      quoteCurrency: "THB",
      close: data.nav,
      source: "manual_nav",
    })
    .onConflictDoUpdate({
      target: [priceCache.symbol, priceCache.date],
      set: { close: data.nav, source: "manual_nav", fetchedAt: new Date() },
    });
  revalidatePath("/portfolio");
}

// ─── New flow: upsert quantity-tracked asset (Stock / Crypto / Gold) ─────────

const ASSET_CLASSES = [
  "STOCK",
  "ETF",
  "CRYPTO",
  "GOLD",
  "FUND",
  "CASH",
  "PF",
  "OTHER",
  "EMERGENCY_FUND",
] as const;

const upsertQuantityInput = z.object({
  accountId: z.string().uuid(),
  assetClass: z.enum(["STOCK", "ETF", "CRYPTO", "GOLD"]),
  symbol: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  units: decimalString,
  nativeCurrency: z.enum(["THB", "USD"]),
  unitType: z.enum(["SHARES", "COINS", "BAHT_WEIGHT", "TROY_OZ", "THB", "USD"]),
  quoteSource: z.enum(["YAHOO", "GOLDTRADERS_TH"]),
});

/**
 * Add `units` of a quantity-tracked asset. If the user already owns this
 * symbol+assetClass, append a BUY tx to the existing holding. Otherwise
 * create the holding first.
 *
 * Fetches the current spot price to use as cost basis for the BUY tx, and
 * caches that price in price_cache so the dashboard sees up-to-date numbers
 * without waiting for the cron.
 */
export async function upsertAssetByQuantity(input: unknown) {
  const userId = await requireUserId();
  const data = upsertQuantityInput.parse(input);

  // Fetch current price (for BUY tx cost basis + price_cache)
  let priceNative: string | null = null;
  if (data.quoteSource === "YAHOO") {
    const spot = await fetchSpot(data.symbol);
    if (spot) priceNative = String(spot.price);
  } else if (data.quoteSource === "GOLDTRADERS_TH") {
    const gold = await fetchTodayGold();
    if (gold) priceNative = String(gold.bahtWeight999PriceTHB);
  }

  // Find existing holding (same user, same symbol, same asset class)
  const existing = await db.query.holdings.findFirst({
    where: and(
      eq(holdings.userId, userId),
      eq(holdings.symbol, data.symbol),
      eq(holdings.assetClass, data.assetClass),
    ),
  });

  let holdingId: string;
  if (existing) {
    holdingId = existing.id;
  } else {
    const [row] = await db
      .insert(holdings)
      .values({
        userId,
        accountId: data.accountId,
        assetClass: data.assetClass,
        symbol: data.symbol,
        name: data.name,
        nativeCurrency: data.nativeCurrency,
        unitType: data.unitType,
        quoteSource: data.quoteSource,
      })
      .returning();
    holdingId = row!.id;
  }

  const today = new Date().toISOString().slice(0, 10);

  // Insert BUY tx
  await db.insert(investmentTxs).values({
    userId,
    holdingId,
    date: today,
    type: "BUY",
    units: data.units,
    priceNative: priceNative ?? "0",
    feesNative: "0",
  });

  // Cache the spot price so the portfolio renders without waiting for cron
  if (priceNative) {
    const quoteCurrency = data.quoteSource === "GOLDTRADERS_TH" ? "THB" : data.nativeCurrency;
    await db
      .insert(priceCache)
      .values({
        symbol: data.symbol,
        date: today,
        quoteCurrency,
        close: priceNative,
        source: data.quoteSource === "GOLDTRADERS_TH" ? "goldtraders.or.th" : "yahoo",
      })
      .onConflictDoUpdate({
        target: [priceCache.symbol, priceCache.date],
        set: { close: priceNative, fetchedAt: new Date() },
      });
  }

  // Invalidate portfolioDaily from today forward so values recompute
  await db
    .delete(portfolioDaily)
    .where(
      and(
        eq(portfolioDaily.userId, userId),
        eq(portfolioDaily.holdingId, holdingId),
        gte(portfolioDaily.date, today),
      ),
    );

  revalidatePath("/portfolio");
  revalidatePath("/portfolio/holdings");
  return { holdingId, priceNative };
}

// ─── Manual entries (PF / Cash / Emergency Fund) ──────────────────────────────

const manualEntryInput = z.object({
  accountId: z.string().uuid(),
  assetClass: z.enum(["PF", "CASH", "EMERGENCY_FUND"]),
  name: z.string().min(1).max(200),
  amount: decimalString,
  currency: z.enum(["THB", "USD"]),
});

/**
 * Create a manual entry. Stored as: holding (no symbol, quoteSource=NONE)
 * + a single BUY tx with units=amount, priceNative=1. The "balance" is
 * therefore replay(txs).units.
 */
export async function addManualEntry(input: unknown) {
  const userId = await requireUserId();
  const data = manualEntryInput.parse(input);

  const [row] = await db
    .insert(holdings)
    .values({
      userId,
      accountId: data.accountId,
      assetClass: data.assetClass,
      symbol: null,
      name: data.name,
      nativeCurrency: data.currency,
      unitType: data.currency,
      quoteSource: "NONE",
    })
    .returning();

  const today = new Date().toISOString().slice(0, 10);
  await db.insert(investmentTxs).values({
    userId,
    holdingId: row!.id,
    date: today,
    type: "BUY",
    units: data.amount,
    priceNative: "1",
    feesNative: "0",
  });

  revalidatePath("/portfolio");
  revalidatePath("/portfolio/holdings");
  return row;
}

const updateManualInput = z.object({
  holdingId: z.string().uuid(),
  name: z.string().min(1).max(200),
  amount: decimalString,
  currency: z.enum(["THB", "USD"]),
});

/**
 * Replace the manual entry's amount/name/currency. Implemented as: delete
 * all txs for the holding and insert a single fresh BUY at units=amount,
 * price=1. This keeps the "one tx represents the balance" invariant.
 */
export async function updateManualEntry(input: unknown) {
  const userId = await requireUserId();
  const data = updateManualInput.parse(input);

  const h = await db.query.holdings.findFirst({
    where: and(eq(holdings.id, data.holdingId), eq(holdings.userId, userId)),
  });
  if (!h) throw new Error("Holding not found");
  if (!["PF", "CASH", "EMERGENCY_FUND"].includes(h.assetClass)) {
    throw new Error("Only manual entries can be updated this way");
  }

  await db
    .update(holdings)
    .set({
      name: data.name,
      nativeCurrency: data.currency,
      unitType: data.currency,
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, data.holdingId));

  await db.delete(investmentTxs).where(eq(investmentTxs.holdingId, data.holdingId));
  await db.delete(portfolioDaily).where(eq(portfolioDaily.holdingId, data.holdingId));

  const today = new Date().toISOString().slice(0, 10);
  await db.insert(investmentTxs).values({
    userId,
    holdingId: data.holdingId,
    date: today,
    type: "BUY",
    units: data.amount,
    priceNative: "1",
    feesNative: "0",
  });

  revalidatePath("/portfolio");
  revalidatePath("/portfolio/holdings");
}

export async function deleteHolding(holdingId: string) {
  const userId = await requireUserId();
  const h = await db.query.holdings.findFirst({
    where: and(eq(holdings.id, holdingId), eq(holdings.userId, userId)),
  });
  if (!h) throw new Error("Holding not found");
  // Cascade deletes investment_txs and portfolio_daily rows
  await db.delete(holdings).where(eq(holdings.id, holdingId));
  revalidatePath("/portfolio");
  revalidatePath("/portfolio/holdings");
}

// ─── Refresh prices (user-triggered) ─────────────────────────────────────────

/**
 * On-demand price refresh. Fetches today's spot price for every YAHOO /
 * GOLDTRADERS holding the user owns and the USDTHB FX rate, upserts into
 * price_cache + fx_rates. Skipped for MANUAL_NAV / NONE quote sources.
 *
 * Note: this is the only place we hit external price APIs on the request
 * path, and it's user-initiated (button click), not automatic on render.
 */
export async function refreshPricesNow() {
  const userId = await requireUserId();
  const userHoldings = await db
    .select({
      id: holdings.id,
      symbol: holdings.symbol,
      nativeCurrency: holdings.nativeCurrency,
      quoteSource: holdings.quoteSource,
    })
    .from(holdings)
    .where(eq(holdings.userId, userId));

  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;
  const errors: string[] = [];

  // Dedupe by symbol — multiple holdings can share a symbol
  const yahooSymbols = new Set<string>();
  let needsGold = false;
  const symbolMeta = new Map<string, { currency: string }>();

  for (const h of userHoldings) {
    if (!h.symbol) continue;
    if (h.quoteSource === "YAHOO") {
      yahooSymbols.add(h.symbol);
      symbolMeta.set(h.symbol, { currency: h.nativeCurrency });
    } else if (h.quoteSource === "GOLDTRADERS_TH") {
      needsGold = true;
      symbolMeta.set(h.symbol, { currency: "THB" });
    }
  }

  // Yahoo spots
  for (const symbol of yahooSymbols) {
    try {
      const spot = await fetchSpot(symbol);
      if (!spot) continue;
      const meta = symbolMeta.get(symbol)!;
      await db
        .insert(priceCache)
        .values({
          symbol,
          date: today,
          quoteCurrency: meta.currency,
          close: String(spot.price),
          source: "yahoo",
        })
        .onConflictDoUpdate({
          target: [priceCache.symbol, priceCache.date],
          set: { close: String(spot.price), fetchedAt: new Date() },
        });
      updated++;
    } catch (err) {
      errors.push(`${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Gold (single source, applies to any GOLDTRADERS_TH holding)
  if (needsGold) {
    try {
      const gold = await fetchTodayGold();
      if (gold) {
        // Update cache for every gold symbol the user owns
        for (const h of userHoldings) {
          if (h.quoteSource !== "GOLDTRADERS_TH" || !h.symbol) continue;
          await db
            .insert(priceCache)
            .values({
              symbol: h.symbol,
              date: gold.date,
              quoteCurrency: "THB",
              close: String(gold.bahtWeight999PriceTHB),
              source: gold.source,
            })
            .onConflictDoUpdate({
              target: [priceCache.symbol, priceCache.date],
              set: { close: String(gold.bahtWeight999PriceTHB), fetchedAt: new Date() },
            });
          updated++;
        }
      }
    } catch (err) {
      errors.push(`gold: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // USD/THB FX rate
  try {
    const fx = await fetchSpot("USDTHB");
    if (fx) {
      await db
        .insert(fxRates)
        .values({
          date: today,
          base: "USD",
          quote: "THB",
          rate: String(fx.price),
          source: "yahoo",
        })
        .onConflictDoUpdate({
          target: [fxRates.date, fxRates.base, fxRates.quote],
          set: { rate: String(fx.price) },
        });
    }
  } catch (err) {
    errors.push(`USDTHB: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Invalidate today's portfolio_daily so values recompute
  await db
    .delete(portfolioDaily)
    .where(and(eq(portfolioDaily.userId, userId), gte(portfolioDaily.date, today)));

  revalidatePath("/portfolio");
  return { updated, errors };
}

// Reference ASSET_CLASSES so the linter doesn't complain when it's unused at
// the bottom of the file.
export type SupportedAssetClass = (typeof ASSET_CLASSES)[number];
