import { describe, expect, it } from "vitest";
import {
  calculateClosedWonTotal,
  calculateCountByStage,
  calculateOpenProposalValue,
  calculateOnHoldCount,
  calculateQuotaProgress,
  calculateStaleCount,
  calculateValueByStage,
  calculateVarianceRollups,
  classifyStaleness,
  isStale,
  staleThresholdFor,
  type ClosedFinancialsRow,
  type StaleThresholds,
} from "./sales-ops";

const baseProposal = {
  id: "p",
  ownerId: "se-1",
  value: 0,
  soldPrice: null,
  loeValue: null,
  loeSignedDate: null,
  statusChangedAt: "2026-04-01T00:00:00Z",
};

describe("sales ops dashboard metrics", () => {
  it("counts Awaiting Sig as open pipeline but not quota progress", () => {
    const proposals = [
      { ...baseProposal, id: "p1", status: "Awaiting Sig", value: 50_000 },
      {
        ...baseProposal,
        id: "p2",
        status: "Closed Won",
        value: 100_000,
        soldPrice: 90_000,
        loeValue: 100_000,
        loeSignedDate: "2026-05-01",
      },
    ];

    expect(calculateOpenProposalValue(proposals)).toBe(50_000);
    expect(
      calculateQuotaProgress(proposals, {
        targetAmount: 200_000,
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      })
    ).toEqual({
      targetAmount: 200_000,
      closedSoldPrice: 90_000,
      percentToTarget: 45,
      remainingToTarget: 110_000,
    });
  });

  it("counts Closed Won by LoE signed date", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "in-range",
        status: "Closed Won",
        soldPrice: 100_000,
        loeValue: 100_000,
        loeSignedDate: "2026-03-31",
      },
      {
        ...baseProposal,
        id: "out-of-range",
        status: "Closed Won",
        soldPrice: 500_000,
        loeValue: 500_000,
        loeSignedDate: "2026-04-01",
      },
    ];

    expect(
      calculateQuotaProgress(proposals, {
        targetAmount: 200_000,
        dateFrom: "2026-01-01",
        dateTo: "2026-03-31",
      }).closedSoldPrice
    ).toBe(100_000);
  });

  it("groups value and count by stage", () => {
    const proposals = [
      { ...baseProposal, id: "p1", status: "Discovery", value: 10_000 },
      { ...baseProposal, id: "p2", status: "Discovery", value: 15_000 },
      { ...baseProposal, id: "p3", status: "Scoping", value: 20_000 },
      { ...baseProposal, id: "p4", status: "Closed Lost", value: 99_000 },
    ];

    expect(calculateValueByStage(proposals)).toEqual([
      { status: "Discovery", value: 25_000 },
      { status: "Scoping", value: 20_000 },
    ]);
    expect(calculateCountByStage(proposals)).toEqual([
      { status: "Discovery", count: 2 },
      { status: "Scoping", count: 1 },
    ]);
  });

  it("uses days in current status and editable thresholds for stale count", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "stale",
        status: "Discovery",
        statusChangedAt: "2026-04-01T00:00:00Z",
      },
      {
        ...baseProposal,
        id: "fresh",
        status: "Scoping",
        statusChangedAt: "2026-04-25T00:00:00Z",
      },
      {
        ...baseProposal,
        id: "hold",
        status: "On Hold",
        statusChangedAt: "2026-01-01T00:00:00Z",
      },
    ];

    expect(
      calculateStaleCount(proposals, {
        now: new Date("2026-05-01T00:00:00Z"),
        thresholds: { Discovery: 21, Scoping: 21 },
      })
    ).toBe(1);
    expect(calculateOnHoldCount(proposals)).toBe(1);
  });

  it("rolls up under, even, and over variance", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "under",
        status: "Closed Won",
        soldPrice: 100_000,
        loeValue: 90_000,
      },
      {
        ...baseProposal,
        id: "even",
        status: "Closed Won",
        soldPrice: 50_000,
        loeValue: 50_000,
      },
      {
        ...baseProposal,
        id: "over",
        status: "Closed Won",
        soldPrice: 25_000,
        loeValue: 30_000,
      },
    ];

    expect(calculateVarianceRollups(proposals)).toEqual({
      underCount: 1,
      evenCount: 1,
      overCount: 1,
      netVariance: -5000,
      underVarianceTotal: -10000,
      overVarianceTotal: 5000,
    });
  });
});

// Live prod and staging values of proposal_stale_thresholds.
const SEEDED = {
  Discovery: 21,
  Scoping: 21,
  "Proposal Draft": 5,
  "Sent for Review": 3,
  Negotiations: 3,
  "Awaiting Sig": 14,
} satisfies StaleThresholds;

const MS_PER_DAY = 86_400_000;

describe("stale thresholds", () => {
  it.each([
    ["Discovery", 21, false],
    ["Scoping", 21, false],
    ["Proposal Draft", 5, false],
    ["Sent for Review", 3, false],
    ["Negotiations", 3, false],
    ["Awaiting Sig", 14, false],
    ["Discovery", 22, true],
    ["Proposal Draft", 6, true],
    ["Sent for Review", 4, true],
    ["Negotiations", 4, true],
    ["Awaiting Sig", 15, true],
  ] as const)(
    "isStale uses strict > per seeded threshold: %s at %i days -> %s",
    (status, days, expected) => {
      expect(isStale(status, days, SEEDED)).toBe(expected);
      expect(classifyStaleness(status, days, SEEDED)).toBe(
        expected ? "stale" : "fresh"
      );
    }
  );

  it("staleThresholdFor returns the seeded threshold for tracked statuses", () => {
    expect(staleThresholdFor("Sent for Review", SEEDED)).toBe(3);
    expect(staleThresholdFor("Awaiting Sig", SEEDED)).toBe(14);
    expect(staleThresholdFor("On Hold", SEEDED)).toBeNull();
    expect(staleThresholdFor("Discovery", { Discovery: 0 })).toBeNull();
  });

  it("a 10-day Sent for Review proposal is stale", () => {
    // The old fixed 21-day report rule called this fresh.
    expect(isStale("Sent for Review", 10, SEEDED)).toBe(true);
    expect(classifyStaleness("Sent for Review", 10, SEEDED)).toBe("stale");
  });

  it.each(["On Hold", "Closed Won", "Closed Lost"])(
    "never flags untracked statuses: %s",
    (status) => {
      expect(isStale(status, 999, SEEDED)).toBe(false);
      expect(classifyStaleness(status, 999, SEEDED)).toBeNull();
    }
  );

  it("missing threshold is unclassified", () => {
    const withoutScoping: StaleThresholds = { ...SEEDED };
    delete withoutScoping.Scoping;

    expect(classifyStaleness("Scoping", 100, withoutScoping)).toBeNull();
    expect(isStale("Scoping", 100, withoutScoping)).toBe(false);
  });

  it("null days is unclassified", () => {
    expect(classifyStaleness("Discovery", null, SEEDED)).toBeNull();
    expect(isStale("Discovery", null, SEEDED)).toBe(false);
  });

  it("calculateStaleCount counts exactly what isStale flags", () => {
    const now = new Date("2026-05-01T17:00:00Z");
    const proposals = Object.entries(SEEDED).flatMap(([status, threshold]) =>
      [threshold, threshold + 1].map((days) => ({
        ...baseProposal,
        id: `${status}-${days}`,
        status,
        // Same wall time, `days` calendar days earlier (no DST change in range).
        statusChangedAt: new Date(now.getTime() - days * MS_PER_DAY).toISOString(),
      }))
    );

    const flagged = proposals.filter((proposal) =>
      isStale(
        proposal.status,
        Math.round(
          (now.getTime() - new Date(proposal.statusChangedAt).getTime()) /
            MS_PER_DAY
        ),
        SEEDED
      )
    );

    expect(flagged).toHaveLength(6);
    expect(calculateStaleCount(proposals, { now, thresholds: SEEDED })).toBe(6);
  });

  it("stale count uses Chicago calendar days across spring-forward", () => {
    // Mar 1 -> Mar 23 is 22 Chicago calendar days. The old floor of elapsed
    // 24-hour periods gave 21, which is not > 21.
    const proposals = [
      {
        ...baseProposal,
        id: "dst",
        status: "Discovery",
        statusChangedAt: "2026-03-01T09:00:00-06:00",
      },
    ];

    expect(
      calculateStaleCount(proposals, {
        now: new Date("2026-03-23T08:00:00-05:00"),
        thresholds: { Discovery: 21 },
      })
    ).toBe(1);
  });

  it("unparseable statusChangedAt is not stale", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "bad-date",
        status: "Discovery",
        statusChangedAt: "not a date",
      },
    ];

    expect(
      calculateStaleCount(proposals, {
        now: new Date("2026-05-01T17:00:00Z"),
        thresholds: SEEDED,
      })
    ).toBe(0);
  });
});

describe("closed won by LoE signed date", () => {
  const FY_2026 = { dateFrom: "2026-01-01", dateTo: "2026-12-31" };

  it("FY closed sold counts a deal created last year and signed this year", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "created-2025",
        status: "Closed Won",
        soldPrice: 250_000,
        loeValue: 250_000,
        loeSignedDate: "2026-03-31",
      },
      {
        ...baseProposal,
        id: "created-2026",
        status: "Closed Won",
        soldPrice: 100_000,
        loeValue: 100_000,
        loeSignedDate: "2026-06-15",
      },
    ];

    expect(
      calculateQuotaProgress(proposals, { targetAmount: 700_000, ...FY_2026 })
    ).toEqual({
      targetAmount: 700_000,
      closedSoldPrice: 350_000,
      percentToTarget: 50,
      remainingToTarget: 350_000,
    });
  });

  it("window bounds are inclusive DATE strings", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "first-day",
        status: "Closed Won",
        soldPrice: 1_000,
        loeSignedDate: "2026-01-01",
      },
      {
        ...baseProposal,
        id: "last-day",
        status: "Closed Won",
        soldPrice: 2_000,
        loeSignedDate: "2026-12-31",
      },
      {
        ...baseProposal,
        id: "next-year",
        status: "Closed Won",
        soldPrice: 4_000,
        loeSignedDate: "2027-01-01",
      },
    ];

    expect(
      calculateQuotaProgress(proposals, { targetAmount: 10_000, ...FY_2026 })
        .closedSoldPrice
    ).toBe(3_000);
  });

  it("Closed Won with null loeSignedDate is excluded", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "no-date",
        status: "Closed Won",
        soldPrice: 75_000,
        loeSignedDate: null,
      },
    ];

    expect(
      calculateQuotaProgress(proposals, { targetAmount: 100_000, ...FY_2026 })
        .closedSoldPrice
    ).toBe(0);
  });

  it("a reopened deal in an open status is not quota", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "reopened",
        status: "Negotiations",
        soldPrice: 50_000,
        loeSignedDate: "2026-02-01",
      },
    ];

    expect(
      calculateQuotaProgress(proposals, { targetAmount: 100_000, ...FY_2026 })
        .closedSoldPrice
    ).toBe(0);
  });

  it("accepts closed rows without pipeline fields", () => {
    const closedRows: ClosedFinancialsRow[] = [
      {
        id: "c",
        status: "Closed Won",
        ownerId: "u",
        soldPrice: 10,
        loeValue: 10,
        loeSignedDate: "2026-02-01",
      },
    ];

    expect(
      calculateQuotaProgress(closedRows, { targetAmount: 100, ...FY_2026 })
        .closedSoldPrice
    ).toBe(10);
    expect(calculateVarianceRollups(closedRows, FY_2026).evenCount).toBe(1);
    expect(calculateClosedWonTotal(closedRows, FY_2026)).toBe(10);
  });

  it("variance honours the LoE window when given", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "in-window-under",
        status: "Closed Won",
        soldPrice: 100_000,
        loeValue: 90_000,
        loeSignedDate: "2026-02-01",
      },
      {
        ...baseProposal,
        id: "in-window-over",
        status: "Closed Won",
        soldPrice: 25_000,
        loeValue: 30_000,
        loeSignedDate: "2026-05-01",
      },
      {
        ...baseProposal,
        id: "out-of-window",
        status: "Closed Won",
        soldPrice: 50_000,
        loeValue: 10_000,
        loeSignedDate: "2025-12-31",
      },
    ];

    expect(calculateVarianceRollups(proposals, FY_2026)).toEqual({
      underCount: 1,
      overCount: 1,
      evenCount: 0,
      netVariance: -5000,
      underVarianceTotal: -10000,
      overVarianceTotal: 5000,
    });
    expect(calculateVarianceRollups(proposals).underCount).toBe(2);
  });

  describe("calculateClosedWonTotal", () => {
    it("includes both inclusive window bounds", () => {
      const proposals = [
        { status: "Closed Won", soldPrice: 1_000, loeSignedDate: "2026-04-01" },
        { status: "Closed Won", soldPrice: 2_000, loeSignedDate: "2026-06-30" },
        { status: "Closed Won", soldPrice: 4_000, loeSignedDate: "2026-03-31" },
        { status: "Closed Won", soldPrice: 8_000, loeSignedDate: "2026-07-01" },
      ];

      expect(
        calculateClosedWonTotal(proposals, {
          dateFrom: "2026-04-01",
          dateTo: "2026-06-30",
        })
      ).toBe(3_000);
    });

    it("excludes Closed Lost and open statuses", () => {
      const proposals = [
        { status: "Closed Won", soldPrice: 1_000, loeSignedDate: "2026-02-01" },
        { status: "Closed Lost", soldPrice: 2_000, loeSignedDate: "2026-02-01" },
        { status: "Awaiting Sig", soldPrice: 4_000, loeSignedDate: "2026-02-01" },
        { status: "Negotiations", soldPrice: 8_000, loeSignedDate: "2026-02-01" },
      ];

      expect(calculateClosedWonTotal(proposals, FY_2026)).toBe(1_000);
    });

    it("excludes a null LoE signed date and counts a null sold price as 0", () => {
      const proposals = [
        { status: "Closed Won", soldPrice: 1_000, loeSignedDate: null },
        { status: "Closed Won", soldPrice: null, loeSignedDate: "2026-02-01" },
        { status: "Closed Won", soldPrice: 500.25, loeSignedDate: "2026-02-02" },
      ];

      expect(calculateClosedWonTotal(proposals, FY_2026)).toBe(500.25);
    });

    it("returns 0 for no rows", () => {
      expect(calculateClosedWonTotal([], FY_2026)).toBe(0);
    });
  });
});
