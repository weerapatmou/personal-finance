"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface YearSelectorProps {
  selectedYear: number;
  years: number[];
}

export function YearSelector({ selectedYear, years }: YearSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", next);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <select
      value={selectedYear}
      disabled={pending}
      onChange={onChange}
      className="rounded-md border bg-background px-3 py-2 text-sm"
      aria-label="Select year"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
