import { RRule, rrulestr } from "rrule";

/**
 * Compute the occurrence dates for a recurring rule that fall in
 * `(after, until]`. Returns ISO `yyyy-mm-dd` strings, sorted ascending.
 *
 * - Uses the `rrule` library so we never reinvent ICAL recurrence math.
 * - The `after` boundary is exclusive so a cron run at T can safely
 *   `last_fired_at = T` and re-running is idempotent.
 * - The `until` boundary is inclusive (the cron always passes
 *   end-of-yesterday-ICT here).
 */
export function expandOccurrences(
  rruleString: string,
  after: Date,
  until: Date,
): string[] {
  const rule = rrulestr(rruleString) as RRule;
  // We want (after, until] — exclusive on the lower bound so a rule that just
  // fired doesn't fire again, inclusive on the upper bound so an occurrence
  // exactly at `until` (e.g. today's run boundary) is not skipped.
  // rrule.between(after, until, inc=true) is [after, until]; we then filter
  // out the lower bound.
  const occs = rule.between(after, until, true).filter((d) => d.getTime() > after.getTime());
  return occs.map(toIsoDate);
}

export function toIsoDate(d: Date): string {
  // Treat the rrule output as UTC and format as yyyy-mm-dd. This is correct
  // for date-only RRULEs (BYMONTHDAY, BYDAY) which the app uses.
  const year = d.getUTCFullYear().toString().padStart(4, "0");
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoDateToYearMonth(iso: string): { year: number; month: number } {
  const [y, m] = iso.split("-");
  return { year: Number(y), month: Number(m) };
}
