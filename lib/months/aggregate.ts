import Decimal from "decimal.js";
import type { Topic } from "@/lib/types";

export type AggregateInput = {
  budgetLines: Array<{
    id: string;
    categoryId: string;
    itemNameTh: string;
    itemNameEn: string | null;
    plannedAmount: string | number | Decimal;
    sortOrder: number;
  }>;
  transactions: Array<{
    id: string;
    categoryId: string;
    budgetLineId: string | null;
    amount: string | number | Decimal;
    currency: string;
    date: string;
  }>;
  categories: Array<{
    id: string;
    topic: Topic;
    nameTh: string;
    nameEn: string;
    sortOrder: number;
  }>;
};

export type LineRow = {
  budgetLineId: string | null; // null when there's an "Uncategorized" actual with no plan
  categoryId: string;
  itemNameTh: string;
  itemNameEn: string | null;
  planned: Decimal;
  actual: Decimal;
};

export type CategoryGroup = {
  categoryId: string;
  categoryNameTh: string;
  categoryNameEn: string;
  lines: LineRow[];
  plannedSubtotal: Decimal;
  actualSubtotal: Decimal;
};

export type TopicGroup = {
  topic: Topic;
  categories: CategoryGroup[];
  plannedSubtotal: Decimal;
  actualSubtotal: Decimal;
};

export type AggregateResult = {
  groups: TopicGroup[];
  totalPlanned: Decimal;
  totalActual: Decimal;
};

const ZERO = new Decimal(0);
const TOPIC_ORDER: Topic[] = ["FIX", "VARIABLE", "INVESTMENT", "TAX"];

/**
 * Compute the Plan-vs-Actual table for a single month.
 *
 * Inputs are pre-fetched DB rows scoped to the user + month. This function
 * performs the grouping, summing, and topic-ordering deterministically so
 * snapshots are stable across renders.
 */
export function aggregateMonth(input: AggregateInput): AggregateResult {
  const catById = new Map(input.categories.map((c) => [c.id, c]));

  // Group transactions by (categoryId, budgetLineId).
  const txByLine = new Map<string, Decimal>();
  for (const tx of input.transactions) {
    const key = `${tx.categoryId}::${tx.budgetLineId ?? "_unmapped_"}`;
    const cur = txByLine.get(key) ?? ZERO;
    txByLine.set(key, cur.plus(new Decimal(tx.amount)));
  }

  // Build line rows: every budget line plus any "_unmapped_" transactions
  // for which no budget line exists.
  type Bucket = { categoryId: string; lines: LineRow[] };
  const bucketByCat = new Map<string, Bucket>();

  for (const bl of input.budgetLines) {
    const cat = catById.get(bl.categoryId);
    if (!cat) continue;
    const planned = new Decimal(bl.plannedAmount);
    const actual = txByLine.get(`${bl.categoryId}::${bl.id}`) ?? ZERO;
    const bucket = bucketByCat.get(cat.id) ?? { categoryId: cat.id, lines: [] };
    bucket.lines.push({
      budgetLineId: bl.id,
      categoryId: cat.id,
      itemNameTh: bl.itemNameTh,
      itemNameEn: bl.itemNameEn,
      planned,
      actual,
    });
    bucketByCat.set(cat.id, bucket);
  }

  // Add "Uncategorized" rows for transactions whose budget_line_id is null.
  for (const [key, sum] of txByLine.entries()) {
    if (!key.endsWith("::_unmapped_")) continue;
    const categoryId = key.split("::")[0]!;
    const cat = catById.get(categoryId);
    if (!cat) continue;
    const bucket = bucketByCat.get(categoryId) ?? { categoryId, lines: [] };
    bucket.lines.push({
      budgetLineId: null,
      categoryId,
      itemNameTh: "(ไม่จัดประเภท)",
      itemNameEn: "(Uncategorized)",
      planned: ZERO,
      actual: sum,
    });
    bucketByCat.set(categoryId, bucket);
  }

  // Roll into topic groups.
  const groupByTopic = new Map<Topic, TopicGroup>();
  for (const t of TOPIC_ORDER) {
    groupByTopic.set(t, {
      topic: t,
      categories: [],
      plannedSubtotal: ZERO,
      actualSubtotal: ZERO,
    });
  }

  for (const [catId, bucket] of bucketByCat.entries()) {
    const cat = catById.get(catId);
    if (!cat) continue;
    const plannedSub = bucket.lines.reduce((s, l) => s.plus(l.planned), ZERO);
    const actualSub = bucket.lines.reduce((s, l) => s.plus(l.actual), ZERO);

    const tg = groupByTopic.get(cat.topic)!;
    tg.categories.push({
      categoryId: cat.id,
      categoryNameTh: cat.nameTh,
      categoryNameEn: cat.nameEn,
      lines: bucket.lines.sort((a, b) => a.itemNameTh.localeCompare(b.itemNameTh, "th")),
      plannedSubtotal: plannedSub,
      actualSubtotal: actualSub,
    });
    tg.plannedSubtotal = tg.plannedSubtotal.plus(plannedSub);
    tg.actualSubtotal = tg.actualSubtotal.plus(actualSub);
  }

  // Sort categories within a topic by sortOrder, then nameTh.
  for (const tg of groupByTopic.values()) {
    tg.categories.sort((a, b) => {
      const ca = catById.get(a.categoryId);
      const cb = catById.get(b.categoryId);
      const sa = ca?.sortOrder ?? 0;
      const sb = cb?.sortOrder ?? 0;
      if (sa !== sb) return sa - sb;
      return a.categoryNameTh.localeCompare(b.categoryNameTh, "th");
    });
  }

  const groups = TOPIC_ORDER.map((t) => groupByTopic.get(t)!);
  const totalPlanned = groups.reduce((s, g) => s.plus(g.plannedSubtotal), ZERO);
  const totalActual = groups.reduce((s, g) => s.plus(g.actualSubtotal), ZERO);

  return { groups, totalPlanned, totalActual };
}

/**
 * The "highlight overspend" rule used by the UI. Returns true when actual
 * exceeds plan by more than `thresholdPct` percent. `plan == 0` is never
 * highlighted (no plan, no overspend).
 */
export function isOverBudget(
  planned: Decimal,
  actual: Decimal,
  thresholdPct: number,
): boolean {
  if (planned.isZero()) return false;
  const ratio = actual.dividedBy(planned).minus(1).times(100);
  return ratio.greaterThan(thresholdPct);
}
