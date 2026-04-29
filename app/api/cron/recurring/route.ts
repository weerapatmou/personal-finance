import { NextResponse } from "next/server";
import { db } from "@/db";
import { recurringRules, budgetLines, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { expandOccurrences, isoDateToYearMonth } from "@/lib/recurring/expand";

type BudgetLineTemplate = {
  categoryId: string;
  itemNameTh: string;
  itemNameEn?: string | null;
  plannedAmount: string | number;
  currency?: string;
};

type TransactionTemplate = {
  accountId: string;
  categoryId: string;
  budgetLineId?: string | null;
  amount: string | number;
  currency?: string;
  type?: "EXPENSE" | "TRANSFER";
  note?: string | null;
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Process up to end-of-yesterday in ICT (UTC+7) — i.e. start of today UTC+7.
  // For simplicity here we treat `now` as the upper bound; idempotency via
  // unique index protects against double-fires.

  const activeRules = await db.query.recurringRules.findMany({
    where: eq(recurringRules.isActive, true),
  });

  let budgetLinesCreated = 0;
  let transactionsCreated = 0;
  let rulesProcessed = 0;
  const errors: string[] = [];

  for (const rule of activeRules) {
    rulesProcessed++;
    try {
      const after = rule.lastFiredAt ?? new Date(rule.startDate);
      const occurrences = expandOccurrences(rule.rruleString, after, now);

      for (const occIso of occurrences) {
        if (rule.scope === "BUDGET_LINE") {
          const tpl = rule.templateJson as unknown as BudgetLineTemplate;
          const { year, month } = isoDateToYearMonth(occIso);
          // Idempotency: rely on the unique index
          // (user_id, year, month, category_id, item_name_th).
          await db
            .insert(budgetLines)
            .values({
              userId: rule.userId,
              year,
              month,
              categoryId: tpl.categoryId,
              itemNameTh: tpl.itemNameTh,
              itemNameEn: tpl.itemNameEn ?? null,
              plannedAmount: String(tpl.plannedAmount),
              currency: tpl.currency ?? "THB",
              recurringTemplateId: rule.id,
            })
            .onConflictDoNothing();
          budgetLinesCreated++;
        } else {
          const tpl = rule.templateJson as unknown as TransactionTemplate;
          await db
            .insert(transactions)
            .values({
              userId: rule.userId,
              accountId: tpl.accountId,
              categoryId: tpl.categoryId,
              budgetLineId: tpl.budgetLineId ?? null,
              date: occIso,
              amount: String(tpl.amount),
              currency: tpl.currency ?? "THB",
              type: tpl.type ?? "EXPENSE",
              note: tpl.note ?? null,
              recurringRuleId: rule.id,
            })
            .onConflictDoNothing(); // unique on (recurring_rule_id, date)
          transactionsCreated++;
        }
      }

      await db
        .update(recurringRules)
        .set({ lastFiredAt: now, updatedAt: now })
        .where(eq(recurringRules.id, rule.id));
    } catch (err) {
      errors.push(
        `rule ${rule.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    rulesProcessed,
    budgetLinesCreated,
    transactionsCreated,
    errors,
  });
}
