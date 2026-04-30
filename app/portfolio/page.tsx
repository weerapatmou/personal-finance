import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { assetHoldings, manualHoldings, assetPrices, currencyRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import Decimal from "decimal.js";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Plus } from "lucide-react";
import { CategoryPieChart } from "./category-pie-chart";
import { RefreshPricesButton } from "./refresh-prices-button";
import { HoldingRowActions } from "./holding-row";
import { convertToUsdThb, sumValues } from "@/lib/portfolio/value";
import type { ValuePair } from "@/lib/portfolio/value";
import type { Currency } from "@/lib/money";

// 6 display categories shown on the dashboard. Stock/Crypto/Gold come from
// asset_holdings; PF/Cash/Emergency come from manual_holdings.
const DISPLAY_CATEGORIES: Array<{
  label: string;
  matches: { kind: "asset" | "manual"; value: string }[];
  color: string;
}> = [
  { label: "Stock",          color: "#a5b4fc", matches: [{ kind: "asset",  value: "STOCK" }] },
  { label: "Cryptocurrency", color: "#16a34a", matches: [{ kind: "asset",  value: "CRYPTO" }] },
  { label: "Gold",           color: "#fde68a", matches: [{ kind: "asset",  value: "GOLD" }] },
  { label: "Provident Fund", color: "#7dd3fc", matches: [{ kind: "manual", value: "PF" }] },
  { label: "Cash",           color: "#fcd34d", matches: [{ kind: "manual", value: "CASH" }] },
  { label: "Emergency Fund", color: "#fca5a5", matches: [{ kind: "manual", value: "EMERGENCY_FUND" }] },
];

export default async function PortfolioDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [assets, manuals, prices, fx] = await Promise.all([
    db.select().from(assetHoldings).where(eq(assetHoldings.userId, userId)),
    db.select().from(manualHoldings).where(eq(manualHoldings.userId, userId)),
    db.select().from(assetPrices),
    db.select().from(currencyRates).where(eq(currencyRates.base, "USD")),
  ]);

  // Look up USD/THB rate; null means no FX yet (user must click Refresh)
  const usdThbRow = fx.find((r) => r.quote === "THB");
  const usdThbRate = usdThbRow ? new Decimal(usdThbRow.rate) : null;
  const fxAsOf = usdThbRow ? usdThbRow.fetchedAt : null;

  // Most-recent fetch time across all prices + FX. Shown next to the
  // Refresh button so the user knows whether numbers are fresh.
  const allTimestamps: Date[] = [
    ...prices.map((p) => p.fetchedAt),
    ...fx.map((r) => r.fetchedAt),
  ];
  const lastRefreshedAt =
    allTimestamps.length > 0
      ? new Date(Math.max(...allTimestamps.map((d) => d.getTime())))
      : null;

  const priceKey = (symbol: string, source: string) => `${source}::${symbol}`;
  const priceMap = new Map<string, { price: Decimal; currency: Currency; asOf: Date }>();
  for (const p of prices) {
    priceMap.set(priceKey(p.symbol, p.source), {
      price: new Decimal(p.price),
      currency: (p.currency === "THB" ? "THB" : "USD") as Currency,
      asOf: p.fetchedAt,
    });
  }

  type AssetRow = {
    kind: "asset";
    id: string;
    category: string;
    displayName: string;
    symbol: string;
    units: Decimal;
    nativePrice: Decimal | null;
    nativeCurrency: Currency;
    value: ValuePair;
    priceAsOf: Date | null;
  };
  type ManualRow = {
    kind: "manual";
    id: string;
    category: string;
    name: string;
    amount: Decimal;
    currency: Currency;
    value: ValuePair;
  };

  const assetRows: AssetRow[] = assets.map((h) => {
    const cached = priceMap.get(priceKey(h.symbol, h.quoteSource));
    const price = cached?.price ?? null;
    const priceCurrency: Currency = cached?.currency ?? (h.quoteCurrency === "THB" ? "THB" : "USD");
    const units = new Decimal(h.units);
    const nativeValue = price ? units.times(price) : new Decimal(0);
    const value = convertToUsdThb(
      nativeValue,
      priceCurrency,
      usdThbRate,
    );
    return {
      kind: "asset",
      id: h.id,
      category: h.category,
      displayName: h.displayName,
      symbol: h.symbol,
      units,
      nativePrice: price,
      nativeCurrency: priceCurrency,
      value,
      priceAsOf: cached?.asOf ?? null,
    };
  });

  const manualRows: ManualRow[] = manuals.map((h) => {
    const amount = new Decimal(h.amount);
    const currency: Currency = h.currency === "THB" ? "THB" : "USD";
    const value = convertToUsdThb(amount, currency, usdThbRate);
    return {
      kind: "manual",
      id: h.id,
      category: h.category,
      name: h.name,
      amount,
      currency,
      value,
    };
  });

  // Build the per-category breakdown.
  const categoryRows = DISPLAY_CATEGORIES.map((c) => {
    const isAsset = c.matches[0]!.kind === "asset";
    const target = c.matches[0]!.value;
    const items = isAsset
      ? assetRows.filter((r) => r.category === target)
      : manualRows.filter((r) => r.category === target);
    const total = sumValues(items.map((i) => i.value));
    return { label: c.label, color: c.color, total, count: items.length };
  });

  const grand = sumValues([...assetRows.map((r) => r.value), ...manualRows.map((r) => r.value)]);

  const pieData = categoryRows.map((c) => ({
    name: c.label,
    value: c.total.thb.toNumber(),
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
              <div className="flex flex-col items-end gap-1">
                <RefreshPricesButton />
                <p className="text-[11px] text-muted-foreground">
                  {lastRefreshedAt
                    ? `Updated ${formatRelative(lastRefreshedAt)}`
                    : "Never refreshed"}
                </p>
              </div>
              <Link
                href="/portfolio/new"
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
          <StatCard label="Total Asset (USD)" value={fmtUSD(grand.usd)} sub={fmtTHB(grand.thb)} highlight />
          <StatCard
            label="USD / THB"
            value={usdThbRate ? usdThbRate.toFixed(4) : "—"}
            sub={fxAsOf ? `as of ${formatTimestamp(fxAsOf)}` : "no FX yet — click Refresh"}
          />
          <StatCard
            label="Holdings"
            value={String(assetRows.length + manualRows.length)}
            sub={`${assetRows.length} asset · ${manualRows.length} manual`}
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
                  <th className="px-5 py-2.5 text-right">Value (USD)</th>
                  <th className="px-5 py-2.5 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categoryRows.map((c) => {
                  const pct = grand.thb.isZero()
                    ? new Decimal(0)
                    : c.total.thb.dividedBy(grand.thb).times(100);
                  return (
                    <tr key={c.label}>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                          <span className="font-medium">{c.label}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono">{fmtTHB(c.total.thb)}</td>
                      <td className="px-5 py-3 text-right font-mono">{fmtUSD(c.total.usd)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{pct.toFixed(2)}%</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-5 py-3 text-right font-mono">{fmtTHB(grand.thb)}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmtUSD(grand.usd)}</td>
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
                  <th className="px-5 py-3 text-right">Units / Amount</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-right">Value (USD)</th>
                  <th className="px-5 py-3 text-right">Value (THB)</th>
                  <th className="px-5 py-3 text-right w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assetRows.length === 0 && manualRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                      No holdings yet. Click <span className="font-medium">Add holding</span> to start.
                    </td>
                  </tr>
                ) : (
                  <>
                    {assetRows.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium">{r.displayName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{r.symbol}</p>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{r.category}</td>
                        <td className="px-5 py-3 text-right font-mono">{r.units.toFixed(4)}</td>
                        <td className="px-5 py-3 text-right font-mono">
                          {r.nativePrice
                            ? `${r.nativePrice.toFixed(2)} ${r.nativeCurrency}`
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-right font-mono">{fmtUSD(r.value.usd)}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold">{fmtTHB(r.value.thb)}</td>
                        <td className="px-2 py-3 text-right">
                          <HoldingRowActions kind="asset" id={r.id} units={r.units.toFixed(8)} />
                        </td>
                      </tr>
                    ))}
                    {manualRows.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium">{r.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">manual</p>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{labelFor(r.category)}</td>
                        <td className="px-5 py-3 text-right font-mono">
                          {r.amount.toFixed(2)} {r.currency}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground">—</td>
                        <td className="px-5 py-3 text-right font-mono">{fmtUSD(r.value.usd)}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold">{fmtTHB(r.value.thb)}</td>
                        <td className="px-2 py-3 text-right">
                          <HoldingRowActions
                            kind="manual"
                            id={r.id}
                            name={r.name}
                            amount={r.amount.toFixed(2)}
                            currency={r.currency}
                          />
                        </td>
                      </tr>
                    ))}
                  </>
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

function fmtUSD(d: Decimal): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(d.toNumber());
}

function formatTimestamp(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

/** "12 minutes ago" / "3 hours ago" / "2 days ago" — short relative form. */
function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

function labelFor(cat: string): string {
  switch (cat) {
    case "PF": return "Provident Fund";
    case "CASH": return "Cash";
    case "EMERGENCY_FUND": return "Emergency Fund";
    default: return cat;
  }
}
