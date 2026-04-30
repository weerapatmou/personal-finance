// One per-category card on the Portfolio dashboard. Renders the section
// header (name + total in USD/THB), a small donut chart of within-category
// allocation when there are 2+ holdings, and a table of the holdings with
// inline edit/delete.

import Decimal from "decimal.js";
import type { ValuePair } from "@/lib/portfolio/value";
import type { Currency } from "@/lib/money";
import { CategoryPieChart } from "./category-pie-chart";
import { HoldingRowActions } from "./holding-row";

// Per-holding palette — cycles when a category has more than 10 items.
const PALETTE = [
  "#6366f1", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
  "#84cc16", "#a855f7",
];

export type AssetRow = {
  kind: "asset";
  id: string;
  category: string;
  displayName: string;
  symbol: string;
  units: Decimal;
  nativePrice: Decimal | null;
  nativeCurrency: Currency;
  value: ValuePair;
};

export type ManualRow = {
  kind: "manual";
  id: string;
  category: string;
  name: string;
  amount: Decimal;
  currency: Currency;
  value: ValuePair;
};

export type CategorySectionData = {
  label: string;
  color: string; // accent color shown in the header pill
  total: ValuePair;
  holdings: Array<AssetRow | ManualRow>;
};

export function CategorySection({ section }: { section: CategorySectionData }) {
  const { label, color, total, holdings } = section;
  const grandThb = total.thb;

  const pieData = holdings.map((h, i) => ({
    name: h.kind === "asset" ? h.displayName : h.name,
    value: h.value.thb.toNumber(),
    color: PALETTE[i % PALETTE.length]!,
  }));

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} />
          <h2 className="text-base font-semibold">{label}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-base font-bold">{fmtTHB(total.thb)}</p>
          <p className="text-xs text-muted-foreground">{fmtUSD(total.usd)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Chart side (only when 2+ holdings — single-item donut is silly) */}
        {holdings.length > 1 && (
          <div className="border-b border-border lg:border-b-0 lg:border-r lg:col-span-2 p-4">
            <CategoryPieChart data={pieData} />
          </div>
        )}

        {/* Table side */}
        <div className={`overflow-x-auto ${holdings.length > 1 ? "lg:col-span-3" : "lg:col-span-5"}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5 text-left">Name</th>
                <th className="px-5 py-2.5 text-right">Units / Amount</th>
                <th className="px-5 py-2.5 text-right">Price</th>
                <th className="px-5 py-2.5 text-right">Value (USD)</th>
                <th className="px-5 py-2.5 text-right">Value (THB)</th>
                <th className="px-5 py-2.5 text-right">% of cat</th>
                <th className="px-2 py-2.5 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {holdings.map((h, i) => {
                const pct = grandThb.isZero()
                  ? new Decimal(0)
                  : h.value.thb.dividedBy(grandThb).times(100);
                const sliceColor = PALETTE[i % PALETTE.length]!;
                return h.kind === "asset" ? (
                  <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sliceColor }} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{h.displayName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{h.symbol}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{h.units.toFixed(4)}</td>
                    <td className="px-5 py-3 text-right font-mono">
                      {h.nativePrice
                        ? `${h.nativePrice.toFixed(2)} ${h.nativeCurrency}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{fmtUSD(h.value.usd)}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold">{fmtTHB(h.value.thb)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{pct.toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right">
                      <HoldingRowActions kind="asset" id={h.id} units={h.units.toFixed(8)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sliceColor }} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{h.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">manual</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {h.amount.toFixed(2)} {h.currency}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">—</td>
                    <td className="px-5 py-3 text-right font-mono">{fmtUSD(h.value.usd)}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold">{fmtTHB(h.value.thb)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{pct.toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right">
                      <HoldingRowActions
                        kind="manual"
                        id={h.id}
                        name={h.name}
                        amount={h.amount.toFixed(2)}
                        currency={h.currency}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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
