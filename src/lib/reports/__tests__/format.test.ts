import { describe, expect, it } from "vitest";
import {
  formatDateShort,
  reportBusinessDay,
  toDateOrNull,
} from "../format";

// D5: report dates show the America/Chicago calendar day, the same day the
// range filters (withinRange / applyDateRange) and day counts use.
describe("report date formatting", () => {
  it("shows an evening Chicago timestamp on its Chicago day, not the UTC day", () => {
    // 2026-03-31 19:30 CDT is 2026-04-01T00:30Z.
    expect(reportBusinessDay("2026-04-01T00:30:00Z")).toBe("2026-03-31");
    expect(formatDateShort("2026-04-01T00:30:00Z")).toBe("31 MAR 26");
  });

  it("writes the XLSX cell as midnight UTC of the Chicago day", () => {
    const cell = toDateOrNull("2026-04-01T00:30:00Z");
    expect(cell?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("keeps a bare DATE value as is", () => {
    expect(reportBusinessDay("2026-03-31")).toBe("2026-03-31");
    expect(formatDateShort("2026-03-31")).toBe("31 MAR 26");
    expect(toDateOrNull("2026-03-31")?.toISOString()).toBe(
      "2026-03-31T00:00:00.000Z"
    );
  });

  it("handles the fall-back DST day", () => {
    // 2026-11-01 23:30 CST is 2026-11-02T05:30Z.
    expect(formatDateShort("2026-11-02T05:30:00Z")).toBe("01 NOV 26");
  });

  it("shows a dash for empty or invalid values", () => {
    for (const value of [null, undefined, "", "not a date", "2026-02-30"]) {
      expect(formatDateShort(value)).toBe("—");
      expect(toDateOrNull(value)).toBeNull();
    }
  });
});
