"use client";

import { useState, useTransition, useRef } from "react";
import { updateBudgetLineActual } from "@/app/months/actions";

function fmtTHB(s: string | number | null): string {
  const n = Number(s ?? 0);
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(n);
}

function colorFor(actual: string | number, planned: string | number): string {
  return Number(actual) > Number(planned) ? "text-destructive" : "text-emerald-600";
}

export function ActualCell({
  budgetLineId,
  initialActual,
  planned,
}: {
  budgetLineId: string | null;
  initialActual: string;
  planned: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialActual);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const color = colorFor(initialActual, planned);

  if (!budgetLineId) {
    return <span className={`font-mono ${color}`}>{fmtTHB(initialActual)}</span>;
  }

  const save = () => {
    const clean = value.trim() === "" ? "0" : value.trim();
    setEditing(false);
    startTransition(async () => {
      await updateBudgetLineActual(budgetLineId, clean === "0" ? null : clean);
    });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(initialActual);
            setEditing(false);
          }
        }}
        className="w-28 rounded border bg-background px-2 py-0.5 text-right font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setEditing(true);
        setValue(initialActual === "0" ? "" : initialActual);
      }}
      className={`group/cell flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/50 transition-colors font-mono text-sm disabled:opacity-40 ${color}`}
      title="Click to edit actual"
    >
      <span>{fmtTHB(initialActual)}</span>
      <span className="text-[10px] text-muted-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity">
        ✏
      </span>
    </button>
  );
}
