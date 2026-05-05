"use server";

import { db } from "@/db";
import { dcaEntries, dcaSettings, assetHoldings } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
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

const positiveDecimal = decimalString.refine(
  (s) => Number(s) > 0,
  "Must be greater than zero",
);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");
const currency = z.enum(["THB", "USD"]);
const assetSource = z.enum(["YAHOO", "COINGECKO", "GOLDTRADERS_TH"]);

// Map a quote source to the portfolio category it implies.
function categoryForSource(source: "YAHOO" | "COINGECKO" | "GOLDTRADERS_TH") {
  if (source === "YAHOO") return "STOCK" as const;
  if (source === "GOLDTRADERS_TH") return "GOLD" as const;
  return "CRYPTO" as const;
}

// Quote currency convention used elsewhere in the app's spot fetchers.
function quoteCurrencyForSource(source: "YAHOO" | "COINGECKO" | "GOLDTRADERS_TH") {
  return source === "GOLDTRADERS_TH" ? "THB" : "USD";
}

function defaultDisplayName(symbol: string) {
  if (symbol === "bitcoin") return "Bitcoin";
  return symbol.charAt(0).toUpperCase() + symbol.slice(1);
}

type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Apply a units delta to the user's matching asset_holdings row inside a
 * transaction. Creates the row if it doesn't exist; clamps to zero so a
 * delete can never make units negative.
 */
async function applyHoldingDelta(
  tx: DbOrTx,
  userId: string,
  symbol: string,
  source: "YAHOO" | "COINGECKO" | "GOLDTRADERS_TH",
  deltaUnits: string,
) {
  if (deltaUnits === "0") return;
  const category = categoryForSource(source);
  await tx
    .insert(assetHoldings)
    .values({
      userId,
      category,
      symbol,
      displayName: defaultDisplayName(symbol),
      quoteSource: source,
      quoteCurrency: quoteCurrencyForSource(source),
      units: deltaUnits.startsWith("-") ? "0" : deltaUnits,
    })
    .onConflictDoUpdate({
      target: [assetHoldings.userId, assetHoldings.category, assetHoldings.symbol],
      set: {
        units: sql`GREATEST(${assetHoldings.units} + ${deltaUnits}, 0)`,
        updatedAt: new Date(),
      },
    });
}

const addEntryInput = z.object({
  date: isoDate,
  fiatAmount: positiveDecimal,
  fiatCurrency: currency,
  units: positiveDecimal,
  unitPrice: positiveDecimal,
  assetSymbol: z.string().min(1).max(64).default("bitcoin"),
  assetSource: assetSource.default("COINGECKO"),
  note: z.string().max(500).nullish(),
});

export async function addDcaEntry(input: unknown) {
  const userId = await requireUserId();
  const data = addEntryInput.parse(input);

  await db.transaction(async (tx) => {
    // (userId, asset_symbol, asset_source, date) is unique. If a row already
    // exists for that day, an "add" replaces it — so the holding delta is
    // (newUnits - oldUnits), not just newUnits.
    const existing = await tx
      .select({ units: dcaEntries.units })
      .from(dcaEntries)
      .where(
        and(
          eq(dcaEntries.userId, userId),
          eq(dcaEntries.assetSymbol, data.assetSymbol),
          eq(dcaEntries.assetSource, data.assetSource),
          eq(dcaEntries.date, data.date),
        ),
      );
    const oldUnits = existing[0]?.units ?? "0";

    await tx
      .insert(dcaEntries)
      .values({
        userId,
        date: data.date,
        fiatAmount: data.fiatAmount,
        fiatCurrency: data.fiatCurrency,
        units: data.units,
        unitPrice: data.unitPrice,
        assetSymbol: data.assetSymbol,
        assetSource: data.assetSource,
        note: data.note ?? null,
      })
      .onConflictDoUpdate({
        target: [
          dcaEntries.userId,
          dcaEntries.assetSymbol,
          dcaEntries.assetSource,
          dcaEntries.date,
        ],
        set: {
          fiatAmount: data.fiatAmount,
          fiatCurrency: data.fiatCurrency,
          units: data.units,
          unitPrice: data.unitPrice,
          note: data.note ?? null,
          updatedAt: new Date(),
        },
      });

    const delta = sql`${data.units}::numeric - ${oldUnits}::numeric`;
    // Materialize the delta as a string so it can flow through applyHoldingDelta.
    const deltaRow = await tx.execute<{ delta: string }>(
      sql`SELECT (${delta})::text AS delta`,
    );
    const deltaUnits = deltaRow[0]?.delta ?? "0";
    if (deltaUnits !== "0") {
      await applyHoldingDelta(tx, userId, data.assetSymbol, data.assetSource, deltaUnits);
    }
  });

  revalidatePath("/dca");
  revalidatePath("/portfolio");
  revalidatePath("/");
}

const editEntryInput = addEntryInput.extend({ id: z.string().uuid() });

export async function editDcaEntry(input: unknown) {
  const userId = await requireUserId();
  const data = editEntryInput.parse(input);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(dcaEntries)
      .where(and(eq(dcaEntries.id, data.id), eq(dcaEntries.userId, userId)));
    if (existing.length === 0) throw new Error("Entry not found");
    const old = existing[0]!;

    await tx
      .update(dcaEntries)
      .set({
        date: data.date,
        fiatAmount: data.fiatAmount,
        fiatCurrency: data.fiatCurrency,
        units: data.units,
        unitPrice: data.unitPrice,
        assetSymbol: data.assetSymbol,
        assetSource: data.assetSource,
        note: data.note ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(dcaEntries.id, data.id), eq(dcaEntries.userId, userId)));

    // If the asset reference changed, we need to subtract from the old asset
    // and add to the new one. Otherwise just apply the delta.
    if (old.assetSymbol !== data.assetSymbol || old.assetSource !== data.assetSource) {
      await applyHoldingDelta(
        tx,
        userId,
        old.assetSymbol,
        old.assetSource as "YAHOO" | "COINGECKO" | "GOLDTRADERS_TH",
        "-" + String(old.units),
      );
      await applyHoldingDelta(tx, userId, data.assetSymbol, data.assetSource, data.units);
    } else {
      const deltaRow = await tx.execute<{ delta: string }>(
        sql`SELECT (${data.units}::numeric - ${old.units}::numeric)::text AS delta`,
      );
      const deltaUnits = deltaRow[0]?.delta ?? "0";
      if (deltaUnits !== "0") {
        await applyHoldingDelta(tx, userId, data.assetSymbol, data.assetSource, deltaUnits);
      }
    }
  });

  revalidatePath("/dca");
  revalidatePath("/portfolio");
  revalidatePath("/");
}

export async function deleteDcaEntry(id: string) {
  const userId = await requireUserId();
  const parsed = z.string().uuid().parse(id);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(dcaEntries)
      .where(and(eq(dcaEntries.id, parsed), eq(dcaEntries.userId, userId)));
    if (existing.length === 0) throw new Error("Entry not found");
    const old = existing[0]!;

    await tx
      .delete(dcaEntries)
      .where(and(eq(dcaEntries.id, parsed), eq(dcaEntries.userId, userId)));

    await applyHoldingDelta(
      tx,
      userId,
      old.assetSymbol,
      old.assetSource as "YAHOO" | "COINGECKO" | "GOLDTRADERS_TH",
      "-" + String(old.units),
    );
  });

  revalidatePath("/dca");
  revalidatePath("/portfolio");
  revalidatePath("/");
}

const settingsInput = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  accent: z.string().min(1).max(32).optional(),
  graphRange: z.enum(["7D", "30D", "60D", "90D", "180D", "1Y", "2Y", "4Y", "ALL"]).optional(),
  goalFiat: decimalString.nullish(),
  goalFiatCurrency: currency.nullish(),
  goalUnits: decimalString.nullish(),
});

export async function upsertDcaSettings(input: unknown) {
  const userId = await requireUserId();
  const data = settingsInput.parse(input);
  await db
    .insert(dcaSettings)
    .values({
      userId,
      theme: data.theme ?? "light",
      accent: data.accent ?? "orange",
      graphRange: data.graphRange ?? "30D",
      goalFiat: data.goalFiat ?? null,
      goalFiatCurrency: data.goalFiatCurrency ?? null,
      goalUnits: data.goalUnits ?? null,
    })
    .onConflictDoUpdate({
      target: dcaSettings.userId,
      set: {
        ...(data.theme !== undefined && { theme: data.theme }),
        ...(data.accent !== undefined && { accent: data.accent }),
        ...(data.graphRange !== undefined && { graphRange: data.graphRange }),
        ...(data.goalFiat !== undefined && { goalFiat: data.goalFiat }),
        ...(data.goalFiatCurrency !== undefined && {
          goalFiatCurrency: data.goalFiatCurrency,
        }),
        ...(data.goalUnits !== undefined && { goalUnits: data.goalUnits }),
        updatedAt: new Date(),
      },
    });
  revalidatePath("/dca");
}
