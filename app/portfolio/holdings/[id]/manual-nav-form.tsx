"use client";

import { useState, useTransition } from "react";
import { upsertManualNav } from "@/app/portfolio/actions";

export function ManualNavForm({ symbol }: { symbol: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            await upsertManualNav({
              symbol,
              date: String(fd.get("date") ?? ""),
              nav: String(fd.get("nav") ?? ""),
            });
            (e.target as HTMLFormElement).reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
      className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-3"
    >
      <input
        type="date"
        name="date"
        required
        className="rounded-md border bg-background px-3 py-2 text-sm"
      />
      <input
        type="text"
        inputMode="decimal"
        name="nav"
        placeholder="NAV"
        required
        className="rounded-md border bg-background px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        {pending ? "…" : "Save NAV"}
      </button>
      {error && <p className="text-sm text-destructive sm:col-span-3">{error}</p>}
    </form>
  );
}
