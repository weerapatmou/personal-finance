"use client";

import { useState, useTransition } from "react";
import { createRecurringRule } from "./actions";

export function CreateRuleForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const scope = String(fd.get("scope") ?? "BUDGET_LINE");
        const rruleString = String(fd.get("rruleString") ?? "");
        const startDate = String(fd.get("startDate") ?? "");
        const tplJson = String(fd.get("templateJson") ?? "{}");

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(tplJson);
        } catch {
          setError("templateJson must be valid JSON");
          return;
        }

        startTransition(async () => {
          try {
            await createRecurringRule({
              scope,
              rruleString,
              startDate,
              templateJson: parsed,
              isActive: true,
            });
            (e.target as HTMLFormElement).reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
      className="grid gap-3 rounded-md border p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        Scope
        <select
          name="scope"
          defaultValue="BUDGET_LINE"
          className="rounded-md border bg-background px-3 py-2"
        >
          <option value="BUDGET_LINE">Budget line</option>
          <option value="TRANSACTION">Transaction</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        RRULE string
        <input
          name="rruleString"
          required
          placeholder="FREQ=MONTHLY;BYMONTHDAY=1"
          className="rounded-md border bg-background px-3 py-2 font-mono text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Start date
        <input
          type="date"
          name="startDate"
          required
          className="rounded-md border bg-background px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Template JSON (data to clone on each fire)
        <textarea
          name="templateJson"
          rows={4}
          required
          defaultValue={
            '{\n  "categoryId": "<uuid>",\n  "itemNameTh": "ค่าเช่า Condo",\n  "plannedAmount": "5000",\n  "currency": "THB"\n}'
          }
          className="rounded-md border bg-background px-3 py-2 font-mono text-xs"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        {pending ? "Creating…" : "Create rule"}
      </button>
    </form>
  );
}
