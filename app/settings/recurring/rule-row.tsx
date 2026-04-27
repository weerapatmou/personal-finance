"use client";

import { useTransition } from "react";
import { toggleRecurringRule, deleteRecurringRule } from "./actions";

export function RuleRow({
  id,
  scope,
  rruleString,
  isActive,
  lastFiredAt,
  nextThree,
}: {
  id: string;
  scope: string;
  rruleString: string;
  isActive: boolean;
  lastFiredAt: string | null;
  nextThree: string[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{scope}</span>
          <code className="text-xs text-muted-foreground">{rruleString}</code>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await toggleRecurringRule(id, !isActive);
              })
            }
            className="rounded-md border px-2 py-1 text-xs"
          >
            {isActive ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this rule?")) return;
              startTransition(async () => {
                await deleteRecurringRule(id);
              });
            }}
            className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>Last fired: {lastFiredAt ?? "never"}</div>
        <div>Next: {nextThree.length > 0 ? nextThree.join(", ") : "—"}</div>
      </div>
    </li>
  );
}
