"use client";

import { useState, useTransition } from "react";
import { updateStagingMapping } from "../actions";

type Row = {
  id: string;
  sheetName: string;
  rawTopic: string | null;
  rawCategory: string | null;
  rawItemName: string | null;
  rawPlan: string | null;
  rawActual: string | null;
  mappingStatus: string;
  mappedCategoryId: string | null;
  mappedItemNameTh: string | null;
};

type Cat = { id: string; topic: string; nameTh: string; nameEn: string };

export function MappingTable({ rows, categories }: { rows: Row[]; categories: Cat[] }) {
  const [filter, setFilter] = useState<"ALL" | "UNMAPPED" | "MAPPED" | "SKIPPED">("UNMAPPED");

  const filtered = rows.filter((r) =>
    filter === "ALL" ? true : r.mappingStatus === filter,
  );

  return (
    <>
      <div className="flex gap-2 text-sm">
        {(["ALL", "UNMAPPED", "MAPPED", "SKIPPED"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md border px-3 py-1 ${
              filter === f ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-2">Sheet</th>
              <th className="py-2 pr-2">Topic</th>
              <th className="py-2 pr-2">Category (raw)</th>
              <th className="py-2 pr-2">Item (raw)</th>
              <th className="py-2 pr-2 text-right">Plan</th>
              <th className="py-2 pr-2 text-right">Actual</th>
              <th className="py-2 pr-2">Maps to</th>
              <th className="py-2 pr-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <MappingRow key={r.id} row={r} categories={categories} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MappingRow({ row, categories }: { row: Row; categories: Cat[] }) {
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(row.mappedCategoryId ?? "");
  const [itemName, setItemName] = useState(row.mappedItemNameTh ?? row.rawItemName ?? "");
  const [status, setStatus] = useState(row.mappingStatus);

  const filteredCategories = row.rawTopic
    ? categories.filter((c) => c.topic === row.rawTopic)
    : categories;

  const save = (newStatus: "MAPPED" | "SKIPPED") => {
    startTransition(async () => {
      await updateStagingMapping({
        stagingId: row.id,
        topic:
          row.rawTopic === "FIX" ||
          row.rawTopic === "VARIABLE" ||
          row.rawTopic === "INVESTMENT" ||
          row.rawTopic === "TAX"
            ? row.rawTopic
            : null,
        categoryId: newStatus === "SKIPPED" ? null : categoryId || null,
        itemNameTh: newStatus === "SKIPPED" ? null : itemName || null,
        status: newStatus,
      });
      setStatus(newStatus);
    });
  };

  return (
    <tr className={`border-b ${status === "SKIPPED" ? "opacity-40" : ""}`}>
      <td className="py-1 pr-2">{row.sheetName}</td>
      <td className="py-1 pr-2">{row.rawTopic ?? "—"}</td>
      <td className="py-1 pr-2 text-muted-foreground">{row.rawCategory ?? "—"}</td>
      <td className="py-1 pr-2 max-w-[16rem] truncate">{row.rawItemName ?? "—"}</td>
      <td className="py-1 pr-2 text-right font-mono">{row.rawPlan ?? "—"}</td>
      <td className="py-1 pr-2 text-right font-mono">{row.rawActual ?? "—"}</td>
      <td className="py-1 pr-2">
        <div className="flex flex-col gap-1">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="">—</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameTh}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="item name"
            className="rounded-md border bg-background px-2 py-1 text-xs"
          />
        </div>
      </td>
      <td className="py-1 pr-2">
        <div className="flex gap-1">
          <button
            type="button"
            disabled={pending || !categoryId || !itemName}
            onClick={() => save("MAPPED")}
            className="rounded-md border px-2 py-1 text-xs disabled:opacity-30"
          >
            Map
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => save("SKIPPED")}
            className="rounded-md border px-2 py-1 text-xs"
          >
            Skip
          </button>
        </div>
      </td>
    </tr>
  );
}
