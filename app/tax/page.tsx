import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  transactions,
  budgetLines,
  categories,
  monthlyIncome,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { computeBuckets, type TaxContribution } from "@/lib/tax/buckets";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { AlertTriangle } from "lucide-react";

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; income?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const params = await searchParams;
  const year = Number(params.year ?? new Date().getFullYear());
  const overrideIncome = params.income ? new Decimal(params.income) : null;

  const rows = await db
    .select({
      txId: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryNameTh: categories.nameTh,
      categoryTaxTreatment: categories.taxTreatment,
      budgetLineOverride: budgetLines.taxTreatmentOverride,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(budgetLines, eq(transactions.budgetLineId, budgetLines.id))
    .where(
      sql`${transactions.userId} = ${userId} AND EXTRACT(YEAR FROM ${transactions.date}) = ${year}`,
    );

  const contributions: TaxContribution[] = rows
    .map((r) => ({
      taxTreatment: (r.budgetLineOverride ?? r.categoryTaxTreatment) as TaxContribution["taxTreatment"],
      categoryNameTh: r.categoryNameTh,
      amount: new Decimal(r.amount),
      date: r.date,
    }))
    .filter((c) => c.taxTreatment !== "NONE");

  let assessableIncome = overrideIncome;
  if (!assessableIncome) {
    const inc = await db
      .select({ total: sql<string>`COALESCE(SUM(${monthlyIncome.amount}), 0)::text` })
      .from(monthlyIncome)
      .where(sql`${monthlyIncome.userId} = ${userId} AND ${monthlyIncome.year} = ${year}`);
    assessableIncome = new Decimal(inc[0]?.total ?? "0");
  }

  const result = computeBuckets({ assessableIncome, contributions });

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tax Planner — {year}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Thai PIT caps and contribution headroom</p>
          </div>
        </div>

        {/* Filter form */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Parameters</h2>
          <form className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Year</span>
              <input
                type="number"
                name="year"
                defaultValue={year}
                min={2020}
                max={2100}
                className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Assessable income (override)</span>
              <input
                type="text"
                name="income"
                defaultValue={overrideIncome?.toString() ?? ""}
                placeholder={`auto: ${assessableIncome.toFixed(0)}`}
                className="w-48 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          </form>
        </div>

        {result.combinedWarning && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            {result.combinedWarning}
          </div>
        )}

        {/* Buckets table */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Contribution Buckets</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Bucket</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Used</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Cap</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Headroom</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.buckets.map((b) => {
                  const headroom = b.cap ? b.cap.minus(b.used) : null;
                  const isWarning = b.warning;
                  return (
                    <tr key={b.key} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium">{b.label}</p>
                        <p className="text-xs text-muted-foreground">{b.capFormula}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono">{b.used.toFixed(0)}</td>
                      <td className="px-5 py-3.5 text-right font-mono">{b.cap ? b.cap.toFixed(0) : "—"}</td>
                      <td className={`px-5 py-3.5 text-right font-mono font-medium ${isWarning ? "text-destructive" : ""}`}>
                        {headroom ? headroom.toFixed(0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Combined retirement contributions: {result.combinedRetirement.toFixed(0)} /{" "}
          {result.combinedRetirementCap.toFixed(0)}
        </p>
      </div>
    </AppShell>
  );
}
