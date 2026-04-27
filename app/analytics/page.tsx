import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { transactions, categories, monthlyIncome } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // 12-month spend trend by topic.
  const spendByMonth = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${transactions.date})::int`,
      month: sql<number>`EXTRACT(MONTH FROM ${transactions.date})::int`,
      topic: categories.topic,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.userId, userId))
    .groupBy(
      sql`EXTRACT(YEAR FROM ${transactions.date})`,
      sql`EXTRACT(MONTH FROM ${transactions.date})`,
      categories.topic,
    );

  // Top categories by spend (last 90 days).
  const topCats = await db
    .select({
      categoryId: categories.id,
      nameTh: categories.nameTh,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      sql`${transactions.userId} = ${userId} AND ${transactions.date} >= NOW() - INTERVAL '90 days'`,
    )
    .groupBy(categories.id, categories.nameTh)
    .orderBy(sql`SUM(${transactions.amount}) DESC`)
    .limit(15);

  // Net per month: income - actual.
  const incomes = await db.select().from(monthlyIncome).where(eq(monthlyIncome.userId, userId));

  const netRows = new Map<string, { income: Decimal; spend: Decimal }>();
  for (const i of incomes) {
    const key = `${i.year}-${i.month}`;
    netRows.set(key, { income: new Decimal(i.amount), spend: new Decimal(0) });
  }
  for (const s of spendByMonth) {
    const key = `${s.year}-${s.month}`;
    const cur = netRows.get(key) ?? { income: new Decimal(0), spend: new Decimal(0) };
    cur.spend = cur.spend.plus(s.total);
    netRows.set(key, cur);
  }
  const netList = Array.from(netRows.entries())
    .map(([k, v]) => {
      const [y, m] = k.split("-").map(Number);
      return { year: y!, month: m!, income: v.income, spend: v.spend, net: v.income.minus(v.spend) };
    })
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month))
    .slice(0, 12);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <section>
        <h2 className="mb-2 text-lg font-medium">12-month Net Trend</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 pr-4 text-left">Month</th>
              <th className="py-2 pr-4 text-right">Income</th>
              <th className="py-2 pr-4 text-right">Spend</th>
              <th className="py-2 pr-4 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {netList.map((r) => (
              <tr key={`${r.year}-${r.month}`} className="border-b">
                <td className="py-2 pr-4 font-mono">
                  {r.year}-{String(r.month).padStart(2, "0")}
                </td>
                <td className="py-2 pr-4 text-right font-mono">{fmt(r.income)}</td>
                <td className="py-2 pr-4 text-right font-mono">{fmt(r.spend)}</td>
                <td
                  className={`py-2 pr-4 text-right font-mono ${
                    r.net.greaterThanOrEqualTo(0) ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {fmt(r.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Top categories — last 90 days</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {topCats.map((c) => (
            <li key={c.categoryId} className="flex items-center justify-between">
              <span>{c.nameTh}</span>
              <span className="font-mono">{fmt(new Decimal(c.total))}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        Chart visualizations (stacked bars, donut, benchmark overlay) ship next iteration. Tables
        above are derived from the same SQL aggregates that the charts will consume.
      </p>
    </main>
  );
}

function fmt(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(d.toNumber());
}
