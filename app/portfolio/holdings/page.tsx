import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { holdings } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Plus } from "lucide-react";

export default async function HoldingsList() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const rows = await db.select().from(holdings).where(eq(holdings.userId, session.user.id));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = groups.get(r.assetClass) ?? [];
    arr.push(r);
    groups.set(r.assetClass, arr);
  }

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/portfolio" label="Portfolio" />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Holdings</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Manage your investment positions</p>
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

        {rows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">No holdings yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([cls, hs]) => (
              <div key={cls}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{cls}</h2>
                <div className="rounded-2xl border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
                  {hs.map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-semibold">{h.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {h.symbol ?? "—"} · {h.nativeCurrency} · {h.quoteSource}
                        </p>
                      </div>
                      <Link
                        href={`/portfolio/holdings/${h.id}`}
                        className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Open
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
