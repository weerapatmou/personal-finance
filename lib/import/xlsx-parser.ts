import ExcelJS from "exceljs";
import { resolveSheetMonth } from "./sheet-name";
import { parseSheetRows, type ColumnRow, type RawRow } from "./parse-rows";

export type StagedRow = RawRow & {
  inferredYear: number | null;
  inferredMonth: number | null;
};

const TYPO_MAP: Record<string, string> = {
  "ค่าอาหาร Neslte": "ค่าอาหาร Nestle",
};

/**
 * Parse a `.xlsx` file from a Buffer or Uint8Array, producing a flat list of
 * staging rows ready to insert into `import_staging`.
 *
 * Skips non-month sheets via `resolveSheetMonth`; applies the legacy typo map
 * during normalization (per SPEC §7.1).
 */
export async function parseXlsxToStaging(
  data: ArrayBuffer | Buffer | Uint8Array,
): Promise<StagedRow[]> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS's `load` accepts an ArrayBuffer-like; the type is narrower than
  // node Buffer in newer @types/node, so cast at the boundary.
  await workbook.xlsx.load(data as any);

  const out: StagedRow[] = [];

  workbook.eachSheet((sheet) => {
    const yearMonth = resolveSheetMonth(sheet.name);
    if (!yearMonth) return; // skip non-month sheets

    const cells: ColumnRow[] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      cells.push({
        A: extractCell(row.getCell(1)),
        B: extractCell(row.getCell(2)),
        C: extractCell(row.getCell(3)),
        D: extractCell(row.getCell(4)),
        E: extractCell(row.getCell(5)),
      });
    });

    const parsed = parseSheetRows(sheet.name, cells);
    for (const r of parsed) {
      const itemName = r.rawItemName
        ? (TYPO_MAP[r.rawItemName] ?? r.rawItemName).normalize("NFC")
        : null;
      out.push({
        ...r,
        rawItemName: itemName,
        inferredYear: yearMonth.year,
        inferredMonth: yearMonth.month,
      });
    }
  });

  return out;
}

function extractCell(cell: ExcelJS.Cell): string | number | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "object") {
    // Formula result
    if ("result" in v && v.result != null) {
      const result = v.result as unknown;
      if (typeof result === "string" || typeof result === "number") return result;
    }
    // Rich text
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as Array<{ text: string }>).map((r) => r.text).join("");
    }
    // Date
    if (v instanceof Date) return v.toISOString();
  }
  return null;
}
