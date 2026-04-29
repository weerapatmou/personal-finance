import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CurrencySelector } from "@/components/currency-selector";

const SECTIONS: Array<{ href: string; title: string; subtitle: string }> = [
  { href: "/months", title: "Months", subtitle: "Plan vs Actual ledger per month" },
  { href: "/portfolio", title: "Portfolio", subtitle: "Net worth + holdings" },
  { href: "/analytics", title: "Analytics", subtitle: "Trends, top categories" },
  { href: "/tax", title: "Tax planner", subtitle: "Thai PIT caps and headroom" },
  { href: "/retirement", title: "Retirement", subtitle: "FIRE projection" },
  { href: "/settings/import", title: "Import xlsx", subtitle: "Backfill historical sheets" },
  { href: "/settings/recurring", title: "Recurring rules", subtitle: "Auto-populate budgets" },
  { href: "/portfolio/holdings", title: "Holdings", subtitle: "Manage positions + transactions" },
];

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("Home");
  const tCommon = await getTranslations("Common");

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("greeting", { name: session.user.name ?? session.user.username ?? "" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            @{session.user.username}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-muted-foreground">{tCommon("displayCurrency")}</span>
          <CurrencySelector userId={session.user.id} />
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-medium">Sections</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex h-full flex-col gap-1 rounded-md border p-4 hover:bg-muted"
              >
                <span className="font-medium">{s.title}</span>
                <span className="text-xs text-muted-foreground">{s.subtitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          {tCommon("logout")}
        </button>
      </form>
    </main>
  );
}
