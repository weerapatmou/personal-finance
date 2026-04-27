import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { computeDaily } from "@/lib/portfolio/daily";
import { unitsOnDate } from "@/lib/portfolio/units-on-date";

describe("unitsOnDate", () => {
  it("replays only txs up to the given date", () => {
    const txs = [
      { date: "2025-01-01", type: "BUY" as const, units: "10", priceNative: "100" },
      { date: "2025-06-01", type: "BUY" as const, units: "10", priceNative: "200" },
    ];
    expect(unitsOnDate(txs, "2024-12-31").toString()).toBe("0");
    expect(unitsOnDate(txs, "2025-03-15").toString()).toBe("10");
    expect(unitsOnDate(txs, "2025-12-31").toString()).toBe("20");
  });
});

describe("computeDaily", () => {
  it("computes value_base = units * price * fx with LOCF on price + FX", () => {
    const out = computeDaily({
      baseCurrency: "THB",
      holding: { id: "h1", assetClass: "ETF", nativeCurrency: "USD", quoteCurrency: "USD" },
      txs: [{ date: "2026-01-01", type: "BUY", units: "10", priceNative: "100" }],
      prices: [
        { date: "2026-01-01", close: "100" },
        { date: "2026-01-03", close: "110" },
      ],
      fxRates: [
        { date: "2026-01-01", base: "USD", quote: "THB", rate: "33.0" },
        { date: "2026-01-03", base: "USD", quote: "THB", rate: "33.5" },
      ],
      dateRange: ["2026-01-01", "2026-01-02", "2026-01-03"],
    });

    expect(out.length).toBe(3);

    // Day 1: 10 * 100 * 33 = 33,000
    expect(out[0]!.valueBase.toFixed(2)).toBe("33000.00");

    // Day 2: LOCF on both price (100) and FX (33) → 10 * 100 * 33 = 33,000
    expect(out[1]!.valueBase.toFixed(2)).toBe("33000.00");

    // Day 3: new price 110 and FX 33.5 → 10 * 110 * 33.5 = 36,850
    expect(out[2]!.valueBase.toFixed(2)).toBe("36850.00");
  });

  it("LOCFs across a weekend gap (price on Friday only)", () => {
    const out = computeDaily({
      baseCurrency: "THB",
      holding: { id: "h1", assetClass: "STOCK", nativeCurrency: "USD", quoteCurrency: "USD" },
      txs: [{ date: "2026-04-24", type: "BUY", units: "5", priceNative: "200" }],
      prices: [{ date: "2026-04-24", close: "200" }], // Friday only
      fxRates: [{ date: "2026-04-24", base: "USD", quote: "THB", rate: "33.0" }],
      dateRange: ["2026-04-25", "2026-04-26", "2026-04-27"], // Sat, Sun, Mon
    });
    const expected = new Decimal(5).times(200).times(33).toFixed(2);
    for (const day of out) {
      expect(day.valueBase.toFixed(2)).toBe(expected);
    }
  });

  it("marks is_stale when price is older than the asset-class threshold", () => {
    const out = computeDaily({
      baseCurrency: "THB",
      holding: { id: "h1", assetClass: "STOCK", nativeCurrency: "USD", quoteCurrency: "USD" },
      txs: [{ date: "2026-01-01", type: "BUY", units: "5", priceNative: "100" }],
      prices: [{ date: "2026-01-01", close: "100" }],
      fxRates: [{ date: "2026-01-01", base: "USD", quote: "THB", rate: "33.0" }],
      dateRange: ["2026-01-15"], // 14 days later — well past 3-day stale threshold
    });
    expect(out[0]!.isStale).toBe(true);
  });
});
