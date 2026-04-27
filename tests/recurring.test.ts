import { describe, expect, it } from "vitest";
import { expandOccurrences } from "@/lib/recurring/expand";

describe("expandOccurrences", () => {
  it("FREQ=MONTHLY;BYMONTHDAY=1 fires on the 1st of each month", () => {
    // last_fired = Jan 31 → after = Jan 31. until = Apr 5.
    // Expected occurrences: Feb 1, Mar 1, Apr 1.
    const out = expandOccurrences(
      "DTSTART:20260101T000000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1",
      new Date("2026-01-31T00:00:00Z"),
      new Date("2026-04-05T00:00:00Z"),
    );
    expect(out).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
  });

  it("long gap (~60 days) produces 2 monthly occurrences", () => {
    // Cron last fired Feb 15 → next runs cover Mar 1 and Apr 1 by Apr 30.
    const out = expandOccurrences(
      "DTSTART:20260101T000000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1",
      new Date("2026-02-15T00:00:00Z"),
      new Date("2026-04-30T00:00:00Z"),
    );
    expect(out).toEqual(["2026-03-01", "2026-04-01"]);
  });

  it("returns empty when the rule has not fired since the last run", () => {
    const out = expandOccurrences(
      "DTSTART:20260101T000000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=15",
      new Date("2026-04-15T00:00:00Z"), // already fired
      new Date("2026-04-25T00:00:00Z"),
    );
    expect(out).toEqual([]);
  });

  it("FREQ=WEEKLY;BYDAY=MO fires every Monday in range", () => {
    const out = expandOccurrences(
      "DTSTART:20260101T000000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO",
      new Date("2026-04-01T00:00:00Z"),
      new Date("2026-04-30T00:00:00Z"),
    );
    // April 2026 Mondays: 6, 13, 20, 27.
    expect(out).toEqual(["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"]);
  });
});
