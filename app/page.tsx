import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/db";
import { monthlyIncome } from "@/db/schema";
import { sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { AppShell } from "@/components/app-shell";
import { CurrencySelector } from "@/components/currency-selector";
import { YearSelector } from "./year-selector";
import {
  Calendar,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

const QUICK_NAV = [
  {
    href: "/months",
    label: "Months",
    description: "Plan vs Actual ledger",
    icon: Calendar,
    color: "bg-violet-100 text-violet-600",
  },
  {
    href: "/analytics",
    label: "Analytics",
    description: "Trends & categories",
    icon: BarChart2,
    color: "bg-indigo-100 text-indigo-600",
  },
];

interface OverviewPageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;
  const params = await searchParams;

  const currentYear = new Date().getFullYear();
  const parsedYear = Number(params.year);
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : currentYear;

  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  if (!years.includes(year)) years.unshift(year);

  const [t, incomeResult, spendResult] = await Promise.all([
    getTranslations("Home"),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${monthlyIncome.amount}), 0)::text`,
      })
      .from(monthlyIncome)
      .where(sql`${monthlyIncome.userId} = ${userId} AND ${monthlyIncome.year} = ${year}`),
    db.execute<{ total: string }>(sql`
      SELECT (
        (SELECT COALESCE(SUM(manual_actual), 0)
           FROM budget_lines
           WHERE user_id = ${userId} AND year = ${year} AND manual_actual IS NOT NULL)
        +
        (SELECT COALESCE(SUM(t.amount), 0)
           FROM transactions t
           LEFT JOIN budget_lines bl ON t.budget_line_id = bl.id
           WHERE t.user_id = ${userId}
             AND EXTRACT(YEAR FROM t.date) = ${year}
             AND bl.manual_actual IS NULL)
      )::text AS total
    `),
  ]);

  const [incomeRow] = incomeResult;
  const [spendRow] = spendResult;

  const income = new Decimal(incomeRow?.total ?? "0");
  const spend = new Decimal(spendRow?.total ?? "0");
  const net = income.minus(spend);

  const greeting = t("greeting", {
    name: session.user.name ?? session.user.username ?? "",
  });

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 pt-8 lg:pt-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Here&apos;s your financial overview for {year}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Year</span>
              <YearSelector selectedYear={year} years={years} />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Display currency</span>
              <CurrencySelector userId={userId} />
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label={`${year} Income`}
            value={fmt(income)}
            icon={<ArrowUpRight className="h-4 w-4" />}
            iconBg="bg-emerald-100 text-emerald-600"
            trend={income.isZero() ? null : "up"}
          />
          <StatCard
            label={`${year} Spend`}
            value={fmt(spend)}
            icon={<ArrowDownRight className="h-4 w-4" />}
            iconBg="bg-rose-100 text-rose-600"
            trend={spend.isZero() ? null : "down"}
          />
          <StatCard
            label="Net Savings"
            value={fmt(net)}
            icon={<Minus className="h-4 w-4" />}
            iconBg={net.isNegative() ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"}
            valueColor={net.isNegative() ? "text-destructive" : "text-emerald-600"}
            trend={null}
          />
        </div>

        {/* Quick navigation */}
        <div>
          <h2 className="mb-4 text-base font-semibold">Quick Access</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {QUICK_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon,
  iconBg,
  trend,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  trend: "up" | "down" | null;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className={`mt-3 text-2xl font-bold tracking-tight ${valueColor ?? "text-foreground"}`}>
        {value}
      </p>
      {trend && (
        <p
          className={`mt-1 text-xs font-medium ${trend === "up" ? "text-emerald-600" : "text-rose-600"}`}
        >
          {trend === "up" ? "↑ This year" : "↓ This year"}
        </p>
      )}
    </div>
  );
}

function fmt(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(d.toNumber());
}
