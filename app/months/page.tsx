import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { budgetLines, transactions, monthlyIncome } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import Decimal from "decimal.js";

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

  // Plan totals per month
  const planRows = await db
    .select({
      year: budgetLines.year,
      month: budgetLines.month,
      total: sql<string>`COALESCE(SUM(${budgetLines.plannedAmount}), 0)::text`,
    })
    .from(budgetLines)
    .where(eq(budgetLines.userId, userId))
    .groupBy(budgetLines.year, budgetLines.month);

  // Actual totals per month
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

  // Merge into month rows.
  const map = new Map<string, MonthRow>();
  for (const r of planRows) {
    const key = `${r.year}-${r.month}`;
    map.set(key, {
      year: r.year,
      month: r.month,
      income: null,
      totalPlanned: r.total,
      totalActual: "0",
    });
  }
  for (const r of txRows) {
    const key = `${r.year}-${r.month}`;
    const cur = map.get(key) ?? {
      year: r.year,
      month: r.month,
      income: null,
      totalPlanned: "0",
      totalActual: "0",
    };
    cur.totalActual = r.total;
    map.set(key, cur);
  }
  for (const r of incomeRows) {
    const key = `${r.year}-${r.month}`;
    const cur = map.get(key) ?? {
      year: r.year,
      month: r.month,
      income: null,
      totalPlanned: "0",
      totalActual: "0",
    };
    cur.income = r.amount;
    map.set(key, cur);
  }

  const months = Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Months</h1>
        <Link
          href="/months/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          New month
        </Link>
      </header>

      {months.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          No months yet. Create your first month to start budgeting.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {months.map((m) => {
            const income = new Decimal(m.income ?? "0");
            const planned = new Decimal(m.totalPlanned);
            const actual = new Decimal(m.totalActual);
            const net = income.minus(actual);
            const slug = `${pad4(m.year)}-${pad2(m.month)}`;
            return (
              <li
                key={slug}
                className="grid grid-cols-1 gap-3 rounded-md border p-4 sm:grid-cols-5 sm:items-center"
              >
                <div className="font-medium">{monthLabel(m.year, m.month)}</div>
                <KV label="Income" value={fmt(income)} />
                <KV label="Plan" value={fmt(planned)} />
                <KV label="Actual" value={fmt(actual)} />
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span
                    className={`text-sm font-medium ${
                      net.greaterThanOrEqualTo(0) ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    Net {fmt(net)}
                  </span>
                  <Link
                    href={`/months/${slug}`}
                    className="text-sm text-primary underline hover:opacity-80"
                  >
                    View
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
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
