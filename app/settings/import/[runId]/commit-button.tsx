"use client";

import { useState, useTransition } from "react";
import { commitImport } from "../actions";

export function CommitButton({ runId, disabled }: { runId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          setResult(null);
          if (!confirm("Commit this import? This writes BudgetLines and Transactions and cannot be undone.")) return;
          startTransition(async () => {
            try {
              const r = await commitImport(runId);
              setResult(
                `Committed: ${r.budgetLinesCreated} budget lines, ${r.transactionsCreated} transactions, ${r.incomeRowsCreated} income rows`,
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            }
          });
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Committing…" : "Commit"}
      </button>
      {result && <p className="text-xs text-emerald-600">{result}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
