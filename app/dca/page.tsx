import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  dcaEntries,
  dcaSettings,
  assetPrices,
  assetHoldings,
  currencyRates,
  users,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import Decimal from "decimal.js";
import { AppShell } from "@/components/app-shell";
import { convert, money, type Currency, type FxRow } from "@/lib/money";
import { enrichEntries, computeSummary, computeDelta24 } from "@/lib/dca/calc";
import { DcaDashboard } from "./components/dca-dashboard";

export const dynamic = "force-dynamic";

export default async function DcaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const [entries, settingsRow, btcPriceRow, fxRow, userRow, holdingRow] = await Promise.all([
    db
      .select()
      .from(dcaEntries)
      .where(eq(dcaEntries.userId, userId))
      .orderBy(asc(dcaEntries.date)),
    db.select().from(dcaSettings).where(eq(dcaSettings.userId, userId)),
    db
      .select()
      .from(assetPrices)
      .where(and(eq(assetPrices.symbol, "bitcoin"), eq(assetPrices.source, "COINGECKO"))),
    db
      .select()
      .from(currencyRates)
      .where(and(eq(currencyRates.base, "USD"), eq(currencyRates.quote, "THB"))),
    db.select().from(users).where(eq(users.id, userId)),
    db
      .select({ units: assetHoldings.units })
      .from(assetHoldings)
      .where(
        and(
          eq(assetHoldings.userId, userId),
          eq(assetHoldings.category, "CRYPTO"),
          eq(assetHoldings.symbol, "bitcoin"),
        ),
      ),
  ]);

  const displayCurrency = (userRow[0]?.displayCurrency === "USD" ? "USD" : "THB") as Currency;
  const settings = settingsRow[0];

  // FX: the app keeps only the latest USD/THB rate. We backdate it to a fixed
  // sentinel so `convert`'s LOCF lookup always hits something. When FX history
  // is added later, replace this with a date-indexed query.
  const fxRows: FxRow[] = fxRow[0]
    ? [
        {
          date: "1970-01-01",
          base: "USD",
          quote: "THB",
          rate: fxRow[0].rate,
        },
      ]
    : [];

  // BTC live price: cached in asset_prices (USD by source convention).
  const btcPriceUsd = btcPriceRow[0] ? new Decimal(btcPriceRow[0].price) : new Decimal(0);
  const btcPriceCurrency = (btcPriceRow[0]?.currency === "THB" ? "THB" : "USD") as Currency;
  const today = new Date().toISOString().slice(0, 10);
  const currentPriceDisplay = btcPriceUsd.gt(0)
    ? convert(money(btcPriceUsd, btcPriceCurrency), displayCurrency, today, fxRows).amount
    : new Decimal(0);

  // Fallback if asset_prices has no row yet: use the latest entry's price
  // (matches the upstream behaviour of "last known price" for empty-cache UX).
  const fallbackPriceDisplay =
    entries.length > 0
      ? convert(
          money(
            new Decimal(entries[entries.length - 1]!.unitPrice),
            entries[entries.length - 1]!.fiatCurrency as Currency,
          ),
          displayCurrency,
          today,
          fxRows,
        ).amount
      : new Decimal(0);

  const effectivePrice = currentPriceDisplay.gt(0) ? currentPriceDisplay : fallbackPriceDisplay;
  const priceStale = currentPriceDisplay.lte(0);

  const enriched = enrichEntries(
    entries.map((e) => ({
      id: e.id,
      date: e.date,
      fiatAmount: e.fiatAmount,
      fiatCurrency: (e.fiatCurrency === "USD" ? "USD" : "THB") as Currency,
      units: e.units,
      unitPrice: e.unitPrice,
      note: e.note,
    })),
    displayCurrency,
    fxRows,
    effectivePrice,
  );

  const goalFiatNative = settings?.goalFiat ? new Decimal(settings.goalFiat) : new Decimal(0);
  const goalFiatCurrency = (settings?.goalFiatCurrency === "USD" ? "USD" : "THB") as Currency;
  const goalFiatDisplay = goalFiatNative.gt(0)
    ? convert(money(goalFiatNative, goalFiatCurrency), displayCurrency, today, fxRows).amount
    : new Decimal(0);
  const goalUnits = settings?.goalUnits ? new Decimal(settings.goalUnits) : new Decimal(0);

  const summary = computeSummary(enriched, effectivePrice, goalFiatDisplay, goalUnits);
  const delta24 = computeDelta24(enriched);

  return (
    <AppShell>
      <DcaDashboard
        entries={entries.map((e) => ({
          id: e.id,
          date: e.date,
          fiatAmount: String(e.fiatAmount),
          fiatCurrency: (e.fiatCurrency === "USD" ? "USD" : "THB") as Currency,
          units: String(e.units),
          unitPrice: String(e.unitPrice),
          note: e.note ?? null,
        }))}
        enriched={enriched.map((e) => ({
          id: e.id,
          date: e.date,
          dayActive: e.dayActive,
          fiatCurrency: e.fiatCurrency,
          units: e.units.toString(),
          unitPrice: e.unitPrice.toString(),
          note: e.note,
          fiatAmountDisplay: e.fiatAmountDisplay.toString(),
          unitPriceDisplay: e.unitPriceDisplay.toString(),
          cumUnits: e.cumUnits.toString(),
          cumFiatDisplay: e.cumFiatDisplay.toString(),
          portfolioValueDisplay: e.portfolioValueDisplay.toString(),
          unrealizedDisplay: e.unrealizedDisplay.toString(),
          pctUnrealized: e.pctUnrealized.toString(),
        }))}
        summary={{
          spendDisplay: summary.spendDisplay.toString(),
          totalUnits: summary.totalUnits.toString(),
          numberOfDays: summary.numberOfDays,
          averageCostDisplay: summary.averageCostDisplay.toString(),
          marketValueDisplay: summary.marketValueDisplay.toString(),
          pctProfitLoss: summary.pctProfitLoss.toString(),
          maxDrawdownPct: summary.maxDrawdownPct.toString(),
          worstEntryLossPct: summary.worstEntryLossPct.toString(),
          worstEntryLossDisplay: summary.worstEntryLossDisplay.toString(),
          worstEntryDate: summary.worstEntryDate,
          bestEntryGainPct: summary.bestEntryGainPct.toString(),
          bestEntryDate: summary.bestEntryDate,
          progressFiatPct: summary.progressFiatPct.toString(),
          progressUnitsPct: summary.progressUnitsPct.toString(),
          currentPriceDisplay: summary.currentPriceDisplay.toString(),
          goalFiatDisplay: summary.goalFiatDisplay.toString(),
          goalUnits: summary.goalUnits.toString(),
        }}
        delta24={
          delta24
            ? { delta: delta24.delta.toString(), pct: delta24.pct.toString() }
            : null
        }
        priceStale={priceStale}
        displayCurrency={displayCurrency}
        holdingUnits={holdingRow[0]?.units ? String(holdingRow[0].units) : "0"}
        settings={{
          theme: settings?.theme === "dark" ? "dark" : "light",
          accent: settings?.accent ?? "orange",
          graphRange: (settings?.graphRange as
            | "7D"
            | "30D"
            | "60D"
            | "90D"
            | "180D"
            | "1Y"
            | "2Y"
            | "4Y"
            | "ALL") ?? "30D",
          goalFiat: settings?.goalFiat ? String(settings.goalFiat) : null,
          goalFiatCurrency: (settings?.goalFiatCurrency === "USD" ? "USD" : "THB") as Currency,
          goalUnits: settings?.goalUnits ? String(settings.goalUnits) : null,
        }}
      />
    </AppShell>
  );
}
