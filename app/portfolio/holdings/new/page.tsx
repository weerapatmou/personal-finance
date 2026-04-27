import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHolding } from "@/app/portfolio/actions";

export default async function NewHoldingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">New holding</h1>
      <form
        action={async (formData) => {
          "use server";
          await createHolding({
            accountId: formData.get("accountId"),
            assetClass: formData.get("assetClass"),
            symbol: formData.get("symbol") || null,
            name: formData.get("name"),
            nativeCurrency: formData.get("nativeCurrency"),
            unitType: formData.get("unitType"),
            quoteSource: formData.get("quoteSource"),
            notes: formData.get("notes") || null,
          });
          redirect("/portfolio/holdings");
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <Field label="Account">
          <select name="accountId" required className="w-full rounded-md border bg-background px-3 py-2">
            {userAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Asset class">
          <select name="assetClass" required className="w-full rounded-md border bg-background px-3 py-2">
            {["STOCK", "ETF", "CRYPTO", "GOLD", "FUND", "CASH", "PF", "OTHER"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Symbol (optional)">
          <input name="symbol" placeholder="QQQM" className="w-full rounded-md border bg-background px-3 py-2" />
        </Field>
        <Field label="Display name">
          <input name="name" required className="w-full rounded-md border bg-background px-3 py-2" />
        </Field>
        <Field label="Native currency">
          <select name="nativeCurrency" required className="w-full rounded-md border bg-background px-3 py-2">
            <option value="USD">USD</option>
            <option value="THB">THB</option>
          </select>
        </Field>
        <Field label="Unit type">
          <select name="unitType" required defaultValue="SHARES" className="w-full rounded-md border bg-background px-3 py-2">
            {["SHARES", "COINS", "BAHT_WEIGHT", "TROY_OZ", "THB", "USD"].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quote source">
          <select name="quoteSource" required defaultValue="YAHOO" className="w-full rounded-md border bg-background px-3 py-2">
            <option value="YAHOO">Yahoo Finance</option>
            <option value="GOLDTRADERS_TH">goldtraders.or.th</option>
            <option value="MANUAL_NAV">Manual NAV</option>
            <option value="NONE">None (cash)</option>
          </select>
        </Field>
        <Field label="Notes">
          <textarea name="notes" rows={3} className="w-full rounded-md border bg-background px-3 py-2" />
        </Field>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Create
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
