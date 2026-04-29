import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { holdings, investmentTxs } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import Decimal from "decimal.js";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Plus } from "lucide-react";
import { replay } from "@/lib/cost-basis";
import type { InvestmentTxInput } from "@/lib/cost-basis";
import { DeleteHoldingButton } from "./delete-holding-button";

const DISPLAY_CATEGORIES: Array<{ label: string; classes: string[] }> = [
  { label: "Stock",          classes: ["STOCK", "ETF", "FUND"] },
  { label: "Cryptocurrency", classes: ["CRYPTO"] },
  { label: "Gold",           classes: ["GOLD"] },
  { label: "Provident Fund", classes: ["PF"] },
  { label: "Cash",           classes: ["CASH", "OTHER"] },
  { label: "Emergency Fund", classes: ["EMERGENCY_FUND"] },
];

export default async function HoldingsList() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [rows, allTxs] = await Promise.all([
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
  ]);

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

  const enriched = rows.map((h) => ({
    ...h,
    units: replay(txByHolding.get(h.id) ?? []).units as Decimal,
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/portfolio" label="Portfolio" />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Holdings</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Manage your investment positions
              </p>
            </div>
            <Link
              href="/portfolio/holdings/new"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add holding
            </Link>
          </div>
        </div>

        {enriched.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">No holdings yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {DISPLAY_CATEGORIES.map((cat) => {
              const items = enriched.filter((h) => cat.classes.includes(h.assetClass));
              if (items.length === 0) return null;
              return (
                <div key={cat.label}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat.label}
                  </h2>
                  <div className="rounded-2xl border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
                    {items.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{h.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {h.symbol ?? "—"} · {h.units.toFixed(4)} {h.nativeCurrency}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/portfolio/holdings/${h.id}`}
                            className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                          >
                            Open
                          </Link>
                          <DeleteHoldingButton holdingId={h.id} name={h.name} />
                        </div>
                      </div>
                    ))}
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
