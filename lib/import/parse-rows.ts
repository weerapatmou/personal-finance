import type { Topic } from "@/lib/types";

export type RawRow = {
  sheetName: string;
  rowIndex: number;
  rawTopic: string | null;
  rawItemName: string | null;
  rawCategory: string | null;
  rawPlan: number | null;
  rawActual: number | null;
  parseWarnings: string[];
};

export type ColumnRow = {
  A: string | number | null;
  B: string | number | null;
  C: string | number | null;
  D: string | number | null;
  E: string | number | null;
};

const TOPIC_LABELS: Record<string, Topic> = {
  "fix cost": "FIX",
  "variable cost": "VARIABLE",
  "investment": "INVESTMENT",
  "tax": "TAX",
};

const INCOME_LABEL = "income";

/**
 * Parse the rows of a single monthly sheet, handling the column-shift quirk
 * documented in SPEC §7.1: when a row's category cell is blank, the plan
 * value sits in column C (not D) and actual in column E. Topic carries
 * forward across same-group rows.
 *
 * Special handling:
 *   - The footer "Income" row is detected and emitted with rawTopic='_INCOME_'.
 *   - Category inheritance: blank category inherits from the most recent
 *     same-topic row that had an explicit category.
 */
export function parseSheetRows(
  sheetName: string,
  rows: ColumnRow[],
): RawRow[] {
  const out: RawRow[] = [];
  let currentTopic: Topic | null = null;
  let lastCategoryByTopic = new Map<Topic, string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const a = stripStr(r.A);
    const b = stripStr(r.B);
    const c = stripStr(r.C);
    const d = stripStr(r.D);
    const e = stripStr(r.E);

    if (!a && !b && !c && !d && !e) continue; // blank row

    // Topic header: column A is one of the four topic labels. Item is in B.
    const topicMatch = a ? TOPIC_LABELS[a.toLowerCase()] : null;
    if (topicMatch) {
      currentTopic = topicMatch;
      // The first row of a topic group has Item in B, Category in C, Plan in D, Actual in E.
      const item = b;
      const category = isNumericLike(c) ? null : c;
      const plan = parseNumber(d) ?? (category === null ? parseNumber(c) : null);
      const actual = parseNumber(e);

      if (item) {
        if (category) lastCategoryByTopic.set(currentTopic, category);
        out.push({
          sheetName,
          rowIndex: i + 1,
          rawTopic: topicMatch,
          rawItemName: item,
          rawCategory: category ?? lastCategoryByTopic.get(currentTopic) ?? null,
          rawPlan: plan,
          rawActual: actual,
          parseWarnings: [],
        });
      }
      continue;
    }

    // Income row: A column says "income".
    if (a && a.toLowerCase() === INCOME_LABEL) {
      const amount = parseNumber(e) ?? parseNumber(d) ?? parseNumber(c);
      out.push({
        sheetName,
        rowIndex: i + 1,
        rawTopic: "_INCOME_",
        rawItemName: "Income",
        rawCategory: null,
        rawPlan: null,
        rawActual: amount,
        parseWarnings: [],
      });
      continue;
    }

    // Subsequent rows in the same topic: item in A, category in C if a string,
    // plan in C (number) and actual in E if category is blank,
    // otherwise plan in D and actual in E.
    if (currentTopic && a) {
      const cIsNumber = isNumericLike(c);
      const category = cIsNumber ? null : c;
      const plan = cIsNumber
        ? parseNumber(c)
        : parseNumber(d) ?? (category ? null : parseNumber(c));
      const actual = parseNumber(e);

      if (category) lastCategoryByTopic.set(currentTopic, category);
      const inheritedCategory =
        category ?? lastCategoryByTopic.get(currentTopic) ?? null;

      out.push({
        sheetName,
        rowIndex: i + 1,
        rawTopic: currentTopic,
        rawItemName: a,
        rawCategory: inheritedCategory,
        rawPlan: plan,
        rawActual: actual,
        parseWarnings: [],
      });
      continue;
    }
  }

  return out;
}

function stripStr(v: string | number | null | undefined): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseNumber(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isNumericLike(v: string): boolean {
  if (!v) return false;
  return /^-?[\d,]+(\.\d+)?$/.test(v.trim());
}
