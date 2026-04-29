import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { holdings, investmentTxs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import Decimal from "decimal.js";
import { replay } from "@/lib/cost-basis";
import type { InvestmentTxInput, ReplayResult } from "@/lib/cost-basis";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Plus, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export default async function PortfolioDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

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
    <AppShell>
      <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Net worth, holdings & allocation</p>
            </div>
            <Link
              href="/portfolio/holdings/new"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Add holding
            </Link>
          </div>
        </div>

        {staleHoldings.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <span className="font-semibold">Stale data: </span>
              {staleHoldings.map((r) => r.name).join(", ")}
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Worth</p>
            <p className="mt-2 text-2xl font-bold">{fmt(totalNetWorth)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Holdings</p>
            <p className="mt-2 text-2xl font-bold">{dashboardRows.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Stale Prices</p>
            <p className={`mt-2 text-2xl font-bold ${staleHoldings.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {staleHoldings.length}
            </p>
          </div>
        </div>

        {/* Allocation */}
        {allocation.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">Allocation</h2>
            <div className="space-y-3">
              {allocation.map((a) => (
                <div key={a.cls}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{a.cls}</span>
                    <span className="text-muted-foreground">{fmt(a.val)} · {a.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${a.pct.toNumber()}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Holdings table */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Holdings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Asset</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Units</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Avg Cost</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Price</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Value (THB)</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">P&amp;L %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dashboardRows.map((r) => {
                  const isUp = r.pnlPct?.greaterThanOrEqualTo(0);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/portfolio/holdings/${r.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{r.assetClass}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm">{r.units.toFixed(4)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm">{r.avgCost.toFixed(4)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm">{r.currentPrice.toFixed(4)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm">{fmt(r.valueBase)}</td>
                      <td className="px-5 py-3.5 text-right">
                        {r.pnlPct ? (
                          <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${isUp ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {r.pnlPct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
    minimumFractionDigits: 2,
  }).format(d.toNumber());
}
