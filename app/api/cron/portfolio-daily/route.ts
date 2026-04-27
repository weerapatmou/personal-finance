import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  holdings,
  investmentTxs,
  priceCache,
  fxRates,
  portfolioDaily,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { computeDaily } from "@/lib/portfolio/daily";
import type { AssetClass } from "@/lib/types";
import type { InvestmentTxInput } from "@/lib/cost-basis";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const allUsers = await db.select().from(users);
  let rowsUpserted = 0;
  const errors: string[] = [];

  for (const u of allUsers) {
    const userHoldings = await db
      .select()
      .from(holdings)
      .where(and(eq(holdings.userId, u.id), eq(holdings.isArchived, false)));

    for (const h of userHoldings) {
      try {
        // Determine the dirty-from date for this holding:
        //   max(holding.first_tx_date, latest computed PortfolioDaily + 1)
        //   but recompute the earlier date if any tx in PriceCache or
        //   InvestmentTx is newer than the latest PortfolioDaily.computed_at.
        const earliestTxRow = await db
          .select({ d: sql<string>`MIN(${investmentTxs.date})` })
          .from(investmentTxs)
          .where(eq(investmentTxs.holdingId, h.id));
        const earliestTx = earliestTxRow[0]?.d ?? null;
        if (!earliestTx) continue; // nothing to compute

        const latestDaily = await db
          .select({ d: sql<string>`MAX(${portfolioDaily.date})` })
          .from(portfolioDaily)
          .where(
            and(eq(portfolioDaily.userId, u.id), eq(portfolioDaily.holdingId, h.id)),
          );
        const latestStr = latestDaily[0]?.d ?? null;

        const fromDate = latestStr ? nextDay(latestStr) : earliestTx;
        if (fromDate > yesterdayIso) continue;
        const dateRange = enumerateDates(fromDate, yesterdayIso);

        // Pull all txs, prices, and FX rates we need.
        const txs = await db
          .select()
          .from(investmentTxs)
          .where(eq(investmentTxs.holdingId, h.id));

        const prices = h.symbol
          ? await db.select().from(priceCache).where(eq(priceCache.symbol, h.symbol))
          : [];

        const fxAll = await db.select().from(fxRates);

        const computed = computeDaily({
          baseCurrency: u.baseCurrency,
          holding: {
            id: h.id,
            assetClass: h.assetClass as AssetClass,
            nativeCurrency: h.nativeCurrency,
            quoteCurrency: h.nativeCurrency, // for now, quote = native; wider scheme later.
          },
          txs: txs.map(toReplayInput),
          prices: prices.map((p) => ({ date: p.date, close: p.close })),
          fxRates: fxAll.map((f) => ({
            date: f.date,
            base: f.base,
            quote: f.quote,
            rate: f.rate,
          })),
          dateRange,
        });

        for (const c of computed) {
          await db
            .insert(portfolioDaily)
            .values({
              userId: u.id,
              date: c.date,
              holdingId: h.id,
              unitsHeld: c.unitsHeld.toString(),
              priceNative: c.priceNative.toString(),
              priceCurrency: c.priceCurrency,
              fxToBase: c.fxToBase.toString(),
              valueBase: c.valueBase.toString(),
              isStale: c.isStale,
            })
            .onConflictDoUpdate({
              target: [portfolioDaily.userId, portfolioDaily.date, portfolioDaily.holdingId],
              set: {
                unitsHeld: c.unitsHeld.toString(),
                priceNative: c.priceNative.toString(),
                fxToBase: c.fxToBase.toString(),
                valueBase: c.valueBase.toString(),
                isStale: c.isStale,
                computedAt: new Date(),
              },
            });
          rowsUpserted++;
        }
      } catch (err) {
        errors.push(`${u.id}/${h.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({ ok: true, rowsUpserted, errors });
}

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

type DbInvestmentTx = typeof investmentTxs.$inferSelect;
function toReplayInput(t: DbInvestmentTx): InvestmentTxInput {
  return {
    date: t.date,
    type: t.type as InvestmentTxInput["type"],
    units: t.units,
    priceNative: t.priceNative,
    feesNative: t.feesNative,
    splitRatio: t.splitRatio,
  };
}
