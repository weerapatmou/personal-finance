import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthError } from "next-auth";
import { Wallet, TrendingUp, ShieldCheck, BarChart2 } from "lucide-react";

const FEATURES = [
  { icon: TrendingUp, text: "Track investments & net worth" },
  { icon: BarChart2, text: "Monthly budget & analytics" },
  { icon: ShieldCheck, text: "Thai PIT tax planning" },
];

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
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:flex-1 flex-col justify-between bg-primary p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">FinanceOS</span>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-4xl font-bold leading-tight">
              Your personal
              <br />
              finance command
              <br />
              centre.
            </h2>
            <p className="mt-4 text-white/70 text-lg">
              Everything you need to plan, track, and grow your wealth — in one place.
            </p>
          </div>

          <ul className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-white/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-white/40">Personal Finance Tracker © {new Date().getFullYear()}</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 sm:p-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold">FinanceOS</span>
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your credentials to continue.
            </p>
          </div>

          {params.error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {params.error === "CredentialsSignin"
                ? "Incorrect username or password."
                : "Sign-in failed. Please try again."}
            </div>
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
                if (err instanceof AuthError) {
                  const code =
                    err.type === "CredentialsSignin" ? "CredentialsSignin" : "AuthError";
                  redirect(`/login?error=${code}`);
                }
                throw err;
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="your_username"
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
