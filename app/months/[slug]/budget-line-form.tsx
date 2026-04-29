"use client";

import { useState, useTransition } from "react";
import { createBudgetLine } from "@/app/months/actions";

type Category = { id: string; nameTh: string; nameEn: string };

export function BudgetLineForm({
  year,
  month,
  categories,
  topicLabel,
}: {
  year: number;
  month: number;
  categories: Category[];
  topicLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const STEP = 100;

  const adjust = (delta: number) => {
    const current = parseFloat(amount) || 0;
    const next = Math.max(0, current + delta);
    setAmount(next.toFixed(0));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;
    setError(null);
    startTransition(async () => {
      try {
        await createBudgetLine({
          year,
          month,
          categoryId,
          itemNameTh: name.trim(),
          plannedAmount: amount || "0",
          currency: "THB",
        });
        setName("");
        setAmount("0");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item");
      }
    });
  };

  if (categories.length === 0) return null;

  if (!open) {
    return (
      <tr>
        <td colSpan={3} className="px-5 py-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded border border-dashed border-muted-foreground text-[10px] font-bold">+</span>
            Add item to {topicLabel}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={3} className="px-5 py-3 bg-muted/10 border-t border-dashed border-border">
        <form onSubmit={handleSubmit}>
          <p className="text-xs font-medium text-muted-foreground mb-2.5">
            New budget line — {topicLabel}
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm min-w-[180px]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn} / {c.nameTh}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Item name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Netflix"
                className="w-44 rounded-md border bg-background px-2 py-1.5 text-sm"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Planned amount (฿)</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => adjust(-STEP)}
                  className="h-8 w-8 flex items-center justify-center rounded border bg-background text-sm font-bold hover:bg-muted transition-colors"
                  aria-label="Decrease by 100"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm text-right font-mono"
                />
                <button
                  type="button"
                  onClick={() => adjust(STEP)}
                  className="h-8 w-8 flex items-center justify-center rounded border bg-background text-sm font-bold hover:bg-muted transition-colors"
                  aria-label="Increase by 100"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50 transition-opacity"
              >
                {pending ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setError(null); }}
                className="text-xs text-muted-foreground hover:underline py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </form>
      </td>
    </tr>
  );
}
