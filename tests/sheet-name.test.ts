import { describe, expect, it } from "vitest";
import { resolveSheetMonth } from "@/lib/import/sheet-name";

describe("resolveSheetMonth", () => {
  const cases: Array<[string, { year: number; month: number } | null]> = [
    ["JUL2024", { year: 2024, month: 7 }],
    ["JULY 2024", { year: 2024, month: 7 }],
    ["AUG2024", { year: 2024, month: 8 }],
    ["Oct 2024", { year: 2024, month: 10 }],
    ["Nov 2024", { year: 2024, month: 11 }],
    ["DEC 2024", { year: 2024, month: 12 }],
    ["JAN 2025", { year: 2025, month: 1 }],
    ["Mar 2025", { year: 2025, month: 3 }],
    ["June 2025", { year: 2025, month: 6 }],
    ["Sep 2025", { year: 2025, month: 9 }],
    ["Mar 26", { year: 2026, month: 3 }],
    ["Apr 26", { year: 2026, month: 4 }],
    ["Investment Summary", null],
    ["Plan Personal Finance", null],
    ["COMPOUND", null],
    ["Template Finance Detail", null],
    ["Random sheet", null],
  ];

  for (const [name, expected] of cases) {
    it(`resolves "${name}"`, () => {
      expect(resolveSheetMonth(name)).toEqual(expected);
    });
  }
});
