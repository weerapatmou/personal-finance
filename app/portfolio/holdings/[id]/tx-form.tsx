"use client";

import { useState, useTransition } from "react";
import { createInvestmentTx } from "@/app/portfolio/actions";

export function TxForm({ holdingId }: { holdingId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("BUY");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const payload = {
          holdingId,
          date: String(fd.get("date") ?? ""),
          type: String(fd.get("type") ?? "BUY") as
            | "BUY"
            | "SELL"
            | "DIVIDEND"
            | "FEE"
            | "SPLIT"
            | "TRANSFER_IN"
            | "TRANSFER_OUT",
          units: emptyToNull(fd.get("units")),
          priceNative: emptyToNull(fd.get("priceNative")),
          feesNative: String(fd.get("feesNative") ?? "0"),
          amountNative: emptyToNull(fd.get("amountNative")),
          splitRatio: emptyToNull(fd.get("splitRatio")),
          note: emptyToNull(fd.get("note")),
        };
        startTransition(async () => {
          try {
            await createInvestmentTx(payload);
            (e.target as HTMLFormElement).reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
      className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2"
    >
      <select
        name="type"
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        {["BUY", "SELL", "DIVIDEND", "FEE", "SPLIT", "TRANSFER_IN", "TRANSFER_OUT"].map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="date"
        required
        className="rounded-md border bg-background px-3 py-2 text-sm"
      />
      {(type === "BUY" || type === "SELL" || type === "TRANSFER_IN" || type === "TRANSFER_OUT") && (
        <>
          <input
            type="text"
            inputMode="decimal"
            name="units"
            placeholder="units"
            required
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            inputMode="decimal"
            name="priceNative"
            placeholder="price (native)"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            inputMode="decimal"
            name="feesNative"
            placeholder="fees"
            defaultValue="0"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </>
      )}
      {type === "SPLIT" && (
        <input
          type="text"
          inputMode="decimal"
          name="splitRatio"
          placeholder="ratio (1:10 reverse → 0.1)"
          required
          className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2"
        />
      )}
      {(type === "DIVIDEND" || type === "FEE") && (
        <input
          type="text"
          inputMode="decimal"
          name="amountNative"
          placeholder="amount (native)"
          required
          className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2"
        />
      )}
      <input
        type="text"
        name="note"
        placeholder="note"
        className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2"
      />
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground sm:col-span-2"
      >
        {pending ? "Saving…" : "Add transaction"}
      </button>
    </form>
  );
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}
