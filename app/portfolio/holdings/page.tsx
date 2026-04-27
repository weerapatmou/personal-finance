import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { holdings } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Holdings</h1>
        <Link
          href="/portfolio/holdings/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Add holding
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No holdings yet.</p>
      ) : (
        Array.from(groups.entries()).map(([cls, hs]) => (
          <section key={cls}>
            <h2 className="text-lg font-medium">{cls}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {hs.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.symbol ?? "—"} · {h.nativeCurrency} · {h.quoteSource}
                    </div>
                  </div>
                  <Link
                    href={`/portfolio/holdings/${h.id}`}
                    className="text-sm text-primary underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
