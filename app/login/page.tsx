import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthError } from "next-auth";

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

      {params.error && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {params.error === "CredentialsSignin"
            ? "Incorrect username or password."
            : "Sign-in failed. Please try again."}
        </p>
      )}

      <form
        action={async (formData) => {
          "use server";
          const username = String(formData.get("username") ?? "").trim();
          const password = String(formData.get("password") ?? "");
          try {
            await signIn("credentials", {
              username,
              password,
              redirectTo: params.callbackUrl ?? "/",
            });
          } catch (err) {
            // Auth.js redirect throws are not real errors — let them propagate.
            if (err instanceof AuthError) {
              const code = err.type === "CredentialsSignin" ? "CredentialsSignin" : "AuthError";
              redirect(`/login?error=${code}`);
            }
            throw err;
          }
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            name="username"
            type="text"
            autoComplete="username"
            required
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
