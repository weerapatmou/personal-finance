import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { project } from "@/lib/retirement/projection";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { TrendingUp, Clock, AlertCircle } from "lucide-react";

const DEFAULTS = {
  currentAge: 30,
  retirementAge: 60,
  endAge: 100,
  currentNetWorth: "500000",
  monthlySavings: "30000",
  expectedRealReturnPct: 5,
  expectedInflationPct: 3,
  targetMonthlyExpense: "40000",
};

const FIELDS = [
  { label: "Current age", name: "currentAge", type: "number" },
  { label: "Retirement age", name: "retirementAge", type: "number" },
  { label: "End age", name: "endAge", type: "number" },
  { label: "Current net worth (THB)", name: "currentNetWorth", type: "text" },
  { label: "Monthly savings (THB)", name: "monthlySavings", type: "text" },
  { label: "Expected real return %", name: "expectedRealReturnPct", type: "number" },
  { label: "Expected inflation %", name: "expectedInflationPct", type: "number" },
  { label: "Target monthly expense (THB, today)", name: "targetMonthlyExpense", type: "text" },
];

export default async function RetirementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const params = await searchParams;

  const inputs = {
    currentAge: Number(params.currentAge ?? DEFAULTS.currentAge),
    retirementAge: Number(params.retirementAge ?? DEFAULTS.retirementAge),
    endAge: Number(params.endAge ?? DEFAULTS.endAge),
    currentNetWorth: new Decimal(params.currentNetWorth ?? DEFAULTS.currentNetWorth),
    monthlySavings: new Decimal(params.monthlySavings ?? DEFAULTS.monthlySavings),
    expectedRealReturnPct: Number(params.expectedRealReturnPct ?? DEFAULTS.expectedRealReturnPct),
    expectedInflationPct: Number(params.expectedInflationPct ?? DEFAULTS.expectedInflationPct),
    targetMonthlyExpense: new Decimal(params.targetMonthlyExpense ?? DEFAULTS.targetMonthlyExpense),
  };

  const result = project(inputs);
  const last = result.rows[result.rows.length - 1];

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Retirement Projection</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-return FIRE model — target expense in today&apos;s THB, net of inflation.
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">FIRE Number</p>
            </div>
            <p className="text-2xl font-bold">{fmt(result.fireNumber)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-primary" />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance at End Age</p>
            </div>
            <p className="text-2xl font-bold">{fmt(last?.yearEndBalance ?? new Decimal(0))}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className={`h-4 w-4 ${result.runsOutAtAge ? "text-destructive" : "text-emerald-600"}`} />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Money Runs Out</p>
            </div>
            <p className={`text-2xl font-bold ${result.runsOutAtAge ? "text-destructive" : "text-emerald-600"}`}>
              {result.runsOutAtAge ? `Age ${result.runsOutAtAge}` : "Never"}
            </p>
          </div>
        </div>

        {/* Inputs form */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Parameters</h2>
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map(({ label, name, type }) => (
              <label key={name} className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-muted-foreground">{label}</span>
                <input
                  type={type}
                  name={name}
                  defaultValue={String(inputs[name as keyof typeof inputs])}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                />
              </label>
            ))}
            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
              >
                Recompute
              </button>
            </div>
          </form>
        </div>

        {/* Projection table */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Projection Table <span className="text-muted-foreground font-normal">(every 5 years)</span></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Age</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Start</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Contribution</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Market Gain</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Withdrawal</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">End</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows
                  .filter((_, i) => i % 5 === 0 || i === result.rows.length - 1)
                  .map((r) => (
                    <tr key={r.age} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium">{r.age}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm">{fmt(r.yearStartBalance)}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm">{fmt(r.contribution)}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm">{fmt(r.marketGain)}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm">{fmt(r.withdrawal)}</td>
                      <td className="px-5 py-3 text-right font-mono text-sm font-semibold">{fmt(r.yearEndBalance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function fmt(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(d.toNumber());
}
