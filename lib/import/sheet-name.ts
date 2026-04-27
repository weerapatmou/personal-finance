// Resolve a workbook sheet name to a (year, month) pair, handling all 22
// historical naming styles in the user's xlsx (per SPEC §7.1).
//
// Returns null for non-month sheets (Investment Summary, Plan Personal Finance,
// COMPOUND, Template Finance Detail).

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const SKIP_SHEETS = new Set([
  "investment summary",
  "plan personal finance",
  "compound",
  "template finance detail",
]);

export function resolveSheetMonth(
  sheetName: string,
): { year: number; month: number } | null {
  const norm = sheetName.trim().toLowerCase();
  if (SKIP_SHEETS.has(norm)) return null;

  // Try patterns in priority order.
  // 1. "MONTH YYYY" or "MONTH YY" (with optional space)
  const m1 = norm.match(/^([a-z]+)\s*(\d{2,4})$/i);
  if (m1) {
    const month = MONTH_LOOKUP[m1[1]!.toLowerCase()];
    if (month) {
      const year = expandYear(Number(m1[2]));
      if (year) return { year, month };
    }
  }

  // 2. "MONTH YYYY" with no space — e.g. "JUL2024"
  const m2 = norm.match(/^([a-z]+)(\d{4})$/i);
  if (m2) {
    const month = MONTH_LOOKUP[m2[1]!.toLowerCase()];
    if (month) return { year: Number(m2[2]), month };
  }

  return null;
}

/**
 * 2-digit year handling per SPEC §7.1: yy in [20..40] → 2000+yy. Otherwise
 * we assume the user wrote a full 4-digit year.
 */
function expandYear(yy: number): number | null {
  if (yy >= 1900) return yy;
  if (yy >= 20 && yy <= 40) return 2000 + yy;
  return null;
}
