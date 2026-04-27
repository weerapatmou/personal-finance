import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { recurringRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rrulestr } from "rrule";
import { RuleRow } from "./rule-row";
import { CreateRuleForm } from "./create-rule-form";

export default async function RecurringSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const rules = await db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.userId, userId));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Recurring rules</h1>
        <p className="text-sm text-muted-foreground">
          Auto-populate budget lines or transactions on a schedule. Uses ICAL RRULE strings.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-medium">Active rules</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((r) => {
              let nextThree: string[] = [];
              try {
                const rule = rrulestr(r.rruleString);
                nextThree = rule
                  .all((d, i) => i < 3 && d > new Date())
                  .map((d) => d.toISOString().slice(0, 10));
              } catch {
                nextThree = [];
              }
              return (
                <RuleRow
                  key={r.id}
                  id={r.id}
                  scope={r.scope}
                  rruleString={r.rruleString}
                  isActive={r.isActive}
                  lastFiredAt={r.lastFiredAt?.toISOString() ?? null}
                  nextThree={nextThree}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Create rule</h2>
        <CreateRuleForm />
      </section>
    </main>
  );
}
