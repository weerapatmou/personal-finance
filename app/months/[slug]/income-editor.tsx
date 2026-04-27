"use client";

import { useState, useTransition } from "react";
import { upsertMonthlyIncome } from "@/app/months/actions";

export function IncomeEditor({
  year,
  month,
  initialAmount,
}: {
  year: number;
  month: number;
  initialAmount: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialAmount);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        Income {fmt(value)} ✏️
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await upsertMonthlyIncome({ year, month, amount: value, currency: "THB" });
          setEditing(false);
        });
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-32 rounded-md border bg-background px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-muted-foreground hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

function fmt(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
  }).format(n);
}
