import { describe, expect, it } from "vitest";
import { parseSheetRows } from "@/lib/import/parse-rows";

describe("parseSheetRows", () => {
  it("parses topic header row, item, category, plan, actual", () => {
    const out = parseSheetRows("Apr 26", [
      { A: "Fix Cost", B: "ค่าผ่อนรถยนต์", C: "Transportation", D: 5000, E: 5000 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      rawTopic: "FIX",
      rawItemName: "ค่าผ่อนรถยนต์",
      rawCategory: "Transportation",
      rawPlan: 5000,
      rawActual: 5000,
    });
  });

  it("handles the column-shift quirk (blank category → plan in C, actual in E)", () => {
    const out = parseSheetRows("Apr 26", [
      { A: "Fix Cost", B: "ค่าผ่อนรถยนต์", C: "Transportation", D: 5000, E: 5000 },
      // Subsequent row in same topic; item in A, no category, plan in C, actual in E.
      { A: "ค่าโทรศัพท์", B: null, C: 430, D: null, E: 427 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      rawItemName: "ค่าโทรศัพท์",
      rawPlan: 430,
      rawActual: 427,
    });
    // Category inherits from the prior row in the same topic.
    expect(out[1]!.rawCategory).toBe("Transportation");
  });

  it("carries topic forward across multiple rows", () => {
    const out = parseSheetRows("Apr 26", [
      { A: "Variable Cost", B: "ค่าน้ำมัน", C: "Transportation", D: 1500, E: 1500 },
      { A: "ค่าน้ำ", B: null, C: 160, D: null, E: 160 },
      { A: "ค่าไฟ", B: null, C: 1000, D: null, E: 533 },
    ]);
    expect(out.map((r) => r.rawTopic)).toEqual(["VARIABLE", "VARIABLE", "VARIABLE"]);
  });

  it("emits the income row with rawTopic=_INCOME_", () => {
    const out = parseSheetRows("Apr 26", [
      { A: "Income", B: null, C: null, D: null, E: 80625 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rawTopic: "_INCOME_", rawActual: 80625 });
  });

  it("skips entirely blank rows", () => {
    const out = parseSheetRows("Apr 26", [
      { A: null, B: null, C: null, D: null, E: null },
      { A: "Tax", B: "ภาษีทั่วไป", C: 4536, D: null, E: 3158 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.rawTopic).toBe("TAX");
  });
});
