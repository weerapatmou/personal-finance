import Decimal from "decimal.js";

// Implements SPEC §4 (canonical cost-basis rules). Pure functions, no DB access.

export type InvestmentTxInput = {
  date: string; // ISO yyyy-mm-dd; used only for ordering
  type: "BUY" | "SELL" | "DIVIDEND" | "FEE" | "SPLIT" | "TRANSFER_IN" | "TRANSFER_OUT";
  units?: Decimal.Value | null;
  priceNative?: Decimal.Value | null;
  feesNative?: Decimal.Value | null;
  splitRatio?: Decimal.Value | null;
};

export type ReplayResult = {
  units: Decimal;
  avgCost: Decimal; // in the holding's native currency
  realized: RealizedRow[];
};

export type RealizedRow = {
  date: string;
  units: Decimal;
  proceedsNative: Decimal;
  costBasisNative: Decimal;
  realizedNative: Decimal;
};

const ZERO = new Decimal(0);

/**
 * Replay every transaction in chronological order and produce the current
 * `(units, avgCost)` plus the list of realized P&L events from SELLs.
 *
 * Rules (verbatim from SPEC §4):
 *
 * - BUY: new_avg = (old_units*old_avg + buy_units*buy_price + buy_fees) / new_units.
 *   Fees baked into basis.
 * - SELL: realized = price*units - fees - avg*units. avg unchanged. Realization recorded.
 * - DIVIDEND: no-op on units / avg. (Cash treatment is the caller's concern.)
 *   DRIP must be modeled by the caller as a BUY with zero fees, not as a DIVIDEND.
 * - FEE (standalone): no-op on units / avg.
 * - SPLIT: units *= ratio, avg /= ratio. ratio < 1 for reverse splits.
 * - TRANSFER_IN / TRANSFER_OUT: units in/out at current avg_cost; basis unchanged.
 */
export function replay(txs: InvestmentTxInput[]): ReplayResult {
  const sorted = [...txs].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  let units = ZERO;
  let avgCost = ZERO;
  const realized: RealizedRow[] = [];

  for (const tx of sorted) {
    switch (tx.type) {
      case "BUY": {
        const u = new Decimal(tx.units ?? 0);
        const p = new Decimal(tx.priceNative ?? 0);
        const f = new Decimal(tx.feesNative ?? 0);
        if (u.isZero()) break;
        const newUnits = units.plus(u);
        avgCost = units
          .times(avgCost)
          .plus(u.times(p))
          .plus(f)
          .dividedBy(newUnits);
        units = newUnits;
        break;
      }

      case "SELL": {
        const u = new Decimal(tx.units ?? 0).abs();
        const p = new Decimal(tx.priceNative ?? 0);
        const f = new Decimal(tx.feesNative ?? 0);
        if (u.isZero()) break;
        if (u.greaterThan(units)) {
          throw new Error(
            `SELL of ${u.toString()} exceeds held units ${units.toString()} on ${tx.date}`,
          );
        }
        const proceeds = p.times(u).minus(f);
        const costBasis = avgCost.times(u);
        const r = proceeds.minus(costBasis);
        realized.push({
          date: tx.date,
          units: u,
          proceedsNative: proceeds,
          costBasisNative: costBasis,
          realizedNative: r,
        });
        units = units.minus(u);
        // avgCost unchanged on sell
        if (units.isZero()) avgCost = ZERO;
        break;
      }

      case "SPLIT": {
        const r = new Decimal(tx.splitRatio ?? 1);
        if (r.isZero()) throw new Error(`SPLIT with zero ratio on ${tx.date}`);
        units = units.times(r);
        avgCost = r.equals(0) ? avgCost : avgCost.dividedBy(r);
        break;
      }

      case "TRANSFER_IN": {
        const u = new Decimal(tx.units ?? 0);
        // External transfer in carries existing basis if priceNative is supplied,
        // else inherits current avg_cost (treats it as moving an existing position).
        const p = tx.priceNative != null ? new Decimal(tx.priceNative) : avgCost;
        if (u.isZero()) break;
        const newUnits = units.plus(u);
        avgCost = units.times(avgCost).plus(u.times(p)).dividedBy(newUnits);
        units = newUnits;
        break;
      }

      case "TRANSFER_OUT": {
        const u = new Decimal(tx.units ?? 0).abs();
        if (u.greaterThan(units)) {
          throw new Error(
            `TRANSFER_OUT of ${u.toString()} exceeds held units ${units.toString()}`,
          );
        }
        units = units.minus(u);
        if (units.isZero()) avgCost = ZERO;
        break;
      }

      case "DIVIDEND":
      case "FEE":
        // No effect on units/avgCost. Cash side is handled outside.
        break;
    }
  }

  return { units, avgCost, realized };
}
