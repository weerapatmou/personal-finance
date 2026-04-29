"use client";

import { useState, useTransition } from "react";
import {
  createBudgetLineDetail,
  updateBudgetLineDetail,
  deleteBudgetLineDetail,
} from "@/app/months/actions";
import Decimal from "decimal.js";

type Detail = { id: string; name: string; amount: string; currency: string };

function fmtTHB(v: string | number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(v));
}

function Modal({
  title,
  budgetLineId,
  initialDetails,
  onClose,
}: {
  title: string;
  budgetLineId: string;
  initialDetails: Detail[];
  onClose: () => void;
}) {
  const [items, setItems] = useState<Detail[]>(initialDetails);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((s, d) => s.plus(new Decimal(d.amount)), new Decimal(0));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newAmount) return;
    setError(null);
    startTransition(async () => {
      try {
        const created = await createBudgetLineDetail({
          budgetLineId,
          name: newName.trim(),
          amount: newAmount,
          currency: "THB",
        });
        setItems((prev) => [...prev, created]);
        setNewName("");
        setNewAmount("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add");
      }
    });
  };

  const startEdit = (d: Detail) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditAmount(d.amount);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim() || !editAmount) return;
    startTransition(async () => {
      try {
        await updateBudgetLineDetail(id, { name: editName.trim(), amount: editAmount });
        setItems((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, name: editName.trim(), amount: editAmount } : d,
          ),
        );
        setEditingId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      }
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    startTransition(async () => {
      try {
        await deleteBudgetLineDetail(id);
        setItems((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-base">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total: <span className="font-mono font-medium">{fmtTHB(total.toString())}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Items list */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                    No items yet — add one below.
                  </td>
                </tr>
              )}
              {items.map((d) =>
                editingId === d.id ? (
                  <tr key={d.id} className="bg-muted/10">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded border bg-background px-2 py-1 text-sm"
                        autoFocus
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-24 rounded border bg-background px-2 py-1 text-sm text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => saveEdit(d.id)}
                          disabled={pending}
                          className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground hover:underline px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">{d.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtTHB(d.amount)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Edit"
                        >
                          ✏
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id, d.name)}
                          disabled={pending}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                          aria-label="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold font-mono">
                    {fmtTHB(total.toString())}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Add form */}
        <div className="border-t border-dashed border-border px-4 py-3 bg-muted/5">
          <form onSubmit={handleAdd} className="flex gap-2 items-end">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-muted-foreground">Item name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Nintendo Switch (1/12)"
                className="rounded border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Amount (฿)</label>
              <input
                type="text"
                inputMode="decimal"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0"
                className="w-24 rounded border bg-background px-2 py-1.5 text-sm text-right font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={pending || !newName.trim() || !newAmount}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {pending ? "…" : "Add"}
            </button>
          </form>
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export function DetailActualCell({
  budgetLineId,
  categoryName,
  actual,
  initialDetails,
}: {
  budgetLineId: string;
  categoryName: string;
  actual: string;
  initialDetails: Detail[];
}) {
  const [open, setOpen] = useState(false);

  const fmtValue = new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(actual));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/50 transition-colors font-mono text-sm"
        title={`Edit ${categoryName} items`}
      >
        <span>{fmtValue}</span>
        <span className="text-[10px] text-primary opacity-60 group-hover:opacity-100 transition-opacity">
          📋
        </span>
      </button>

      {open && (
        <Modal
          title={`${categoryName} — Items`}
          budgetLineId={budgetLineId}
          initialDetails={initialDetails}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
