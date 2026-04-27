import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { holdings, investmentTxs, priceCache } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { replay } from "@/lib/cost-basis";
import type { InvestmentTxInput } from "@/lib/cost-basis";
import { TxForm } from "./tx-form";
import { ManualNavForm } from "./manual-nav-form";

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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">{h.name}</h1>
        <p className="text-sm text-muted-foreground">
          {h.assetClass} · {h.symbol ?? "—"} · {h.nativeCurrency} · {h.quoteSource}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Units" value={cb.units.toFixed(4)} />
        <Stat label={`Avg cost (${h.nativeCurrency})`} value={cb.avgCost.toFixed(4)} />
        <Stat label="Realized P&L" value={cb.realized.length.toString() + " events"} />
        <Stat label="Tx count" value={String(txs.length)} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Add transaction</h2>
        <TxForm holdingId={h.id} />
      </section>

      {h.quoteSource === "MANUAL_NAV" && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Add NAV entry</h2>
          <ManualNavForm symbol={h.symbol ?? ""} />
        </section>
      )}

      <section className="overflow-x-auto">
        <h2 className="mb-2 text-lg font-medium">Transaction history</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3 text-right">Units</th>
              <th className="py-2 pr-3 text-right">Price</th>
              <th className="py-2 pr-3 text-right">Fees</th>
              <th className="py-2 pr-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className="border-b">
                <td className="py-2 pr-3 font-mono">{t.date}</td>
                <td className="py-2 pr-3">{t.type}</td>
                <td className="py-2 pr-3 text-right font-mono">{t.units ?? "—"}</td>
                <td className="py-2 pr-3 text-right font-mono">{t.priceNative ?? "—"}</td>
                <td className="py-2 pr-3 text-right font-mono">{t.feesNative}</td>
                <td className="py-2 pr-3 text-muted-foreground">{t.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {recentPrices.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Recent prices ({recentPrices.length})</h2>
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
