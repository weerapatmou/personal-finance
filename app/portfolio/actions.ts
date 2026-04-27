"use server";

import { db } from "@/db";
import {
  holdings,
  investmentTxs,
  currencyConverts,
  priceCache,
  portfolioDaily,
} from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

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
