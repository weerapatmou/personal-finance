"use client";

import { useState, useTransition } from "react";
import { createBudgetLineDetail, deleteBudgetLineDetail } from "@/app/months/actions";

type Detail = { id: string; name: string; amount: string; currency: string };
type BudgetLineOption = { id: string; itemNameTh: string; itemNameEn: string | null };

function fmt(s: string | number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(s));
}

function DetailCard({
  budgetLine,
  details,
}: {
  budgetLine: BudgetLineOption;
  details: Detail[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const total = details.reduce((s, d) => s + Number(d.amount), 0);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount) return;
    setError(null);
    startTransition(async () => {
      try {
        await createBudgetLineDetail({
          budgetLineId: budgetLine.id,
          name: name.trim(),
          amount,
          currency: "THB",
        });
        setName("");
        setAmount("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add detail");
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteBudgetLineDetail(id);
    });
  };

  const label = budgetLine.itemNameEn
    ? `${budgetLine.itemNameEn} / ${budgetLine.itemNameTh}`
    : budgetLine.itemNameTh;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Detail — {label}
        </h3>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/10">
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {details.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-3 text-xs text-muted-foreground italic text-center">
                No items yet — add one below.
              </td>
            </tr>
          ) : (
            details.map((d) => (
              <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2">{d.name}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(d.amount)}</td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    disabled={pending}
                    className="text-muted-foreground hover:text-destructive transition-colors text-base leading-none disabled:opacity-40"
                    aria-label="Delete item"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {details.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/20">
              <td className="px-4 py-2 text-xs font-semibold text-right text-muted-foreground">Total</td>
              <td className="px-4 py-2 text-right font-semibold font-mono">{fmt(total)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      <form onSubmit={handleAdd} className="px-4 py-3 bg-muted/5 border-t border-dashed border-border">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Item name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nintendo Switch (1/12)"
              className="w-56 rounded border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Amount (฿)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-28 rounded border bg-background px-2 py-1.5 text-sm text-right font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !name.trim() || !amount}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50 transition-opacity"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </form>
    </div>
  );
}

export function BudgetLineDetailSection({
  budgetLines,
  detailsByLineId,
}: {
  budgetLines: BudgetLineOption[];
  detailsByLineId: Record<string, Detail[]>;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedLineId, setSelectedLineId] = useState(budgetLines[0]?.id ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Lines that already have details (always shown)
  const linesWithDetails = budgetLines.filter(
    (bl) => (detailsByLineId[bl.id]?.length ?? 0) > 0
  );

  // Lines without details (for the "add new section" dropdown)
  const linesWithoutDetails = budgetLines.filter(
    (bl) => (detailsByLineId[bl.id]?.length ?? 0) === 0
  );

  const handleAddFirst = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLineId || !name.trim() || !amount) return;
    setAddError(null);
    startTransition(async () => {
      try {
        await createBudgetLineDetail({
          budgetLineId: selectedLineId,
          name: name.trim(),
          amount,
          currency: "THB",
        });
        setName("");
        setAmount("");
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "Failed to add detail");
      }
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Budget Line Details
      </h2>

      {/* Cards for lines that already have details */}
      {linesWithDetails.map((bl) => (
        <DetailCard
          key={bl.id}
          budgetLine={bl}
          details={detailsByLineId[bl.id] ?? []}
        />
      ))}

      {/* Form to start a new detail section for a line without details */}
      {budgetLines.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Add detail to a budget line
          </p>
          <form onSubmit={handleAddFirst}>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Budget line</label>
                <select
                  value={selectedLineId}
                  onChange={(e) => setSelectedLineId(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm min-w-[200px]"
                >
                  {/* Show all lines, grouped by whether they have details */}
                  {linesWithDetails.length > 0 && (
                    <optgroup label="Has details">
                      {linesWithDetails.map((bl) => (
                        <option key={bl.id} value={bl.id}>
                          {bl.itemNameTh}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {linesWithoutDetails.length > 0 && (
                    <optgroup label="No details yet">
                      {linesWithoutDetails.map((bl) => (
                        <option key={bl.id} value={bl.id}>
                          {bl.itemNameTh}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Item name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pokemon ZA"
                  className="w-52 rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Amount (฿)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm text-right font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={pending || !name.trim() || !amount || !selectedLineId}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50 transition-opacity"
              >
                {pending ? "Adding…" : "Add"}
              </button>
            </div>
            {addError && <p className="mt-1.5 text-xs text-destructive">{addError}</p>}
          </form>
        </div>
      )}

      {budgetLines.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Add budget lines above to start tracking details.
        </p>
      )}
    </div>
  );
}
