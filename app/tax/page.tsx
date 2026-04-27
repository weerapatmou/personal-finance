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

  // Pull every Transaction in the year alongside its category and any
  // BudgetLine override.
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

  // Default assessable income = sum of MonthlyIncome for the year.
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Tax planner — {year}</h1>
        <form className="mt-2 flex flex-wrap gap-2 text-sm">
          <label className="flex items-center gap-2">
            Year
            <input
              type="number"
              name="year"
              defaultValue={year}
              min={2020}
              max={2100}
              className="w-24 rounded-md border bg-background px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            Assessable income (override)
            <input
              type="text"
              name="income"
              defaultValue={overrideIncome?.toString() ?? ""}
              placeholder={`auto: ${assessableIncome.toFixed(0)}`}
              className="w-40 rounded-md border bg-background px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded-md bg-primary px-3 py-1 text-primary-foreground">
            Apply
          </button>
        </form>
      </header>

      {result.combinedWarning && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          {result.combinedWarning}
        </div>
      )}

      <section>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Bucket</th>
              <th className="py-2 pr-3 text-right">Used</th>
              <th className="py-2 pr-3 text-right">Cap</th>
              <th className="py-2 pr-3 text-right">Headroom</th>
            </tr>
          </thead>
          <tbody>
            {result.buckets.map((b) => (
              <tr key={b.key} className="border-b">
                <td className="py-2 pr-3">
                  <div className="font-medium">{b.label}</div>
                  <div className="text-xs text-muted-foreground">{b.capFormula}</div>
                </td>
                <td className="py-2 pr-3 text-right font-mono">{b.used.toFixed(0)}</td>
                <td className="py-2 pr-3 text-right font-mono">
                  {b.cap ? b.cap.toFixed(0) : "—"}
                </td>
                <td
                  className={`py-2 pr-3 text-right font-mono ${
                    b.warning ? "text-destructive" : ""
                  }`}
                >
                  {b.cap ? b.cap.minus(b.used).toFixed(0) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-muted-foreground">
        Combined retirement contributions: {result.combinedRetirement.toFixed(0)} / {" "}
        {result.combinedRetirementCap.toFixed(0)}
      </p>
    </main>
  );
}
