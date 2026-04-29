"use client";

import { useState, useTransition } from "react";
import { createBudgetLine, createCategory, archiveCategory } from "@/app/months/actions";
import type { Topic } from "@/lib/types";

type Category = { id: string; nameTh: string; nameEn: string };

const PROTECTED = ["Personal Reward", "Special Expense"] as const;
const isProtected = (nameEn: string) => (PROTECTED as readonly string[]).includes(nameEn);

type State =
  | { step: "idle" }
  | { step: "selecting" }
  | { step: "filling"; categoryId: string; categoryNameEn: string; categoryNameTh: string }
  | { step: "new_category" };

const STEP = 100;

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const adjust = (delta: number) => {
    const current = parseFloat(value) || 0;
    onChange(Math.max(0, current + delta).toFixed(0));
  };
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => adjust(-STEP)}
        className="h-8 w-8 flex items-center justify-center rounded border bg-background font-bold hover:bg-muted"
        aria-label="−100"
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm text-right font-mono"
      />
      <button
        type="button"
        onClick={() => adjust(STEP)}
        className="h-8 w-8 flex items-center justify-center rounded border bg-background font-bold hover:bg-muted"
        aria-label="+100"
      >
        +
      </button>
    </div>
  );
}

export function BudgetLineForm({
  year,
  month,
  topic,
  categories: initialCategories,
  topicLabel,
}: {
  year: number;
  month: number;
  topic: Topic;
  categories: Category[];
  topicLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>({ step: "idle" });
  const [cats, setCats] = useState<Category[]>(initialCategories);
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("0");
  const [catName, setCatName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setState({ step: "idle" });
    setItemName("");
    setAmount("0");
    setCatName("");
    setError(null);
  };

  const openForm = () =>
    setState(cats.length > 0 ? { step: "selecting" } : { step: "new_category" });

  // ── Delete (archive) a category pill ────────────────────────────────────────
  const handleDelete = (cat: Category) => {
    if (!window.confirm(`Remove category "${cat.nameEn}"?\n\nIt will be hidden from this list. Existing budget lines for this category are preserved.`)) return;
    startTransition(async () => {
      try {
        await archiveCategory(cat.id);
        setCats((prev) => prev.filter((c) => c.id !== cat.id));
        if (cats.length - 1 === 0) setState({ step: "new_category" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove category");
      }
    });
  };

  // ── Idle ─────────────────────────────────────────────────────────────────────
  if (state.step === "idle") {
    return (
      <tr>
        <td colSpan={3} className="px-5 py-2">
          <button
            type="button"
            onClick={openForm}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded border border-dashed border-muted-foreground text-[10px] font-bold group-hover:border-foreground">
              +
            </span>
            Add item to {topicLabel}
          </button>
        </td>
      </tr>
    );
  }

  // ── Selecting category ────────────────────────────────────────────────────────
  if (state.step === "selecting") {
    return (
      <tr>
        <td colSpan={3} className="px-5 py-3 bg-muted/10 border-t border-dashed border-border">
          <p className="text-xs text-muted-foreground mb-2.5">
            Select a category for{" "}
            <span className="font-medium text-foreground">{topicLabel}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span key={c.id} className="inline-flex items-center rounded-full border overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setState({
                      step: "filling",
                      categoryId: c.id,
                      categoryNameEn: c.nameEn,
                      categoryNameTh: c.nameTh,
                    })
                  }
                  className="px-3 py-1 text-xs hover:bg-muted transition-colors"
                >
                  {c.nameEn}
                </button>
                {!isProtected(c.nameEn) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    disabled={pending}
                    className="px-1.5 py-1 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border-l border-border disabled:opacity-40"
                    aria-label={`Remove ${c.nameEn}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setState({ step: "new_category" })}
              className="rounded-full border border-dashed px-3 py-1 text-xs hover:bg-muted transition-colors flex items-center gap-1"
            >
              <span className="text-[10px] font-bold">+</span> New category
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <button type="button" onClick={reset} className="mt-2.5 text-xs text-muted-foreground hover:underline">
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  // ── Filling details for existing category ─────────────────────────────────────
  if (state.step === "filling") {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!itemName.trim()) return;
      setError(null);
      startTransition(async () => {
        try {
          await createBudgetLine({
            year,
            month,
            categoryId: state.categoryId,
            itemNameTh: itemName.trim(),
            plannedAmount: amount || "0",
            currency: "THB",
          });
          reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
        }
      });
    };

    return (
      <tr>
        <td colSpan={3} className="px-5 py-3 bg-muted/10 border-t border-dashed border-border">
          <p className="text-xs text-muted-foreground mb-2.5">
            Add item to{" "}
            <span className="font-medium text-foreground">{state.categoryNameEn}</span>
          </p>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Item name</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={state.categoryNameTh}
                autoFocus
                className="w-48 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Planned amount (฿)</label>
              <AmountInput value={amount} onChange={setAmount} />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={pending || !itemName.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setState({ step: "selecting" })}
                className="text-xs text-muted-foreground hover:underline py-1.5"
              >
                ← Back
              </button>
              <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:underline py-1.5">
                Cancel
              </button>
            </div>
          </form>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </td>
      </tr>
    );
  }

  // ── New category ──────────────────────────────────────────────────────────────
  if (state.step === "new_category") {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!catName.trim()) return;
      setError(null);
      startTransition(async () => {
        try {
          const categoryId = await createCategory({
            topic,
            nameEn: catName.trim(),
            nameTh: catName.trim(),
          });
          await createBudgetLine({
            year,
            month,
            categoryId,
            itemNameTh: catName.trim(),
            plannedAmount: amount || "0",
            currency: "THB",
          });
          setCats((prev) => [...prev, { id: categoryId, nameEn: catName.trim(), nameTh: catName.trim() }]);
          reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to create");
        }
      });
    };

    return (
      <tr>
        <td colSpan={3} className="px-5 py-3 bg-muted/10 border-t border-dashed border-border">
          <p className="text-xs text-muted-foreground mb-2.5">
            New category in <span className="font-medium text-foreground">{topicLabel}</span>
          </p>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Category name</label>
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Internet"
                autoFocus
                className="w-44 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Planned amount (฿)</label>
              <AmountInput value={amount} onChange={setAmount} />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={pending || !catName.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create & Add"}
              </button>
              {cats.length > 0 && (
                <button
                  type="button"
                  onClick={() => setState({ step: "selecting" })}
                  className="text-xs text-muted-foreground hover:underline py-1.5"
                >
                  ← Back
                </button>
              )}
              <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:underline py-1.5">
                Cancel
              </button>
            </div>
          </form>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </td>
      </tr>
    );
  }

  return null;
}
