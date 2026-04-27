"use client";

import { useTransition, useState } from "react";
import { copyPlanFromPreviousMonth } from "@/app/months/actions";

export function CopyPlanButton({ year, month }: { year: number; month: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await copyPlanFromPreviousMonth(year, month);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed");
            }
          });
        }}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Copying…" : "Copy plan from previous"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
