"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteBudgetLine } from "@/app/months/actions";

export function DeleteLineButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!window.confirm(`Delete "${name}"?\n\nThis removes the budget line and any detail items under it.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteBudgetLine(id);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive transition-opacity disabled:opacity-40"
      aria-label={`Delete ${name}`}
      title="Delete"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
