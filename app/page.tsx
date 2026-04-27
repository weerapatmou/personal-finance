import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CurrencySelector } from "@/components/currency-selector";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("Home");
  const tCommon = await getTranslations("Common");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">
        {t("greeting", { name: session.user.name ?? session.user.email ?? "" })}
      </h1>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{tCommon("displayCurrency")}</span>
        <CurrencySelector userId={session.user.id!} />
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

      <p className="text-xs text-muted-foreground">
        Phase 1 stub. Real dashboard ships in Phase 2.
      </p>
    </main>
  );
}
