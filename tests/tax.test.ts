import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { computeBuckets } from "@/lib/tax/buckets";

describe("computeBuckets", () => {
  it("computes RMF cap = min(30% income, ฿500k) and PF cap = min(15% income, ฿500k)", () => {
    const r = computeBuckets({
      assessableIncome: new Decimal(1_000_000),
      contributions: [
        {
          taxTreatment: "PIT_DEDUCT",
          categoryNameTh: "RMF (ลดหย่อนภาษี)",
          amount: new Decimal(50_000),
          date: "2026-03-01",
        },
        {
          taxTreatment: "PF_CONTRIB",
          categoryNameTh: "Provident Fund",
          amount: new Decimal(60_000),
          date: "2026-03-01",
        },
      ],
    });
    const rmf = r.buckets.find((b) => b.key === "RMF")!;
    const pf = r.buckets.find((b) => b.key === "PF_OWN")!;
    // 30% × 1M = 300k; min(300k, 500k) = 300k
    expect(rmf.cap!.toFixed(0)).toBe("300000");
    // 15% × 1M = 150k; min(150k, 500k) = 150k
    expect(pf.cap!.toFixed(0)).toBe("150000");
  });

  it("flags combined retirement contributions over ฿500,000", () => {
    const r = computeBuckets({
      assessableIncome: new Decimal(2_500_000),
      contributions: [
        {
          taxTreatment: "PIT_DEDUCT",
          categoryNameTh: "RMF",
          amount: new Decimal(300_000),
          date: "2026-03-01",
        },
        {
          taxTreatment: "PF_CONTRIB",
          categoryNameTh: "Provident Fund",
          amount: new Decimal(250_000),
          date: "2026-03-01",
        },
      ],
    });
    expect(r.combinedWarning).toMatch(/exceed/);
  });

  it("SSF cap is min(30% income, ฿200,000)", () => {
    const r = computeBuckets({
      assessableIncome: new Decimal(2_000_000),
      contributions: [
        {
          taxTreatment: "PIT_DEDUCT",
          categoryNameTh: "SSF Fund",
          amount: new Decimal(180_000),
          date: "2026-03-01",
        },
      ],
    });
    const ssf = r.buckets.find((b) => b.key === "SSF")!;
    expect(ssf.cap!.toFixed(0)).toBe("200000"); // min(600k, 200k)
    expect(ssf.warning).toBeUndefined();
  });

  it("SSO cap is ฿9,000 regardless of income", () => {
    const r = computeBuckets({
      assessableIncome: new Decimal(10_000_000),
      contributions: [
        {
          taxTreatment: "SSO_CONTRIB",
          categoryNameTh: "SSO",
          amount: new Decimal(9_000),
          date: "2026-12-31",
        },
      ],
    });
    const sso = r.buckets.find((b) => b.key === "SSO")!;
    expect(sso.cap!.toFixed(0)).toBe("9000");
    expect(sso.warning).toBeUndefined();
  });
});
