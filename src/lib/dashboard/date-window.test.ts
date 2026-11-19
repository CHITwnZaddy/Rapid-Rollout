import { describe, expect, it } from "vitest";
import {
  buildDashboardDrillDowns,
  buildReportHref,
  firstParam,
  resolveDashboardDateWindow,
} from "./date-window";

const DATE_WINDOW_PARAM = /dateFrom|dateTo|range=/;

describe("buildDashboardDrillDowns", () => {
  it.each(["mine", "team"] as const)(
    "drill-down links carry scope and origin but no date window (%s scope)",
    (scope) => {
      const links = buildDashboardDrillDowns(scope);

      expect(links.openProposalHref).toBe(
        `/reports/proposal-log?scope=${scope}&from=dashboard&status=open`
      );
      expect(links.onHoldHref).toBe(
        `/reports/proposal-log?scope=${scope}&from=dashboard&status=On+Hold`
      );
      expect(links.staleHref).toBe(
        `/reports/stale-proposals?scope=${scope}&from=dashboard&bucket=stale`
      );
      expect(links.stageHref("Awaiting Sig")).toBe(
        `/reports/proposal-log?scope=${scope}&from=dashboard&status=Awaiting+Sig`
      );

      for (const href of [
        links.openProposalHref,
        links.onHoldHref,
        links.staleHref,
        links.stageHref("Awaiting Sig"),
      ]) {
        expect(href).not.toMatch(DATE_WINDOW_PARAM);
      }
    }
  );
});

describe("resolveDashboardDateWindow", () => {
  it("current-year uses the Chicago year on New Year's Eve evening", () => {
    // 05:30 UTC on 2027-01-01, so a UTC server would pick 2027.
    const now = new Date("2026-12-31T23:30:00-06:00");

    expect(resolveDashboardDateWindow({}, now)).toEqual({
      range: "current-year",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      label: "2026",
      year: 2026,
    });
  });

  it("current-quarter on quarter-end evening stays in Q1", () => {
    // 01:00 UTC on April 1.
    const now = new Date("2026-03-31T20:00:00-05:00");

    expect(
      resolveDashboardDateWindow({ range: "current-quarter" }, now)
    ).toEqual({
      range: "current-quarter",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
      label: "Q1 2026",
      year: 2026,
    });
  });

  it("current-quarter in the first minutes of Q2", () => {
    const now = new Date("2026-04-01T00:30:00-05:00");

    expect(
      resolveDashboardDateWindow({ range: "current-quarter" }, now)
    ).toEqual({
      range: "current-quarter",
      dateFrom: "2026-04-01",
      dateTo: "2026-06-30",
      label: "Q2 2026",
      year: 2026,
    });
  });

  it("current-quarter in Q4 ends on December 31", () => {
    const now = new Date("2026-11-19T12:00:00-06:00");

    expect(
      resolveDashboardDateWindow({ range: "current-quarter" }, now)
    ).toEqual({
      range: "current-quarter",
      dateFrom: "2026-10-01",
      dateTo: "2026-12-31",
      label: "Q4 2026",
      year: 2026,
    });
  });

  it("custom passes valid dates through", () => {
    const now = new Date("2026-11-19T12:00:00-06:00");

    expect(
      resolveDashboardDateWindow(
        { range: "custom", dateFrom: "2025-11-01", dateTo: "2026-03-31" },
        now
      )
    ).toEqual({
      range: "custom",
      dateFrom: "2025-11-01",
      dateTo: "2026-03-31",
      label: "2025-11-01 to 2026-03-31",
      year: 2025,
    });
  });

  it("custom falls back on invalid or missing dates", () => {
    const now = new Date("2026-11-19T12:00:00-06:00");

    expect(
      resolveDashboardDateWindow(
        { range: "custom", dateFrom: "abc", dateTo: "2026-02-30" },
        now
      )
    ).toEqual({
      range: "custom",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      label: "2026-01-01 to 2026-12-31",
      year: 2026,
    });

    expect(resolveDashboardDateWindow({ range: "custom" }, now)).toEqual({
      range: "custom",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      label: "2026-01-01 to 2026-12-31",
      year: 2026,
    });

    expect(
      resolveDashboardDateWindow(
        { range: "custom", dateFrom: "", dateTo: "2026-6-1" },
        now
      )
    ).toMatchObject({ dateFrom: "2026-01-01", dateTo: "2026-12-31" });
  });

  it("custom fallbacks use the Chicago year on New Year's Eve evening", () => {
    const now = new Date("2026-12-31T23:30:00-06:00");

    expect(resolveDashboardDateWindow({ range: "custom" }, now)).toMatchObject(
      { dateFrom: "2026-01-01", dateTo: "2026-12-31", year: 2026 }
    );
  });

  it("array params use the first value", () => {
    const now = new Date("2026-11-19T12:00:00-06:00");

    expect(
      resolveDashboardDateWindow(
        {
          range: ["custom", "current-quarter"],
          dateFrom: ["2025-02-01", "2024-01-01"],
          dateTo: ["2025-02-28", "not-a-date"],
        },
        now
      )
    ).toEqual({
      range: "custom",
      dateFrom: "2025-02-01",
      dateTo: "2025-02-28",
      label: "2025-02-01 to 2025-02-28",
      year: 2025,
    });

    expect(
      resolveDashboardDateWindow(
        { range: ["current-quarter", "custom"] },
        now
      )
    ).toMatchObject({ range: "current-quarter", label: "Q4 2026" });
  });

  it("unknown range falls back to current-year", () => {
    const now = new Date("2026-11-19T12:00:00-06:00");

    expect(
      resolveDashboardDateWindow(
        { range: "last-decade", dateFrom: "2020-01-01", dateTo: "2020-12-31" },
        now
      )
    ).toEqual({
      range: "current-year",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      label: "2026",
      year: 2026,
    });
  });

  it("does not depend on the process time zone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        expect(
          resolveDashboardDateWindow(
            { range: "current-quarter" },
            new Date("2026-03-31T23:30:00-05:00")
          )
        ).toMatchObject({ dateFrom: "2026-01-01", label: "Q1 2026" });
        expect(
          resolveDashboardDateWindow({}, new Date("2026-12-31T23:30:00-06:00"))
        ).toMatchObject({ year: 2026 });
      }
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    }
  });
});

describe("firstParam", () => {
  it("returns the first array value, the string itself, or undefined", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
    expect(firstParam([])).toBeUndefined();
  });
});

describe("buildReportHref", () => {
  it("drops empty and undefined params and omits a bare '?'", () => {
    expect(
      buildReportHref("/reports/proposal-log", {
        scope: "team",
        status: undefined,
        q: "",
      })
    ).toBe("/reports/proposal-log?scope=team");
    expect(buildReportHref("/reports/proposal-log", {})).toBe(
      "/reports/proposal-log"
    );
  });
});
