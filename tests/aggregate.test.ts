import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { aggregateMonth, isOverBudget } from "@/lib/months/aggregate";

const cats = [
  { id: "cat-fix-1", topic: "FIX" as const, nameTh: "ค่าผ่อนรถยนต์", nameEn: "Car Loan", sortOrder: 1 },
  { id: "cat-var-1", topic: "VARIABLE" as const, nameTh: "ค่าน้ำมัน", nameEn: "Gas", sortOrder: 1 },
  { id: "cat-inv-1", topic: "INVESTMENT" as const, nameTh: "Invest ระยะยาว", nameEn: "Long-term", sortOrder: 1 },
];

describe("aggregateMonth", () => {
  it("groups budget lines by topic and sums Plan + Actual correctly", () => {
    const r = aggregateMonth({
      categories: cats,
      budgetLines: [
        { id: "bl-1", categoryId: "cat-fix-1", itemNameTh: "ผ่อน", itemNameEn: null, plannedAmount: "5000", sortOrder: 1 },
        { id: "bl-2", categoryId: "cat-var-1", itemNameTh: "น้ำมัน", itemNameEn: null, plannedAmount: "1500", sortOrder: 2 },
      ],
      transactions: [
        { id: "tx-1", categoryId: "cat-fix-1", budgetLineId: "bl-1", amount: "5000", currency: "THB", date: "2026-04-15" },
        { id: "tx-2", categoryId: "cat-var-1", budgetLineId: "bl-2", amount: "1700", currency: "THB", date: "2026-04-20" },
      ],
    });

    expect(r.totalPlanned.toFixed(2)).toBe("6500.00");
    expect(r.totalActual.toFixed(2)).toBe("6700.00");

    const fix = r.groups.find((g) => g.topic === "FIX")!;
    expect(fix.plannedSubtotal.toFixed(2)).toBe("5000.00");
    expect(fix.actualSubtotal.toFixed(2)).toBe("5000.00");

    const variable = r.groups.find((g) => g.topic === "VARIABLE")!;
    expect(variable.actualSubtotal.toFixed(2)).toBe("1700.00");
  });

  it("sums multiple transactions against the same budget line", () => {
    const r = aggregateMonth({
      categories: cats,
      budgetLines: [
        { id: "bl-1", categoryId: "cat-var-1", itemNameTh: "อาหาร", itemNameEn: null, plannedAmount: "7000", sortOrder: 1 },
      ],
      transactions: [
        { id: "tx-1", categoryId: "cat-var-1", budgetLineId: "bl-1", amount: "1000", currency: "THB", date: "2026-04-01" },
        { id: "tx-2", categoryId: "cat-var-1", budgetLineId: "bl-1", amount: "2500", currency: "THB", date: "2026-04-15" },
        { id: "tx-3", categoryId: "cat-var-1", budgetLineId: "bl-1", amount: "750.50", currency: "THB", date: "2026-04-30" },
      ],
    });

    const variable = r.groups.find((g) => g.topic === "VARIABLE")!;
    const line = variable.categories[0]!.lines[0]!;
    expect(line.actual.toFixed(2)).toBe("4250.50");
  });

  it("creates an Uncategorized line for transactions with no budget_line_id", () => {
    const r = aggregateMonth({
      categories: cats,
      budgetLines: [],
      transactions: [
        { id: "tx-1", categoryId: "cat-var-1", budgetLineId: null, amount: "500", currency: "THB", date: "2026-04-10" },
      ],
    });
    const variable = r.groups.find((g) => g.topic === "VARIABLE")!;
    expect(variable.categories.length).toBe(1);
    expect(variable.categories[0]!.lines[0]!.budgetLineId).toBeNull();
    expect(variable.categories[0]!.lines[0]!.actual.toFixed(2)).toBe("500.00");
  });

  it("orders topic groups FIX → VARIABLE → INVESTMENT → TAX deterministically", () => {
    const r = aggregateMonth({
      categories: cats,
      budgetLines: [
        { id: "bl-1", categoryId: "cat-inv-1", itemNameTh: "หุ้น", itemNameEn: null, plannedAmount: "10000", sortOrder: 1 },
        { id: "bl-2", categoryId: "cat-fix-1", itemNameTh: "ผ่อน", itemNameEn: null, plannedAmount: "5000", sortOrder: 1 },
      ],
      transactions: [],
    });
    expect(r.groups.map((g) => g.topic)).toEqual(["FIX", "VARIABLE", "INVESTMENT", "TAX"]);
  });
});

describe("isOverBudget", () => {
  it("returns true when actual exceeds plan by more than threshold pct", () => {
    expect(isOverBudget(new Decimal(100), new Decimal(115), 10)).toBe(true);
    expect(isOverBudget(new Decimal(100), new Decimal(110), 10)).toBe(false);
    expect(isOverBudget(new Decimal(100), new Decimal(110.01), 10)).toBe(true);
  });

  it("returns false when planned is zero (no plan, no overspend)", () => {
    expect(isOverBudget(new Decimal(0), new Decimal(99999), 10)).toBe(false);
  });
});
