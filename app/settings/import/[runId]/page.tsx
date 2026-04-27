import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { importRuns, importStaging, categories } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { MappingTable } from "./mapping-table";
import { CommitButton } from "./commit-button";

export default async function ImportRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { runId } = await params;

  const run = await db.query.importRuns.findFirst({
    where: and(eq(importRuns.id, runId), eq(importRuns.userId, session.user.id)),
  });
  if (!run) notFound();

  const rows = await db
    .select()
    .from(importStaging)
    .where(eq(importStaging.importRunId, runId))
    .orderBy(asc(importStaging.sheetName), asc(importStaging.rowIndex));

  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, session.user.id));

  const counts = {
    total: rows.length,
    unmapped: rows.filter((r) => r.mappingStatus === "UNMAPPED").length,
    mapped: rows.filter((r) => r.mappingStatus === "MAPPED").length,
    skipped: rows.filter((r) => r.mappingStatus === "SKIPPED").length,
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{run.sourceFilename}</h1>
          <p className="text-sm text-muted-foreground">
            Status: {run.status} · {counts.total} rows · {counts.unmapped} unmapped ·{" "}
            {counts.mapped} mapped · {counts.skipped} skipped
          </p>
        </div>
        <CommitButton runId={run.id} disabled={counts.unmapped > 0 || run.status === "COMMITTED"} />
      </header>

      <MappingTable
        rows={rows.map((r) => ({
          id: r.id,
          sheetName: r.sheetName,
          rawTopic: r.rawTopic,
          rawCategory: r.rawCategory,
          rawItemName: r.rawItemName,
          rawPlan: r.rawPlan,
          rawActual: r.rawActual,
          mappingStatus: r.mappingStatus,
          mappedCategoryId: r.mappedCategoryId,
          mappedItemNameTh: r.mappedItemNameTh,
        }))}
        categories={userCategories.map((c) => ({
          id: c.id,
          topic: c.topic,
          nameTh: c.nameTh,
          nameEn: c.nameEn,
        }))}
      />
    </main>
  );
}
