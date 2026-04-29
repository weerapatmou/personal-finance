"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteMonth } from "@/app/months/actions";

export function DeleteMonthButton({
  year,
  month,
  label,
}: {
  year: number;
  month: number;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete ${label}?\n\nThis removes the budget plan, income, and all detail items for that month. Transactions are preserved.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteMonth(year, month);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete month");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
