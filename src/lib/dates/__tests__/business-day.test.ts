import { describe, expect, it } from "vitest";
import {
  BUSINESS_TIME_ZONE,
  addDaysToDateInput,
  businessCalendarDaysBetween,
  businessDateOf,
  businessDayBoundsUtc,
  isValidDateInput,
  startOfBusinessDayUtc,
} from "../business-day";

describe("BUSINESS_TIME_ZONE", () => {
  it("is America/Chicago", () => {
    expect(BUSINESS_TIME_ZONE).toBe("America/Chicago");
  });
});

describe("isValidDateInput", () => {
  it.each(["2026-03-31", "2028-02-29"])("accepts %s", (value) => {
    expect(isValidDateInput(value)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-3-1",
    "garbage",
    "",
    "2026-03-31T00:00:00Z",
  ])("rejects %j", (value) => {
    expect(isValidDateInput(value)).toBe(false);
  });
});

describe("addDaysToDateInput", () => {
  it.each([
    ["2026-03-31", 1, "2026-04-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-03-08", 1, "2026-03-09"],
  ] as const)("%s + %i -> %s", (value, days, expected) => {
    expect(addDaysToDateInput(value, days)).toBe(expected);
  });
});

describe("businessDateOf", () => {
  it.each([
    ["2026-03-31T23:30:00-05:00", "2026-03-31"],
    ["2026-04-01T04:30:00Z", "2026-03-31"],
    ["2026-04-01T05:00:00Z", "2026-04-01"],
  ])("%s -> %s", (value, expected) => {
    expect(businessDateOf(value)).toBe(expected);
  });

  it("accepts a Date", () => {
    expect(businessDateOf(new Date("2026-12-31T23:59:59.999-06:00"))).toBe(
      "2026-12-31"
    );
  });

  it("returns null for an unparseable value without throwing", () => {
    expect(() => businessDateOf("garbage")).not.toThrow();
    expect(businessDateOf("garbage")).toBeNull();
  });
});

describe("startOfBusinessDayUtc", () => {
  it.each([
    ["2026-01-01", "2026-01-01T06:00:00.000Z"],
    ["2026-07-01", "2026-07-01T05:00:00.000Z"],
    ["2026-03-08", "2026-03-08T06:00:00.000Z"],
    ["2026-03-09", "2026-03-09T05:00:00.000Z"],
    ["2026-11-01", "2026-11-01T05:00:00.000Z"],
    ["2026-11-02", "2026-11-02T06:00:00.000Z"],
    ["2028-02-29", "2028-02-29T06:00:00.000Z"],
  ])("%s -> %s", (value, expected) => {
    expect(startOfBusinessDayUtc(value)).toBe(expected);
  });

  it("throws on an invalid date", () => {
    expect(() => startOfBusinessDayUtc("2026-02-30")).toThrow(
      "Invalid date filter: 2026-02-30"
    );
  });
});

describe("businessDayBoundsUtc", () => {
  it("covers Q1 2026 in Chicago", () => {
    expect(businessDayBoundsUtc("2026-01-01", "2026-03-31")).toEqual({
      gte: "2026-01-01T06:00:00.000Z",
      lt: "2026-04-01T05:00:00.000Z",
    });
  });

  it("covers the full year 2026 in Chicago", () => {
    expect(businessDayBoundsUtc("2026-01-01", "2026-12-31").lt).toBe(
      "2027-01-01T06:00:00.000Z"
    );
  });

  it("returns only lt when dateFrom is undefined", () => {
    const bounds = businessDayBoundsUtc(undefined, "2026-03-08");
    expect(bounds).toEqual({ lt: "2026-03-09T05:00:00.000Z" });
    expect("gte" in bounds).toBe(false);
  });

  it("skips empty-string bounds", () => {
    expect(businessDayBoundsUtc("", "")).toEqual({});
  });

  it("spans the fall-back change", () => {
    expect(businessDayBoundsUtc("2026-10-31", "2026-11-01")).toEqual({
      gte: "2026-10-31T05:00:00.000Z",
      lt: "2026-11-02T06:00:00.000Z",
    });
  });

  it("names the user's dateTo value when it is invalid", () => {
    expect(() => businessDayBoundsUtc(undefined, "2026-02-30")).toThrow(
      "Invalid date filter: 2026-02-30"
    );
  });

  it("includes 11:30 PM CDT on quarter-end day", () => {
    const { gte, lt } = businessDayBoundsUtc("2026-01-01", "2026-03-31");
    const t = Date.parse("2026-03-31T23:30:00-05:00");
    expect(t).toBeGreaterThanOrEqual(Date.parse(gte!));
    expect(t).toBeLessThan(Date.parse(lt!));
  });

  it("excludes 12:30 AM CDT Apr 1", () => {
    const { lt } = businessDayBoundsUtc("2026-01-01", "2026-03-31");
    const t = Date.parse("2026-04-01T00:30:00-05:00");
    expect(t).toBeGreaterThanOrEqual(Date.parse(lt!));
  });
});

describe("businessCalendarDaysBetween", () => {
  it.each([
    [
      "spring-forward, same wall time",
      "2026-03-01T09:00:00-06:00",
      "2026-03-22T09:00:00-05:00",
      21,
    ],
    [
      "late evening into spring-forward day",
      "2026-03-07T23:30:00-06:00",
      "2026-03-08T23:00:00-05:00",
      1,
    ],
    [
      "inside the 23-hour day",
      "2026-03-08T00:30:00-06:00",
      "2026-03-08T23:45:00-05:00",
      0,
    ],
    [
      "inside the 25-hour fall-back day",
      "2026-11-01T00:30:00-05:00",
      "2026-11-01T23:45:00-06:00",
      0,
    ],
    [
      "across fall-back",
      "2026-10-25T09:00:00-05:00",
      "2026-11-08T09:00:00-06:00",
      14,
    ],
    [
      "evening change, next morning",
      "2026-04-21T23:30:00-05:00",
      "2026-04-22T08:00:00-05:00",
      1,
    ],
    [
      "same Chicago day straddling UTC midnight",
      "2026-04-21T19:30:00-05:00",
      "2026-04-21T23:59:00-05:00",
      0,
    ],
    [
      "year boundary",
      "2026-12-31T23:00:00-06:00",
      "2027-01-01T00:30:00-06:00",
      1,
    ],
    [
      "late-evening UTC start",
      "2026-03-02T05:30:00Z",
      "2026-03-22T17:00:00Z",
      21,
    ],
    [
      "start after end across midnight",
      "2026-04-22T00:00:00.500-05:00",
      "2026-04-21T23:59:59.900-05:00",
      -1,
    ],
  ])("%s", (_label, start, end, expected) => {
    expect(businessCalendarDaysBetween(start, end)).toBe(expected);
  });

  it("accepts a Date as end", () => {
    expect(
      businessCalendarDaysBetween(
        "2026-03-01T09:00:00-06:00",
        new Date("2026-03-22T09:00:00-05:00")
      )
    ).toBe(21);
  });

  it("returns null for an unparseable value", () => {
    expect(
      businessCalendarDaysBetween("garbage", "2026-03-22T09:00:00-05:00")
    ).toBeNull();
    expect(
      businessCalendarDaysBetween("2026-03-01T09:00:00-06:00", "garbage")
    ).toBeNull();
  });

  it("is independent of the process time zone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      expect(
        businessCalendarDaysBetween(
          "2026-03-01T09:00:00-06:00",
          "2026-03-22T09:00:00-05:00"
        )
      ).toBe(21);
      expect(
        businessCalendarDaysBetween(
          "2026-04-21T19:30:00-05:00",
          "2026-04-21T23:59:00-05:00"
        )
      ).toBe(0);
      expect(startOfBusinessDayUtc("2026-03-09")).toBe(
        "2026-03-09T05:00:00.000Z"
      );
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    }
  });
});
