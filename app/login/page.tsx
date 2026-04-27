import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const t = await getTranslations("Login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {params.error === "AccessDenied" && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {t("notAllowed")}
        </p>
      )}
      {params.error === "Verification" && (
        <p className="rounded-md border bg-muted p-3 text-sm">
          The sign-in link is invalid or has expired.
        </p>
      )}

      <form
        action={async (formData) => {
          "use server";
          const email = String(formData.get("email") ?? "").trim();
          await signIn("nodemailer", {
            email,
            redirectTo: params.callbackUrl ?? "/",
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("emailLabel")}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("submit")}
        </button>
      </form>
    </main>
  );
}
