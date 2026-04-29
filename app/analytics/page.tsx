import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { transactions, categories, monthlyIncome } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [spendByMonth, topCats, incomes] = await Promise.all([
    db
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
      ),
    db
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
      .limit(15),
    db.select().from(monthlyIncome).where(eq(monthlyIncome.userId, userId)),
  ]);

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

  const maxSpend = netList.reduce((max, r) => (r.spend.greaterThan(max) ? r.spend : max), new Decimal(0));

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">12-month trend & top spending categories</p>
          </div>
        </div>

        {/* Net trend */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">12-Month Net Trend</h2>
          </div>
          {netList.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Month</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Income</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Spend</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Net</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-40">Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {netList.map((r) => {
                    const isPositive = r.net.greaterThanOrEqualTo(0);
                    const barPct = maxSpend.isZero() ? 0 : r.spend.dividedBy(maxSpend).times(100).toNumber();
                    return (
                      <tr key={`${r.year}-${r.month}`} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium">
                          {r.year}-{String(r.month).padStart(2, "0")}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-sm">{fmt(r.income)}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-sm">{fmt(r.spend)}</td>
                        <td className={`px-5 py-3.5 text-right font-mono text-sm font-semibold ${isPositive ? "text-emerald-600" : "text-destructive"}`}>
                          {fmt(r.net)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${isPositive ? "bg-emerald-500" : "bg-rose-500"}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top categories */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Top Categories — Last 90 days</h2>
          </div>
          {topCats.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No transactions in the last 90 days.</p>
          ) : (
            <div className="divide-y divide-border">
              {topCats.map((c, i) => (
                <div key={c.categoryId} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-sm">{c.nameTh}</span>
                  </div>
                  <span className="font-mono text-sm font-medium">{fmt(new Decimal(c.total))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Chart visualizations (stacked bars, donut, benchmark overlay) ship next iteration.
        </p>
      </div>
    </AppShell>
  );
}

function fmt(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(d.toNumber());
}
