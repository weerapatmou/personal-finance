import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { budgetLines, transactions, monthlyIncome } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import Decimal from "decimal.js";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";

type MonthRow = {
  year: number;
  month: number;
  income: string | null;
  totalPlanned: string;
  totalActual: string;
};

export default async function MonthsIndex() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const planRows = await db
    .select({
      year: budgetLines.year,
      month: budgetLines.month,
      total: sql<string>`COALESCE(SUM(${budgetLines.plannedAmount}), 0)::text`,
    })
    .from(budgetLines)
    .where(eq(budgetLines.userId, userId))
    .groupBy(budgetLines.year, budgetLines.month);

  const txRows = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${transactions.date})::int`,
      month: sql<number>`EXTRACT(MONTH FROM ${transactions.date})::int`,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .groupBy(
      sql`EXTRACT(YEAR FROM ${transactions.date})`,
      sql`EXTRACT(MONTH FROM ${transactions.date})`,
    );

  const incomeRows = await db
    .select()
    .from(monthlyIncome)
    .where(eq(monthlyIncome.userId, userId));

  const map = new Map<string, MonthRow>();
  for (const r of planRows) {
    const key = `${r.year}-${r.month}`;
    map.set(key, { year: r.year, month: r.month, income: null, totalPlanned: r.total, totalActual: "0" });
  }
  for (const r of txRows) {
    const key = `${r.year}-${r.month}`;
    const cur = map.get(key) ?? { year: r.year, month: r.month, income: null, totalPlanned: "0", totalActual: "0" };
    cur.totalActual = r.total;
    map.set(key, cur);
  }
  for (const r of incomeRows) {
    const key = `${r.year}-${r.month}`;
    const cur = map.get(key) ?? { year: r.year, month: r.month, income: null, totalPlanned: "0", totalActual: "0" };
    cur.income = r.amount;
    map.set(key, cur);
  }

  const months = Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
        {/* Page header */}
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Months</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Plan vs actual budget per month</p>
            </div>
            <Link
              href="/months/new"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              New month
            </Link>
          </div>
        </div>

        {months.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No months yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first month to start budgeting.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {months.map((m) => {
              const income = new Decimal(m.income ?? "0");
              const planned = new Decimal(m.totalPlanned);
              const actual = new Decimal(m.totalActual);
              const net = income.minus(actual);
              const slug = `${pad4(m.year)}-${pad2(m.month)}`;
              const isPositive = net.greaterThanOrEqualTo(0);

              return (
                <div
                  key={slug}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        {isPositive
                          ? <TrendingUp className="h-5 w-5 text-primary" />
                          : <TrendingDown className="h-5 w-5 text-destructive" />
                        }
                      </div>
                      <div>
                        <p className="font-semibold">{monthLabel(m.year, m.month)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Plan: {fmt(planned)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6">
                      <Kv label="Income" value={fmt(income)} />
                      <Kv label="Actual" value={fmt(actual)} />
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground mb-0.5">Net</p>
                        <p className={`text-sm font-semibold ${isPositive ? "text-emerald-600" : "text-destructive"}`}>
                          {fmt(net)}
                        </p>
                      </div>
                      <Link
                        href={`/months/${slug}`}
                        className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
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

function pad4(n: number): string {
  return n.toString().padStart(4, "0");
}
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
