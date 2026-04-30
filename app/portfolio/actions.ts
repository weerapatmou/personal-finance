"use server";

import { db } from "@/db";
import { assetHoldings, manualHoldings, assetPrices } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { fetchSpot as yahooSpot } from "@/lib/prices/yahoo";
import { fetchSpot as coingeckoSpot } from "@/lib/prices/coingecko";
import { fetchTodayGold } from "@/lib/prices/goldtraders";
import { refreshPricesForUser } from "@/lib/portfolio/refresh-prices";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

const decimalString = z
  .string()
  .min(1)
  .regex(/^-?\d+(\.\d+)?$/, "Must be a numeric string");

const positiveDecimal = decimalString.refine(
  (s) => Number(s) > 0,
  "Must be greater than zero",
);

// ─── Asset (quantity-tracked) holdings ───────────────────────────────────────

const addAssetInput = z.object({
  category: z.enum(["STOCK", "CRYPTO", "GOLD"]),
  symbol: z.string().min(1).max(64),
  displayName: z.string().min(1).max(200),
  source: z.enum(["YAHOO", "COINGECKO", "GOLDTRADERS_TH"]),
  currency: z.enum(["THB", "USD"]),
  units: positiveDecimal,
});

/**
 * Add `units` of an asset. If the user already owns this (category, symbol),
 * append to existing units via INSERT ... ON CONFLICT. Also fetches spot
 * price inline so the dashboard renders immediately without waiting for the
 * cron — this is a deliberate exception to "no API calls on request path"
 * because the call is user-initiated and the wizard would otherwise show
 * value=$0 until the next refresh.
 */
export async function addAssetUnits(input: unknown) {
  const userId = await requireUserId();
  const data = addAssetInput.parse(input);

  await db
    .insert(assetHoldings)
    .values({
      userId,
      category: data.category,
      symbol: data.symbol,
      displayName: data.displayName,
      quoteSource: data.source,
      quoteCurrency: data.currency,
      units: data.units,
    })
    .onConflictDoUpdate({
      target: [assetHoldings.userId, assetHoldings.category, assetHoldings.symbol],
      set: {
        units: sql`${assetHoldings.units} + ${data.units}`,
        displayName: data.displayName, // refresh display name on each add
        updatedAt: new Date(),
      },
    });

  // Inline spot fetch + cache. Failures are silent — the cron will catch up.
  try {
    let price: number | null = null;
    let priceCurrency = data.currency;
    if (data.source === "YAHOO") {
      const s = await yahooSpot(data.symbol);
      if (s) {
        price = s.price;
        priceCurrency = s.currency === "THB" ? "THB" : "USD";
      }
    } else if (data.source === "COINGECKO") {
      const s = await coingeckoSpot(data.symbol);
      if (s) {
        price = s.priceUsd;
        priceCurrency = "USD";
      }
    } else if (data.source === "GOLDTRADERS_TH") {
      const g = await fetchTodayGold();
      if (g) {
        price = g.bahtWeight999PriceTHB;
        priceCurrency = "THB";
      }
    }
    if (price !== null) {
      await db
        .insert(assetPrices)
        .values({
          symbol: data.symbol,
          source: data.source,
          price: String(price),
          currency: priceCurrency,
        })
        .onConflictDoUpdate({
          target: [assetPrices.symbol, assetPrices.source],
          set: { price: String(price), currency: priceCurrency, fetchedAt: new Date() },
        });
    }
  } catch {
    // ignore — cron will fix
  }

  revalidatePath("/portfolio");
}

const editAssetInput = z.object({
  id: z.string().uuid(),
  units: positiveDecimal,
});

export async function editAssetUnits(input: unknown) {
  const userId = await requireUserId();
  const data = editAssetInput.parse(input);
  const result = await db
    .update(assetHoldings)
    .set({ units: data.units, updatedAt: new Date() })
    .where(and(eq(assetHoldings.id, data.id), eq(assetHoldings.userId, userId)))
    .returning({ id: assetHoldings.id });
  if (result.length === 0) throw new Error("Holding not found");
  revalidatePath("/portfolio");
}

export async function deleteAssetHolding(id: string) {
  const userId = await requireUserId();
  const result = await db
    .delete(assetHoldings)
    .where(and(eq(assetHoldings.id, id), eq(assetHoldings.userId, userId)))
    .returning({ id: assetHoldings.id });
  if (result.length === 0) throw new Error("Holding not found");
  revalidatePath("/portfolio");
}

// ─── Manual holdings (PF / Cash / Emergency Fund) ────────────────────────────

const addManualInput = z.object({
  category: z.enum(["PF", "CASH", "EMERGENCY_FUND"]),
  name: z.string().min(1).max(200),
  amount: positiveDecimal,
  currency: z.enum(["THB", "USD"]),
});

export async function addManualHolding(input: unknown) {
  const userId = await requireUserId();
  const data = addManualInput.parse(input);
  await db.insert(manualHoldings).values({
    userId,
    category: data.category,
    name: data.name,
    amount: data.amount,
    currency: data.currency,
  });
  revalidatePath("/portfolio");
}

const updateManualInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  amount: positiveDecimal,
  currency: z.enum(["THB", "USD"]),
});

export async function updateManualHolding(input: unknown) {
  const userId = await requireUserId();
  const data = updateManualInput.parse(input);
  const result = await db
    .update(manualHoldings)
    .set({
      name: data.name,
      amount: data.amount,
      currency: data.currency,
      updatedAt: new Date(),
    })
    .where(and(eq(manualHoldings.id, data.id), eq(manualHoldings.userId, userId)))
    .returning({ id: manualHoldings.id });
  if (result.length === 0) throw new Error("Holding not found");
  revalidatePath("/portfolio");
}

export async function deleteManualHolding(id: string) {
  const userId = await requireUserId();
  const result = await db
    .delete(manualHoldings)
    .where(and(eq(manualHoldings.id, id), eq(manualHoldings.userId, userId)))
    .returning({ id: manualHoldings.id });
  if (result.length === 0) throw new Error("Holding not found");
  revalidatePath("/portfolio");
}

// ─── Refresh prices ──────────────────────────────────────────────────────────

export async function refreshPricesNow() {
  const userId = await requireUserId();
  const summary = await refreshPricesForUser(userId);
  revalidatePath("/portfolio");
  return summary;
}
