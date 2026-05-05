import Decimal from "decimal.js";
import type { Currency, FxRow } from "@/lib/money";
import { convert, money } from "@/lib/money";

export type DcaEntryRow = {
  id: string;
  date: string;
  fiatAmount: string | number | Decimal;
  fiatCurrency: Currency;
  units: string | number | Decimal;
  unitPrice: string | number | Decimal;
  note?: string | null;
};

export type EnrichedDcaEntry = {
  id: string;
  date: string;
  dayActive: number;
  fiatAmount: Decimal;
  fiatCurrency: Currency;
  units: Decimal;
  unitPrice: Decimal;
  note: string | null;
  fiatAmountDisplay: Decimal;
  unitPriceDisplay: Decimal;
  cumUnits: Decimal;
  cumFiatDisplay: Decimal;
  portfolioValueDisplay: Decimal;
  unrealizedDisplay: Decimal;
  pctUnrealized: Decimal;
};

export type DcaSummary = {
  spendDisplay: Decimal;
  totalUnits: Decimal;
  numberOfDays: number;
  averageCostDisplay: Decimal;
  marketValueDisplay: Decimal;
  pctProfitLoss: Decimal;
  maxDrawdownPct: Decimal;
  worstEntryLossPct: Decimal;
  worstEntryLossDisplay: Decimal;
  worstEntryDate: string;
  bestEntryGainPct: Decimal;
  bestEntryDate: string;
  progressFiatPct: Decimal;
  progressUnitsPct: Decimal;
  currentPriceDisplay: Decimal;
  goalFiatDisplay: Decimal;
  goalUnits: Decimal;
};

export type Delta24 = { delta: Decimal; pct: Decimal } | null;

/**
 * Walk entries oldest -> newest. Caller must pre-sort ASC by date.
 * `displayCurrency` is what the dashboard renders in; each row's native fiat
 * is converted via FX rows dated to the entry's date (LOCF).
 */
export function enrichEntries(
  entries: DcaEntryRow[],
  displayCurrency: Currency,
  fxRows: FxRow[],
  currentPriceDisplay: Decimal,
): EnrichedDcaEntry[] {
  let cumUnits = new Decimal(0);
  let cumFiatDisplay = new Decimal(0);

  return entries.map((e, i) => {
    const fiatAmount = new Decimal(e.fiatAmount);
    const units = new Decimal(e.units);
    const unitPrice = new Decimal(e.unitPrice);

    const fiatDisplay = convert(
      money(fiatAmount, e.fiatCurrency),
      displayCurrency,
      e.date,
      fxRows,
    ).amount;
    const priceDisplay = convert(
      money(unitPrice, e.fiatCurrency),
      displayCurrency,
      e.date,
      fxRows,
    ).amount;

    cumUnits = cumUnits.plus(units);
    cumFiatDisplay = cumFiatDisplay.plus(fiatDisplay);

    const portfolioValueDisplay = cumUnits.times(currentPriceDisplay);
    const unrealizedDisplay = portfolioValueDisplay.minus(cumFiatDisplay);
    const pctUnrealized = cumFiatDisplay.gt(0)
      ? unrealizedDisplay.dividedBy(cumFiatDisplay).times(100)
      : new Decimal(0);

    return {
      id: e.id,
      date: e.date,
      dayActive: i + 1,
      fiatAmount,
      fiatCurrency: e.fiatCurrency,
      units,
      unitPrice,
      note: e.note ?? null,
      fiatAmountDisplay: fiatDisplay,
      unitPriceDisplay: priceDisplay,
      cumUnits,
      cumFiatDisplay,
      portfolioValueDisplay,
      unrealizedDisplay,
      pctUnrealized,
    };
  });
}

export function computeSummary(
  enriched: EnrichedDcaEntry[],
  currentPriceDisplay: Decimal,
  goalFiatDisplay: Decimal,
  goalUnits: Decimal,
): DcaSummary {
  if (enriched.length === 0) {
    return {
      spendDisplay: new Decimal(0),
      totalUnits: new Decimal(0),
      numberOfDays: 0,
      averageCostDisplay: new Decimal(0),
      marketValueDisplay: new Decimal(0),
      pctProfitLoss: new Decimal(0),
      maxDrawdownPct: new Decimal(0),
      worstEntryLossPct: new Decimal(0),
      worstEntryLossDisplay: new Decimal(0),
      worstEntryDate: "",
      bestEntryGainPct: new Decimal(0),
      bestEntryDate: "",
      progressFiatPct: new Decimal(0),
      progressUnitsPct: new Decimal(0),
      currentPriceDisplay,
      goalFiatDisplay,
      goalUnits,
    };
  }

  const spendDisplay = enriched.reduce(
    (s, e) => s.plus(e.fiatAmountDisplay),
    new Decimal(0),
  );
  const totalUnits = enriched[enriched.length - 1]!.cumUnits;
  const marketValueDisplay = totalUnits.times(currentPriceDisplay);
  const averageCostDisplay = totalUnits.gt(0)
    ? spendDisplay.dividedBy(totalUnits)
    : new Decimal(0);
  const pctProfitLoss = spendDisplay.gt(0)
    ? marketValueDisplay.minus(spendDisplay).dividedBy(spendDisplay).times(100)
    : new Decimal(0);

  let peak = new Decimal(0);
  let maxDrawdownPct = new Decimal(0);
  for (const e of enriched) {
    if (e.portfolioValueDisplay.gt(peak)) peak = e.portfolioValueDisplay;
    if (peak.gt(0)) {
      const dd = e.portfolioValueDisplay.minus(peak).dividedBy(peak).times(100);
      if (dd.lt(maxDrawdownPct)) maxDrawdownPct = dd;
    }
  }

  let worstEntryLossPct = new Decimal(0);
  let worstEntryLossDisplay = new Decimal(0);
  let worstEntryDate = "";
  let bestEntryGainPct = new Decimal(0);
  let bestEntryDate = "";
  for (const e of enriched) {
    const currentVal = e.units.times(currentPriceDisplay);
    const diff = currentVal.minus(e.fiatAmountDisplay);
    const pct = e.fiatAmountDisplay.gt(0)
      ? diff.dividedBy(e.fiatAmountDisplay).times(100)
      : new Decimal(0);
    if (pct.lt(worstEntryLossPct)) {
      worstEntryLossPct = pct;
      worstEntryLossDisplay = diff;
      worstEntryDate = e.date;
    }
    if (pct.gt(bestEntryGainPct)) {
      bestEntryGainPct = pct;
      bestEntryDate = e.date;
    }
  }

  const progressFiatPct = goalFiatDisplay.gt(0)
    ? marketValueDisplay.dividedBy(goalFiatDisplay).times(100)
    : new Decimal(0);
  const progressUnitsPct = goalUnits.gt(0)
    ? totalUnits.dividedBy(goalUnits).times(100)
    : new Decimal(0);

  return {
    spendDisplay,
    totalUnits,
    numberOfDays: enriched.length,
    averageCostDisplay,
    marketValueDisplay,
    pctProfitLoss,
    maxDrawdownPct,
    worstEntryLossPct,
    worstEntryLossDisplay,
    worstEntryDate,
    bestEntryGainPct,
    bestEntryDate,
    progressFiatPct,
    progressUnitsPct,
    currentPriceDisplay,
    goalFiatDisplay,
    goalUnits,
  };
}

export function computeDelta24(enriched: EnrichedDcaEntry[]): Delta24 {
  if (enriched.length < 2) return null;
  const last = enriched[enriched.length - 1]!;
  const prev = enriched[enriched.length - 2]!;
  const delta = last.portfolioValueDisplay.minus(prev.portfolioValueDisplay);
  const pct = prev.portfolioValueDisplay.gt(0)
    ? delta.dividedBy(prev.portfolioValueDisplay).times(100)
    : new Decimal(0);
  return { delta, pct };
}
