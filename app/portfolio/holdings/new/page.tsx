import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accounts, holdings, investmentTxs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { NewHoldingWizard } from "./new-holding-wizard";
import { replay } from "@/lib/cost-basis";
import type { InvestmentTxInput } from "@/lib/cost-basis";

export default async function NewHoldingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [userAccounts, userHoldings, userTxs] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db
      .select({
        id: holdings.id,
        name: holdings.name,
        assetClass: holdings.assetClass,
        symbol: holdings.symbol,
        nativeCurrency: holdings.nativeCurrency,
      })
      .from(holdings)
      .where(eq(holdings.userId, userId)),
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
  for (const t of userTxs) {
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

  const enriched = userHoldings.map((h) => ({
    ...h,
    units: replay(txByHolding.get(h.id) ?? []).units.toFixed(8),
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-md p-6 sm:p-8">
        <NewHoldingWizard accounts={userAccounts} existingHoldings={enriched} />
      </div>
    </AppShell>
  );
}
