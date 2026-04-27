"use server";

import { db } from "@/db";
import { recurringRules } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { rrulestr } from "rrule";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

const ruleInput = z.object({
  scope: z.enum(["BUDGET_LINE", "TRANSACTION"]),
  rruleString: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  templateJson: z.record(z.string(), z.unknown()),
  isActive: z.boolean().default(true),
});

function validateRRule(s: string) {
  // Throws if the RRULE string is malformed.
  rrulestr(s);
}

export async function createRecurringRule(input: unknown) {
  const userId = await requireUserId();
  const data = ruleInput.parse(input);
  validateRRule(data.rruleString);

  await db.insert(recurringRules).values({
    userId,
    scope: data.scope,
    rruleString: data.rruleString,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    templateJson: data.templateJson,
    isActive: data.isActive,
  });

  revalidatePath("/settings/recurring");
}

export async function toggleRecurringRule(id: string, isActive: boolean) {
  const userId = await requireUserId();
  const existing = await db.query.recurringRules.findFirst({
    where: and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)),
  });
  if (!existing) throw new Error("Rule not found");

  await db
    .update(recurringRules)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(recurringRules.id, id));

  revalidatePath("/settings/recurring");
}

export async function deleteRecurringRule(id: string) {
  const userId = await requireUserId();
  const existing = await db.query.recurringRules.findFirst({
    where: and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)),
  });
  if (!existing) throw new Error("Rule not found");
  await db.delete(recurringRules).where(eq(recurringRules.id, id));
  revalidatePath("/settings/recurring");
}
