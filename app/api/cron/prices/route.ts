import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  holdings,
  investmentTxs,
  priceCache,
  fxRates,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchHistorical } from "@/lib/prices/yahoo";
import { fetchTodayGold } from "@/lib/prices/goldtraders";

const ONE_YEAR_MS = 365 * 86_400_000;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const activeHoldings = await db
    .select()
    .from(holdings)
    .where(eq(holdings.isArchived, false));

  let pricesInserted = 0;
  let fxInserted = 0;
  const errors: string[] = [];

  for (const h of activeHoldings) {
    if (!h.symbol) continue;
    try {
      // Determine the from-date for backfill: max(first_tx_date, last_cached+1).
      const earliestTx = await db
        .select({ d: sql<string>`MIN(${investmentTxs.date})` })
        .from(investmentTxs)
        .where(eq(investmentTxs.holdingId, h.id));

      const latestCached = await db
        .select({ d: sql<string>`MAX(${priceCache.date})` })
        .from(priceCache)
        .where(eq(priceCache.symbol, h.symbol));

      const earliestStr = earliestTx[0]?.d ?? null;
      const latestStr = latestCached[0]?.d ?? null;

      const candidates: string[] = [earliestStr, latestStr ? nextDay(latestStr) : null].filter(
        (x): x is string => !!x,
      );
      if (candidates.length === 0) continue;
      const fromDate = candidates.reduce((a, b) => (a > b ? a : b));

      // Cap backfill at 1 year per cron run.
      const fromCapped = capRange(fromDate, yesterdayIso, ONE_YEAR_MS);

      if (h.quoteSource === "YAHOO") {
        const bars = await fetchHistorical(h.symbol, fromCapped, yesterdayIso);
        for (const b of bars) {
          await db
            .insert(priceCache)
            .values({
              symbol: h.symbol,
              date: b.date,
              quoteCurrency: h.nativeCurrency,
              open: b.open != null ? String(b.open) : null,
              high: b.high != null ? String(b.high) : null,
              low: b.low != null ? String(b.low) : null,
              close: String(b.close),
              source: "yahoo",
            })
            .onConflictDoNothing();
          pricesInserted++;
        }
      } else if (h.quoteSource === "GOLDTRADERS_TH") {
        const gold = await fetchTodayGold();
        if (gold) {
          await db
            .insert(priceCache)
            .values({
              symbol: h.symbol,
              date: gold.date,
              quoteCurrency: "THB",
              close: String(gold.bahtWeight999PriceTHB),
              source: gold.source,
            })
            .onConflictDoNothing();
          pricesInserted++;
        }
      }
      // MANUAL_NAV: skip; user enters via the UI.
    } catch (err) {
      errors.push(`${h.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // FX: USDTHB
  try {
    const fxBars = await fetchHistorical("USDTHB", await fxFromDate(yesterdayIso), yesterdayIso);
    for (const b of fxBars) {
      await db
        .insert(fxRates)
        .values({
          date: b.date,
          base: "USD",
          quote: "THB",
          rate: String(b.close),
          source: "yahoo",
        })
        .onConflictDoNothing();
      fxInserted++;
    }
  } catch (err) {
    errors.push(`FX: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    ok: true,
    holdingsProcessed: activeHoldings.length,
    pricesInserted,
    fxInserted,
    errors,
  });
}

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function capRange(from: string, to: string, maxMs: number): string {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (b - a <= maxMs) return from;
  return new Date(b - maxMs).toISOString().slice(0, 10);
}

async function fxFromDate(yesterdayIso: string): Promise<string> {
  const last = await db
    .select({ d: sql<string>`MAX(${fxRates.date})` })
    .from(fxRates)
    .where(and(eq(fxRates.base, "USD"), eq(fxRates.quote, "THB")));
  const lastStr = last[0]?.d ?? null;
  if (lastStr) return capRange(nextDay(lastStr), yesterdayIso, ONE_YEAR_MS);
  // Default backfill: 1 year.
  return capRange(yesterdayIso, yesterdayIso, ONE_YEAR_MS);
}
