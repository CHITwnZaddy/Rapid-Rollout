import { describe, expect, it } from "vitest";
import { formatMarginPercent, withinRange } from "../helpers";

describe("formatMarginPercent", () => {
  it("renders a dash for null or undefined margin", () => {
    expect(formatMarginPercent(null)).toBe("—");
    expect(formatMarginPercent(undefined)).toBe("—");
  });

  it("formats to two decimals by default", () => {
    expect(formatMarginPercent(42.5)).toBe("42.50%");
  });

  it("respects a custom precision", () => {
    expect(formatMarginPercent(42.567, 1)).toBe("42.6%");
  });
});

describe("withinRange", () => {
  it("includes a late-evening Chicago time on the 'to' day", () => {
    expect(withinRange("2026-04-18T23:30:00-05:00", null, "2026-04-18")).toBe(
      true
    );
  });

  it("excludes a time just after Chicago midnight following the 'to' day", () => {
    expect(withinRange("2026-04-19T00:30:00-05:00", null, "2026-04-18")).toBe(
      false
    );
  });

  it("excludes a Chicago time on the day before 'from' even when UTC is already 'from'", () => {
    expect(withinRange("2026-04-17T22:00:00-05:00", "2026-04-18", null)).toBe(
      false
    );
  });

  it("starts 'from' at Chicago midnight, not UTC midnight", () => {
    // 2026-03-01 is CST (UTC-6), so Chicago midnight is 06:00Z.
    expect(withinRange("2026-03-01T05:59:59Z", "2026-03-01", null)).toBe(false);
    expect(withinRange("2026-03-01T06:00:00Z", "2026-03-01", null)).toBe(true);
  });

  it("includes a late time on the 25-hour fall-back day", () => {
    expect(
      withinRange("2026-11-01T23:45:00-06:00", "2026-11-01", "2026-11-01")
    ).toBe(true);
  });

  it("treats a null timestamp as in range only when unfiltered", () => {
    expect(withinRange(null, null, null)).toBe(true);
    expect(withinRange(null, "2026-01-01", null)).toBe(false);
  });

  it("returns false for an unparseable timestamp", () => {
    expect(withinRange("not-a-date", null, null)).toBe(false);
  });
});
