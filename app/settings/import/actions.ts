"use server";

import { db } from "@/db";
import {
  importRuns,
  importStaging,
  budgetLines,
  transactions,
  monthlyIncome,
  categoryAliases,
  categories,
  accounts,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parseXlsxToStaging } from "@/lib/import/xlsx-parser";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

/** Stage 1 — parse the uploaded xlsx and insert ImportStaging rows. */
export async function uploadXlsx(formData: FormData) {
  const userId = await requireUserId();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  if (file.size > 50 * 1024 * 1024) throw new Error("File too large (>50MB)");

  const buffer = Buffer.from(await file.arrayBuffer());

  // Insert run record first.
  const [run] = await db
    .insert(importRuns)
    .values({
      userId,
      sourceFilename: file.name,
      status: "STAGED",
    })
    .returning();
  const runId = run!.id;

  const rows = await parseXlsxToStaging(buffer);

  // Apply existing CategoryAlias rows for auto-suggestion.
  const aliases = await db
    .select()
    .from(categoryAliases)
    .where(eq(categoryAliases.userId, userId));
  const aliasByItemName = new Map<string, (typeof aliases)[number]>();
  for (const a of aliases) aliasByItemName.set(a.rawItemName, a);

  // Insert in chunks to avoid query-size limits.
  for (const r of rows) {
    const alias = r.rawItemName ? aliasByItemName.get(r.rawItemName) : undefined;
    await db.insert(importStaging).values({
      importRunId: runId,
      sheetName: r.sheetName,
      rowIndex: r.rowIndex,
      rawTopic: r.rawTopic,
      rawItemName: r.rawItemName,
      rawCategory: r.rawCategory,
      rawPlan: r.rawPlan != null ? String(r.rawPlan) : null,
      rawActual: r.rawActual != null ? String(r.rawActual) : null,
      inferredYear: r.inferredYear,
      inferredMonth: r.inferredMonth,
      parseWarnings: r.parseWarnings.length ? r.parseWarnings : null,
      mappingStatus: alias ? "MAPPED" : "UNMAPPED",
      mappedTopic:
        r.rawTopic === "FIX" ||
        r.rawTopic === "VARIABLE" ||
        r.rawTopic === "INVESTMENT" ||
        r.rawTopic === "TAX"
          ? r.rawTopic
          : null,
      mappedCategoryId: alias?.categoryId ?? null,
      mappedItemNameTh: alias?.itemNameTh ?? r.rawItemName ?? null,
    });
  }

  await db
    .update(importRuns)
    .set({
      status: "MAPPING",
      summaryJson: { rows: rows.length },
    })
    .where(eq(importRuns.id, runId));

  revalidatePath("/settings/import");
  return { runId };
}

/** Update a single staging row's mapping. Persists a CategoryAlias for reuse. */
const mappingUpdate = z.object({
  stagingId: z.string().uuid(),
  topic: z.enum(["FIX", "VARIABLE", "INVESTMENT", "TAX"]).nullable(),
  categoryId: z.string().uuid().nullable(),
  itemNameTh: z.string().nullable(),
  status: z.enum(["MAPPED", "SKIPPED"]),
});

export async function updateStagingMapping(input: unknown) {
  const userId = await requireUserId();
  const data = mappingUpdate.parse(input);

  // Verify the staging row belongs to one of this user's runs.
  const [staged] = await db
    .select({
      id: importStaging.id,
      rawTopic: importStaging.rawTopic,
      rawCategory: importStaging.rawCategory,
      rawItemName: importStaging.rawItemName,
    })
    .from(importStaging)
    .innerJoin(importRuns, eq(importStaging.importRunId, importRuns.id))
    .where(and(eq(importStaging.id, data.stagingId), eq(importRuns.userId, userId)));
  if (!staged) throw new Error("Staging row not found");

  await db
    .update(importStaging)
    .set({
      mappedTopic: data.topic,
      mappedCategoryId: data.categoryId,
      mappedItemNameTh: data.itemNameTh,
      mappingStatus: data.status,
    })
    .where(eq(importStaging.id, data.stagingId));

  // Persist alias for future runs.
  if (data.status === "MAPPED" && staged.rawItemName) {
    await db
      .insert(categoryAliases)
      .values({
        userId,
        rawTopic: staged.rawTopic ?? null,
        rawCategory: staged.rawCategory ?? null,
        rawItemName: staged.rawItemName,
        categoryId: data.categoryId,
        itemNameTh: data.itemNameTh,
      })
      .onConflictDoUpdate({
        target: [
          categoryAliases.userId,
          categoryAliases.rawTopic,
          categoryAliases.rawCategory,
          categoryAliases.rawItemName,
        ],
        set: {
          categoryId: data.categoryId,
          itemNameTh: data.itemNameTh,
        },
      });
  }
}

/** Stage 2 commit: write ImportStaging → real BudgetLine / Transaction / MonthlyIncome rows. */
export async function commitImport(runId: string) {
  const userId = await requireUserId();
  const run = await db.query.importRuns.findFirst({
    where: and(eq(importRuns.id, runId), eq(importRuns.userId, userId)),
  });
  if (!run) throw new Error("Import run not found");

  const stagedRows = await db
    .select()
    .from(importStaging)
    .where(eq(importStaging.importRunId, runId));

  const unmapped = stagedRows.filter((r) => r.mappingStatus === "UNMAPPED");
  if (unmapped.length > 0) {
    throw new Error(`${unmapped.length} rows are still UNMAPPED — finish mapping before committing.`);
  }

  // Pick a default account for imported transactions: the first non-archived
  // account. The user can re-assign later.
  const [defaultAccount] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)));
  if (!defaultAccount) throw new Error("Create at least one account before importing");

  let budgetLinesCreated = 0;
  let transactionsCreated = 0;
  let incomeRowsCreated = 0;

  try {
    for (const r of stagedRows) {
      if (r.mappingStatus === "SKIPPED") continue;

      // Income row.
      if (r.rawTopic === "_INCOME_" && r.inferredYear && r.inferredMonth && r.rawActual) {
        await db
          .insert(monthlyIncome)
          .values({
            userId,
            year: r.inferredYear,
            month: r.inferredMonth,
            amount: r.rawActual,
            currency: "THB",
          })
          .onConflictDoUpdate({
            target: [monthlyIncome.userId, monthlyIncome.year, monthlyIncome.month],
            set: { amount: r.rawActual },
          });
        incomeRowsCreated++;
        continue;
      }

      if (!r.mappedCategoryId || !r.mappedItemNameTh) continue;
      if (!r.inferredYear || !r.inferredMonth) continue;

      // BudgetLine if there's a plan.
      let budgetLineId: string | null = null;
      if (r.rawPlan && Number(r.rawPlan) !== 0) {
        const [bl] = await db
          .insert(budgetLines)
          .values({
            userId,
            year: r.inferredYear,
            month: r.inferredMonth,
            categoryId: r.mappedCategoryId,
            itemNameTh: r.mappedItemNameTh,
            plannedAmount: r.rawPlan,
            currency: "THB",
          })
          .onConflictDoNothing()
          .returning();
        if (bl) {
          budgetLineId = bl.id;
          budgetLinesCreated++;
        } else {
          // Already exists; look it up.
          const existing = await db.query.budgetLines.findFirst({
            where: and(
              eq(budgetLines.userId, userId),
              eq(budgetLines.year, r.inferredYear),
              eq(budgetLines.month, r.inferredMonth),
              eq(budgetLines.categoryId, r.mappedCategoryId),
              eq(budgetLines.itemNameTh, r.mappedItemNameTh),
            ),
          });
          budgetLineId = existing?.id ?? null;
        }
      }

      // Transaction if there's an actual.
      if (r.rawActual && Number(r.rawActual) !== 0) {
        const lastDay = lastDayOfMonth(r.inferredYear, r.inferredMonth);
        await db.insert(transactions).values({
          userId,
          accountId: defaultAccount.id,
          categoryId: r.mappedCategoryId,
          budgetLineId,
          date: lastDay,
          amount: r.rawActual,
          currency: "THB",
          type: "EXPENSE",
          note: `imported from ${r.sheetName}`,
        });
        transactionsCreated++;
      }

      await db
        .update(importStaging)
        .set({
          importedBudgetLineId: budgetLineId,
          importedTransactions: r.rawActual ? 1 : 0,
        })
        .where(eq(importStaging.id, r.id));
    }

    await db
      .update(importRuns)
      .set({
        status: "COMMITTED",
        finishedAt: new Date(),
        summaryJson: {
          budgetLinesCreated,
          transactionsCreated,
          incomeRowsCreated,
        },
      })
      .where(eq(importRuns.id, runId));
  } catch (err) {
    await db
      .update(importRuns)
      .set({
        status: "FAILED",
        finishedAt: new Date(),
        summaryJson: {
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .where(eq(importRuns.id, runId));
    throw err;
  }

  revalidatePath("/settings/import");
  revalidatePath("/months");
  return { budgetLinesCreated, transactionsCreated, incomeRowsCreated };
}

function lastDayOfMonth(year: number, month: number): string {
  // Day 0 of next month = last day of this month.
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

// Reference category table at module load so unused-import warnings don't
// flag this for tree-shake (categories ARE referenced indirectly through the
// alias table FK).
void categories;
