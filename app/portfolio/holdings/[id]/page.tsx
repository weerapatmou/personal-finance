import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { holdings, investmentTxs, priceCache } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { replay } from "@/lib/cost-basis";
import type { InvestmentTxInput } from "@/lib/cost-basis";
import { TxForm } from "./tx-form";
import { ManualNavForm } from "./manual-nav-form";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";

export default async function HoldingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const h = await db.query.holdings.findFirst({
    where: and(eq(holdings.id, id), eq(holdings.userId, session.user.id)),
  });
  if (!h) notFound();

  const txs = await db
    .select()
    .from(investmentTxs)
    .where(eq(investmentTxs.holdingId, h.id))
    .orderBy(desc(investmentTxs.date));

  const cb = replay(
    txs.map<InvestmentTxInput>((t) => ({
      date: t.date,
      type: t.type as InvestmentTxInput["type"],
      units: t.units,
      priceNative: t.priceNative,
      feesNative: t.feesNative,
      splitRatio: t.splitRatio,
    })),
  );

  const recentPrices = h.symbol
    ? await db
        .select()
        .from(priceCache)
        .where(eq(priceCache.symbol, h.symbol))
        .orderBy(desc(priceCache.date))
        .limit(30)
    : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/portfolio" label="Portfolio" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{h.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {h.assetClass} · {h.symbol ?? "—"} · {h.nativeCurrency} · {h.quoteSource}
            </p>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Units" value={cb.units.toFixed(4)} />
          <Stat label={`Avg cost (${h.nativeCurrency})`} value={cb.avgCost.toFixed(4)} />
          <Stat label="Realized P&L" value={cb.realized.length.toString() + " events"} />
          <Stat label="Tx count" value={String(txs.length)} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Add transaction</h2>
          <TxForm holdingId={h.id} />
        </section>

        {h.quoteSource === "MANUAL_NAV" && (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">Add NAV entry</h2>
            <ManualNavForm symbol={h.symbol ?? ""} />
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Transaction history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Units</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Price</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Fees</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {txs.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-mono">{t.date}</td>
                    <td className="px-5 py-3">{t.type}</td>
                    <td className="px-5 py-3 text-right font-mono">{t.units ?? "—"}</td>
                    <td className="px-5 py-3 text-right font-mono">{t.priceNative ?? "—"}</td>
                    <td className="px-5 py-3 text-right font-mono">{t.feesNative}</td>
                    <td className="px-5 py-3 text-muted-foreground">{t.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {recentPrices.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">Recent prices ({recentPrices.length})</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              {recentPrices.map((p) => (
                <li key={`${p.symbol}-${p.date}`} className="flex items-center justify-between">
                  <span className="font-mono">{p.date}</span>
                  <span className="font-mono">{p.close}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
