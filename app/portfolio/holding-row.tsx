"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import {
  editAssetUnits,
  deleteAssetHolding,
  updateManualHolding,
  deleteManualHolding,
} from "./actions";

interface AssetRowProps {
  kind: "asset";
  id: string;
  units: string;
}

interface ManualRowProps {
  kind: "manual";
  id: string;
  name: string;
  amount: string;
  currency: "THB" | "USD";
}

export function HoldingRowActions(props: AssetRowProps | ManualRowProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [units, setUnits] = useState(props.kind === "asset" ? props.units : "");
  const [name, setName] = useState(props.kind === "manual" ? props.name : "");
  const [amount, setAmount] = useState(props.kind === "manual" ? props.amount : "");
  const [currency, setCurrency] = useState<"THB" | "USD">(
    props.kind === "manual" ? props.currency : "THB",
  );

  function cancel() {
    setIsEditing(false);
    setError(null);
    if (props.kind === "asset") setUnits(props.units);
    else {
      setName(props.name);
      setAmount(props.amount);
      setCurrency(props.currency);
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        if (props.kind === "asset") {
          await editAssetUnits({ id: props.id, units });
        } else {
          await updateManualHolding({ id: props.id, name, amount, currency });
        }
        setIsEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function remove() {
    if (!confirm("Delete this holding? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        if (props.kind === "asset") {
          await deleteAssetHolding(props.id);
        } else {
          await deleteManualHolding(props.id);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        {props.kind === "asset" ? (
          <input
            type="number"
            step="any"
            min="0"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            className="w-28 rounded-lg border border-border bg-background px-2 py-1 text-sm"
            placeholder="Units"
          />
        ) : (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              placeholder="Name"
            />
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              placeholder="Amount"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "THB" | "USD")}
              className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </>
        )}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          aria-label="Save"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Edit"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={isPending}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        aria-label="Delete"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
