import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { importRuns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { uploadXlsx } from "./actions";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Upload } from "lucide-react";

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
    <AppShell>
      <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Import XLSX</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload your legacy Personal Finance.xlsx. Stage 1 parses the file;
              Stage 2 maps categories; commit writes the live rows.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Upload file</h2>
          <form
            action={async (formData) => {
              "use server";
              const { runId } = await uploadXlsx(formData);
              redirect(`/settings/import/${runId}`);
            }}
            className="flex flex-col gap-4"
          >
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
            />
            <div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
              >
                <Upload className="h-4 w-4" />
                Upload &amp; stage
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Recent imports</h2>
          </div>
          {runs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{r.sourceFilename}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.startedAt.toISOString()} · {r.status}
                    </p>
                  </div>
                  <Link
                    href={`/settings/import/${r.id}`}
                    className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
