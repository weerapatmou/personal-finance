import Decimal from "decimal.js";

export type ProjectionInputs = {
  currentAge: number;
  retirementAge: number;
  endAge: number; // typically 100
  currentNetWorth: Decimal;
  monthlySavings: Decimal; // pre-retirement
  expectedRealReturnPct: number; // e.g. 5 for 5%
  expectedInflationPct: number; // e.g. 3
  targetMonthlyExpense: Decimal; // in today's THB
};

export type ProjectionRow = {
  age: number;
  yearStartBalance: Decimal;
  contribution: Decimal;
  marketGain: Decimal;
  withdrawal: Decimal;
  yearEndBalance: Decimal;
};

export type ProjectionResult = {
  rows: ProjectionRow[];
  runsOutAtAge: number | null; // null if balance stays positive through endAge
  fireNumber: Decimal; // 25× annual target expense
  shortfallAtRetirement: Decimal; // negative if surplus
};

/**
 * Project end-of-year balances from current_age through end_age.
 *
 * Math: real-return model. Target expenses are in *today's THB* — we don't
 * inflate the expense each year because the return is already real (net of
 * inflation). This is the simplest defensible model that the user's
 * COMPOUND sheet was trying to compute before the #REF! errors.
 *
 * Order of operations within a year:
 *   1. Apply real return to start-of-year balance
 *   2. Add contributions (if pre-retirement)
 *   3. Subtract withdrawals (if post-retirement)
 *
 * Pre-retirement contributions = monthlySavings × 12.
 * Post-retirement withdrawals  = targetMonthlyExpense × 12.
 */
export function project(input: ProjectionInputs): ProjectionResult {
  const r = new Decimal(input.expectedRealReturnPct).dividedBy(100);
  const annualContribution = input.monthlySavings.times(12);
  const annualWithdrawal = input.targetMonthlyExpense.times(12);

  const rows: ProjectionRow[] = [];
  let balance = input.currentNetWorth;
  let runsOutAtAge: number | null = null;

  for (let age = input.currentAge; age < input.endAge; age++) {
    const start = balance;
    const marketGain = start.times(r);
    const isWorking = age < input.retirementAge;
    const contribution = isWorking ? annualContribution : new Decimal(0);
    const withdrawal = isWorking ? new Decimal(0) : annualWithdrawal;
    const end = start.plus(marketGain).plus(contribution).minus(withdrawal);

    rows.push({
      age,
      yearStartBalance: start,
      contribution,
      marketGain,
      withdrawal,
      yearEndBalance: end,
    });

    // "Ran out" means strictly below zero (or zero with active withdrawals).
    // A flat zero balance with no withdrawals is not running out.
    const ranOut =
      end.lessThan(0) || (end.equals(0) && withdrawal.greaterThan(0));
    if (ranOut && runsOutAtAge === null) {
      runsOutAtAge = age + 1;
    }
    balance = end;
  }

  const fireNumber = annualWithdrawal.times(25);
  const balanceAtRetirement =
    rows.find((r2) => r2.age === input.retirementAge - 1)?.yearEndBalance ??
    rows[rows.length - 1]?.yearEndBalance ??
    new Decimal(0);
  const shortfallAtRetirement = fireNumber.minus(balanceAtRetirement);

  return {
    rows,
    runsOutAtAge,
    fireNumber,
    shortfallAtRetirement,
  };
}
