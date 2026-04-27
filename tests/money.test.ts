import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  add,
  convert,
  format,
  MissingFxRateError,
  money,
  multiply,
  subtract,
  UnknownCurrencyError,
  type FxRow,
} from "@/lib/money";

const fxRows: FxRow[] = [
  { date: "2026-04-24", base: "USD", quote: "THB", rate: "33.40" }, // Friday
  { date: "2026-04-25", base: "USD", quote: "THB", rate: "33.45" }, // Saturday (rare)
  { date: "2026-04-27", base: "USD", quote: "THB", rate: "33.60" }, // Monday
];

describe("money", () => {
  it("converts USD to THB at the exact-date rate", () => {
    const usd = money("100", "USD");
    const thb = convert(usd, "THB", "2026-04-27", fxRows);
    expect(thb.currency).toBe("THB");
    expect(thb.amount.equals(new Decimal("3360.00"))).toBe(true);
  });

  it("LOCFs to the most recent prior rate when no rate exists for the request date", () => {
    // Sunday — no row. Should fall back to Saturday (33.45).
    const usd = money("100", "USD");
    const thb = convert(usd, "THB", "2026-04-26", fxRows);
    expect(thb.amount.equals(new Decimal("3345.00"))).toBe(true);
  });

  it("LOCFs across a weekend gap when only Friday has a rate", () => {
    const friday: FxRow[] = [
      { date: "2026-04-24", base: "USD", quote: "THB", rate: "33.40" },
    ];
    const usd = money("100", "USD");
    const monday = convert(usd, "THB", "2026-04-27", friday);
    expect(monday.amount.equals(new Decimal("3340.00"))).toBe(true);
  });

  it("returns the input unchanged on same-currency convert", () => {
    const thb = money("500", "THB");
    const out = convert(thb, "THB", "2026-04-27", fxRows);
    expect(out).toBe(thb);
  });

  it("uses inverse FX when only the reverse direction is available", () => {
    // Want THB->USD, but only USD->THB rows exist. convert() should compute
    // the inverse: amount / rate.
    const onlyUsdThb: FxRow[] = [
      { date: "2026-04-27", base: "USD", quote: "THB", rate: "33.50" },
    ];
    const thb = money("33500", "THB");
    const usd = convert(thb, "USD", "2026-04-27", onlyUsdThb);
    // 33500 * (1 / 33.50) = 1000
    expect(usd.amount.toFixed(2)).toBe("1000.00");
  });

  it("throws UnknownCurrencyError on unknown currency", () => {
    // @ts-expect-error -- testing runtime guard
    expect(() => money("1", "JPY")).toThrow(UnknownCurrencyError);
  });

  it("throws MissingFxRateError when no rate exists at or before the date", () => {
    const future = money("1", "USD");
    expect(() => convert(future, "THB", "2020-01-01", fxRows)).toThrow(MissingFxRateError);
  });

  it("add / subtract / multiply preserve currency and use Decimal arithmetic", () => {
    const a = money("0.10", "THB");
    const b = money("0.20", "THB");
    expect(add(a, b).amount.equals(new Decimal("0.30"))).toBe(true);
    expect(subtract(b, a).amount.equals(new Decimal("0.10"))).toBe(true);
    expect(multiply(a, "3").amount.equals(new Decimal("0.30"))).toBe(true);
  });

  it("add throws when currencies differ", () => {
    expect(() => add(money("1", "THB"), money("1", "USD"))).toThrow();
  });

  it("format produces locale-aware currency strings", () => {
    const thb = money("1234.56", "THB");
    const out = format(thb, "th-TH");
    expect(out).toContain("1,234.56");
  });
});
