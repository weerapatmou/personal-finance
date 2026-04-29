import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { holdings, investmentTxs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import Decimal from "decimal.js";
import { replay } from "@/lib/cost-basis";
import type { InvestmentTxInput, ReplayResult } from "@/lib/cost-basis";

export default async function PortfolioDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Latest PortfolioDaily per holding.
  const latestRows = await db.execute<{
    holding_id: string;
    date: string;
    units_held: string;
    price_native: string;
    price_currency: string;
    value_base: string;
    is_stale: boolean;
  }>(sql`
    SELECT DISTINCT ON (holding_id)
      holding_id, date, units_held, price_native, price_currency, value_base, is_stale
    FROM portfolio_daily
    WHERE user_id = ${userId}
    ORDER BY holding_id, date DESC
  `);

  const allHoldings = await db.select().from(holdings).where(eq(holdings.userId, userId));
  const allTxs = await db.select().from(investmentTxs).where(eq(investmentTxs.userId, userId));

  // Per-holding cost basis (replay).
  const txByHolding = new Map<string, InvestmentTxInput[]>();
  for (const t of allTxs) {
    const arr = txByHolding.get(t.holdingId) ?? [];
    arr.push({
      date: t.date,
      type: t.type as InvestmentTxInput["type"],
      units: t.units,
      priceNative: t.priceNative,
      feesNative: t.feesNative,
      splitRatio: t.splitRatio,
    });
    txByHolding.set(t.holdingId, arr);
  }

  type Row = {
    id: string;
    name: string;
    assetClass: string;
    nativeCurrency: string;
    units: Decimal;
    avgCost: Decimal;
    currentPrice: Decimal;
    valueBase: Decimal;
    pnlPct: Decimal | null;
    isStale: boolean;
  };

  const rowsArr = Array.from(latestRows as unknown as Iterable<{
    holding_id: string;
    date: string;
    units_held: string;
    price_native: string;
    price_currency: string;
    value_base: string;
    is_stale: boolean;
  }>);

  const dashboardRows: Row[] = allHoldings.map((h) => {
    const dailyRow = rowsArr.find((r) => r.holding_id === h.id);
    const txs = txByHolding.get(h.id) ?? [];
    const cb: ReplayResult = replay(txs);
    const currentPrice = dailyRow ? new Decimal(dailyRow.price_native) : new Decimal(0);
    const valueBase = dailyRow ? new Decimal(dailyRow.value_base) : new Decimal(0);
    const pnlPct = cb.avgCost.isZero()
      ? null
      : currentPrice.minus(cb.avgCost).dividedBy(cb.avgCost).times(100);
    return {
      id: h.id,
      name: h.name,
      assetClass: h.assetClass,
      nativeCurrency: h.nativeCurrency,
      units: cb.units,
      avgCost: cb.avgCost,
      currentPrice,
      valueBase,
      pnlPct,
      isStale: dailyRow?.is_stale ?? true,
    };
  });

  const totalNetWorth = dashboardRows.reduce((s, r) => s.plus(r.valueBase), new Decimal(0));

  const allocationByClass = new Map<string, Decimal>();
  for (const r of dashboardRows) {
    const cur = allocationByClass.get(r.assetClass) ?? new Decimal(0);
    allocationByClass.set(r.assetClass, cur.plus(r.valueBase));
  }
  const allocation = Array.from(allocationByClass.entries())
    .map(([cls, val]) => ({
      cls,
      val,
      pct: totalNetWorth.isZero() ? new Decimal(0) : val.dividedBy(totalNetWorth).times(100),
    }))
    .sort((a, b) => (a.val.greaterThan(b.val) ? -1 : 1));

  const staleHoldings = dashboardRows.filter((r) => r.isStale);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <Link
          href="/portfolio/holdings/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Add holding
        </Link>
      </header>

      {staleHoldings.length > 0 && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          <strong>Stale data:</strong> {staleHoldings.map((r) => r.name).join(", ")}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Net Worth" value={fmt(totalNetWorth)} />
        <Stat label="Holdings" value={String(dashboardRows.length)} />
        <Stat label="Stale" value={String(staleHoldings.length)} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Allocation</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {allocation.map((a) => (
            <li key={a.cls} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{a.cls}</span>
              <span className="font-mono">{a.pct.toFixed(2)}%</span>
              <span>{fmt(a.val)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-2 text-lg font-medium">Holdings</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Asset</th>
              <th className="py-2 pr-3 text-right">Units</th>
              <th className="py-2 pr-3 text-right">Avg cost</th>
              <th className="py-2 pr-3 text-right">Price</th>
              <th className="py-2 pr-3 text-right">Value (THB)</th>
              <th className="py-2 pr-3 text-right">P&amp;L %</th>
            </tr>
          </thead>
          <tbody>
            {dashboardRows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 pr-3">
                  <Link href={`/portfolio/holdings/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{r.assetClass}</td>
                <td className="py-2 pr-3 text-right font-mono">{r.units.toFixed(4)}</td>
                <td className="py-2 pr-3 text-right font-mono">{r.avgCost.toFixed(4)}</td>
                <td className="py-2 pr-3 text-right font-mono">{r.currentPrice.toFixed(4)}</td>
                <td className="py-2 pr-3 text-right font-mono">{fmt(r.valueBase)}</td>
                <td
                  className={`py-2 pr-3 text-right font-mono ${
                    r.pnlPct?.greaterThanOrEqualTo(0)
                      ? "text-emerald-600"
                      : r.pnlPct
                        ? "text-destructive"
                        : ""
                  }`}
                >
                  {r.pnlPct ? r.pnlPct.toFixed(2) + "%" : "—"}
                </td>
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
    <div className="rounded-md border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function fmt(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(d.toNumber());
}
