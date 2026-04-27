"use client";

import { useTransition } from "react";
import { setDisplayCurrency } from "@/app/actions";

export function CurrencySelector({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue="THB"
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as "THB" | "USD";
        startTransition(async () => {
          await setDisplayCurrency(userId, value);
        });
      }}
      className="rounded-md border bg-background px-3 py-2 text-sm"
    >
      <option value="THB">THB (฿)</option>
      <option value="USD">USD ($)</option>
    </select>
  );
}
