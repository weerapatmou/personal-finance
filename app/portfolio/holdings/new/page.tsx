import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accounts, holdings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { NewHoldingWizard } from "./new-holding-wizard";

export default async function NewHoldingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [userAccounts, userHoldings] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db
      .select({
        id: holdings.id,
        name: holdings.name,
        assetClass: holdings.assetClass,
        symbol: holdings.symbol,
      })
      .from(holdings)
      .where(eq(holdings.userId, userId)),
  ]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md p-6 sm:p-8">
        <NewHoldingWizard accounts={userAccounts} existingHoldings={userHoldings} />
      </div>
    </AppShell>
  );
}
