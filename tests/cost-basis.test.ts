import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { replay, type InvestmentTxInput } from "@/lib/cost-basis";

describe("cost-basis replay()", () => {
  it("computes weighted-average avg_cost across two BUYs", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-10", type: "BUY", units: "10", priceNative: "100", feesNative: "0" },
      { date: "2025-02-15", type: "BUY", units: "10", priceNative: "200", feesNative: "0" },
    ];
    const r = replay(txs);
    expect(r.units.equals(20)).toBe(true);
    // (10*100 + 10*200) / 20 = 150
    expect(r.avgCost.equals(150)).toBe(true);
  });

  it("partial SELL leaves avg_cost unchanged and decreases units", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "10", priceNative: "100" },
      { date: "2025-06-01", type: "SELL", units: "4", priceNative: "150", feesNative: "5" },
    ];
    const r = replay(txs);
    expect(r.units.equals(6)).toBe(true);
    expect(r.avgCost.equals(100)).toBe(true);
    expect(r.realized.length).toBe(1);
    // proceeds = 4*150 - 5 = 595; basis = 4*100 = 400; realized = 195
    expect(r.realized[0]!.realizedNative.equals(195)).toBe(true);
  });

  it("1:10 reverse SPLIT divides units and multiplies avg_cost by 10", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "100", priceNative: "5" },
      { date: "2025-07-01", type: "SPLIT", splitRatio: "0.1" },
    ];
    const r = replay(txs);
    // units: 100 * 0.1 = 10
    // avg_cost: 5 / 0.1 = 50
    expect(r.units.equals(10)).toBe(true);
    expect(r.avgCost.equals(50)).toBe(true);
  });

  it("2-for-1 forward SPLIT doubles units and halves avg_cost", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "10", priceNative: "100" },
      { date: "2025-07-01", type: "SPLIT", splitRatio: "2" },
    ];
    const r = replay(txs);
    expect(r.units.equals(20)).toBe(true);
    expect(r.avgCost.equals(50)).toBe(true);
  });

  it("BUY fees are baked into avg_cost", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "10", priceNative: "100", feesNative: "10" },
    ];
    const r = replay(txs);
    // (10*100 + 10) / 10 = 101
    expect(r.avgCost.equals(101)).toBe(true);
  });

  it("DIVIDEND does not change units or avg_cost", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "10", priceNative: "100" },
      { date: "2025-06-01", type: "DIVIDEND", units: "0", priceNative: "5" },
    ];
    const r = replay(txs);
    expect(r.units.equals(10)).toBe(true);
    expect(r.avgCost.equals(100)).toBe(true);
    expect(r.realized.length).toBe(0);
  });

  it("standalone FEE does not change units or avg_cost", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "10", priceNative: "100" },
      { date: "2025-06-01", type: "FEE", feesNative: "20" },
    ];
    const r = replay(txs);
    expect(r.units.equals(10)).toBe(true);
    expect(r.avgCost.equals(100)).toBe(true);
  });

  it("processes transactions in date order regardless of input order", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-02-15", type: "BUY", units: "10", priceNative: "200" },
      { date: "2025-01-10", type: "BUY", units: "10", priceNative: "100" },
    ];
    const r = replay(txs);
    expect(r.units.equals(20)).toBe(true);
    expect(r.avgCost.equals(150)).toBe(true);
  });

  it("throws when SELL exceeds held units", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "5", priceNative: "100" },
      { date: "2025-06-01", type: "SELL", units: "10", priceNative: "150" },
    ];
    expect(() => replay(txs)).toThrow();
  });

  it("zeroes avg_cost after a complete SELL", () => {
    const txs: InvestmentTxInput[] = [
      { date: "2025-01-01", type: "BUY", units: "10", priceNative: "100" },
      { date: "2025-06-01", type: "SELL", units: "10", priceNative: "150" },
    ];
    const r = replay(txs);
    expect(r.units.equals(0)).toBe(true);
    expect(r.avgCost.equals(0)).toBe(true);
  });

  it("HUYA-style 1:10 reverse split with prior BUYs gives correct post-split basis", () => {
    // Pre-split: 65 shares avg 1.50.
    // Reverse 1:10 → 6.5 shares avg 15.00. Decimal precision test.
    const txs: InvestmentTxInput[] = [
      { date: "2024-01-01", type: "BUY", units: "30", priceNative: "1.20" },
      { date: "2024-06-01", type: "BUY", units: "35", priceNative: "1.7571428571" },
      { date: "2025-03-01", type: "SPLIT", splitRatio: "0.1" },
    ];
    const r = replay(txs);
    expect(r.units.toFixed(4)).toBe("6.5000");
    // Pre-split weighted avg = (30*1.2 + 35*1.7571428571) / 65
    // = (36 + 61.5) / 65 = 97.5 / 65 = 1.5
    // Post-split avg = 1.5 / 0.1 = 15
    expect(r.avgCost.toFixed(4)).toBe(new Decimal("15").toFixed(4));
  });
});
