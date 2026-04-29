"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteHolding } from "@/app/portfolio/actions";

export function DeleteHoldingButton({
  holdingId,
  name,
}: {
  holdingId: string;
  name: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(`Delete "${name}"? This removes the holding and all its transactions.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deleteHolding(holdingId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        aria-label={`Delete ${name}`}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
