import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { recurringRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rrulestr } from "rrule";
import { RuleRow } from "./rule-row";
import { CreateRuleForm } from "./create-rule-form";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";

export default async function RecurringSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const rules = await db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.userId, userId));

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
        <div className="pt-8 lg:pt-0 space-y-4">
          <BackButton href="/" label="Dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Recurring Rules</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Auto-populate budget lines or transactions on a schedule using ICAL RRULE strings.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Active Rules</h2>
          </div>
          {rules.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No rules yet.</p>
          ) : (
            <ul className="divide-y divide-border">
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
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Create Rule</h2>
          <CreateRuleForm />
        </div>
      </div>
    </AppShell>
  );
}
