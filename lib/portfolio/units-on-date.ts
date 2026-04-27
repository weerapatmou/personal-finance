import Decimal from "decimal.js";
import { replay, type InvestmentTxInput } from "@/lib/cost-basis";

/**
 * Compute units held on date D by replaying every InvestmentTx with `tx.date <= D`.
 * Pure function; the caller is responsible for fetching the rows.
 */
export function unitsOnDate(txs: InvestmentTxInput[], date: string): Decimal {
  const eligible = txs.filter((t) => t.date <= date);
  return replay(eligible).units;
}
