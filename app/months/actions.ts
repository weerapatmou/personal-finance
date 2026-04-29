"use server";

import { db } from "@/db";
import {
  budgetLines,
  budgetLineDetails,
  transactions,
  monthlyIncome,
  categories,
} from "@/db/schema";
import { and, eq, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

const decimalString = z
  .string()
  .min(1)
  .regex(/^-?\d+(\.\d+)?$/, "Must be a numeric string");

// ─── Category CRUD ───────────────────────────────────────────────────────────

const categoryInput = z.object({
  topic: z.enum(["FIX", "VARIABLE", "INVESTMENT", "TAX"]),
  nameEn: z.string().min(1).max(200),
  nameTh: z.string().min(1).max(200),
});

export async function createCategory(input: unknown): Promise<string> {
  const userId = await requireUserId();
  const data = categoryInput.parse(input);

  const [result] = await db
    .insert(categories)
    .values({
      userId,
      topic: data.topic,
      nameEn: data.nameEn,
      nameTh: data.nameTh,
    })
    .returning({ id: categories.id });

  if (!result) throw new Error("Failed to create category");
  revalidatePath("/months", "layout");
  return result.id;
}

// ─── BudgetLine CRUD ─────────────────────────────────────────────────────────

const budgetLineInput = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  categoryId: z.string().uuid(),
  itemNameTh: z.string().min(1).max(200),
  itemNameEn: z.string().max(200).optional().nullable(),
  plannedAmount: decimalString,
  currency: z.enum(["THB", "USD"]).default("THB"),
});

export async function createBudgetLine(input: unknown) {
  const userId = await requireUserId();
  const data = budgetLineInput.parse(input);

  // Verify the category belongs to the user.
  const cat = await db.query.categories.findFirst({
    where: and(eq(categories.id, data.categoryId), eq(categories.userId, userId)),
  });
  if (!cat) throw new Error("Category not found");

  await db.insert(budgetLines).values({
    userId,
    year: data.year,
    month: data.month,
    categoryId: data.categoryId,
    itemNameTh: data.itemNameTh,
    itemNameEn: data.itemNameEn ?? null,
    plannedAmount: data.plannedAmount,
    currency: data.currency,
  });

  revalidatePath(`/months/${pad(data.year)}-${pad2(data.month)}`);
}

export async function updateBudgetLine(id: string, input: unknown) {
  const userId = await requireUserId();
  const data = budgetLineInput.partial().parse(input);

  const existing = await db.query.budgetLines.findFirst({
    where: and(eq(budgetLines.id, id), eq(budgetLines.userId, userId)),
  });
  if (!existing) throw new Error("BudgetLine not found");

  await db
    .update(budgetLines)
    .set({
      ...(data.itemNameTh !== undefined && { itemNameTh: data.itemNameTh }),
      ...(data.itemNameEn !== undefined && { itemNameEn: data.itemNameEn ?? null }),
      ...(data.plannedAmount !== undefined && { plannedAmount: data.plannedAmount }),
      updatedAt: new Date(),
    })
    .where(eq(budgetLines.id, id));

  revalidatePath(`/months/${pad(existing.year)}-${pad2(existing.month)}`);
}

export async function deleteBudgetLine(id: string) {
  const userId = await requireUserId();
  const existing = await db.query.budgetLines.findFirst({
    where: and(eq(budgetLines.id, id), eq(budgetLines.userId, userId)),
  });
  if (!existing) throw new Error("BudgetLine not found");
  await db.delete(budgetLines).where(eq(budgetLines.id, id));
  revalidatePath(`/months/${pad(existing.year)}-${pad2(existing.month)}`);
}

// ─── Transaction CRUD ────────────────────────────────────────────────────────

const transactionInput = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  budgetLineId: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: decimalString,
  currency: z.enum(["THB", "USD"]).default("THB"),
  type: z.enum(["EXPENSE", "TRANSFER"]).default("EXPENSE"),
  note: z.string().max(2000).optional().nullable(),
});

export async function createTransaction(input: unknown) {
  const userId = await requireUserId();
  const data = transactionInput.parse(input);
  await db.insert(transactions).values({
    userId,
    accountId: data.accountId,
    categoryId: data.categoryId,
    budgetLineId: data.budgetLineId ?? null,
    date: data.date,
    amount: data.amount,
    currency: data.currency,
    type: data.type,
    note: data.note ?? null,
  });
  const [year, month] = data.date.split("-");
  revalidatePath(`/months/${year}-${month}`);
}

export async function updateTransaction(id: string, input: unknown) {
  const userId = await requireUserId();
  const data = transactionInput.partial().parse(input);
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
  });
  if (!existing) throw new Error("Transaction not found");

  await db
    .update(transactions)
    .set({
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.note !== undefined && { note: data.note ?? null }),
      ...(data.date !== undefined && { date: data.date }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.budgetLineId !== undefined && { budgetLineId: data.budgetLineId ?? null }),
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, id));

  const date = data.date ?? existing.date;
  const [year, month] = date.split("-");
  revalidatePath(`/months/${year}-${month}`);
}

export async function deleteTransaction(id: string) {
  const userId = await requireUserId();
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
  });
  if (!existing) throw new Error("Transaction not found");
  await db.delete(transactions).where(eq(transactions.id, id));
  const [year, month] = existing.date.split("-");
  revalidatePath(`/months/${year}-${month}`);
}

// ─── MonthlyIncome upsert ────────────────────────────────────────────────────

const incomeInput = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  amount: decimalString,
  currency: z.enum(["THB", "USD"]).default("THB"),
  note: z.string().max(2000).optional().nullable(),
});

export async function upsertMonthlyIncome(input: unknown) {
  const userId = await requireUserId();
  const data = incomeInput.parse(input);

  await db
    .insert(monthlyIncome)
    .values({
      userId,
      year: data.year,
      month: data.month,
      amount: data.amount,
      currency: data.currency,
      note: data.note ?? null,
    })
    .onConflictDoUpdate({
      target: [monthlyIncome.userId, monthlyIncome.year, monthlyIncome.month],
      set: {
        amount: data.amount,
        currency: data.currency,
        note: data.note ?? null,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/months/${pad(data.year)}-${pad2(data.month)}`);
}

// ─── BudgetLineDetail CRUD ────────────────────────────────────────────────────

const budgetLineDetailInput = z.object({
  budgetLineId: z.string().uuid(),
  name: z.string().min(1).max(500),
  amount: decimalString,
  currency: z.enum(["THB", "USD"]).default("THB"),
});

export async function createBudgetLineDetail(
  input: unknown,
): Promise<{ id: string; name: string; amount: string; currency: string }> {
  const userId = await requireUserId();
  const data = budgetLineDetailInput.parse(input);

  const bl = await db.query.budgetLines.findFirst({
    where: and(eq(budgetLines.id, data.budgetLineId), eq(budgetLines.userId, userId)),
  });
  if (!bl) throw new Error("Budget line not found");

  const [created] = await db
    .insert(budgetLineDetails)
    .values({ userId, budgetLineId: data.budgetLineId, name: data.name, amount: data.amount, currency: data.currency })
    .returning();
  if (!created) throw new Error("Insert failed");

  await syncDetailTotal(data.budgetLineId, bl.year, bl.month);
  return { id: created.id, name: created.name, amount: created.amount, currency: created.currency };
}

export async function deleteBudgetLineDetail(id: string) {
  const userId = await requireUserId();

  const existing = await db.query.budgetLineDetails.findFirst({
    where: and(eq(budgetLineDetails.id, id), eq(budgetLineDetails.userId, userId)),
  });
  if (!existing) throw new Error("Detail not found");

  await db.delete(budgetLineDetails).where(eq(budgetLineDetails.id, id));

  const bl = await db.query.budgetLines.findFirst({
    where: eq(budgetLines.id, existing.budgetLineId),
  });
  if (bl) await syncDetailTotal(existing.budgetLineId, bl.year, bl.month);
}

const updateDetailInput = z.object({
  name: z.string().min(1).max(500),
  amount: decimalString,
});

export async function updateBudgetLineDetail(id: string, input: unknown) {
  const userId = await requireUserId();
  const data = updateDetailInput.parse(input);

  const existing = await db.query.budgetLineDetails.findFirst({
    where: and(eq(budgetLineDetails.id, id), eq(budgetLineDetails.userId, userId)),
  });
  if (!existing) throw new Error("Detail not found");

  await db
    .update(budgetLineDetails)
    .set({ name: data.name, amount: data.amount, updatedAt: new Date() })
    .where(eq(budgetLineDetails.id, id));

  const bl = await db.query.budgetLines.findFirst({
    where: eq(budgetLines.id, existing.budgetLineId),
  });
  if (bl) await syncDetailTotal(existing.budgetLineId, bl.year, bl.month);
}

// ─── BudgetLine actual override ───────────────────────────────────────────────

export async function updateBudgetLineActual(id: string, amount: string | null) {
  const userId = await requireUserId();

  const existing = await db.query.budgetLines.findFirst({
    where: and(eq(budgetLines.id, id), eq(budgetLines.userId, userId)),
  });
  if (!existing) throw new Error("Budget line not found");

  const parsed = amount !== null ? z.string().regex(/^-?\d+(\.\d+)?$/).parse(amount) : null;

  await db
    .update(budgetLines)
    .set({ manualActual: parsed, updatedAt: new Date() })
    .where(eq(budgetLines.id, id));

  revalidatePath(`/months/${pad(existing.year)}-${pad2(existing.month)}`);
}

// ─── Category archive (soft-delete) ──────────────────────────────────────────

const PROTECTED_CATEGORY_NAMES = ["Personal Reward", "Special Expense"] as const;

export async function archiveCategory(id: string) {
  const userId = await requireUserId();

  const cat = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, userId)),
  });
  if (!cat) throw new Error("Category not found");

  if ((PROTECTED_CATEGORY_NAMES as readonly string[]).includes(cat.nameEn)) {
    throw new Error("This category is required and cannot be removed");
  }

  await db.update(categories).set({ isArchived: true, updatedAt: new Date() }).where(eq(categories.id, id));
  revalidatePath("/months", "layout");
}

// ─── Private helper ───────────────────────────────────────────────────────────

async function syncDetailTotal(budgetLineId: string, year: number, month: number) {
  const [row] = await db
    .select({ total: sum(budgetLineDetails.amount) })
    .from(budgetLineDetails)
    .where(eq(budgetLineDetails.budgetLineId, budgetLineId));

  const newTotal = row?.total ?? "0";
  await db
    .update(budgetLines)
    .set({ manualActual: newTotal === "0" ? null : newTotal, updatedAt: new Date() })
    .where(eq(budgetLines.id, budgetLineId));

  revalidatePath(`/months/${pad(year)}-${pad2(month)}`);
}

// ─── Month creation + copy from previous ─────────────────────────────────────

const createMonthInput = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  copyPlanFromPrevious: z.boolean().default(true),
});

export async function createMonth(input: unknown) {
  const userId = await requireUserId();
  const data = createMonthInput.parse(input);

  const existingLines = await db.query.budgetLines.findMany({
    where: and(
      eq(budgetLines.userId, userId),
      eq(budgetLines.year, data.year),
      eq(budgetLines.month, data.month),
    ),
  });

  if (existingLines.length === 0 && data.copyPlanFromPrevious) {
    // Silent if there's no previous month to copy from — typical first-run case.
    await copyPlanFromPreviousMonth(data.year, data.month, { silentIfEmpty: true });
  }

  revalidatePath(`/months/${pad(data.year)}-${pad2(data.month)}`);
  revalidatePath("/months");
}

export async function copyPlanFromPreviousMonth(
  year: number,
  month: number,
  options: { silentIfEmpty?: boolean } = {},
) {
  const userId = await requireUserId();
  const prev = previousMonth(year, month);

  const prevLines = await db.query.budgetLines.findMany({
    where: and(
      eq(budgetLines.userId, userId),
      eq(budgetLines.year, prev.year),
      eq(budgetLines.month, prev.month),
    ),
  });

  if (prevLines.length === 0) {
    if (options.silentIfEmpty) {
      return { copied: 0, skipped: 0, prevMonthEmpty: true } as const;
    }
    throw new Error(
      `No BudgetLines exist for ${prev.year}-${pad2(prev.month)} to copy from.`,
    );
  }

  // Idempotent: skip any (categoryId, itemNameTh) already present in target.
  const existing = await db.query.budgetLines.findMany({
    where: and(
      eq(budgetLines.userId, userId),
      eq(budgetLines.year, year),
      eq(budgetLines.month, month),
    ),
  });
  const existingKeys = new Set(existing.map((l) => `${l.categoryId}::${l.itemNameTh}`));

  const toInsert = prevLines
    .filter((l) => !existingKeys.has(`${l.categoryId}::${l.itemNameTh}`))
    .map((l) => ({
      userId,
      year,
      month,
      categoryId: l.categoryId,
      itemNameTh: l.itemNameTh,
      itemNameEn: l.itemNameEn,
      plannedAmount: l.plannedAmount,
      currency: l.currency,
      sortOrder: l.sortOrder,
    }));

  if (toInsert.length > 0) {
    await db.insert(budgetLines).values(toInsert);
  }

  revalidatePath(`/months/${pad(year)}-${pad2(month)}`);
  return { copied: toInsert.length, skipped: prevLines.length - toInsert.length };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(4, "0");
}
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

// Suppress unused-import warning for `sql` (kept for future raw queries)
void sql;
