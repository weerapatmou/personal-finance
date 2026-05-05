import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  enrichEntries,
  computeSummary,
  computeDelta24,
  type DcaEntryRow,
} from "@/lib/dca/calc";
import type { FxRow } from "@/lib/money";

const fx: FxRow[] = [{ date: "1970-01-01", base: "USD", quote: "THB", rate: "35" }];

const baseEntries: DcaEntryRow[] = [
  // 1000 THB at 1,000,000 THB/BTC -> 0.001 BTC
  {
    id: "a",
    date: "2026-04-01",
    fiatAmount: "1000",
    fiatCurrency: "THB",
    units: "0.001",
    unitPrice: "1000000",
  },
  // 30 USD at 30,000 USD/BTC -> 0.001 BTC (30 USD = 1050 THB at rate 35)
  {
    id: "b",
    date: "2026-04-02",
    fiatAmount: "30",
    fiatCurrency: "USD",
    units: "0.001",
    unitPrice: "30000",
  },
];

describe("DCA enrichEntries", () => {
  it("converts each row's native fiat to the display currency at the entry date", () => {
    const enriched = enrichEntries(baseEntries, "THB", fx, new Decimal("1100000"));
    expect(enriched).toHaveLength(2);
    expect(enriched[0]!.fiatAmountDisplay.toString()).toBe("1000");
    expect(enriched[1]!.fiatAmountDisplay.toString()).toBe("1050"); // 30 USD * 35
    expect(enriched[1]!.cumFiatDisplay.toString()).toBe("2050");
    expect(enriched[1]!.cumUnits.toString()).toBe("0.002");
  });

  it("computes portfolio value and unrealized P/L per row from cumulative units", () => {
    const enriched = enrichEntries(baseEntries, "THB", fx, new Decimal("1100000"));
    // 0.002 BTC * 1,100,000 THB/BTC = 2200 THB; invested 2050 THB
    expect(enriched[1]!.portfolioValueDisplay.toString()).toBe("2200");
    expect(enriched[1]!.unrealizedDisplay.toString()).toBe("150");
  });
});

describe("DCA computeSummary", () => {
  it("returns zero metrics for empty input but echoes the current price", () => {
    const s = computeSummary([], new Decimal("1100000"), new Decimal(0), new Decimal(0));
    expect(s.numberOfDays).toBe(0);
    expect(s.spendDisplay.toString()).toBe("0");
    expect(s.currentPriceDisplay.toString()).toBe("1100000");
  });

  it("aggregates totals, average cost, and goal progress", () => {
    const enriched = enrichEntries(baseEntries, "THB", fx, new Decimal("1100000"));
    const s = computeSummary(
      enriched,
      new Decimal("1100000"),
      new Decimal("10000"),
      new Decimal("0.005"),
    );
    expect(s.totalUnits.toString()).toBe("0.002");
    expect(s.spendDisplay.toString()).toBe("2050");
    expect(s.marketValueDisplay.toString()).toBe("2200");
    expect(s.averageCostDisplay.toString()).toBe("1025000");
    expect(s.progressFiatPct.toString()).toBe("22");
    expect(s.progressUnitsPct.toString()).toBe("40");
  });

  it("tracks max drawdown across the equity curve", () => {
    // Three entries, with a price dip on entry 2.
    const entries: DcaEntryRow[] = [
      { id: "1", date: "2026-04-01", fiatAmount: "1000", fiatCurrency: "THB", units: "0.001", unitPrice: "1000000" },
      { id: "2", date: "2026-04-02", fiatAmount: "1000", fiatCurrency: "THB", units: "0.002", unitPrice: "500000" },
      { id: "3", date: "2026-04-03", fiatAmount: "1000", fiatCurrency: "THB", units: "0.001", unitPrice: "1000000" },
    ];
    const enriched = enrichEntries(entries, "THB", fx, new Decimal("1000000"));
    // portfolio at row1: 0.001 * 1m = 1000; row2: 0.003 * 500k = 1500; row3: 0.004 * 1m = 4000.
    // Peak after row3 is 4000 — but peak is rolling so peak after row1 is 1000, row2 1500, row3 4000.
    // Drawdown only occurs if a later row is below an earlier peak; not here, so max = 0.
    const s = computeSummary(enriched, new Decimal("1000000"), new Decimal(0), new Decimal(0));
    expect(s.maxDrawdownPct.toString()).toBe("0");
  });
});

describe("DCA computeDelta24", () => {
  it("returns null when fewer than 2 entries exist", () => {
    const enriched = enrichEntries(baseEntries.slice(0, 1), "THB", fx, new Decimal("1100000"));
    expect(computeDelta24(enriched)).toBeNull();
  });

  it("returns the change between the two most recent entries", () => {
    const enriched = enrichEntries(baseEntries, "THB", fx, new Decimal("1100000"));
    const d = computeDelta24(enriched);
    expect(d).not.toBeNull();
    // row1 portfolio 0.001 * 1.1m = 1100; row2 portfolio 0.002 * 1.1m = 2200 -> delta 1100, +100%
    expect(d!.delta.toString()).toBe("1100");
    expect(d!.pct.toString()).toBe("100");
  });
});
