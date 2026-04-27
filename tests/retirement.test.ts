import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { project } from "@/lib/retirement/projection";

const baseInputs = {
  currentAge: 30,
  retirementAge: 60,
  endAge: 90,
  currentNetWorth: new Decimal(0),
  monthlySavings: new Decimal(0),
  expectedRealReturnPct: 0,
  expectedInflationPct: 0,
  targetMonthlyExpense: new Decimal(0),
};

describe("project()", () => {
  it("zero inputs → balance stays at 0 and never runs out", () => {
    const r = project(baseInputs);
    expect(r.runsOutAtAge).toBeNull();
    expect(r.rows.every((row) => row.yearEndBalance.equals(0))).toBe(true);
  });

  it("non-zero contributions accumulate at the real return rate", () => {
    const r = project({
      ...baseInputs,
      currentNetWorth: new Decimal(0),
      monthlySavings: new Decimal(10_000), // 120k/year
      expectedRealReturnPct: 0,
      retirementAge: 32,
      endAge: 32,
    });
    // 2 years × 120k = 240k
    expect(r.rows[r.rows.length - 1]!.yearEndBalance.toFixed(0)).toBe("240000");
  });

  it("flagged runs-out-at-age when withdrawals exceed available balance", () => {
    const r = project({
      ...baseInputs,
      currentNetWorth: new Decimal(100_000),
      monthlySavings: new Decimal(0),
      expectedRealReturnPct: 0,
      retirementAge: 30, // already retired
      endAge: 35,
      targetMonthlyExpense: new Decimal(50_000), // 600k/year
    });
    expect(r.runsOutAtAge).not.toBeNull();
    expect(r.runsOutAtAge!).toBeLessThanOrEqual(31);
  });

  it("FIRE number = 25 × annual target expense", () => {
    const r = project({
      ...baseInputs,
      targetMonthlyExpense: new Decimal(40_000),
    });
    // 40k * 12 * 25 = 12,000,000
    expect(r.fireNumber.toFixed(0)).toBe("12000000");
  });

  it("infinite balance with high return — never runs out", () => {
    const r = project({
      ...baseInputs,
      currentNetWorth: new Decimal(10_000_000),
      monthlySavings: new Decimal(50_000),
      expectedRealReturnPct: 10,
      retirementAge: 60,
      endAge: 90,
      targetMonthlyExpense: new Decimal(40_000),
    });
    expect(r.runsOutAtAge).toBeNull();
    expect(r.rows[r.rows.length - 1]!.yearEndBalance.greaterThan(0)).toBe(true);
  });
});
