import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { importRuns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { uploadXlsx } from "./actions";

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const runs = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.userId, session.user.id))
    .orderBy(desc(importRuns.startedAt))
    .limit(20);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Import xlsx</h1>
        <p className="text-sm text-muted-foreground">
          Upload your legacy Personal Finance.xlsx. Stage 1 parses the file into
          a staging table; you map the categories in Stage 2; commit writes the
          live BudgetLine / Transaction / MonthlyIncome rows.
        </p>
      </header>

      <form
        action={async (formData) => {
          "use server";
          const { runId } = await uploadXlsx(formData);
          redirect(`/settings/import/${runId}`);
        }}
        className="flex flex-col gap-3 rounded-md border p-4"
      >
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="text-sm"
        />
        <button
          type="submit"
          className="self-start rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Upload &amp; stage
        </button>
      </form>

      <section>
        <h2 className="mb-2 text-lg font-medium">Recent imports</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{r.sourceFilename}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.startedAt.toISOString()} · {r.status}
                  </span>
                </div>
                <Link
                  href={`/settings/import/${r.id}`}
                  className="text-sm text-primary underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
