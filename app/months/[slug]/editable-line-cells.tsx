"use client";

import { useEffect, useState, useTransition } from "react";
import { updateBudgetLine } from "@/app/months/actions";

function fmtTHB(s: string | number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(s));
}

export function EditableNameCell({
  budgetLineId,
  initial,
}: {
  budgetLineId: string | null;
  initial: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  if (!budgetLineId) {
    return <span>{initial}</span>;
  }

  const save = () => {
    const trimmed = value.trim();
    setEditing(false);
    if (!trimmed || trimmed === initial) return;
    startTransition(async () => {
      try {
        await updateBudgetLine(budgetLineId, { itemNameTh: trimmed });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not save name");
        setValue(initial);
      }
    });
  };

  if (editing) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(initial);
            setEditing(false);
          }
        }}
        className="rounded border bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
        setValue(initial);
      }}
      className="group/name flex items-center gap-1 text-left rounded px-1 py-0.5 hover:bg-muted/50 transition-colors disabled:opacity-40"
      title="Click to edit name"
    >
      <span>{initial}</span>
      <span className="text-[10px] text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity">
        ✏
      </span>
    </button>
  );
}

export function EditablePlanCell({
  budgetLineId,
  initial,
}: {
  budgetLineId: string | null;
  initial: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  if (!budgetLineId) {
    return <span className="font-mono">{fmtTHB(initial)}</span>;
  }

  const save = () => {
    const clean = value.trim() === "" ? "0" : value.trim();
    setEditing(false);
    if (Number(clean) === Number(initial)) return;
    startTransition(async () => {
      try {
        await updateBudgetLine(budgetLineId, { plannedAmount: clean });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not save plan");
        setValue(initial);
      }
    });
  };

  const adjust = (delta: number) => {
    const cur = parseFloat(value) || 0;
    setValue(Math.max(0, cur + delta).toFixed(0));
  };

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            adjust(-100);
          }}
          className="h-7 w-7 flex items-center justify-center rounded border bg-background text-sm font-bold hover:bg-muted"
          aria-label="−100"
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(initial);
              setEditing(false);
            }
          }}
          className="w-28 rounded border bg-background px-2 py-0.5 text-right font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            adjust(100);
          }}
          className="h-7 w-7 flex items-center justify-center rounded border bg-background text-sm font-bold hover:bg-muted"
          aria-label="+100"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setEditing(true);
        setValue(initial);
      }}
      className="group/plan ml-auto flex items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-muted/50 transition-colors font-mono text-sm disabled:opacity-40"
      title="Click to edit planned amount"
    >
      <span>{fmtTHB(initial)}</span>
      <span className="text-[10px] text-muted-foreground opacity-0 group-hover/plan:opacity-100 transition-opacity">
        ✏
      </span>
    </button>
  );
}
