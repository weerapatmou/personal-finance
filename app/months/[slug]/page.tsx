import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import {
  budgetLines,
  transactions,
  monthlyIncome,
  categories,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { aggregateMonth, isOverBudget } from "@/lib/months/aggregate";
import { TOPIC_LABEL_EN } from "@/lib/types";
import type { Topic } from "@/lib/types";
import { CopyPlanButton } from "./copy-plan-button";
import { IncomeEditor } from "./income-editor";

export default async function MonthDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { slug } = await params;
  const m = slug.match(/^(\d{4})-(\d{2})$/);
  if (!m) notFound();
  const year = Number(m[1]);
  const month = Number(m[2]);

  const [bls, txs, cats, incomeRow] = await Promise.all([
    db
      .select()
      .from(budgetLines)
      .where(
        and(
          eq(budgetLines.userId, userId),
          eq(budgetLines.year, year),
          eq(budgetLines.month, month),
        ),
      ),
    db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`EXTRACT(YEAR FROM ${transactions.date}) = ${year}`,
          sql`EXTRACT(MONTH FROM ${transactions.date}) = ${month}`,
        ),
      ),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.query.monthlyIncome.findFirst({
      where: and(
        eq(monthlyIncome.userId, userId),
        eq(monthlyIncome.year, year),
        eq(monthlyIncome.month, month),
      ),
    }),
  ]);

  const result = aggregateMonth({
    budgetLines: bls.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      itemNameTh: b.itemNameTh,
      itemNameEn: b.itemNameEn,
      plannedAmount: b.plannedAmount,
      sortOrder: b.sortOrder,
    })),
    transactions: txs.map((t) => ({
      id: t.id,
      categoryId: t.categoryId,
      budgetLineId: t.budgetLineId,
      amount: t.amount,
      currency: t.currency,
      date: t.date,
    })),
    categories: cats.map((c) => ({
      id: c.id,
      topic: c.topic as Topic,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      sortOrder: c.sortOrder,
    })),
  });

  const income = new Decimal(incomeRow?.amount ?? "0");
  const net = income.minus(result.totalActual);
  const overBudgetThreshold = Number(process.env.OVER_BUDGET_THRESHOLD_PCT ?? "10");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{monthLabel(year, month)}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <IncomeEditor year={year} month={month} initialAmount={incomeRow?.amount ?? "0"} />
          <span className={net.greaterThanOrEqualTo(0) ? "text-emerald-600" : "text-destructive"}>
            Net {fmt(net)}
          </span>
          <CopyPlanButton year={year} month={month} />
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">Category / Item</th>
              <th className="py-2 pr-4 text-right">Plan</th>
              <th className="py-2 pr-4 text-right">Actual</th>
            </tr>
          </thead>
          <tbody>
            {result.groups.map((g) => (
              <tbody key={g.topic}>
                <tr className="bg-muted/50">
                  <td className="py-2 pl-2 font-semibold uppercase tracking-wide" colSpan={3}>
                    {TOPIC_LABEL_EN[g.topic]}
                  </td>
                </tr>
                {g.categories.map((c) => (
                  <>
                    <tr key={`${c.categoryId}-head`} className="text-muted-foreground">
                      <td className="py-1 pl-4 italic">{c.categoryNameEn} / {c.categoryNameTh}</td>
                      <td className="py-1 pr-4 text-right">{fmt(c.plannedSubtotal)}</td>
                      <td className="py-1 pr-4 text-right">{fmt(c.actualSubtotal)}</td>
                    </tr>
                    {c.lines.map((l) => {
                      const over = isOverBudget(l.planned, l.actual, overBudgetThreshold);
                      return (
                        <tr key={`${c.categoryId}-${l.budgetLineId ?? "x"}-${l.itemNameTh}`} className="border-b">
                          <td className="py-1 pl-8">{l.itemNameTh}</td>
                          <td className="py-1 pr-4 text-right">{fmt(l.planned)}</td>
                          <td
                            className={`py-1 pr-4 text-right ${over ? "text-destructive" : ""}`}
                          >
                            {fmt(l.actual)}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
                <tr className="border-b font-semibold">
                  <td className="py-2 pl-2 text-right">Subtotal {TOPIC_LABEL_EN[g.topic]}</td>
                  <td className="py-2 pr-4 text-right">{fmt(g.plannedSubtotal)}</td>
                  <td className="py-2 pr-4 text-right">{fmt(g.actualSubtotal)}</td>
                </tr>
              </tbody>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pl-2 text-right">TOTAL</td>
              <td className="py-2 pr-4 text-right">{fmt(result.totalPlanned)}</td>
              <td className="py-2 pr-4 text-right">{fmt(result.totalActual)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Edit/add controls are minimal in this build — full inline editing lands in the next iteration. For now, use the new-transaction page or the recurring rules to populate this month.
      </p>
    </main>
  );
}

function monthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function fmt(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(d.toNumber());
}
