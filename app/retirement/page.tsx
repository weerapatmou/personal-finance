import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { project } from "@/lib/retirement/projection";

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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Retirement projection</h1>
        <p className="text-sm text-muted-foreground">
          Replaces the broken COMPOUND sheet. Real-return model: target expense is in today's THB,
          return is real (net of inflation).
        </p>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
        {[
          ["Current age", "currentAge", inputs.currentAge.toString(), "number"],
          ["Retirement age", "retirementAge", inputs.retirementAge.toString(), "number"],
          ["End age", "endAge", inputs.endAge.toString(), "number"],
          ["Current net worth (THB)", "currentNetWorth", inputs.currentNetWorth.toString(), "text"],
          ["Monthly savings (THB)", "monthlySavings", inputs.monthlySavings.toString(), "text"],
          [
            "Expected real return %",
            "expectedRealReturnPct",
            inputs.expectedRealReturnPct.toString(),
            "number",
          ],
          [
            "Expected inflation %",
            "expectedInflationPct",
            inputs.expectedInflationPct.toString(),
            "number",
          ],
          [
            "Target monthly expense (THB, today)",
            "targetMonthlyExpense",
            inputs.targetMonthlyExpense.toString(),
            "text",
          ],
        ].map(([label, name, value, type]) => (
          <label key={name} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <input
              type={type}
              name={name}
              defaultValue={value}
              className="rounded-md border bg-background px-3 py-2"
            />
          </label>
        ))}
        <button
          type="submit"
          className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground sm:col-span-2"
        >
          Recompute
        </button>
      </form>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="FIRE number" value={fmt(result.fireNumber)} />
        <Stat label="Balance at end-age" value={fmt(last?.yearEndBalance ?? new Decimal(0))} />
        <Stat
          label="Money runs out at"
          value={result.runsOutAtAge ? `age ${result.runsOutAtAge}` : "never"}
        />
      </section>

      <section className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 pr-3 text-left">Age</th>
              <th className="py-2 pr-3 text-right">Start</th>
              <th className="py-2 pr-3 text-right">Contribution</th>
              <th className="py-2 pr-3 text-right">Market gain</th>
              <th className="py-2 pr-3 text-right">Withdrawal</th>
              <th className="py-2 pr-3 text-right">End</th>
            </tr>
          </thead>
          <tbody>
            {result.rows
              .filter((_, i) => i % 5 === 0 || i === result.rows.length - 1)
              .map((r) => (
                <tr key={r.age} className="border-b">
                  <td className="py-1 pr-3">{r.age}</td>
                  <td className="py-1 pr-3 text-right font-mono">{fmt(r.yearStartBalance)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{fmt(r.contribution)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{fmt(r.marketGain)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{fmt(r.withdrawal)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{fmt(r.yearEndBalance)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function fmt(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(d.toNumber());
}
