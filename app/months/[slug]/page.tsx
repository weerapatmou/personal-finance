import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import {
  budgetLines,
  budgetLineDetails,
  transactions,
  monthlyIncome,
  categories,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { aggregateMonth, isOverBudget } from "@/lib/months/aggregate";
import { TOPIC_LABEL_EN } from "@/lib/types";
import type { Topic } from "@/lib/types";
import { Fragment } from "react";
import { CopyPlanButton } from "./copy-plan-button";
import { IncomeEditor } from "./income-editor";
import { BudgetLineForm } from "./budget-line-form";
import { BudgetLineDetailSection } from "./budget-line-detail-section";
import { MonthChart } from "./month-chart";
import type { ChartTopic } from "./month-chart";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";

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

  // Fetch budget line details for all budget lines in this month
  const blIds = bls.map((b) => b.id);
  const details =
    blIds.length > 0
      ? await db
          .select()
          .from(budgetLineDetails)
          .where(
            and(
              eq(budgetLineDetails.userId, userId),
              inArray(budgetLineDetails.budgetLineId, blIds),
            ),
          )
      : [];

  // Group details by budgetLineId
  const detailsByLineId: Record<string, typeof details> = {};
  for (const d of details) {
    if (!detailsByLineId[d.budgetLineId]) detailsByLineId[d.budgetLineId] = [];
    detailsByLineId[d.budgetLineId].push(d);
  }

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

  // Build category lookup for forms (topic → categories)
  const catsByTopic: Record<Topic, typeof cats> = {
    FIX: [],
    VARIABLE: [],
    INVESTMENT: [],
    TAX: [],
  };
  for (const c of cats) {
    catsByTopic[c.topic as Topic].push(c);
  }

  // Chart data
  const chartData: ChartTopic[] = result.groups.map((g) => ({
    topic: TOPIC_LABEL_EN[g.topic],
    plan: g.plannedSubtotal.toNumber(),
    actual: g.actualSubtotal.toNumber(),
  }));

  // All budget lines for the detail section
  const allBudgetLines = bls.map((b) => ({
    id: b.id,
    itemNameTh: b.itemNameTh,
    itemNameEn: b.itemNameEn,
  }));

  const detailsForSection: Record<
    string,
    Array<{ id: string; name: string; amount: string; currency: string }>
  > = {};
  for (const [lineId, lineDetails] of Object.entries(detailsByLineId)) {
    detailsForSection[lineId] = lineDetails.map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      currency: d.currency,
    }));
  }

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/months" label="Months" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{monthLabel(year, month)}</h1>
              <p className={`mt-1 text-sm font-medium ${net.greaterThanOrEqualTo(0) ? "text-emerald-600" : "text-destructive"}`}>
                Net {fmt(net)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <IncomeEditor year={year} month={month} initialAmount={incomeRow?.amount ?? "0"} />
              <CopyPlanButton year={year} month={month} />
            </div>
          </div>
        </div>

        {/* Budget Table */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Category / Item</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Plan</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actual</th>
                </tr>
              </thead>
              {result.groups.map((g) => (
                <tbody key={g.topic} className="divide-y divide-border">
                  <tr className="bg-muted/50">
                    <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground" colSpan={3}>
                      {TOPIC_LABEL_EN[g.topic]}
                    </td>
                  </tr>
                  {g.categories.map((c) => (
                    <Fragment key={c.categoryId}>
                      <tr className="bg-muted/10">
                        <td className="px-5 py-2 pl-8 text-xs italic text-muted-foreground">
                          {c.categoryNameEn} / {c.categoryNameTh}
                        </td>
                        <td className="px-5 py-2 text-right text-xs text-muted-foreground">{fmt(c.plannedSubtotal)}</td>
                        <td className="px-5 py-2 text-right text-xs text-muted-foreground">{fmt(c.actualSubtotal)}</td>
                      </tr>
                      {c.lines.map((l) => {
                        const over = isOverBudget(l.planned, l.actual, overBudgetThreshold);
                        return (
                          <tr key={`${c.categoryId}-${l.budgetLineId ?? "x"}-${l.itemNameTh}`} className="hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-2.5 pl-12">{l.itemNameTh}</td>
                            <td className="px-5 py-2.5 text-right font-mono">{fmt(l.planned)}</td>
                            <td className={`px-5 py-2.5 text-right font-mono ${over ? "font-semibold text-destructive" : ""}`}>
                              {fmt(l.actual)}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                  <tr className="border-t border-border bg-muted/20">
                    <td className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Subtotal {TOPIC_LABEL_EN[g.topic]}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold">{fmt(g.plannedSubtotal)}</td>
                    <td className="px-5 py-2.5 text-right font-semibold">{fmt(g.actualSubtotal)}</td>
                  </tr>
                  {/* Inline add-budget-line form per topic */}
                  <BudgetLineForm
                    year={year}
                    month={month}
                    categories={catsByTopic[g.topic].map((c) => ({
                      id: c.id,
                      nameTh: c.nameTh,
                      nameEn: c.nameEn,
                    }))}
                    topicLabel={TOPIC_LABEL_EN[g.topic]}
                  />
                </tbody>
              ))}
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40">
                  <td className="px-5 py-3 text-right text-sm font-bold uppercase tracking-wider">TOTAL</td>
                  <td className="px-5 py-3 text-right font-bold">{fmt(result.totalPlanned)}</td>
                  <td className="px-5 py-3 text-right font-bold">{fmt(result.totalActual)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Detail Sections */}
        <BudgetLineDetailSection
          budgetLines={allBudgetLines}
          detailsByLineId={detailsForSection}
        />

        {/* Plan vs Actual Chart */}
        <MonthChart data={chartData} />
      </div>
    </AppShell>
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
