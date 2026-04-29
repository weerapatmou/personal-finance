import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { holdings, investmentTxs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import Decimal from "decimal.js";
import { replay } from "@/lib/cost-basis";
import type { InvestmentTxInput } from "@/lib/cost-basis";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Plus } from "lucide-react";
import { CategoryPieChart } from "./category-pie-chart";
import { RefreshPricesButton } from "./refresh-prices-button";
import { DeleteHoldingButton } from "./holdings/delete-holding-button";

// Display categories shown on the dashboard. The user thinks in these 6 buckets;
// the underlying schema has finer-grained asset_class values that we group here.
const DISPLAY_CATEGORIES: Array<{
  label: string;
  classes: string[];
  color: string;
}> = [
  { label: "Stock",          classes: ["STOCK", "ETF", "FUND"],  color: "#a5b4fc" },
  { label: "Cryptocurrency", classes: ["CRYPTO"],                color: "#16a34a" },
  { label: "Gold",           classes: ["GOLD"],                  color: "#fde68a" },
  { label: "Provident Fund", classes: ["PF"],                    color: "#7dd3fc" },
  { label: "Cash",           classes: ["CASH", "OTHER"],         color: "#fcd34d" },
  { label: "Emergency Fund", classes: ["EMERGENCY_FUND"],        color: "#fca5a5" },
];

export default async function PortfolioDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [allHoldings, allTxs, latestPrices, fxResult] = await Promise.all([
    db.select().from(holdings).where(eq(holdings.userId, userId)),
    db
      .select({
        holdingId: investmentTxs.holdingId,
        date: investmentTxs.date,
        type: investmentTxs.type,
        units: investmentTxs.units,
        priceNative: investmentTxs.priceNative,
        feesNative: investmentTxs.feesNative,
        splitRatio: investmentTxs.splitRatio,
      })
      .from(investmentTxs)
      .where(eq(investmentTxs.userId, userId)),
    db.execute<{ symbol: string; close: string; date: string }>(sql`
      SELECT DISTINCT ON (symbol) symbol, close::text AS close, date::text AS date
      FROM price_cache
      ORDER BY symbol, date DESC
    `),
    db.execute<{ rate: string; date: string }>(sql`
      SELECT rate::text AS rate, date::text AS date
      FROM fx_rates
      WHERE base = 'USD' AND quote = 'THB'
      ORDER BY date DESC
      LIMIT 1
    `),
  ]);

  const fxRows = Array.from(fxResult as unknown as Iterable<{ rate: string; date: string }>);
  const usdToThb = new Decimal(fxRows[0]?.rate ?? "35");
  const fxAsOf = fxRows[0]?.date ?? null;

  const priceRows = Array.from(
    latestPrices as unknown as Iterable<{ symbol: string; close: string; date: string }>,
  );
  const priceMap = new Map<string, { close: Decimal; date: string }>();
  for (const p of priceRows) {
    priceMap.set(p.symbol, { close: new Decimal(p.close), date: p.date });
  }

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
    symbol: string | null;
    units: Decimal;
    avgCost: Decimal;
    price: Decimal;
    priceDate: string | null;
    valueNative: Decimal;
    valueThb: Decimal;
  };

  const rows: Row[] = allHoldings.map((h) => {
    const cb = replay(txByHolding.get(h.id) ?? []);
    const isManual = h.quoteSource === "NONE";
    const priceEntry = h.symbol ? priceMap.get(h.symbol) : undefined;
    const price = isManual ? new Decimal(1) : (priceEntry?.close ?? new Decimal(0));
    const valueNative = cb.units.times(price);
    const valueThb =
      h.nativeCurrency === "USD" ? valueNative.times(usdToThb) : valueNative;
    return {
      id: h.id,
      name: h.name,
      assetClass: h.assetClass,
      nativeCurrency: h.nativeCurrency,
      symbol: h.symbol,
      units: cb.units,
      avgCost: cb.avgCost,
      price,
      priceDate: priceEntry?.date ?? null,
      valueNative,
      valueThb,
    };
  });

  const totalThb = rows.reduce((s, r) => s.plus(r.valueThb), new Decimal(0));

  const categoryRows = DISPLAY_CATEGORIES.map((c) => {
    const total = rows
      .filter((r) => c.classes.includes(r.assetClass))
      .reduce((s, r) => s.plus(r.valueThb), new Decimal(0));
    const pct = totalThb.isZero() ? new Decimal(0) : total.dividedBy(totalThb).times(100);
    return { label: c.label, color: c.color, total, pct };
  });

  const pieData = categoryRows.map((c) => ({
    name: c.label,
    value: c.total.toNumber(),
    color: c.color,
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Net worth, allocation & current prices
              </p>
            </div>
            <div className="flex items-center gap-3">
              <RefreshPricesButton />
              <Link
                href="/portfolio/holdings/new"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Add holding
              </Link>
            </div>
          </div>
        </div>

        {/* Top stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Asset"
            value={fmtTHB(totalThb)}
            sub={`${rows.length} holding${rows.length === 1 ? "" : "s"}`}
            highlight
          />
          <StatCard
            label="USD / THB"
            value={usdToThb.toFixed(4)}
            sub={fxAsOf ? `as of ${fxAsOf}` : "no FX data — refresh prices"}
          />
          <StatCard
            label="Categories"
            value={String(categoryRows.filter((c) => !c.total.isZero()).length)}
            sub="active asset types"
          />
        </div>

        {/* Allocation: table + pie chart */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Allocation by category</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 text-left">Category</th>
                  <th className="px-5 py-2.5 text-right">Value (THB)</th>
                  <th className="px-5 py-2.5 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categoryRows.map((c) => (
                  <tr key={c.label}>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                        <span className="font-medium">{c.label}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{fmtTHB(c.total)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{c.pct.toFixed(2)}%</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-5 py-3 text-right font-mono">{fmtTHB(totalThb)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">100.00%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">Distribution</h2>
            <CategoryPieChart data={pieData} />
          </div>
        </div>

        {/* Holdings detail */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Holdings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Type</th>
                  <th className="px-5 py-3 text-right">Units</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-right">Native value</th>
                  <th className="px-5 py-3 text-right">Value (THB)</th>
                  <th className="px-5 py-3 text-right w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                      No holdings yet. Click <span className="font-medium">Add holding</span> to start.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/portfolio/holdings/${r.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                        {r.symbol && (
                          <span className="ml-2 text-xs text-muted-foreground">{r.symbol}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{r.assetClass}</td>
                      <td className="px-5 py-3 text-right font-mono">{r.units.toFixed(4)}</td>
                      <td className="px-5 py-3 text-right font-mono">
                        {r.price.isZero() ? "—" : r.price.toFixed(2)}
                        {!r.price.isZero() && (
                          <span className="ml-1 text-xs text-muted-foreground">{r.nativeCurrency}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {r.valueNative.toFixed(2)}
                        <span className="ml-1 text-xs text-muted-foreground">{r.nativeCurrency}</span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">{fmtTHB(r.valueThb)}</td>
                      <td className="px-2 py-3 text-right">
                        <DeleteHoldingButton holdingId={r.id} name={r.name} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function fmtTHB(d: Decimal): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(d.toNumber());
}

